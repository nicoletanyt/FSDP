import { useCallback, useEffect, useRef, useState } from "react";
import {
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    Clock3,
    ScanLine,
    Smartphone,
    QrCode,
} from "lucide-react";
import { Link } from "react-router";
import { pendingNfcTagKey } from "@/components/instructor/NfcTagCapture";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { scanNfcTag } from "@/lib/nfc-check-in";
import type { NfcScanResult } from "@/lib/nfc-check-in";
import { currentDeviceSupportsNfcCheckIn } from "@/lib/nfc-device";
import { tokenFromNdefRecords } from "@/lib/nfc-tag-reader";

type NdefReader = {
    scan: (options: { signal: AbortSignal }) => Promise<void>;
    onreading: ((event: { message: { records: Iterable<{ recordType: string; data: DataView | null }> } }) => void) | null;
    onreadingerror: (() => void) | null;
};

const formatTime = (value: string) =>
    new Intl.DateTimeFormat("en-SG", {
        timeZone: "Asia/Singapore",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(value));

export default function NfcCheckIn() {
    const [supportedDevice] = useState(currentDeviceSupportsNfcCheckIn);
    const [tag, setTag] = useState(() =>
        sessionStorage.getItem(pendingNfcTagKey),
    );
    const [result, setResult] = useState<NfcScanResult | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [scannerError, setScannerError] = useState("");
    const [scannerState, setScannerState] = useState<"idle" | "starting" | "active">("idle");
    const [feedbackVisible, setFeedbackVisible] = useState(false);
    const attempted = useRef(false);
    const inFlight = useRef(false);
    const classChoicePending = useRef(false);
    const manuallyStopped = useRef(false);
    const scanController = useRef<AbortController | null>(null);
    const lastRead = useRef<{ tag: string; at: number } | null>(null);
    const checkTagRef = useRef<(token: string, eventId?: string) => Promise<void>>(async () => {});

    const checkTag = useCallback(
        async (token: string, eventId?: string) => {
            if (!supportedDevice || inFlight.current) return;
            inFlight.current = true;
            setPending(true);
            setError("");
            try {
                const response = await scanNfcTag(token, eventId);
                setResult(response);
                classChoicePending.current = response.status === "select_class";
                if (response.status !== "select_class") {
                    sessionStorage.removeItem(pendingNfcTagKey);
                    setTag(null);
                }
                if (response.status === "marked") setFeedbackVisible(true);
            } catch (failure) {
                setError(
                    failure instanceof Error
                        ? failure.message
                        : "Unable to check attendance. Try again.",
                );
            } finally {
                inFlight.current = false;
                setPending(false);
            }
        },
        [supportedDevice],
    );
    checkTagRef.current = checkTag;

    const stopScanning = useCallback(() => {
        manuallyStopped.current = true;
        scanController.current?.abort();
        scanController.current = null;
        setScannerState("idle");
    }, []);

    const startScanning = useCallback(async () => {
        if (scanController.current || !supportedDevice) return;
        manuallyStopped.current = false;
        const controller = new AbortController();
        scanController.current = controller;
        setScannerState("starting");
        setScannerError("");
        try {
            const Reader = (window as Window & { NDEFReader?: new () => NdefReader }).NDEFReader;
            if (!Reader) throw new Error("Web NFC is unavailable in this browser.");
            const reader = new Reader();
            reader.onreading = (event) => {
                if (controller.signal.aborted || inFlight.current || classChoicePending.current) return;
                const token = tokenFromNdefRecords(event.message.records, window.location.origin);
                if (!token) {
                    setTag(null);
                    setResult(null);
                    setError("");
                    setFeedbackVisible(false);
                    setScannerError("This tag does not contain a valid check-in URL for this site.");
                    return;
                }
                if (lastRead.current?.tag === token && Date.now() - lastRead.current.at < 2500) return;
                lastRead.current = { tag: token, at: Date.now() };
                attempted.current = true;
                setScannerError("");
                setResult(null);
                setFeedbackVisible(false);
                setTag(token);
                void checkTagRef.current(token);
            };
            reader.onreadingerror = () => {
                if (!controller.signal.aborted) setScannerError("Unable to read that tag. Move it away and try again.");
            };
            await reader.scan({ signal: controller.signal });
            if (!controller.signal.aborted) setScannerState("active");
        } catch (failure) {
            if (!controller.signal.aborted) {
                setScannerState("idle");
                setScannerError(failure instanceof DOMException && failure.name === "NotAllowedError"
                    ? "Allow NFC access to scan tags, then try again."
                    : "Unable to start NFC scanning. Check that NFC is on and try again.");
            }
            if (scanController.current === controller) scanController.current = null;
        }
    }, [supportedDevice]);

    useEffect(() => {
        if (!supportedDevice || !navigator.permissions?.query) return;
        let cancelled = false;
        // A permission prompt requires a user gesture; only auto-start if already granted.
        const autoStartIfPermitted = () => void navigator.permissions.query({ name: "nfc" as PermissionName }).then(permission => {
            if (!cancelled && !manuallyStopped.current && permission.state === "granted" && document.visibilityState === "visible") {
                void startScanning();
            }
        }).catch(() => { /* Permission query unsupported: show the Start scanning button. */ });
        autoStartIfPermitted();
        document.addEventListener("visibilitychange", autoStartIfPermitted);
        return () => { cancelled = true; document.removeEventListener("visibilitychange", autoStartIfPermitted); };
    }, [supportedDevice, startScanning]);

    useEffect(() => () => {
        scanController.current?.abort();
        scanController.current = null;
    }, []);

    useEffect(() => {
        if (!supportedDevice) {
            sessionStorage.removeItem(pendingNfcTagKey);
            setTag(null);
            return;
        }
        if (!tag || attempted.current) return;
        attempted.current = true;
        if (tag === "invalid") {
            sessionStorage.removeItem(pendingNfcTagKey);
            setTag(null);
            setResult({ status: "invalid" });
            return;
        }
        void checkTag(tag);
    }, [supportedDevice, tag, checkTag]);

    useEffect(() => {
        if (!feedbackVisible) return;
        const timeout = window.setTimeout(() => setFeedbackVisible(false), 2000);
        return () => window.clearTimeout(timeout);
    }, [feedbackVisible]);

    const classTime =
        result?.starts_at && result?.ends_at
            ? `${formatTime(result.starts_at)}–${formatTime(result.ends_at)} · Singapore time`
            : null;

    return (
        <section
            className="mx-auto flex w-full max-w-2xl flex-col gap-6"
            aria-label="NFC attendance"
        >
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                    NFC attendance
                </h1>
                <p className="max-w-prose text-sm text-muted-foreground">
                    {supportedDevice
                        ? "Tap a student’s tag with this phone or tablet to check their lesson today."
                        : "NFC check-in is not supported on this device or browser."}
                </p>
            </header>

            {supportedDevice && (
                <div className="flex flex-wrap items-center gap-3" role="status">
                    <Button type="button" variant={scannerState === "active" ? "outline" : "default"}
                        disabled={scannerState === "starting"}
                        onClick={() => scannerState === "active" ? stopScanning() : void startScanning()}>
                        <ScanLine className="size-4" aria-hidden="true" />
                        {scannerState === "active" ? "Stop scanning" : scannerState === "starting" ? "Starting NFC…" : "Start scanning"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                        {scannerState === "active" ? "Scanning is active. Keep this page open and your phone unlocked."
                            : "Start once to scan tags here without reopening this page."}
                    </p>
                </div>
            )}

            {scannerError && supportedDevice && (
                <Alert variant="destructive" role="alert">
                    <CircleAlert className="size-4" aria-hidden="true" />
                    <AlertDescription>{scannerError}</AlertDescription>
                </Alert>
            )}

            {!supportedDevice && (
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 py-6 text-center" role="status">
                        <Smartphone
                            className="size-9 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <div className="space-y-2">
                            <h2 className="text-lg font-semibold">
                                Please try a valid device.
                            </h2>
                            <p className="text-sm font-medium">
                                This device can only handle QR check-in.
                            </p>
                        </div>
                        <Button
                            nativeButton={false}
                            render={<Link to="/instructor/check-in" />}
                            className="min-h-11 w-full sm:w-auto"
                        >
                            <QrCode className="size-4" aria-hidden="true" />
                            Use QR check-in
                        </Button>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>Supported devices:</p>
                            <ul className="list-inside list-disc space-y-2">
                                <li>
                                    Android phones/tablets with NFC hardware, running Chrome 89 or
                                    later.
                                </li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            )}

            {error && (
                <Alert variant="destructive" role="alert">
                    <CircleAlert className="size-4" aria-hidden="true" />
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                        {error}
                        {tag && (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => tag && void checkTag(tag)}
                            >
                                Try again
                            </Button>
                        )}
                    </AlertDescription>
                </Alert>
            )}

            {pending && (
                <Card>
                    <CardContent
                        className="flex min-h-44 items-center justify-center gap-4"
                        role="status"
                    >
                        <ScanLine
                            className="size-7 animate-pulse text-primary motion-reduce:animate-none"
                            aria-hidden="true"
                        />
                        <span className="font-medium">Checking today’s class…</span>
                    </CardContent>
                </Card>
            )}

            {!pending && result?.status === "select_class" && (
                <Card>
                    <CardContent className="space-y-5 py-6">
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold">
                                Choose a class for {result.student_name}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                More than one class is in its check-in window.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            {result.classes?.map((item) => (
                                <Button
                                    key={item.event_id}
                                    type="button"
                                    variant="outline"
                                    className="h-auto min-h-12 justify-start whitespace-normal py-3 text-left"
                                    onClick={() => tag && void checkTag(tag, item.event_id)}
                                    disabled={pending}
                                >
                                    {item.class_name} · {formatTime(item.starts_at)}–
                                    {formatTime(item.ends_at)}
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {!pending && result?.status === "marked" && (
                <Card className="border-success/30 bg-success/5" role="status">
                    <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
                        {feedbackVisible ? (
                            <>
                                <CheckCircle2
                                    className="size-12 text-success"
                                    aria-hidden="true"
                                />
                                <h2 className="text-2xl font-semibold text-success">
                                    Attendance Marked
                                </h2>
                                <p className="font-medium">{result.student_name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {result.class_name} · {classTime}
                                </p>
                                {result.already_marked && (
                                    <p className="text-sm text-muted-foreground">
                                        Already recorded for this class.
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <ScanLine className="size-9 text-primary" aria-hidden="true" />
                                <h2 className="text-lg font-semibold">
                                    {scannerState === "active" ? "Ready for the next tag" : "Scan complete"}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Attendance has been recorded.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {!pending && result?.status === "upcoming" && (
                <Card role="status">
                    <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
                        <Clock3 className="size-10 text-primary" aria-hidden="true" />
                        <h2 className="text-2xl font-semibold">
                            Class starts at {formatTime(result.starts_at!)}
                        </h2>
                        <p className="font-medium">{result.student_name}</p>
                        <p className="text-sm text-muted-foreground">
                            {result.class_name} · Check-in opens 10 minutes before class.
                        </p>
                    </CardContent>
                </Card>
            )}

            {!pending && result?.status === "absent" && (
                <Card className="border-destructive/30 bg-destructive/5" role="status">
                    <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
                        <CircleAlert
                            className="size-10 text-destructive"
                            aria-hidden="true"
                        />
                        <h2 className="text-2xl font-semibold text-destructive">Absent</h2>
                        <p className="font-medium">{result.student_name}</p>
                        <p className="text-sm text-muted-foreground">
                            {result.class_name} · {classTime}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            No attendance was marked by this tap.
                        </p>
                    </CardContent>
                </Card>
            )}

            {!pending && result?.status === "no_class" && (
                <Card role="status">
                    <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
                        <CalendarClock
                            className="size-9 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <h2 className="text-lg font-semibold">No class today</h2>
                        <p className="text-sm text-muted-foreground">
                            {result.student_name} has no class assigned to you today.
                        </p>
                    </CardContent>
                </Card>
            )}

            {!pending && result?.status === "excused" && (
                <Card role="status">
                    <CardContent className="space-y-2 py-8 text-center">
                        <h2 className="text-lg font-semibold">Excused</h2>
                        <p className="text-sm text-muted-foreground">
                            {result.student_name} has an excused attendance record. No
                            attendance was changed.
                        </p>
                    </CardContent>
                </Card>
            )}

            {!pending &&
                result &&
                ["invalid", "wrong_class", "unlinked", "forbidden"].includes(
                    result.status,
                ) && (
                    <Alert variant="destructive" role="alert">
                        <CircleAlert className="size-4" aria-hidden="true" />
                        <AlertDescription>
                            {result.status === "invalid"
                                ? "Invalid tag. Ask an administrator for a replacement."
                                : result.status === "unlinked"
                                    ? "Your instructor account is not linked to a teaching record."
                                    : "You are not assigned to this class. No attendance was changed."}
                        </AlertDescription>
                    </Alert>
                )}

            {supportedDevice && !pending && !result && !error && (
                <Card>
                    <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
                        <ScanLine className="size-9 text-primary" aria-hidden="true" />
                        <h2 className="text-lg font-semibold">{scannerState === "active" ? "Ready for a scan" : "Start scanning to check in"}</h2>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            {scannerState === "active"
                                ? "Tap a student’s NFC tag to see their attendance status."
                                : "Turn on NFC, then tap Start scanning. Existing URL tags also work when opened directly."}
                        </p>
                    </CardContent>
                </Card>
            )}
        </section>
    );
}
