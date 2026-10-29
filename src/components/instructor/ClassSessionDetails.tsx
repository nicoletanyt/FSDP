import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
    Check,
    CircleCheck,
    CircleMinus,
    CircleX,
    MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadSession, saveSession, studentDetailsHref, students } from "@/lib/instructor-calendar";
import type {
    Attendance,
    CalendarEvent,
    SessionRecord,
    Student,
    StudentSession,
} from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";
import { sessionPhase, studentSessionHistory } from "@/lib/instructor-student-details";

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
        const label = value === "present" ? "Present" : value === "absent" ? "Absent" : "Unmarked";
        return (
            <span
                role="img"
                aria-label={`Attendance for ${student.name}: ${label}`}
                title={label}
                className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    value === "present" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : value === "absent" ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                            : "bg-muted text-muted-foreground",
                )}
            >
                {value === "present" ? <CircleCheck aria-hidden="true" className="size-4" />
                    : value === "absent" ? <CircleX aria-hidden="true" className="size-4 text-red-600 dark:text-red-400" />
                        : <CircleMinus aria-hidden="true" className="size-4" />}
            </span>
        );
    }

    return (
        <div
            role="group"
            aria-label={`Attendance for ${student.name}`}
            className="flex shrink-0 items-center gap-0.5"
        >
            <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={value === "present"}
                aria-label={`Mark ${student.name} present${value === "present" ? " · selected, click again to clear" : ""}`}
                title={
                    value === "present" ? "Present · click to clear" : "Mark present"
                }
                onClick={() => onChange(value === "present" ? "unmarked" : "present")}
                className={cn(
                    "size-7 rounded-full text-muted-foreground/45 transition-colors duration-200 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/50",
                    value === "present" &&
                    "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900",
                )}
            >
                <CircleCheck aria-hidden="true" className="size-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={value === "absent"}
                aria-label={`Mark ${student.name} absent${value === "absent" ? " · selected, click again to clear" : ""}`}
                title={value === "absent" ? "Absent · click to clear" : "Mark absent"}
                onClick={() => onChange(value === "absent" ? "unmarked" : "absent")}
                className={cn(
                    "size-7 rounded-full text-muted-foreground/45 transition-colors duration-200 hover:bg-muted hover:text-muted-foreground",
                    value === "absent" && "bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-600 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900 dark:hover:text-red-400",
                )}
            >
                <CircleX aria-hidden="true" className="size-4" />
            </Button>
        </div>
    );
}

const beltColors: Record<string, string> = {
    white: "border-slate-300 bg-white dark:border-slate-500",
    yellow: "border-yellow-500 bg-yellow-400",
    orange: "border-orange-500 bg-orange-500",
    green: "border-green-600 bg-green-600",
    blue: "border-blue-600 bg-blue-600",
    brown: "border-amber-900 bg-amber-800",
    black:
        "border-slate-950 bg-slate-950 dark:border-slate-300 dark:bg-slate-200",
};

function BeltIndicator({ grade }: { grade: string }) {
    const color = grade.toLowerCase().split(" ")[0];
    return (
        <span
            aria-label={`${grade} belt`}
            title={`${grade} belt`}
            className={cn(
                "inline-block size-3 shrink-0 rounded-full border shadow-xs",
                beltColors[color] ?? "border-muted-foreground bg-muted",
            )}
        />
    );
}

export default function ClassSessionDetails({
    event,
}: {
    event: CalendarEvent;
}) {
    const [record, setRecord] = useState(() => {
        const initial = loadSession(event);
        const currentTime = new Date();
        if (sessionPhase(event, currentTime) === "past") {
            // Match student history, including any explicitly saved attendance.
            for (const student of students.filter((item) => event.studentIds.includes(item.id))) {
                const history = studentSessionHistory(student, currentTime, event)
                    .find((item) => item.event.id === event.id);
                if (history) initial[student.id].attendance = history.attendance;
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
    const marked = roster.filter((student) => record[student.id].attendance !== "unmarked").length;
    const allPresent = roster.length > 0 && roster.every((student) => record[student.id].attendance === "present");

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
        <div className="border-t border-foreground/10 bg-background/60">
            <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                    <h4 className="font-semibold">
                        Attendance
                    </h4>
                    <span aria-live="polite" className="text-muted-foreground">
                        {marked}/{roster.length} marked
                    </span>
                </div>
            </div>

            <ul
                aria-label="Student roster"
                className="max-h-80 divide-y overflow-y-auto overscroll-contain border-foreground/5 px-3"
            >
                {roster.map((student) => {
                    const value = record[student.id];
                    return (
                        <li key={student.id} className="py-1.5">
                            <div className="flex min-h-7 items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <BeltIndicator grade={student.beltGrade} />
                                    <Link
                                        to={studentDetailsHref(student.id, event, isGrading ? "grading" : undefined)}
                                        className="rounded-sm text-[11px] focus-visible:outline-2 focus-visible:outline-ring"
                                    >
                                        {student.name}
                                    </Link>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <AttendanceControls
                                        student={student}
                                        value={value.attendance}
                                        readOnly={isPast}
                                        onChange={(attendance) => updateStudent(student.id, { attendance })}
                                    />
                                    <Button
                                        render={<Link to={studentDetailsHref(student.id, event, isGrading ? "grading" : "sessions")} />}
                                        nativeButton={false}
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={isGrading ? `View grading details for ${student.name}` : `View sessions and feedback for ${student.name}`}
                                        title={isGrading ? "View student grading details" : "View student sessions and feedback"}
                                        className={cn(value.comment && "bg-muted")}
                                    >
                                        <MessageSquare aria-hidden="true" />
                                    </Button>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {!isPast && (
                <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <Button variant="outline" size="sm" onClick={toggleAllAttendance} className="h-auto min-h-7 min-w-0 shrink py-1 whitespace-normal">
                            {allPresent ? <CircleX aria-hidden="true" /> : <Check aria-hidden="true" />}
                            {allPresent ? "Mark All Absent" : "Mark All Present"}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
