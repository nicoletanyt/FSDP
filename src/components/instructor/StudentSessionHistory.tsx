import { useId, useState } from "react";
import {
    CalendarDays,
    Check,
    Clock3,
    CircleCheck,
    CircleX,
    Filter,
    MapPin,
    Pencil,
    Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { InstructorAvatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import {
    currentInstructor,
    formatTime,
    resolveInstructorProfile,
    saveStudentFeedback,
} from "@/lib/instructor-calendar";
import type { Attendance, Student } from "@/lib/instructor-calendar";
import { sessionPhase } from "@/lib/instructor-student-details";
import type { StudentHistorySession } from "@/lib/instructor-student-details";
import { cn } from "@/lib/utils";

const sessionDateFormat = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

function AttendanceBadge({ value }: { value: Attendance }) {
    return (
        <span
            role="img"
            aria-label={value}
            className={cn(
                "detail-status inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium capitalize",
                value === "present"
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : value === "absent"
                        ? "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                        : "bg-muted text-muted-foreground",
            )}
        >
            {value === "present" && (
                <CircleCheck aria-hidden="true" className="size-4" />
            )}
            {value === "absent" && <CircleX aria-hidden="true" className="size-4" />}
            {value === "unmarked" && value}
        </span>
    );
}

function SessionReport({
    session,
    student,
    selected,
    now,
    onSaved,
}: {
    session: StudentHistorySession;
    student: Student;
    selected: boolean;
    now: Date;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(session.feedback);
    const toast = useToast();
    const { profile } = useAuth();
    const phase = sessionPhase(session.event, now);
    const report = session.feedback.trim();
    const currentAuthor = profile
        ? {
            id: profile.id,
            name:
                [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
                profile.email,
        }
        : currentInstructor;
    const sessionAuthor = session.reportAuthor ?? {
        id: session.event.instructorId,
        name: session.instructor,
    };
    const currentInstructorProfile = profile
        ? {
            id: profile.id,
            name:
                [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
                profile.email,
            role: "Instructor",
        }
        : null;
    const authorProfile = resolveInstructorProfile(
        sessionAuthor.id,
        sessionAuthor.name,
        currentInstructorProfile,
    );

    return (
        <Card
            size="sm"
            data-session-id={session.event.id}
            data-selected={selected || undefined}
            data-phase={phase}
            className={cn(
                "detail-card session-report gap-4 border border-transparent bg-card py-4",
                selected && "border-primary/30 ring-0",
            )}
        >
            <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-4">
                    <CardTitle className="min-w-0 text-base font-semibold">
                        <h3>{session.event.name}</h3>
                    </CardTitle>
                    <AttendanceBadge value={session.attendance} />
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-4 lg:gap-y-2">
                    <div className="detail-meta flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                            {sessionDateFormat.format(session.event.date)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <Clock3 aria-hidden="true" className="size-4 shrink-0" />
                            {formatTime(session.event.startTime)} –{" "}
                            {formatTime(session.event.endTime)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <MapPin aria-hidden="true" className="size-4 shrink-0" />
                            {session.event.dojo}
                        </span>
                    </div>
                    <InstructorAvatar
                        profile={authorProfile}
                        showName
                        interactive={false}
                        avatarClassName="size-7 lg:size-6"
                    />
                </div>
            </CardHeader>
            <CardContent>
                <div className="mb-4 border-t lg:mb-2" aria-hidden="true" />
                <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-3 lg:mb-2 lg:min-h-8">
                    <h4 className="text-sm font-semibold text-foreground">
                        Instructor report
                    </h4>
                    {!editing && report && (
                        <Button
                            variant="ghost"
                            size="touch"
                            className="-mr-1 w-11 px-0 md:w-auto md:px-3"
                            aria-label="Edit report"
                            onClick={() => {
                                setDraft(session.feedback);
                                setEditing(true);
                            }}
                        >
                            <Pencil aria-hidden="true" />
                            <span className="hidden md:inline">Edit report</span>
                        </Button>
                    )}
                </div>
                {editing ? (
                    <form
                        className="space-y-2"
                        onSubmit={(submit) => {
                            submit.preventDefault();
                            saveStudentFeedback(
                                session.event,
                                student.id,
                                draft.trim(),
                                session.attendance,
                                session.reportAuthor ?? currentAuthor,
                            );
                            setEditing(false);
                            onSaved();
                            toast.add({ title: "Report saved", type: "success" });
                        }}
                    >
                        <Label htmlFor={`report-${session.event.id}`} className="sr-only">
                            Instructor report
                        </Label>
                        <Textarea
                            id={`report-${session.event.id}`}
                            value={draft}
                            onChange={(change) => setDraft(change.target.value)}
                            rows={2}
                            className="detail-body min-h-24 bg-background text-sm"
                            placeholder="What went well? What should they work on next?"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="touch"
                                onClick={() => setEditing(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" size="touch">
                                <Check aria-hidden="true" />
                                Save
                            </Button>
                        </div>
                    </form>
                ) : report ? (
                    <p
                        className={cn(
                            "detail-body max-w-prose whitespace-pre-wrap text-sm wrap-break-word",
                            "text-foreground",
                        )}
                    >
                        {report}
                    </p>
                ) : (
                    <Button
                        variant="default"
                        size="touch"
                        className="max-md:w-full"
                        onClick={() => {
                            setDraft(session.feedback);
                            setEditing(true);
                        }}
                    >
                        <Plus aria-hidden="true" />
                        Add report
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

function SessionFilters({
    attendance,
    sort,
    onAttendanceChange,
    onSortChange,
    onReset,
    active,
    inline = false,
}: {
    attendance: Attendance | "all";
    sort: string;
    onAttendanceChange: (value: Attendance | "all") => void;
    onSortChange: (value: string) => void;
    onReset: () => void;
    active: boolean;
    inline?: boolean;
}) {
    const filterId = useId();
    const selectClassName =
        "detail-body h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-9";

    return (
        <div className={inline ? "flex flex-wrap items-end gap-3" : "grid gap-3"}>
            <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${filterId}-attendance`} className="detail-label">Attendance</Label>
                <select
                    id={`${filterId}-attendance`}
                    value={attendance}
                    onChange={(event) => onAttendanceChange(event.target.value as Attendance | "all")}
                    className={selectClassName}
                >
                    <option value="all">All attendance</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="unmarked">Unmarked</option>
                </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${filterId}-sort`} className="detail-label">Date order</Label>
                <select
                    id={`${filterId}-sort`}
                    value={sort}
                    onChange={(event) => onSortChange(event.target.value)}
                    className={selectClassName}
                >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </select>
            </div>
            {active && (
                <Button variant="ghost" size="touch" onClick={onReset}>
                    Reset filters
                </Button>
            )}
        </div>
    );
}

export default function StudentSessionHistory({
    sessions,
    student,
    contextId,
    now,
    onSaved,
}: {
    sessions: StudentHistorySession[];
    student: Student;
    contextId?: string;
    now: Date;
    onSaved: () => void;
}) {
    const [attendance, setAttendance] = useState<Attendance | "all">("all");
    const [sort, setSort] = useState("newest");
    const activeFilterCount = Number(attendance !== "all") + Number(sort !== "newest");
    const visibleSessions = sessions
        .filter(
            (session) => attendance === "all" || session.attendance === attendance,
        )
        .sort(
            (a, b) =>
                (a.event.date.getTime() - b.event.date.getTime() ||
                    a.event.startTime.localeCompare(b.event.startTime)) *
                (sort === "oldest" ? 1 : -1),
        );
    function resetFilters() {
        setAttendance("all");
        setSort("newest");
    }

    return (
        <section aria-label="Session history" className="detail-section">
            <div className="detail-section-header">
                <h2 className="font-semibold">Session history</h2>
                <div className="hidden lg:block">
                    <SessionFilters
                        attendance={attendance}
                        sort={sort}
                        onAttendanceChange={setAttendance}
                        onSortChange={setSort}
                        onReset={resetFilters}
                        active={activeFilterCount > 0}
                        inline
                    />
                </div>
                <Popover>
                    <PopoverTrigger
                        render={
                            <Button
                                variant={activeFilterCount ? "secondary" : "outline"}
                                size="touch"
                                className="lg:hidden"
                                aria-label={`Filter sessions${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}
                            />
                        }
                    >
                        <Filter aria-hidden="true" />
                        Filter
                        {activeFilterCount > 0 && (
                            <span className="detail-status rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground">
                                {activeFilterCount}
                            </span>
                        )}
                    </PopoverTrigger>
                    <PopoverContent align="end" className="student-detail-view w-72 gap-3 lg:hidden">
                        <PopoverTitle>Filter sessions</PopoverTitle>
                        <SessionFilters
                            attendance={attendance}
                            sort={sort}
                            onAttendanceChange={setAttendance}
                            onSortChange={setSort}
                            onReset={resetFilters}
                            active={activeFilterCount > 0}
                        />
                    </PopoverContent>
                </Popover>
            </div>
            {activeFilterCount > 0 && (
                <p role="status" className="detail-meta text-sm text-muted-foreground">
                    {visibleSessions.length} of {sessions.length} sessions
                    {attendance !== "all" && ` · ${attendance[0].toUpperCase()}${attendance.slice(1)}`}
                    {sort === "oldest" && " · Oldest first"}
                </p>
            )}
            <div className="space-y-5 lg:space-y-3">
                {visibleSessions.length ? (
                    visibleSessions.map((session) => (
                        <SessionReport
                            key={session.event.id}
                            session={session}
                            student={student}
                            selected={session.event.id === contextId}
                            now={now}
                            onSaved={onSaved}
                        />
                    ))
                ) : (
                    <Card size="sm" className="detail-card">
                        <CardContent className="detail-body py-3 text-sm text-muted-foreground">
                            {sessions.length
                                ? "No sessions match this attendance filter."
                                : "No training sessions recorded."}
                        </CardContent>
                    </Card>
                )}
            </div>
        </section>
    );
}
