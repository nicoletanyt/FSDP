import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import { ChevronDown, LogOut, Maximize, UserCheck } from "lucide-react";
import CheckInScanner from "@/components/instructor/CheckInScanner";
import type { ScanFeedback } from "@/components/instructor/CheckInScanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTime, students } from "@/lib/instructor-calendar";
import {
    createCheckInSessions,
    recordCheckIn,
    validateCheckInQr,
} from "@/lib/instructor-check-in";
import type { CheckInRecord } from "@/lib/instructor-check-in";
import type { InstructorOutletContext } from "@/layouts/InstructorLayout";
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

export default function InstructorCheckIn() {
    const { isKiosk, setIsKiosk } = useOutletContext<InstructorOutletContext>();
    const [sessions] = useState(() => createCheckInSessions());
    const [sessionId, setSessionId] = useState(sessions[0].id);
    const [records, setRecords] = useState<CheckInRecord[]>([]);
    const recordsRef = useRef<CheckInRecord[]>([]);
    const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
    const scanLocked = useRef(false);
    const enterKioskRef = useRef<HTMLButtonElement>(null);
    const exitKioskRef = useRef<HTMLButtonElement>(null);
    const wasKiosk = useRef(false);
    const session = sessions.find((item) => item.id === sessionId) ?? sessions[0];
    const roster = students.filter((student) =>
        session.studentIds.includes(student.id),
    );
    const attendance = records.filter(
        (record) => record.sessionId === session.id,
    );
    const recent = [...attendance].reverse();
    const attendancePercent = roster.length
        ? (attendance.length / roster.length) * 100
        : 0;
    const sessionDetails = `${session.dojo} · ${dateFormat.format(session.date)} · ${formatTime(session.startTime)}–${formatTime(session.endTime)}`;

    useEffect(() => {
        if (!feedback) return;
        const timeout = window.setTimeout(() => {
            scanLocked.current = false;
            setFeedback(null);
        }, 2000);
        return () => window.clearTimeout(timeout);
    }, [feedback]);

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

    function markAttendance(studentId: string, source: CheckInRecord["source"]) {
        if (scanLocked.current) return;
        scanLocked.current = true;
        const result = recordCheckIn(
            recordsRef.current,
            session,
            studentId,
            source,
        );
        if (result.status === "success") {
            recordsRef.current = result.records;
            setRecords(result.records);
            setFeedback({
                tone: "success",
                title: result.student.name,
                beltGrade: result.student.beltGrade,
                description: "You’re checked in. Welcome to class!",
            });
        } else if (result.status === "duplicate") {
            setFeedback({
                tone: "duplicate",
                title: result.message,
                description: `${result.student.name} is already on today’s attendance list.`,
            });
        } else {
            setFeedback({
                tone: "invalid",
                title: "Unable to check in",
                description: result.message,
            });
        }
    }

    function handleScan(payload: string) {
        if (scanLocked.current) return;
        const validation = validateCheckInQr(payload, session);
        if (!validation.valid) {
            scanLocked.current = true;
            setFeedback({
                tone: "invalid",
                title: "QR code not recognised",
                description: validation.message,
            });
            return;
        }
        markAttendance(validation.student.id, "qr");
    }

    function changeSession(value: string) {
        scanLocked.current = false;
        setFeedback(null);
        setSessionId(value);
    }

    return (
        <section
            data-check-in-kiosk={isKiosk}
            aria-label="Check-in"
            className={cn(
                "flex min-h-0 flex-1 flex-col gap-3",
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
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        className="-ml-2 min-h-11 max-w-full gap-2 px-2 text-left text-xl font-semibold whitespace-normal"
                                    />
                                }
                                aria-label={`Active class: ${session.name}. Change class session`}
                            >
                                {session.name}
                                <ChevronDown aria-hidden="true" className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuRadioGroup
                                    value={sessionId}
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
                    </h1>
                    <p
                        title={sessionDetails}
                        className="max-w-full truncate text-xs text-muted-foreground"
                    >
                        {sessionDetails}
                    </p>
                </div>
                <Button
                    ref={enterKioskRef}
                    onClick={toggleKiosk}
                    aria-pressed={isKiosk}
                    className="ml-auto min-h-11 gap-2 px-4"
                >
                    <Maximize aria-hidden="true" />
                    Enter Kiosk Mode
                </Button>
            </header>

            <div
                className={cn(
                    "grid min-h-0 flex-1",
                    !isKiosk && "gap-3 md:grid-cols-[minmax(0,7fr)_minmax(14rem,3fr)]",
                )}
            >
                {/* Keep one scanner mounted so changing modes preserves the camera stream. */}
                <CheckInScanner
                    feedback={feedback}
                    onScan={handleScan}
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
                                {attendance.length}/{roster.length}
                            </span>{" "}
                            checked in
                        </p>
                    </div>
                    <ul
                        aria-label="Checked-in students"
                        className="max-h-64 min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain px-4 md:max-h-none"
                    >
                        {recent.map((record) => {
                            const student = students.find(
                                (item) => item.id === record.studentId,
                            );
                            return (
                                <li
                                    key={record.studentId}
                                    className="flex items-center justify-between gap-3 py-3.5"
                                >
                                    <span className="min-w-0 break-words text-sm font-medium">
                                        {student?.name ?? "Student"}
                                    </span>
                                    <time
                                        dateTime={record.checkedInAt}
                                        className="shrink-0 text-xs tabular-nums text-muted-foreground"
                                    >
                                        {timeFormat.format(new Date(record.checkedInAt))}
                                    </time>
                                </li>
                            );
                        })}
                        {!recent.length && (
                            <li className="flex min-h-48 flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground">
                                <UserCheck
                                    aria-hidden="true"
                                    className="mb-1 size-7 opacity-40"
                                />
                                <p className="text-sm">No check-ins yet</p>
                                <p className="text-xs">Ready for the first student.</p>
                            </li>
                        )}
                    </ul>
                </Card>
            </div>
            {isKiosk && (
                <>
                    <footer className="shrink-0 border-t border-white/10 px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <div className="mx-auto w-full max-w-lg space-y-2">
                            <p
                                aria-live="polite"
                                aria-atomic="true"
                                className="text-center text-sm text-white/80"
                            >
                                <span className="font-semibold tabular-nums text-white">
                                    {attendance.length} / {roster.length}
                                </span>{" "}
                                students checked in
                            </p>
                            <div
                                role="progressbar"
                                aria-label="Students checked in"
                                aria-valuemin={0}
                                aria-valuemax={roster.length}
                                aria-valuenow={attendance.length}
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
