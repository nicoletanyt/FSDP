import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    CalendarDays,
    Clock3,
    MapPin,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import InstructorDataStatus from "./InstructorDataStatus";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useAuth } from "@/hooks/use-auth";
import { instructorQueryKeys as queryKeys, instructorQueryTimes as queryTimes } from "@/lib/instructor/query-keys";
import { previousHistoryPage } from "@/lib/instructor/history-placeholder";
import { InstructorDataError } from "@/lib/instructor/errors";
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
import FilterPopover, { FilterField } from "@/components/FilterPopover";

const PAGE_SIZE = 20;

function SessionHistoryCard({
    session,
    selected,
}: {
    session: StudentHistoryEntry;
    selected: boolean;
}) {
    const attendance = toAttendanceState(session.record.attendance_status);
    const { starts_at, ends_at } = session.event;
    const now = Date.now();
    const phase =
        !starts_at || !ends_at
            ? "unknown"
            : now < Date.parse(starts_at)
                ? "upcoming"
                : now < Date.parse(ends_at)
                    ? "in-progress"
                    : "past";
    return (
        <Card
            size="sm"
            data-session-id={session.event.id}
            data-selected={selected || undefined}
            data-phase={phase}
            className={cn(
                "detail-card session-history-card gap-4 border border-transparent bg-card py-4",
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
        </Card>
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
    const queryClient = useQueryClient();
    const { session, profile } = useAuth();
    const userId = profile?.role === "instructor" ? session?.user.id : undefined;
    const [attendance, setAttendance] = useState<AttendanceState | "all">("all");
    const [sort, setSort] = useState("newest");
    const [page, setPage] = useState(0);
    const load = useCallback(
        async (signal: AbortSignal) => {
            const result = await api.getStudentHistory(studentId, {
                eventType: "class",
                attendance: attendance === "all" ? undefined : attendance,
                oldestFirst: sort === "oldest",
                offset: page * PAGE_SIZE,
                limit: PAGE_SIZE,
                signal,
            });
            if (result.offset !== page * PAGE_SIZE || result.limit !== PAGE_SIZE) {
                throw new InstructorDataError("invalid_data", "The session history does not match the requested page.");
            }
            return result;
        },
        [api, studentId, attendance, sort, page],
    );
    const history = useInstructorQuery(
        (uid) => queryKeys.studentHistory(uid, studentId, { attendance, sort, page, pageSize: PAGE_SIZE }),
        load,
        {
            ...queryTimes.studentHistory,
            placeholderData: (previous, previousQuery) =>
                previousHistoryPage(
                    queryClient,
                    userId,
                    studentId,
                    { attendance, sort, page, pageSize: PAGE_SIZE },
                    previous,
                    previousQuery,
                ),
        },
    );
    useEffect(() => {
        if (
            history.status === "success" && !history.isPlaceholderData &&
            page > 0 &&
            page * PAGE_SIZE >= history.data.total
        ) {
            setPage(Math.max(0, Math.ceil(history.data.total / PAGE_SIZE) - 1));
        }
    }, [history.status, history.data, history.isPlaceholderData, page]);
    const displayedPage = history.status === "success" ? Math.floor(history.data.offset / PAGE_SIZE) : page;
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
        <section aria-label="Session history" aria-busy={history.isPlaceholderData} className="detail-section">
            {history.isPlaceholderData && <p role="status" className="sr-only">Loading requested page. Showing page {displayedPage + 1}.</p>}
            <div className="detail-section-header">
                <h2 className="font-semibold">Session history</h2>
                <FilterPopover title="Filter sessions" activeCount={activeCount} onReset={filters.onReset}>
                    <FilterField
                        label="Attendance"
                        value={attendance}
                        onChange={(value) => filters.onAttendanceChange(value as AttendanceState | "all")}
                        ariaLabel="Attendance filter"
                        options={[
                            { value: "all", label: "All attendance" },
                            ...(["present", "late", "absent", "excused", "unmarked"] as const).map((value) => ({
                                value,
                                label: `${value[0].toUpperCase()}${value.slice(1)}`,
                            })),
                        ]}
                    />
                    <FilterField
                        label="Date order"
                        value={sort}
                        onChange={filters.onSortChange}
                        ariaLabel="Date order"
                        options={[
                            { value: "newest", label: "Newest first" },
                            { value: "oldest", label: "Oldest first" },
                        ]}
                    />
                </FilterPopover>
            </div>
            {history.status !== "success" ? (
                <InstructorDataStatus
                    loading={history.status === "loading"}
                    error={history.error}
                    onRetry={history.retry}
                    variant="history"
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
                                <SessionHistoryCard
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
                                disabled={displayedPage === 0}
                                onClick={() => setPage(displayedPage - 1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                                Previous
                            </Button>
                            <span className="detail-meta text-sm">
                                Page {displayedPage + 1} of {Math.ceil(history.data.total / PAGE_SIZE)}
                            </span>
                            <Button
                                variant="outline"
                                size="touch"
                                disabled={(displayedPage + 1) * PAGE_SIZE >= history.data.total}
                                onClick={() => setPage(displayedPage + 1)}
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
