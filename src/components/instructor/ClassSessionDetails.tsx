import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
    Check,
    ChevronDown,
    CircleCheck,
    CircleMinus,
    CircleX,
    MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import GradeBadge from "@/components/GradeBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    loadSession,
    saveSession,
    studentDetailsHref,
    students,
} from "@/lib/instructor-calendar";
import type {
    Attendance,
    CalendarEvent,
    SessionRecord,
    Student,
    StudentSession,
} from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";
import {
    sessionPhase,
    studentSessionHistory,
} from "@/lib/instructor-student-details";

function AttendanceControls({
    student,
    value,
    onChange,
    readOnly = false,
}: {
    student: Student;
    value: Attendance;
    onChange: (value: Attendance) => void;
    readOnly?: boolean;
}) {
    if (readOnly) {
        const label =
            value === "present"
                ? "Present"
                : value === "absent"
                    ? "Absent"
                    : "Unmarked";
        return (
            <div className="flex w-15 shrink-0 items-center justify-center">
                <span
                    role="img"
                    aria-label={`Attendance for ${student.name}: ${label}`}
                    title={label}
                    className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full",
                        value === "present"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : value === "absent"
                                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                                : "bg-muted text-muted-foreground",
                    )}
                >
                    {value === "present" ? (
                        <CircleCheck aria-hidden="true" className="size-4" />
                    ) : value === "absent" ? (
                        <CircleX aria-hidden="true" className="size-4" />
                    ) : (
                        <CircleMinus aria-hidden="true" className="size-4" />
                    )}
                </span>
            </div>
        );
    }

    return (
        <div
            role="group"
            aria-label={`Attendance for ${student.name}`}
            className="grid w-15 shrink-0 grid-cols-2 gap-1"
        >
            <Tooltip>
                <TooltipTrigger render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-pressed={value === "present"}
                        aria-label={`Mark ${student.name} present${value === "present" ? " · selected, click again to clear" : ""}`}
                        onClick={() => onChange(value === "present" ? "unmarked" : "present")}
                        className={cn(
                            "size-7 rounded-md text-foreground/70 transition-colors hover:bg-emerald-100 hover:text-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-300",
                            value === "present" &&
                            "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:hover:text-emerald-950",
                        )}
                    />
                }>
                    <CircleCheck aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{value === "present" ? "Present · click to clear" : "Present"}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-pressed={value === "absent"}
                        aria-label={`Mark ${student.name} absent${value === "absent" ? " · selected, click again to clear" : ""}`}
                        onClick={() => onChange(value === "absent" ? "unmarked" : "absent")}
                        className={cn(
                            "size-7 rounded-md text-foreground/70 transition-colors hover:bg-rose-100 hover:text-rose-800 dark:hover:bg-rose-950 dark:hover:text-rose-300",
                            value === "absent" &&
                            "bg-rose-600 text-white hover:bg-rose-700 hover:text-white dark:bg-rose-500 dark:text-rose-950 dark:hover:bg-rose-400 dark:hover:text-rose-950",
                        )}
                    />
                }>
                    <CircleX aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{value === "absent" ? "Absent · click to clear" : "Absent"}</TooltipContent>
            </Tooltip>
        </div>
    );
}

export default function ClassSessionDetails({
    event,
    summary = false,
    expanded = true,
    showAttendanceToggle = true,
    fillHeight = false,
    onToggle,
}: {
    event: CalendarEvent;
    summary?: boolean;
    expanded?: boolean;
    showAttendanceToggle?: boolean;
    fillHeight?: boolean;
    onToggle?: () => void;
}) {
    const [record, setRecord] = useState(() => {
        const initial = loadSession(event);
        const currentTime = new Date();
        if (sessionPhase(event, currentTime) === "past") {
            // Match student history, including any explicitly saved attendance.
            for (const student of students.filter((item) =>
                event.studentIds.includes(item.id),
            )) {
                const history = studentSessionHistory(
                    student,
                    currentTime,
                    event,
                ).find((item) => item.event.id === event.id);
                if (history)
                    initial[student.id].attendance = history.attendance;
            }
        }
        return initial;
    });
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const isPast = sessionPhase(event, now) === "past";
    const isGrading = event.type === "grading";
    const roster = students.filter((student) =>
        event.studentIds.includes(student.id),
    );
    const marked = roster.filter(
        (student) => record[student.id].attendance !== "unmarked",
    ).length;
    const allPresent =
        roster.length > 0 &&
        roster.every((student) => record[student.id].attendance === "present");

    function persistRecord(next: SessionRecord) {
        if (sessionPhase(event, new Date()) === "past") return;
        saveSession(event.id, next);
        setRecord(next);
    }

    function updateStudent(id: string, changes: Partial<StudentSession>) {
        persistRecord({
            ...record,
            [id]: { ...record[id], ...changes },
        });
    }

    function toggleAllAttendance() {
        const attendance = allPresent ? "absent" : "present";
        persistRecord(
            Object.fromEntries(
                Object.entries(record).map(([id, value]) => [
                    id,
                    { ...value, attendance },
                ]),
            ),
        );
    }

    return (
        <div
            className={cn(
                "bg-background text-foreground",
                fillHeight && "flex min-h-0 flex-1 flex-col",
                !summary && "border-t border-foreground/10",
            )}
        >
            {summary && showAttendanceToggle && (
                <div className="shrink-0 px-3 pb-2">
                    <Button
                        variant="ghost"
                        onClick={onToggle}
                        aria-expanded={expanded}
                        aria-controls={`attendance-${event.id}`}
                        className="h-9 w-full justify-between px-3 text-xs"
                    >
                        {expanded ? "Hide Attendance" : "View Attendance"}
                        <ChevronDown
                            aria-hidden="true"
                            className={cn(
                                "size-3 transition-transform motion-reduce:transition-none",
                                expanded && "rotate-180",
                            )}
                        />
                    </Button>
                </div>
            )}
            <div
                id={summary ? `attendance-${event.id}` : undefined}
                hidden={summary && !expanded}
                className={cn(fillHeight && (!summary || expanded) && "flex min-h-0 flex-1 flex-col")}
            >
                {!summary && (
                    <div className="shrink-0 space-y-2 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                            <h4 className="font-semibold">Attendance</h4>
                            <span
                                aria-live="polite"
                                className="text-muted-foreground"
                            >
                                {marked}/{roster.length} marked
                            </span>
                        </div>
                    </div>
                )}
                <TooltipProvider>
                    <ul
                        aria-label="Student roster"
                        className={cn(
                            "my-2 divide-y divide-border/50 overflow-y-auto overscroll-contain bg-muted/25",
                            fillHeight ? "min-h-0 flex-1" : "max-h-80",
                        )}
                    >
                        {roster.map((student) => {
                            const value = record[student.id];
                            return (
                                <li key={student.id} className="grid h-14 grid-cols-[minmax(0,1fr)_92px] grid-rows-[28px_16px] items-center gap-x-2 gap-y-0.5 px-3 py-1">
                                    <span title={student.name} className="min-w-0 truncate text-2xs font-medium">
                                        {student.name}
                                    </span>
                                    <div className="col-start-2 row-span-2 row-start-1 grid w-[92px] grid-cols-[60px_28px] items-center gap-1 self-center">
                                        <AttendanceControls
                                            student={student}
                                            value={value.attendance}
                                            readOnly={isPast}
                                            onChange={(attendance) => updateStudent(student.id, { attendance })}
                                        />
                                        <Tooltip>
                                            <TooltipTrigger render={
                                                <Button
                                                    render={
                                                        <Link to={studentDetailsHref(student.id, event, isGrading ? "grading" : "sessions")} />
                                                    }
                                                    nativeButton={false}
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={isGrading
                                                        ? `View grading details for ${student.name}`
                                                        : `View sessions and feedback for ${student.name}`}
                                                    className={cn(
                                                        "size-7 rounded-md text-foreground/70 hover:text-foreground",
                                                        value.comment && "bg-accent text-foreground",
                                                    )}
                                                />
                                            }>
                                                <MessageSquare aria-hidden="true" />
                                            </TooltipTrigger>
                                            <TooltipContent>Note</TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <div className="col-start-1 row-start-2 flex min-w-0 items-center">
                                        <GradeBadge
                                            rank={student.rank}
                                            system={student.gradingSystem}
                                            className="h-4 rounded-none border-0 bg-transparent p-0 text-[11px] leading-4 text-muted-foreground [&>span:first-child]:font-normal [&>[aria-hidden]]:h-1.5 [&>[aria-hidden]]:w-3"
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </TooltipProvider>
                {!isPast && (
                    <div className="shrink-0 border-t border-border/50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={toggleAllAttendance}
                                className="h-auto min-h-8 min-w-0 shrink px-3 py-1.5 text-xs whitespace-normal"
                            >
                                {allPresent ? (
                                    <CircleX aria-hidden="true" />
                                ) : (
                                    <Check aria-hidden="true" />
                                )}
                                {allPresent
                                    ? "Mark All Absent"
                                    : "Mark All Present"}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
