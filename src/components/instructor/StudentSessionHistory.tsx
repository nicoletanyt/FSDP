import { useCallback, useEffect, useId, useState } from "react";
import {
    CalendarDays,
    Clock3,
    Filter,
    MapPin,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { InstructorAvatar } from "@/components/ui/avatar";
import InstructorDataStatus from "./InstructorDataStatus";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { toAttendanceState } from "@/lib/instructor/adapters";
import {
    historyDate,
    historyTimeRange,
    instructorName,
} from "@/lib/instructor/student-detail";
import type {
    AttendanceState,
    StudentHistoryEntry,
    StudentId,
} from "@/lib/instructor/types";
import { cn } from "cn";

const PAGE_SIZE = 20;

function SessionReport({
    session,
    selected,
}: {
    session: StudentHistoryEntry;
    selected: boolean;
}) {
    const attendance = toAttendanceState(session.record.attendance_status);
    const report = session.record.report?.trim();
    const author = session.reportAuthor;
    const phase =
        Date.now() < Date.parse(session.event.starts_at)
            ? "upcoming"
            : Date.now() < Date.parse(session.event.ends_at)
                ? "in-progress"
                : "past";
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
                    <span
                        role="img"
                        aria-label={attendance}
                        className={cn(
                            "detail-status shrink-0 rounded-md px-2 py-0.5 text-sm font-medium capitalize",
                            attendance === "present"
                                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                : attendance === "late"
                                    ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                    : attendance === "absent"
                                        ? "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                                        : "bg-muted text-muted-foreground",
                        )}
                    >
                        {attendance}
                    </span>
                </div>
                <div className="detail-meta flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                        {historyDate(session.event.starts_at)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Clock3 aria-hidden="true" className="size-4 shrink-0" />
                        {historyTimeRange(session.event.starts_at, session.event.ends_at)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-4 shrink-0" />
                        {session.centre?.name ?? "Dojo not recorded"}
                    </span>
                </div>
                <p className="detail-meta text-sm text-muted-foreground">
                    Class instructor: {instructorName(session.instructor)}
                </p>
                {session.event.status === "cancelled" && (
                    <p className="detail-meta text-sm text-muted-foreground">
                        Cancelled session
                    </p>
                )}
            </CardHeader>
            <CardContent>
                <div className="mb-4 border-t lg:mb-2" aria-hidden="true" />
                <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-3 lg:mb-2 lg:min-h-8">
                    <h4 className="text-sm font-semibold">Instructor report</h4>
                    <Button variant="ghost" size="touch" disabled>
                        {report ? "Edit report" : "Add report"}
                    </Button>
                </div>
                {report ? (
                    <>
                        {author ? (
                            <InstructorAvatar
                                profile={{
                                    id: author.id,
                                    name: instructorName(author),
                                    role: "Instructor",
                                }}
                                showName
                                interactive={false}
                                avatarClassName="size-7 lg:size-6"
                            />
                        ) : (
                            <p className="detail-meta text-sm text-muted-foreground">
                                Report author not recorded
                            </p>
                        )}
                        <p className="detail-body mt-3 max-w-prose whitespace-pre-wrap text-sm wrap-break-word">
                            {report}
                        </p>
                    </>
                ) : (
                    <p className="detail-body text-sm text-muted-foreground">
                        No report recorded.
                    </p>
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
    inline = false,
}: {
    attendance: AttendanceState | "all";
    sort: string;
    onAttendanceChange: (value: AttendanceState | "all") => void;
    onSortChange: (value: string) => void;
    onReset: () => void;
    inline?: boolean;
}) {
    const id = useId();
    const selectClassName =
        "detail-body h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-9";
    return (
        <div className={inline ? "flex flex-wrap items-end gap-3" : "grid gap-3"}>
            <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${id}-attendance`} className="detail-label">
                    Attendance
                </Label>
                <select
                    id={`${id}-attendance`}
                    value={attendance}
                    onChange={(event) =>
                        onAttendanceChange(event.target.value as AttendanceState | "all")
                    }
                    className={selectClassName}
                >
                    <option value="all">All attendance</option>
                    {(["present", "late", "absent", "excused", "unmarked"] as const).map(
                        (value) => (
                            <option key={value} value={value}>
                                {value[0].toUpperCase()}
                                {value.slice(1)}
                            </option>
                        ),
                    )}
                </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${id}-sort`} className="detail-label">
                    Date order
                </Label>
                <select
                    id={`${id}-sort`}
                    value={sort}
                    onChange={(event) => onSortChange(event.target.value)}
                    className={selectClassName}
                >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </select>
            </div>
            {(attendance !== "all" || sort !== "newest") && (
                <Button variant="ghost" size="touch" onClick={onReset}>
                    Reset filters
                </Button>
            )}
        </div>
    );
}

export default function StudentSessionHistory({
    studentId,
    contextId,
}: {
    studentId: StudentId;
    contextId?: string;
}) {
    const api = useInstructorApi();
    const [attendance, setAttendance] = useState<AttendanceState | "all">("all");
    const [sort, setSort] = useState("newest");
    const [page, setPage] = useState(0);
    const load = useCallback(
        (signal: AbortSignal) =>
            api.getStudentHistory(studentId, {
                eventType: "class",
                attendance: attendance === "all" ? undefined : attendance,
                oldestFirst: sort === "oldest",
                offset: page * PAGE_SIZE,
                limit: PAGE_SIZE,
                signal,
            }),
        [api, studentId, attendance, sort, page],
    );
    const history = useInstructorQuery(
        JSON.stringify(["student-history", studentId, attendance, sort, page]),
        load,
    );
    useEffect(() => {
        if (
            history.status === "success" &&
            page > 0 &&
            page * PAGE_SIZE >= history.data.total
        ) {
            setPage(Math.max(0, Math.ceil(history.data.total / PAGE_SIZE) - 1));
        }
    }, [history.status, history.data, page]);
    const activeCount = Number(attendance !== "all") + Number(sort !== "newest");
    const filters = {
        attendance,
        sort,
        onAttendanceChange: (value: AttendanceState | "all") => {
            setAttendance(value);
            setPage(0);
        },
        onSortChange: (value: string) => {
            setSort(value);
            setPage(0);
        },
        onReset: () => {
            setAttendance("all");
            setSort("newest");
            setPage(0);
        },
    };
    return (
        <section aria-label="Session history" className="detail-section">
            <div className="detail-section-header">
                <h2 className="font-semibold">Session history</h2>
                <div className="hidden lg:block">
                    <SessionFilters {...filters} inline />
                </div>
                <Popover>
                    <PopoverTrigger
                        render={
                            <Button
                                variant={activeCount ? "secondary" : "outline"}
                                size="touch"
                                className="lg:hidden"
                                aria-label={`Filter sessions${activeCount ? `, ${activeCount} active` : ""}`}
                            />
                        }
                    >
                        <Filter aria-hidden="true" />
                        Filter
                        {activeCount > 0 && (
                            <span className="detail-status rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground">
                                {activeCount}
                            </span>
                        )}
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        className="student-detail-view w-72 gap-3 lg:hidden"
                    >
                        <PopoverTitle>Filter sessions</PopoverTitle>
                        <SessionFilters {...filters} />
                    </PopoverContent>
                </Popover>
            </div>
            {history.status !== "success" ? (
                <InstructorDataStatus
                    loading={history.status === "loading"}
                    error={history.error}
                    onRetry={history.retry}
                />
            ) : (
                <>
                    <p
                        role="status"
                        className="detail-meta text-sm text-muted-foreground"
                    >
                        {history.data.total} sessions
                        {attendance !== "all" && ` · ${attendance}`}
                    </p>
                    <div className="space-y-5 lg:space-y-3">
                        {history.data.items.length ? (
                            history.data.items.map((session) => (
                                <SessionReport
                                    key={session.event.id}
                                    session={session}
                                    selected={session.event.id === contextId}
                                />
                            ))
                        ) : (
                            <Card size="sm" className="detail-card">
                                <CardContent className="detail-body py-3 text-sm text-muted-foreground">
                                    {attendance === "all"
                                        ? "No training sessions recorded."
                                        : "No sessions match this attendance filter."}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                    {history.data.total > PAGE_SIZE && (
                        <nav
                            aria-label="Session history pages"
                            className="flex flex-wrap items-center justify-between gap-3"
                        >
                            <Button
                                variant="outline"
                                size="touch"
                                disabled={page === 0}
                                onClick={() => setPage((value) => value - 1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                                Previous
                            </Button>
                            <span className="detail-meta text-sm">
                                Page {page + 1} of {Math.ceil(history.data.total / PAGE_SIZE)}
                            </span>
                            <Button
                                variant="outline"
                                size="touch"
                                disabled={(page + 1) * PAGE_SIZE >= history.data.total}
                                onClick={() => setPage((value) => value + 1)}
                            >
                                Next
                                <ChevronRight aria-hidden="true" />
                            </Button>
                        </nav>
                    )}
                </>
            )}
        </section>
    );
}
