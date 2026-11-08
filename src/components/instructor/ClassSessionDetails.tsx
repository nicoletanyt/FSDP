import { useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
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
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import GradeBadge from "@/components/instructor/DatabaseGradeBadge";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import StudentTrainingDialog from "./StudentTrainingDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useInstructorAttendance } from "@/hooks/use-instructor-attendance";
import { parseEntityId } from "@/lib/instructor/adapters";
import { attendanceEditable, editableAttendanceRows } from "@/lib/instructor/attendance";
import { rosterAttendance } from "@/lib/instructor/calendar-view";
import { studentDetailsHref } from "@/lib/instructor-calendar";
import type { CalendarViewEvent as CalendarEvent } from "@/lib/instructor/calendar-view";
import type { AttendanceState as Attendance, GradeRow, StudentEntry } from "@/lib/instructor/types";
import { cn } from "@/lib/utils";

type Student = { id: string; name: string; grade: GradeRow | null; entry: StudentEntry };

function AttendanceControls({
    student,
    value,
    onChange,
    pending = false,
    readOnly = false,
}: {
    student: Student;
    value: Attendance;
    onChange?: (value: Attendance) => void;
    pending?: boolean;
    readOnly?: boolean;
}) {
    if (readOnly || value === "late" || value === "excused") {
        const label =
            value === "present"
                ? "Present"
                : value === "late" ? "Late"
                : value === "excused" ? "Excused"
                : value === "absent"
                    ? "Absent"
                    : "Unmarked";
        return (
            <div className="flex size-11 shrink-0 items-center justify-center text-xs lg:h-auto lg:w-15">
                <span
                    role="img"
                    aria-label={`Attendance for ${student.name}: ${label}`}
                    title={label}
                    className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full",
                        value === "late" && "w-auto rounded-md px-1.5 text-xs font-medium",
                        value === "present"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : value === "late" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                            : value === "absent"
                                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                                : "bg-muted text-muted-foreground",
                    )}
                >
                    {value === "late" ? "Late" : value === "present" ? (
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
            className="flex shrink-0 lg:grid lg:w-15 lg:grid-cols-2 lg:gap-1"
        >
            <Tooltip>
                <TooltipTrigger render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-pressed={value === "present"}
                        disabled={!onChange || pending}
                        aria-label={`Mark ${student.name} present${value === "present" ? onChange ? " · selected, click again to clear" : " · recorded" : ""}`}
                        onClick={() => onChange?.(value === "present" ? "unmarked" : "present")}
                        className={cn(
                            "size-11 rounded-md px-0 text-xs text-foreground/70 transition-colors hover:bg-emerald-100 hover:text-emerald-800 lg:size-7 dark:hover:bg-emerald-950 dark:hover:text-emerald-300",
                            value === "present" &&
                            "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:hover:text-emerald-950",
                        )}
                    />
                }>
                    <CircleCheck aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{value === "present" && onChange ? "Present · click to clear" : "Present"}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-pressed={value === "absent"}
                        disabled={!onChange || pending}
                        aria-label={`Mark ${student.name} absent${value === "absent" ? onChange ? " · selected, click again to clear" : " · recorded" : ""}`}
                        onClick={() => onChange?.(value === "absent" ? "unmarked" : "absent")}
                        className={cn(
                            "size-11 rounded-md px-0 text-xs text-foreground/70 transition-colors hover:bg-rose-100 hover:text-rose-800 lg:size-7 dark:hover:bg-rose-950 dark:hover:text-rose-300",
                            value === "absent" &&
                            "bg-rose-600 text-white hover:bg-rose-700 hover:text-white dark:bg-rose-500 dark:text-rose-950 dark:hover:bg-rose-400 dark:hover:text-rose-950",
                        )}
                    />
                }>
                    <CircleX aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{value === "absent" && onChange ? "Absent · click to clear" : "Absent"}</TooltipContent>
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
    const { session, profile } = useAuth();
    const dialogContext = JSON.stringify([event.id, session?.user.id, profile?.role, expanded]);
    const studentDialogHandle = useMemo(() => DialogPrimitive.createHandle<StudentEntry>(), [dialogContext]);
    const attendance = useInstructorAttendance(parseEntityId(event.id, "event"), expanded);
    const { query } = attendance;
    const entries = attendance.data?.entries ?? [];
    const storedEvent = attendance.data?.session.event;
    const startsAt = storedEvent ? storedEvent.starts_at : event.startsAt;
    const roster: Student[] = entries.map(({ student }) => ({
        id: student.student.id,
        name: [student.student.first_name, student.student.last_name].filter(Boolean).join(" ") || student.student.email,
        grade: student.grade,
        entry: student,
    }));
    const record = Object.fromEntries(entries.map(entry => [entry.record.student_id, {
        attendance: rosterAttendance(entry.record, startsAt),
    }]));
    const [, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const canEdit = storedEvent ? attendanceEditable(storedEvent) : false;
    const isGrading = event.type === "grading";
    const marked = roster.filter(
        (student) => record[student.id].attendance !== "unmarked",
    ).length;
    const editable = editableAttendanceRows(entries, startsAt);
    const allPresent = editable.length > 0 && editable.every(entry => record[entry.record.student_id].attendance === "present");

    return (
        <div
            aria-busy={query.status === "loading" || attendance.pending}
            className={cn(
                "bg-background text-foreground",
                fillHeight && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col",
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
                className={cn(fillHeight && (!summary || expanded) && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col")}
            >
                {!summary && (
                    <div className="shrink-0 space-y-2 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                            <h4 className="font-semibold">Attendance</h4>
                            <span
                                aria-live="polite"
                                className="text-muted-foreground"
                            >
                                {query.status === "success" && attendance.data ? `${marked}/${roster.length} marked` : "…"}
                            </span>
                        </div>
                    </div>
                )}
                {query.status !== "success" ? <InstructorDataStatus loading={query.status === "loading"} error={query.error} onRetry={query.retry} variant="roster" /> : <>
                {attendance.error && <div className="space-y-2 px-3 py-2">
                    <p role="alert" className="text-sm text-destructive">{attendance.error}</p>
                    <Button variant="outline" size="sm" onClick={attendance.retry} disabled={attendance.pending}>{attendance.retryLabel}</Button>
                </div>}
                {attendance.message && <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{attendance.message}</p>}
                {isGrading && attendance.data && <div className="px-3 pt-4 pb-2">
                    <Button variant="outline" size="sm" className="min-h-11 w-full" nativeButton={false} render={<Link to={`/instructor/grading/${event.id}`} />}>
                        View Grading
                    </Button>
                </div>}
                {attendance.data && !roster.length && <p role="status" className="p-4 text-sm text-muted-foreground">No students are registered for this session.</p>}
                <TooltipProvider>
                    <ul
                        aria-label="Student roster"
                        className={cn(
                            "my-2 divide-y divide-border/50 bg-muted/25 lg:overflow-y-auto lg:overscroll-contain",
                            fillHeight ? "lg:min-h-0 lg:flex-1" : "lg:max-h-80",
                        )}
                    >
                        {roster.map((student) => {
                            const value = record[student.id];
                            return (
                                <li key={student.id} className="grid grid-cols-[minmax(0,1fr)_auto_132px] items-center gap-x-2 py-2 lg:min-h-14 lg:grid-cols-[minmax(0,1fr)_92px] lg:grid-rows-[28px_16px] lg:gap-y-0.5 lg:px-3 lg:py-1">
                                    <div className="min-w-0">
                                        <Popover>
                                            <PopoverTrigger aria-label={`Student details: ${student.name}`} className="flex min-h-11 w-full min-w-0 items-center rounded-md text-left text-2xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
                                                <span className="truncate">{student.name}</span>
                                            </PopoverTrigger>
                                            <PopoverContent align="start" className="gap-2">
                                                <PopoverTitle>{student.name}</PopoverTitle>
                                                <GradeBadge grade={student.grade} showBeltLabel />
                                            </PopoverContent>
                                        </Popover>
                                        <span title={student.name} className="hidden min-w-0 truncate text-2xs font-medium lg:block">{student.name}</span>
                                    </div>
                                    <div className="col-start-3 row-start-1 flex w-[132px] items-center justify-end lg:col-start-2 lg:row-span-2 lg:grid lg:w-[92px] lg:grid-cols-[60px_28px] lg:gap-1 lg:self-center">
                                        <AttendanceControls
                                            student={student}
                                            value={value.attendance}
                                            readOnly={!canEdit}
                                            pending={attendance.bulkPending || Boolean(attendance.error) || attendance.rows[student.id]?.optimistic !== undefined}
                                            onChange={canEdit ? (status) => {
                                                if (status === "present" || status === "absent" || status === "unmarked") attendance.mark(status, parseEntityId(student.id, "student"));
                                            } : undefined}
                                        />
                                        <Tooltip>
                                            <TooltipTrigger render={isGrading ? (
                                                <Button
                                                    render={<Link to={studentDetailsHref(student.id, event, "overview")} />}
                                                    nativeButton={false}
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={`View student overview for ${student.name}`}
                                                    className="size-11 rounded-md text-foreground/70 hover:text-foreground lg:size-7"
                                                />
                                            ) : (
                                                <DialogPrimitive.Trigger handle={studentDialogHandle} payload={student.entry} render={
                                                    <Button variant="ghost" size="icon-sm" aria-label={`View student details and techniques for ${student.name}`} className="size-11 rounded-md text-foreground/70 hover:text-foreground lg:size-7" />
                                                } />
                                            )}>
                                                <MessageSquare aria-hidden="true" />
                                            </TooltipTrigger>
                                            <TooltipContent>{isGrading ? "Student overview" : "Student details and techniques"}</TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <div className="col-start-2 row-start-1 flex min-w-0 items-center lg:col-start-1 lg:row-start-2">
                                        <GradeBadge
                                            grade={student.grade}
                                            className="h-auto max-w-16 flex-nowrap rounded-none border-0 bg-transparent p-0 text-[11px] text-muted-foreground lg:h-4 lg:max-w-full lg:leading-4 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate [&>span:first-child]:font-normal [&>[aria-hidden]]:h-1.5 [&>[aria-hidden]]:w-2 lg:[&>[aria-hidden]]:w-3"
                                        />
                                    </div>
                                    {attendance.rows[student.id]?.phase === 'failed' && <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-label={`Attendance save for ${student.name}`}>
                                        {attendance.rows[student.id].retryable ? 'Failed — review the alert and retry.' : 'Not sent — reapply after recovery.'}
                                        {attendance.rows[student.id].phase === 'failed' && attendance.rows[student.id].retryable && attendance.error && <Button variant="outline" size="sm" className="min-h-11 lg:min-h-8" disabled={attendance.pending} onClick={attendance.retry} aria-label={`${attendance.retryLabel} for ${student.name}`}>{attendance.retryLabel}</Button>}
                                    </div>}
                                </li>
                            );
                        })}
                    </ul>
                </TooltipProvider>
                </>}
                {canEdit && (
                    <div className="shrink-0 border-t border-border/50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={attendance.pending || Boolean(attendance.error) || query.status !== "success" || !editable.length}
                                onClick={() => attendance.mark(allPresent ? "absent" : "present")}
                                title="Applies to editable entries; recorded late and excused attendance is preserved."
                                className="h-auto min-h-11 min-w-0 shrink px-3 py-1.5 text-xs whitespace-normal lg:min-h-8"
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
            {!isGrading && expanded && profile?.role === "instructor" && <StudentTrainingDialog key={dialogContext} handle={studentDialogHandle} />}
        </div>
    );
}
