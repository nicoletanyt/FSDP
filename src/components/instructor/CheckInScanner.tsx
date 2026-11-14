import { useEffect, useState } from "react";
import {
    Camera,
    CameraOff,
    CircleAlert,
    CircleCheck,
    LoaderCircle,
    QrCode,
    Settings2,
    Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import GradeBadge from "@/components/GradeBadge";
import type { StudentRank } from "@/lib/student-grades";
import type { NfcScanResult } from "@/lib/nfc-check-in";
import { useQrCamera } from "@/hooks/use-qr-camera";
import { cn } from "@/lib/utils";

export type ScanFeedback = {
    tone: "success" | "duplicate" | "invalid";
    title: string;
    description: string;
    grade?: StudentRank;
};

export default function CheckInScanner({
    feedback,
    onScan,
    choice,
    choicePending = false,
    onChooseClass,
    onCancelChoice,
    cameraPaused = false,
    onCameraRunningChange,
    isKiosk = false,
}: {
    feedback: ScanFeedback | null;
    onScan: (payload: string) => void;
    choice?: NfcScanResult | null;
    choicePending?: boolean;
    onChooseClass?: (eventId: string) => void;
    onCancelChoice?: () => void;
    cameraPaused?: boolean;
    onCameraRunningChange?: (running: boolean) => void;
    isKiosk?: boolean;
}) {
    const [enabled, setEnabled] = useState(false);
    const [cameraId, setCameraId] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { videoRef, status, error, cameras, activeCameraId, restart } =
        useQrCamera({
            enabled: enabled && !cameraPaused,
            cameraId,
            paused: !!feedback || !!choice || choicePending,
            onScan,
        });
    const live = status === "live";
    const starting = status === "starting";

    useEffect(() => { onCameraRunningChange?.(live || starting); }, [live, starting, onCameraRunningChange]);

    function startCamera() {
        if (cameraPaused) return;
        if (enabled) restart();
        else setEnabled(true);
    }

    return (
        <Card
            className={cn(
                "relative isolate min-w-0 gap-0 bg-zinc-950 py-0 text-white",
                isKiosk
                    ? "h-full min-h-0 rounded-none ring-0"
                    : "min-h-[min(28rem,80dvh)] md:h-full md:min-h-0",
            )}
        >
            <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                aria-label="QR scanner camera preview"
                className="absolute inset-0 size-full object-contain"
            />
            <div
                className={cn(
                    "absolute inset-x-0 top-0 z-20 items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4",
                    isKiosk ? "hidden" : "flex",
                )}
            >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="flex items-center gap-2 text-sm font-medium">
                        <QrCode aria-hidden="true" className="size-4" /> QR check-in
                    </h2>
                    <span
                        role="status"
                        className="flex items-center gap-1.5 text-2xs text-white/70"
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                "size-1.5 rounded-full bg-white/40",
                                live && "bg-emerald-400",
                            )}
                        />
                        {live
                            ? "Camera live"
                            : starting
                                ? "Starting camera…"
                                : cameraPaused ? "Camera paused for NFC" : "Camera off"}
                    </span>
                </div>
                <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <PopoverTrigger aria-label="Camera settings" render={<Button variant="ghost" size="icon-touch" className="size-11 rounded-full bg-black/25 text-white hover:bg-black/45 hover:text-white" />}>
                        <Settings2 aria-hidden="true" className="size-4" />
                    </PopoverTrigger>
                    <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] gap-3 p-4 lg:p-3">
                        <label
                            htmlFor="check-in-camera"
                            className="block text-xs font-medium text-muted-foreground"
                        >
                            Camera
                        </label>
                        <select
                            id="check-in-camera"
                            value={cameraId || activeCameraId}
                            onChange={(event) => {
                                setCameraId(event.target.value);
                                setSettingsOpen(false);
                            }}
                            disabled={starting || cameras.length < 2}
                            className="h-11 w-full min-w-0 max-w-full rounded-lg border bg-background px-3 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                        >
                            {!cameras.length && (
                                <option value="">Rear camera (preferred)</option>
                            )}
                            {cameras.map((camera, index) => (
                                <option key={camera.deviceId} value={camera.deviceId}>
                                    {camera.label || `Camera ${index + 1}`}
                                </option>
                            ))}
                        </select>
                        {enabled && (
                            <Button
                                variant="outline"
                                className="min-h-11 w-full gap-2"
                                onClick={() => {
                                    setEnabled(false);
                                    setSettingsOpen(false);
                                }}
                            >
                                <Square aria-hidden="true" />
                                Stop camera
                            </Button>
                        )}
                    </PopoverContent>
                </Popover>
            </div>

            {!live && (
                <div className={cn("absolute inset-0 overflow-y-auto overscroll-contain px-4 text-center text-white", isKiosk ? "pt-14 pb-3" : "pt-16 pb-4")}>
                  <div className="flex min-h-full flex-col items-center justify-center gap-3">
                    {starting ? (
                        <LoaderCircle
                            aria-hidden="true"
                            className="size-10 animate-spin motion-reduce:animate-none"
                        />
                    ) : (
                        <CameraOff aria-hidden="true" className="size-10 text-zinc-400" />
                    )}
                    <div role={error && enabled ? "alert" : "status"}>
                        <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                            {starting
                                ? "Connecting to your camera"
                                : cameraPaused ? "Camera paused for NFC"
                                : error && enabled
                                    ? "Camera needs attention"
                                    : "Ready for check-ins?"}
                        </p>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-300">
                            {starting
                                ? "Allow camera access when your browser asks."
                                : cameraPaused ? "Use Resume QR camera above when you’re ready to scan codes."
                                : error && enabled
                                    ? error
                                    : "Start the camera to let students scan their QR codes."}
                        </p>
                    </div>
                    {!starting && !cameraPaused && (
                        <Button
                            onClick={startCamera}
                            className="mt-2 min-h-12 gap-2 rounded-xl bg-white px-6 text-zinc-950 hover:bg-zinc-200"
                        >
                            <Camera aria-hidden="true" />
                            {error && enabled ? "Try again" : "Start camera"}
                        </Button>
                    )}
                  </div>
                </div>
            )}

            {choice?.status === "select_class" && (
                <div role="group" aria-label="Choose NFC class" className="absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-amber-100 px-4 py-6 text-center text-amber-950">
                    <div className="flex min-h-full flex-col items-center justify-center gap-3">
                        <CircleAlert aria-hidden="true" className="size-12" />
                        <h2 className="text-xl font-semibold sm:text-3xl">Choose a class for {choice.student_name || "this student"}</h2>
                        <p className="text-sm">More than one class is open. No attendance has been changed.</p>
                        <div className="flex w-full max-w-md flex-col gap-2">
                            {choice.classes?.map(item => <Button key={item.event_id} type="button" variant="outline"
                                disabled={choicePending} className="h-auto min-h-11 whitespace-normal py-3 text-amber-950"
                                onClick={() => onChooseClass?.(item.event_id)}>{item.class_name} · {new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" }).format(new Date(item.starts_at))}</Button>)}
                            <Button type="button" variant="ghost" className="min-h-11 text-amber-950" disabled={choicePending} onClick={onCancelChoice}>Cancel</Button>
                        </div>
                    </div>
                </div>
            )}
            {feedback && (
                <div
                    role={feedback.tone === "invalid" ? "alert" : "status"}
                    className={cn(
                        "absolute inset-0 z-30 overflow-y-auto overscroll-contain px-4 text-center",
                        isKiosk ? "pt-14 pb-3" : "py-4",
                        feedback.tone === "success"
                            ? "bg-emerald-600/95 text-white"
                            : feedback.tone === "duplicate"
                                ? "bg-amber-100/95 text-amber-950"
                                : "bg-red-100/95 text-red-950",
                    )}
                >
                    <div className="flex min-h-full flex-col items-center justify-center gap-2 sm:gap-4">
                    {feedback.tone === "success" ? (
                        <CircleCheck aria-hidden="true" className="size-12 sm:size-24" />
                    ) : (
                        <CircleAlert aria-hidden="true" className="size-12 sm:size-20" />
                    )}
                    <p className="max-w-full text-xl font-semibold tracking-tight wrap-break-words sm:text-4xl lg:text-5xl">
                        {feedback.title}
                    </p>
                    {feedback.grade && (
                        <GradeBadge rank={feedback.grade.rank} system={feedback.grade.gradingSystem} showBeltLabel className="border-current/20 bg-white/15 px-4 py-1.5 text-lg text-inherit" />
                    )}
                    <p className="max-w-md text-base sm:text-lg">
                        {feedback.description}
                    </p>
                    <p className="mt-2 text-xs opacity-80">
                        {live
                            ? "Ready for the next student in 2 seconds"
                            : "Confirmation closes automatically"}
                    </p>
                    </div>
                </div>
            )}
        </Card>
    );
}
