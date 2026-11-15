import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import QRCode from "qrcode";
import { CircleCheck, QrCode } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { fetchAttendanceQr, type AttendanceQr } from "@/lib/attendance-qr";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
});
const formatTime = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : timeFormat.format(date);
};

type Loaded = AttendanceQr & { deadline: number };

/**
 * The student's attendance QR for today's booked class. The code is signed by
 * the database, only works for this student and class, and rotates every minute
 * so a forwarded screenshot quickly stops working.
 */
export type AttendanceQrState = AttendanceQr["status"] | "loading" | "failed";

export default function AttendanceQrCard({
    compact = false,
    inline = false,
    hideUnavailable = false,
    onStatus,
}: {
    /** A single-row button (dashboard card) instead of the large tile. */
    compact?: boolean;
    /** Show the live code itself in the page while check-in is open (tap still enlarges it). */
    inline?: boolean;
    /** Show nothing while loading or when there is no class to check in to today. */
    hideUnavailable?: boolean;
    /** Reports the check-in state so the page can rebalance its own actions. */
    onStatus?: (status: AttendanceQrState) => void;
} = {}) {
    const [open, setOpen] = useState(false);
    const [qr, setQr] = useState<Loaded | null>(null);
    const [failed, setFailed] = useState(false);
    const [image, setImage] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    // The code is on screen either in the dialog or, with `inline`, in the page itself.
    const live = open || (inline && qr?.status === "ready");

    const load = useCallback(async () => {
        try {
            const next = await fetchAttendanceQr();
            const deadline =
                Date.now() + (next.status === "ready" ? next.refreshInMs : 0);
            setQr({ ...next, deadline });
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Rotate the code while it is on screen; wake up when check-in opens.
    useEffect(() => {
        if (!qr) return;
        let delay: number | null = null;
        if (qr.status === "ready" && live)
            delay = Math.max(qr.deadline - Date.now(), 0);
        if (qr.status === "upcoming") {
            const opensIn = Date.parse(qr.opensAt) - Date.now();
            if (opensIn > 0 && opensIn < 24 * 60 * 60 * 1000) delay = opensIn;
        }
        if (delay === null) return;
        const timer = window.setTimeout(() => void load(), delay);
        return () => window.clearTimeout(timer);
    }, [qr, live, load]);

    // Background tabs throttle timers, so fetch a fresh code on return.
    useEffect(() => {
        if (!live) return;
        const onVisible = () =>
            document.visibilityState === "visible" && void load();
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [live, load]);

    // Countdown to the next code.
    useEffect(() => {
        if (!live || qr?.status !== "ready") return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [live, qr?.status]);

    const payload = qr?.status === "ready" ? qr.payload : null;
    useEffect(() => {
        if (!payload) {
            setImage(null);
            return;
        }
        let cancelled = false;
        QRCode.toDataURL(payload, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 320,
        })
            .then((url) => !cancelled && setImage(url))
            .catch(() => !cancelled && setImage(null));
        return () => {
            cancelled = true;
        };
    }, [payload]);

    function changeOpen(next: boolean) {
        setOpen(next);
        // Never show a code that may have rotated while the dialog was closed.
        if (next) void load();
    }

    // "Show check-in QR" in the phone menu links here with #check-in.
    const { hash, pathname, search } = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        if (hash !== "#check-in") return;
        setOpen(true);
        void load();
        navigate({ pathname, search }, { replace: true });
    }, [hash, pathname, search, navigate, load]);

    const state: AttendanceQrState = failed
        ? "failed"
        : (qr?.status ?? "loading");
    useEffect(() => {
        onStatus?.(state);
    }, [onStatus, state]);
    const hidden =
        hideUnavailable &&
        ["loading", "failed", "unavailable", "none"].includes(state);
    const usable = qr?.status === "ready" || qr?.status === "checked_in";
    const label = failed
        ? { title: "QR unavailable", hint: "Refresh the page to try again" }
        : !qr
            ? { title: "Attendance QR", hint: "Checking today’s classes…" }
            : qr.status === "ready"
                ? { title: "Attendance QR", hint: `Tap to check in to ${qr.className}` }
                : qr.status === "checked_in"
                    ? { title: "Checked in", hint: qr.className }
                    : qr.status === "upcoming"
                        ? {
                            title: "QR not open yet",
                            hint: `Opens at ${formatTime(qr.opensAt)} for ${qr.className}`,
                        }
                        : { title: "QR unavailable", hint: "No booked class today" };
    const secondsLeft =
        qr?.status === "ready"
            ? Math.max(Math.ceil((qr.deadline - now) / 1000), 0)
            : 0;

    const showInline = inline && qr?.status === "ready";
    // Inline cards hold the code's place until check-in opens, so the layout doesn't jump.
    const showPlaceholder =
        inline && qr?.status !== "ready" && qr?.status !== "checked_in";

    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            {showInline || (inline && qr?.status === "checked_in") ? (
                // A small tile beside the class details; tapping opens the large code for the instructor to scan.
                <DialogTrigger
                    render={
                        <button
                            type="button"
                            aria-label={
                                qr?.status === "checked_in"
                                    ? `Checked in to ${qr.className}`
                                    : `Attendance QR for ${qr?.className ?? "your class"}. Tap to show it for scanning`
                            }
                            className={cn(
                                "grid w-28 shrink-0 justify-items-center gap-1.5 rounded-xl border p-2 text-center sm:w-32 outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                qr?.status === "checked_in"
                                    ? "border-primary/40 bg-primary/5 text-primary"
                                    : // Always on white so the code stays readable in dark mode.
                                    "bg-white text-neutral-700 hover:bg-neutral-50",
                            )}
                        />
                    }
                >
                    <span className="grid aspect-square w-full place-items-center">
                        {qr?.status === "checked_in" ? (
                            <CircleCheck className="size-12" aria-hidden="true" />
                        ) : image ? (
                            <img src={image} alt="" className="size-full" />
                        ) : (
                            <QrCode className="size-10 text-neutral-400" aria-hidden="true" />
                        )}
                    </span>
                    {qr?.status === "checked_in" ? (
                        <span className="text-xs leading-tight font-semibold">
                            Checked in
                        </span>
                    ) : (
                        <span className="grid text-xs leading-tight">
                            <span className="font-semibold text-neutral-900">
                                Tap to scan
                            </span>
                            <span className="tabular-nums text-neutral-500">
                                {secondsLeft > 0 ? `New code ${secondsLeft}s` : "Refreshing…"}
                            </span>
                        </span>
                    )}
                </DialogTrigger>
            ) : showPlaceholder ? (
                <div className="grid w-28 shrink-0 justify-items-center gap-1.5 rounded-xl border p-2 text-center sm:w-32 border-dashed bg-muted/40 text-muted-foreground">
                    <span
                        aria-hidden="true"
                        className="grid aspect-square w-full place-items-center rounded-lg bg-muted"
                    >
                        <QrCode
                            className="size-10 text-muted-foreground/40"
                            strokeWidth={1.25}
                        />
                    </span>
                    {failed ? (
                        <span className="text-xs leading-tight">
                            Couldn’t load. Refresh to try again.
                        </span>
                    ) : (
                        <span className="grid gap-0.5 text-xs leading-tight">
                            <span className="font-medium text-foreground">
                                QR code available 10 mins before start
                            </span>
                        </span>
                    )}
                </div>
            ) : (
                <DialogTrigger
                    render={
                        <button
                            type="button"
                            disabled={!usable}
                            className={cn(
                                "w-full rounded-xl border transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                                compact
                                    ? "flex min-h-14 items-center gap-3 px-3 py-2.5 text-left"
                                    : "grid place-items-center border-dashed p-5 text-center",
                                hidden && "hidden",
                                compact && qr?.status === "ready"
                                    ? // The live code is the most urgent action in a compact card.
                                    "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                                    : usable
                                        ? cn(
                                            "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10",
                                            !compact && "min-h-40",
                                        )
                                        : cn(
                                            "border-border bg-muted/50 text-muted-foreground",
                                            !compact && "min-h-24",
                                        ),
                            )}
                        />
                    }
                >
                    <span
                        className={compact ? "contents" : "grid justify-items-center gap-2"}
                    >
                        {qr?.status === "checked_in" ? (
                            <CircleCheck
                                className={cn("shrink-0", compact ? "size-6" : "size-8")}
                                aria-hidden="true"
                            />
                        ) : (
                            <QrCode
                                className={cn("shrink-0", compact ? "size-6" : "size-8")}
                                aria-hidden="true"
                            />
                        )}
                        <span className={compact ? "grid min-w-0" : "contents"}>
                            <span className="font-semibold">{label.title}</span>
                            <span className="text-sm">{label.hint}</span>
                        </span>
                    </span>
                </DialogTrigger>
            )}
            <DialogContent className="w-[calc(100%-2rem)] max-w-lg p-4 sm:max-w-lg lg:p-6">
                <div className="grid justify-items-center gap-5 py-2 text-center">
                    <div>
                        <DialogTitle className="text-xl font-semibold">
                            Attendance QR
                        </DialogTitle>
                        <DialogDescription className="mt-2">
                            {qr?.status === "checked_in"
                                ? `You’re checked in to ${qr.className}. Enjoy your class.`
                                : qr?.status === "ready"
                                    ? `Show this to your instructor to check in to ${qr.className}.`
                                    : "Check-in isn’t open right now."}
                        </DialogDescription>
                    </div>
                    {qr?.status === "checked_in" ? (
                        <CircleCheck className="size-24 text-primary" aria-hidden="true" />
                    ) : qr?.status === "ready" ? (
                        <>
                            <div className="grid aspect-square w-72 max-w-full place-items-center rounded-2xl bg-white p-3 sm:w-80">
                                {image ? (
                                    <img
                                        src={image}
                                        alt={`Attendance QR code for ${qr.className}`}
                                        className="size-full"
                                    />
                                ) : (
                                    <QrCode
                                        className="size-16 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground tabular-nums">
                                {secondsLeft > 0
                                    ? `New code in ${secondsLeft}s`
                                    : "Refreshing…"}
                            </p>
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
