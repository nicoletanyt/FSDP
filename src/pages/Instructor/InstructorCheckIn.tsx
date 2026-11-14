import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarX2, ChevronDown, LogOut, Maximize, Nfc, UserCheck } from "lucide-react";
import CheckInScanner from "@/components/instructor/CheckInScanner";
import { pendingNfcTagKey } from "@/components/instructor/NfcTagCapture";
import type { ScanFeedback } from "@/components/instructor/CheckInScanner";
import DatabaseGradeBadge from "@/components/instructor/DatabaseGradeBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useCheckInAlternation } from "@/hooks/use-check-in-alternation";
import { useNfcReader } from "@/hooks/use-nfc-reader";
import { useClassQuery, useInstructorRoster } from "@/hooks/use-instructor-class-queries";
import { parseEntityId, toSingaporeDateTime } from "@/lib/instructor/adapters";
import { invalidateSessionChange } from "@/lib/instructor/cache-invalidation";
import { loadCalendarEvents } from "@/lib/instructor/calendar-queries";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { instructorQueryKeys } from "@/lib/instructor/query-keys";
import type { CalendarViewEvent } from "@/lib/instructor/calendar-view";
import { checkInWithQr, qrCheckInFeedback } from "@/lib/instructor/qr-check-in";
import { nfcCheckInFeedback } from "@/lib/instructor/nfc-feedback";
import { scanNfcTag } from "@/lib/nfc-check-in";
import type { NfcScanResult } from "@/lib/nfc-check-in";
import type { EventId } from "@/lib/instructor/types";
import { formatTime } from "@/lib/instructor-calendar";
import type { InstructorOutletContext } from "@/layouts/InstructorLayout";
import { queryGeneration } from "@/lib/query-generation";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
});
const CHECK_IN_OPENS_MS = 10 * 60 * 1000; // same window as the database
const NO_EVENT = parseEntityId("00000000-0000-4000-8000-000000000000", "event");

/** Today's classes in Singapore time, as the calendar range the instructor API expects. */
function todayRange() {
    const today = toSingaporeDateTime(new Date().toISOString()).date;
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return { from: today, to: tomorrow };
}

/** The class open for check-in now, else the next one today, else the last one. */
function defaultSession(sessions: CalendarViewEvent[], now = Date.now()) {
    const open = sessions.find(
        (s) => now >= Date.parse(s.startsAt!) - CHECK_IN_OPENS_MS && now <= Date.parse(s.endsAt!),
    );
    return open ?? sessions.find((s) => Date.parse(s.startsAt!) > now) ?? sessions.at(-1) ?? null;
}

export default function InstructorCheckIn() {
    const { isKiosk, setIsKiosk } = useOutletContext<InstructorOutletContext>();
    const { session: authSession, profile } = useAuth();
    // Supabase keeps one signed-in account per browser, so signing in as a
    // student in another tab silently switches this tab too.
    const signedInAsInstructor = profile?.role === "instructor";
    const queryClient = useQueryClient();
    const [range] = useState(todayRange);
    const api = useInstructorApi();
    const instructorUserId = signedInAsInstructor ? authSession?.user.id ?? "" : "";
    // Its own key, always refetched on open: a check-in station must never trust
    // a calendar cached earlier (for example while another account was signed in).
    const calendar = useClassQuery(
        [...instructorQueryKeys.all(instructorUserId), "check-in-classes", range.from],
        (signal) => loadCalendarEvents(api, range, signal),
        { enabled: Boolean(instructorUserId), staleTime: 0, gcTime: 60_000 },
    );
    const sessions = useMemo(
        () =>
            (calendar.data ?? [])
                .filter((e) => e.type === "training" && e.status !== "cancelled" && e.startsAt && e.endsAt)
                .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!)),
        [calendar.data],
    );
    const [chosenId, setChosenId] = useState<string | null>(null);
    const [nfcClass, setNfcClass] = useState<Pick<CalendarViewEvent, 'id' | 'name' | 'startsAt' | 'endsAt'> | null>(null);
    const nfcSession: CalendarViewEvent | null = nfcClass?.startsAt && nfcClass.endsAt ? {
        ...nfcClass,
        date: new Date(`${toSingaporeDateTime(nfcClass.startsAt).date}T00:00:00`), type: "training", status: "scheduled",
        startTime: toSingaporeDateTime(nfcClass.startsAt).time,
        endTime: toSingaporeDateTime(nfcClass.endsAt).time,
        dojo: "NFC class", instructorId: null, rosterCount: 0, capacity: null,
        dateOnly: false, reportingTime: null, reportingReleaseOn: null,
    } : null;
    const session = sessions.find((item) => item.id === chosenId) ?? (nfcClass?.id === chosenId ? nfcSession : null) ?? defaultSession(sessions);
    const eventId: EventId = session ? parseEntityId(session.id, "event") : NO_EVENT;
    const roster = useInstructorRoster(eventId, Boolean(session));
    const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
    const [cameraRunning, setCameraRunning] = useState(false);
    const [cameraLive, setCameraLive] = useState(false);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [cameraFailed, setCameraFailed] = useState(false);
    const [simultaneous, setSimultaneous] = useState(false);
    const scanLocked = useRef(false);
    const isScanLocked = useCallback(() => scanLocked.current, []);
    const nfcInFlight = useRef(false);
    const [choice, setChoice] = useState<NfcScanResult | null>(null);
    const choiceTag = useRef<string | null>(null);
    const [nfcPending, setNfcPending] = useState(false);
    const [nfcRetry, setNfcRetry] = useState(false);
    const [nfcStationWarning, setNfcStationWarning] = useState("");
    const attemptedUrl = useRef(false);
    const enterKioskRef = useRef<HTMLButtonElement>(null);
    const exitKioskRef = useRef<HTMLButtonElement>(null);
    const wasKiosk = useRef(false);

    const entries = roster.data?.entries ?? [];
    const checkedIn = entries
        .filter(({ record }) =>
            record.checked_in_at !== null ||
            record.attendance_status === "present" ||
            record.attendance_status === "late")
        .sort((a, b) =>
            Date.parse(b.record.checked_in_at ?? b.record.recorded_at ?? "") -
            Date.parse(a.record.checked_in_at ?? a.record.recorded_at ?? ""));
    const attendancePercent = entries.length ? (checkedIn.length / entries.length) * 100 : 0;
    const canScan = roster.status === "success" && roster.data.canEditAttendance;
    const nfc = useNfcReader((token) => void handleNfc(token), () => scanLocked.current || !!choiceTag.current);
    const onNfcStartupFailed = useCallback(() => {
        nfc.stop();
        setNfcStationWarning("NFC could not restart after the camera was released. QR scanning has resumed. Check NFC is enabled, then start NFC again.");
    }, [nfc.stop]);
    const onCameraRunningChange = useCallback((running: boolean, live: boolean) => { setCameraRunning(running); setCameraLive(live); }, []);
    const onCameraEnabledChange = useCallback((enabled: boolean) => setCameraEnabled(enabled), []);
    const onCameraErrorChange = useCallback((failed: boolean) => setCameraFailed(failed), []);
    const scanBusy = Boolean(feedback || choice || nfcPending || nfcRetry);
    const { alternating, phase: scanPhase, cameraPaused } = useCheckInAlternation({
        cameraEnabled, cameraRunning, cameraLive, cameraFailed, nfcWanted: nfc.wanted, simultaneous,
        nfcState: nfc.state, nfcError: nfc.error, pauseNfc: nfc.pause, resumeNfc: nfc.resume, stopNfc: onNfcStartupFailed,
        busy: scanBusy, locked: isScanLocked,
    });
    const sessionDetails = session
        ? `${session.dojo} · ${dateFormat.format(session.date)} · ${formatTime(session.startTime)}–${formatTime(session.endTime)}`
        : `${dateFormat.format(new Date())} · No classes to check in today`;

    useEffect(() => {
        if (!feedback) return;
        const timeout = window.setTimeout(() => {
            if (!choiceTag.current) scanLocked.current = false;
            setFeedback(null);
        }, 2000);
        return () => window.clearTimeout(timeout);
    }, [feedback]);

    useEffect(() => {
        if (attemptedUrl.current || !authSession || !signedInAsInstructor) return;
        const token = sessionStorage.getItem(pendingNfcTagKey);
        if (!token) return;
        attemptedUrl.current = true;
        // Consume before the async request; never leave a reusable token in browser storage.
        sessionStorage.removeItem(pendingNfcTagKey);
        if (token === "invalid") {
            scanLocked.current = true;
            setFeedback(nfcCheckInFeedback({ status: "invalid" }));
        } else void handleNfc(token);
    });

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") setIsKiosk(false);
        }
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            setIsKiosk(false);
        };
    }, [setIsKiosk]);

    useEffect(() => {
        if (isKiosk) exitKioskRef.current?.focus({ preventScroll: true });
        else if (wasKiosk.current) {
            enterKioskRef.current?.focus({ preventScroll: true });
        }
        wasKiosk.current = isKiosk;
    }, [isKiosk]);

    function toggleKiosk() {
        setIsKiosk(!isKiosk);
    }

    async function handleScan(payload: string) {
        if (scanLocked.current) return;
        scanLocked.current = true;
        if (!signedInAsInstructor) {
            setFeedback({
                tone: "invalid",
                title: "Not signed in as an instructor",
                description: "This browser is now signed in to a different account. Sign in again as the instructor, and show the student QR on another device or browser.",
            });
            return;
        }
        if (!session) {
            setFeedback({
                tone: "invalid",
                title: "No class selected",
                description: calendar.status === "loading"
                    ? "Still loading today’s classes. Try again in a moment."
                    : calendar.status === "error"
                        ? calendar.error ?? "Today’s classes could not be loaded."
                        : "You have no classes to check in today.",
            });
            return;
        }
        if (!canScan) {
            setFeedback({
                tone: "invalid",
                title: "Roster not ready",
                description: roster.status === "loading"
                    ? "Still loading the class roster. Try again in a moment."
                    : roster.status === "error"
                        ? roster.error ?? "The class roster could not be loaded."
                        : "Only the instructor teaching this class can check students in.",
            });
            return;
        }
        const generation = queryGeneration(queryClient);
        try {
            const result = await checkInWithQr(payload, session.id);
            setFeedback(qrCheckInFeedback(result));
            if (result.status === "marked" && authSession) {
                // Refresh this roster and any open views of the class.
                invalidateSessionChange(queryClient, generation, authSession.user.id, session.id, [], "attendance", false);
            }
        } catch (error) {
            setFeedback({
                tone: "invalid",
                title: "Unable to check in",
                description: error instanceof Error ? error.message : "Please try again.",
            });
        }
    }

    async function handleNfc(token: string, selectedEventId?: string) {
        if (nfcInFlight.current || (scanLocked.current && !selectedEventId)) return;
        if (!signedInAsInstructor || !authSession) {
            scanLocked.current = true;
            setFeedback({ tone: "invalid", title: "Not signed in as an instructor", description: "Sign in again as the instructor to check students in." });
            return;
        }
        scanLocked.current = true;
        nfcInFlight.current = true;
        setNfcPending(true);
        setNfcRetry(false);
        const generation = queryGeneration(queryClient);
        try {
            // Without a class ID, the NFC function resolves the student's class itself.
            // Only pass a class ID after the instructor explicitly chooses among matches.
            const result = await scanNfcTag(token, selectedEventId);
            if (result.status === "select_class") {
                choiceTag.current = token;
                setChoice(result);
                setFeedback(null);
                return;
            }
            choiceTag.current = null;
            setChoice(null);
            setFeedback(nfcCheckInFeedback(result));
            if (result.event_id) {
                invalidateSessionChange(queryClient, generation, authSession.user.id, result.event_id, [], "attendance", false);
                // Show the roster for the class actually returned, not the last QR selection.
                setNfcClass({ id: result.event_id, name: result.class_name || "Class", startsAt: result.starts_at ?? null, endsAt: result.ends_at ?? null });
                setChosenId(result.event_id);
                if (!sessions.some(item => item.id === result.event_id)) void queryClient.invalidateQueries({ queryKey: [...instructorQueryKeys.all(authSession.user.id), "check-in-classes", range.from] });
            }
        } catch {
            // Do not surface server error details: they may include sensitive tag data.
            choiceTag.current = token;
            setChoice(null);
            setNfcRetry(true);
            setFeedback({ tone: "invalid", title: "Unable to check NFC tag", description: "Check your connection and try again. No attendance was confirmed." });
        } finally {
            nfcInFlight.current = false;
            setNfcPending(false);
        }
    }

    function retryNfc() {
        if (!choiceTag.current || nfcPending) return;
        const token = choiceTag.current;
        scanLocked.current = false;
        setFeedback(null);
        void handleNfc(token);
    }

    function changeSession(value: string) {
        if (!nfcPending && !choiceTag.current) {
            scanLocked.current = false;
            setFeedback(null);
        }
        setChosenId(value);
    }

    return (
        <section
            data-check-in-kiosk={isKiosk}
            aria-label="Check-in"
            className={cn(
                "flex min-h-0 flex-1 flex-col gap-4",
                isKiosk &&
                "fixed inset-0 z-50 h-dvh gap-0 overflow-hidden bg-zinc-950 text-white",
            )}
        >
            <header
                className={cn(
                    "shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-1",
                    isKiosk ? "hidden" : "flex",
                )}
            >
                <div className="min-w-0 max-w-full">
                    <h1 className="text-xl font-semibold tracking-tight">
                        {session ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            className="-ml-2 h-auto min-h-11 max-w-full gap-2 px-2 py-1 text-left text-xl font-semibold whitespace-normal [overflow-wrap:anywhere]"
                                        />
                                    }
                                    aria-label={`Active class: ${session.name}. Change class session`}
                                >
                                    {session.name}
                                    <ChevronDown aria-hidden="true" className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuRadioGroup
                                        value={session.id}
                                        onValueChange={changeSession}
                                    >
                                        {sessions.map((item) => (
                                            <DropdownMenuRadioItem
                                                key={item.id}
                                                value={item.id}
                                                className="min-h-11 py-2.5 pr-4"
                                            >
                                                <span>
                                                    <span className="block font-medium">{item.name}</span>
                                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                                        {item.dojo} · {formatTime(item.startTime)}–
                                                        {formatTime(item.endTime)}
                                                    </span>
                                                </span>
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            "Check-in"
                        )}
                    </h1>
                    <p
                        className="max-w-full text-xs text-muted-foreground [overflow-wrap:anywhere]"
                    >
                        {!signedInAsInstructor
                            ? "This browser is signed in to a non-instructor account. Sign in again as the instructor."
                            : calendar.status === "loading"
                            ? "Loading today’s classes…"
                            : calendar.status === "error"
                                ? calendar.error
                                : sessionDetails}
                    </p>
                </div>
                <Button
                    ref={enterKioskRef}
                    onClick={toggleKiosk}
                    aria-pressed={isKiosk}
                    disabled={!session}
                    className="min-h-11 w-full gap-2 px-4 sm:ml-auto sm:w-auto"
                >
                    <Maximize aria-hidden="true" />
                    Enter Kiosk Mode
                </Button>
            </header>

            <div className={cn("flex shrink-0 flex-wrap items-center gap-2", isKiosk && "absolute bottom-20 left-4 z-40 rounded-xl bg-black/70 p-2 text-white", isKiosk && (feedback || choice) && "hidden")}>
                {nfc.supported ? (
                    <>
                        <Button type="button" variant={isKiosk ? "secondary" : "outline"} className="min-h-11 gap-2"
                            disabled={nfc.state === "starting"} onClick={() => {
                                setNfcStationWarning("");
                                if (nfc.wanted) nfc.stop();
                                else void nfc.start();
                            }}>
                            <Nfc aria-hidden="true" className="size-4" />
                            {nfc.state === "starting" ? "Starting NFC…" : nfc.wanted ? "Stop NFC scanning" : "Start NFC scanning"}
                        </Button>
                        <span role="status" className={cn("text-xs text-muted-foreground", isKiosk && "text-white/80")}>
                            {nfcPending ? "Checking tag…" : alternating
                                ? scanPhase === "nfc" ? "NFC window · Hold tag until confirmation" : "QR window · Show code to camera"
                                : nfc.state === "active" ? "NFC reader started · Tap a student’s tag" : "Tap Start to scan NFC tags"}
                        </span>
                        {alternating && <span className={cn("text-xs text-muted-foreground", isKiosk && "text-white/80")}>Automatic QR/NFC switching · No button needed between students</span>}
                        {cameraEnabled && nfc.wanted && <Button type="button" variant={isKiosk ? "secondary" : "outline"}
                            aria-pressed={simultaneous} className="min-h-11"
                            onClick={() => setSimultaneous(value => !value)}>
                            {simultaneous ? "Use automatic switching" : "Try continuous QR + NFC"}
                        </Button>}
                        {simultaneous && cameraEnabled && nfc.wanted && <span className={cn("w-full text-xs text-muted-foreground", isKiosk && "text-white/80")}>Experiment: with the camera on, tap a non-student NDEF tag and check whether NFC read events increase below. Switch back if they do not.</span>}
                    </>
                ) : <p className="text-xs text-muted-foreground">NFC scanning is unavailable here. QR check-in and existing NFC tag links still work.</p>}
                {nfc.error && <p role="alert" className="w-full text-xs text-destructive">{nfc.error}</p>}
                {nfcStationWarning && <p role="alert" className="w-full text-xs text-destructive">{nfcStationWarning}</p>}
                {nfc.supported && <details className="w-full text-xs"><summary>Scanner status</summary>
                    <p>Page {document.hidden ? "hidden" : "visible"} · Camera {cameraRunning ? "running" : "off"} · NFC {nfc.state} · NFC read events this visit: {nfc.readCount}</p>
                </details>}
            </div>

            {nfcRetry && choiceTag.current && <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={retryNfc}>Retry NFC check-in</Button>
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => { choiceTag.current = null; setNfcRetry(false); scanLocked.current = false; setFeedback(null); }}>Cancel retry</Button>
            </div>}

            <div
                className={cn(
                    "grid min-h-0 flex-1",
                    !isKiosk && "gap-4 md:grid-cols-[minmax(0,7fr)_minmax(14rem,3fr)]",
                )}
            >
                {/* Keep one scanner mounted so changing modes preserves the camera stream. */}
                <CheckInScanner
                    feedback={feedback}
                    onScan={(payload) => void handleScan(payload)}
                    cameraPaused={cameraPaused}
                    onCameraRunningChange={onCameraRunningChange}
                    onCameraEnabledChange={onCameraEnabledChange}
                    onCameraErrorChange={onCameraErrorChange}
                    choice={choice}
                    choicePending={nfcPending}
                    onChooseClass={eventId => { if (choiceTag.current) void handleNfc(choiceTag.current, eventId); }}
                    onCancelChoice={() => { choiceTag.current = null; setChoice(null); scanLocked.current = false; }}
                    isKiosk={isKiosk}
                />
                <Card
                    role="complementary"
                    aria-label="Recent check-ins"
                    className={cn("min-h-0 min-w-0 gap-0 py-0", isKiosk && "hidden")}
                >
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-3">
                        <h2 className="text-sm font-semibold">Recent check-ins</h2>
                        <p
                            aria-live="polite"
                            aria-atomic="true"
                            className="text-2xs text-muted-foreground"
                        >
                            <span className="font-semibold tabular-nums text-foreground pr-1">
                                {checkedIn.length}/{entries.length}
                            </span>{" "}
                            checked in
                        </p>
                    </div>
                    <ul
                        aria-label="Checked-in students"
                        className="divide-y px-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain"
                    >
                        {checkedIn.map(({ record, student }) => {
                            const at = record.checked_in_at ?? record.recorded_at;
                            return (
                                <li
                                    key={record.student_id}
                                    className="flex flex-wrap items-center justify-between gap-3 py-3.5 md:flex-nowrap"
                                >
                                    <div className="min-w-0 space-y-1">
                                        <p className="break-words text-sm font-medium">
                                            {`${student.student.first_name} ${student.student.last_name}`.trim() || "Student"}
                                        </p>
                                        <DatabaseGradeBadge grade={student.grade} />
                                    </div>
                                    {at && (
                                        <time
                                            dateTime={at}
                                            className="shrink-0 text-xs tabular-nums text-muted-foreground"
                                        >
                                            {timeFormat.format(new Date(at))}
                                        </time>
                                    )}
                                </li>
                            );
                        })}
                        {!checkedIn.length && (
                            <li className="flex min-h-48 flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground">
                                {session ? (
                                    <>
                                        <UserCheck aria-hidden="true" className="mb-1 size-7 opacity-40" />
                                        <p className="text-sm">
                                            {roster.status === "loading" ? "Loading roster…" : "No check-ins yet"}
                                        </p>
                                        <p className="text-xs">
                                            {roster.status === "error"
                                                ? roster.error
                                                : roster.status === "success" && !roster.data.canEditAttendance
                                                    ? "Only the instructor teaching this class can check students in."
                                                    : "Ready for the first student."}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <CalendarX2 aria-hidden="true" className="mb-1 size-7 opacity-40" />
                                        <p className="text-sm">No classes today</p>
                                        <p className="text-xs">Classes you teach today will appear here.</p>
                                    </>
                                )}
                            </li>
                        )}
                    </ul>
                </Card>
            </div>
            {isKiosk && (
                <>
                    <footer className="shrink-0 border-t border-white/10 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-3 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <div className="mx-auto w-full max-w-lg space-y-2">
                            <p
                                aria-live="polite"
                                aria-atomic="true"
                                className="text-center text-sm text-white/80"
                            >
                                <span className="font-semibold tabular-nums text-white">
                                    {checkedIn.length} / {entries.length}
                                </span>{" "}
                                students checked in
                            </p>
                            <div
                                role="progressbar"
                                aria-label="Students checked in"
                                aria-valuemin={0}
                                aria-valuemax={entries.length}
                                aria-valuenow={checkedIn.length}
                                className="h-1.5 overflow-hidden rounded-full bg-white/15"
                            >
                                <div
                                    className="h-full rounded-full bg-emerald-400 transition-[width] duration-300 motion-reduce:transition-none"
                                    style={{ width: `${attendancePercent}%` }}
                                />
                            </div>
                        </div>
                    </footer>
                    <Button
                        ref={exitKioskRef}
                        variant="ghost"
                        onClick={toggleKiosk}
                        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 min-h-11 gap-2 rounded-full bg-black/25 px-4 text-xs text-white/70 hover:bg-black/50 hover:text-white"
                    >
                        <LogOut aria-hidden="true" />
                        Exit Kiosk Mode
                    </Button>
                </>
            )}
        </section>
    );
}
