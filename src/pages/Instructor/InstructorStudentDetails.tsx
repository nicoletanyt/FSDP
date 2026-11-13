import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import {
    ChevronLeft,
    ChevronRight,
    Info,
    TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { StudentInformationCards, StudentInformationActions } from "@/components/instructor/StudentInformation";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import StudentAvatar from "@/components/instructor/StudentAvatar";
import InstructorLoadingBoundary from "@/components/instructor/InstructorLoadingBoundary";
import { InstructorSkeleton } from "@/components/instructor/InstructorSkeletons";
import StudentSessionHistory from "@/components/instructor/StudentSessionHistory";
import StudentGradingRead from "@/components/instructor/StudentGradingRead";
import StudentApplications from "@/components/instructor/StudentApplications";
import { useAuth } from "@/hooks/use-auth";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { instructorQueryKeys as queryKeys, instructorQueryTimes as queryTimes } from "@/lib/instructor/query-keys";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { gradingEventDate, parseEntityId } from "@/lib/instructor/adapters";
import { calendarEventId } from "@/lib/instructor/calendar-view";
import { loadStudentGrading } from "@/lib/instructor/grading";
import { directoryStudent, singaporeToday } from "@/lib/instructor/directory";
import { cachedStudentPreview } from "@/lib/instructor/student-preview";
import {
    attendanceTotals,
    historyDate,
    loadStudentContext,
} from "@/lib/instructor/student-detail";
import type { StudentDetail, StudentId } from "@/lib/instructor/types";
import { cn } from "cn";

type DetailTab = "overview" | "sessions" | "grading";

function AttendanceSummary({ studentId }: { studentId: StudentId }) {
    const api = useInstructorApi();
    const load = useCallback(
        (signal: AbortSignal) => api.getStudentSummary(studentId, signal),
        [api, studentId],
    );
    const summary = useInstructorQuery(userId => queryKeys.studentSummary(userId, studentId), load, queryTimes.studentHistory);
    const totals = summary.data && attendanceTotals(summary.data);
    return (
        <section className="detail-section" aria-label="Attendance summary">
            <div className="detail-section-header">
                <h2>Attendance</h2>
                {summary.status === "success" && (
                    <Popover>
                        <PopoverTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-touch"
                                    aria-label="Attendance reporting period"
                                    className="text-muted-foreground"
                                />
                            }
                        >
                            <Info aria-hidden="true" className="size-4" />
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className="student-detail-view gap-2"
                        >
                            <PopoverTitle>Reporting period</PopoverTitle>
                            <p className="detail-meta text-sm text-muted-foreground">
                                {summary.data.periodStart && summary.data.periodEnd
                                    ? `${historyDate(summary.data.periodStart)} – ${historyDate(summary.data.periodEnd)}`
                                    : "No completed sessions recorded"}
                            </p>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
            {summary.status !== "success" ? (
                <InstructorDataStatus
                    loading={summary.status === "loading"}
                    error={summary.error}
                    onRetry={summary.retry}
                />
            ) : (
                <>
                    <Card size="sm" className="detail-card">
                        <CardContent>
                            <dl className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <dt className="detail-label text-xs text-muted-foreground">
                                        Attendance rate
                                    </dt>
                                    <dd className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
                                        <span className="text-2xl font-semibold">
                                            {totals?.rate == null ? "—" : `${totals.rate}%`}
                                        </span>
                                        <span className="detail-meta text-sm text-muted-foreground">
                                            {totals?.attended}/{totals?.eligible} sessions
                                        </span>
                                    </dd>
                                </div>
                                <div className="border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                                    <dt className="detail-label text-xs text-muted-foreground">
                                        Last attended
                                    </dt>
                                    <dd>
                                        <p className="mt-2 text-lg font-semibold tabular-nums">
                                            {summary.data.lastAttended
                                                ? historyDate(summary.data.lastAttended.event.starts_at)
                                                : "Not recorded"}
                                        </p>
                                        <p className="detail-meta mt-1 text-sm text-muted-foreground">
                                            {summary.data.lastAttended
                                                ? `${summary.data.lastAttended.event.name} · ${summary.data.lastAttended.centre?.name ?? "Dojo not recorded"}`
                                                : "No attended sessions recorded"}
                                        </p>
                                    </dd>
                                </div>
                            </dl>
                        </CardContent>
                    </Card>
                    {summary.data.consecutiveAbsences >= 2 && (
                        <p
                            role="status"
                            className="detail-body flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                        >
                            <TriangleAlert
                                aria-hidden="true"
                                className="mt-0.5 size-3.5 shrink-0"
                            />
                            {summary.data.consecutiveAbsences} consecutive absences in the
                            most recent sessions. Review attendance in the Sessions tab.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}

function StudentDetailContent({ detail }: { detail: StudentDetail }) {
    const api = useInstructorApi();
    const [params, setParams] = useSearchParams();
    const requestedContext = params.get("session") ?? params.get("class");
    const loadContext = useCallback(
        (signal: AbortSignal) =>
            loadStudentContext(api, parseEntityId(requestedContext && calendarEventId(requestedContext), "event"), signal),
        [api, requestedContext],
    );
    const context = useInstructorQuery(
        userId => queryKeys.studentContext(userId, requestedContext?.toLowerCase() ?? ''),
        loadContext,
        { ...queryTimes.roster, enabled: !!requestedContext },
    );
    const linkedContext = context.data?.roster.some(
        (entry) => entry.student.student.id === detail.student.id,
    )
        ? context.data
        : null;
    const roster = linkedContext?.roster ?? [];
    const position = roster.findIndex(
        (entry) => entry.student.student.id === detail.student.id,
    );
    const previous = roster[position - 1]?.student;
    const next = roster[position + 1]?.student;
    const profile = directoryStudent(detail, singaporeToday());
    const tab = params.get("tab");
    const activeTab: DetailTab =
        tab === "sessions" || tab === "grading" ? tab : "overview";
    const loadGrading = useCallback(
        (signal: AbortSignal) => loadStudentGrading(api, detail.student.id, signal),
        [api, detail.student.id],
    );
    const grading = useInstructorQuery(userId => queryKeys.studentGrading(userId, detail.student.id), loadGrading,
        queryTimes.studentGrading);
    const sidebarRef = useRef<HTMLElement>(null);
    const [sidebarFits, setSidebarFits] = useState(false);
    useEffect(() => {
        const sidebar = sidebarRef.current;
        if (!sidebar) return;
        const update = () =>
            setSidebarFits(
                sidebar.getBoundingClientRect().height <= window.innerHeight - 32,
            );
        const observer = new ResizeObserver(update);
        observer.observe(sidebar);
        window.addEventListener("resize", update);
        update();
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", update);
        };
    }, []);
    function selectTab(value: DetailTab) {
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set("tab", value);
                return next;
            },
            { replace: true },
        );
    }
    const contextHref = (id: string) => {
        const nextParams = new URLSearchParams(params);
        nextParams.set("tab", activeTab);
        return `/instructor/students/${id}?${nextParams}`;
    };
    const backHref = linkedContext
        ? `/instructor/calendar?session=${linkedContext.session.event.id}${gradingEventDate(linkedContext.session.event, linkedContext.session.grading) ? `&date=${gradingEventDate(linkedContext.session.event, linkedContext.session.grading)}` : ""}`
        : "/instructor/students";
    return (
        <section className="student-detail-view space-y-2 md:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 max-w-full items-center justify-between gap-2 max-md:w-full">
                    <Button
                        render={<Link to={backHref} />}
                        nativeButton={false}
                        variant="ghost"
                        className="-ml-5 max-w-full min-w-0 max-md:h-auto max-md:min-h-11 max-md:shrink max-md:py-2"
                    >
                        <ChevronLeft aria-hidden="true" />
                        <h1 className="min-w-0 text-left whitespace-normal md:hidden">
                            {profile.name}
                        </h1>
                        <span className="hidden md:inline">
                            {linkedContext ? "Back to calendar" : "Back to students"}
                        </span>
                    </Button>
                </div>
                {roster.length > 1 && (
                    <div
                        className="flex flex-wrap items-center gap-2 sm:gap-3"
                        role="group"
                        aria-label="Students in this class"
                    >
                        <Button
                            render={
                                previous ? (
                                    <Link to={contextHref(previous.student.id)} />
                                ) : undefined
                            }
                            nativeButton={!previous}
                            variant="outline"
                            size="touch"
                            disabled={!previous}
                        >
                            <ChevronLeft aria-hidden="true" />
                            Previous
                        </Button>
                        <span className="text-xs text-muted-foreground tabular-nums">
                            Student {position + 1} of {roster.length}
                        </span>
                        <Button
                            render={
                                next ? <Link to={contextHref(next.student.id)} /> : undefined
                            }
                            nativeButton={!next}
                            variant="outline"
                            size="touch"
                            disabled={!next}
                        >
                            Next
                            <ChevronRight aria-hidden="true" />
                        </Button>
                    </div>
                )}
            </div>
            {requestedContext &&
                (context.status !== "success" ? (
                    <InstructorDataStatus
                        loading={context.status === "loading"}
                        error={context.error}
                        onRetry={context.retry}
                        variant="inline"
                    />
                ) : (
                    !linkedContext && (
                        <p
                            role="status"
                            className="detail-meta text-sm text-muted-foreground"
                        >
                            The selected session is unavailable or this student is not on its
                            roster.
                        </p>
                    )
                ))}
            <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
                <aside
                    ref={sidebarRef}
                    className={cn(
                        "order-2 min-w-0 max-md:hidden lg:order-1",
                        sidebarFits && "lg:sticky lg:top-4",
                    )}
                >
                    <section
                        aria-label="Student details"
                        className="hidden space-y-4 md:block"
                    >
                        <div>
                            <StudentAvatar name={profile.name} className="mb-3" />
                            <h1 className="text-xl font-semibold">{profile.name}</h1>
                            <p className="detail-meta mt-1 text-sm text-muted-foreground">
                                {profile.memberNo}{profile.age !== null && ` · Age ${profile.age}`}
                            </p>
                        </div>
                        <StudentInformationCards detail={detail} />
                        <StudentInformationActions detail={detail} showDetailsLink={false} />
                    </section>
                </aside>
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => {
                        if (
                            value === "overview" ||
                            value === "sessions" ||
                            value === "grading"
                        )
                            selectTab(value);
                    }}
                    className="order-1 min-w-0 gap-6 md:gap-4 max-md:order-1 lg:order-2"
                >
                    <TabsList
                        aria-label="Student training details"
                        className="w-full"
                        touch
                    >
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="sessions">Sessions</TabsTrigger>
                        <TabsTrigger value="grading">Grading</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="space-y-6">
                        <section
                            aria-label="Student details"
                            className="detail-section md:hidden"
                        >
                            <div className="detail-section-header">
                                <h2>Details</h2>
                            </div>
                            <StudentAvatar name={profile.name} />
                            <p className="detail-meta text-sm text-muted-foreground">
                                {profile.memberNo}{profile.age !== null && ` · Age ${profile.age}`}
                            </p>
                            <StudentInformationCards detail={detail} />
                            <StudentInformationActions detail={detail} showDetailsLink={false} />
                        </section>
                        <AttendanceSummary studentId={detail.student.id} />
                        <StudentGradingRead title="Next grading" detail={detail} reads={grading} onRetry={grading.retry} onViewGrading={() => selectTab("grading")} />
                        <StudentApplications studentId={detail.student.id} today={singaporeToday()} />
                        <StudentGradingRead title="Technique checklist" detail={detail} reads={grading} onRetry={grading.retry} />
                    </TabsContent>
                    <TabsContent value="sessions">
                        <StudentSessionHistory
                            studentId={detail.student.id}
                            contextId={linkedContext?.session.event.id}
                        />
                    </TabsContent>
                    <TabsContent value="grading" className="space-y-6">
                        <StudentGradingRead title="Grading eligibility" detail={detail} reads={grading} onRetry={grading.retry} />
                        <StudentApplications studentId={detail.student.id} today={singaporeToday()} />
                        <StudentGradingRead title="Grading history" detail={detail} reads={grading} onRetry={grading.retry} />
                    </TabsContent>
                </Tabs>
            </div>
        </section>
    );
}

function StudentDetailPage() {
    const api = useInstructorApi();
    const client = useQueryClient();
    const { session, profile } = useAuth();
    const { studentId } = useParams();
    const load = useCallback(
        (signal: AbortSignal) =>
            api.getStudentDetail(parseEntityId(studentId, "student"), signal),
        [api, studentId],
    );
    const detail = useInstructorQuery(userId => queryKeys.studentDetail(userId, studentId?.toLowerCase() ?? ''), load, queryTimes.student);
    if (detail.status === "loading") {
        const userId = profile?.role === 'instructor' && profile.id === session?.user.id ? session.user.id : undefined;
        return <InstructorSkeleton variant="student-detail" entry={cachedStudentPreview(client, userId, studentId)} />;
    }
    if (detail.status === "error")
        return (
            <section className="student-detail-view space-y-4">
                <Button
                    render={<Link to="/instructor/students" />}
                    nativeButton={false}
                    variant="outline"
                >
                    <ChevronLeft aria-hidden="true" />
                    Back to students
                </Button>
                <InstructorDataStatus
                    error={detail.error}
                    onRetry={detail.retry}
                />
            </section>
        );
    if (!detail.data)
        return (
            <section className="student-detail-view space-y-4">
                <Button
                    render={<Link to="/instructor/students" />}
                    nativeButton={false}
                    variant="outline"
                >
                    <ChevronLeft aria-hidden="true" />
                    Back to students
                </Button>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Student not found</h1>
                <p className="text-sm text-muted-foreground">
                    This student record is unavailable.
                </p>
            </section>
        );
    return (
        <StudentDetailContent
            key={`${session?.user.id}:${detail.data.student.id}`}
            detail={detail.data}
        />
    );
}

export default function InstructorStudentDetails() {
    return (
        <InstructorLoadingBoundary>
            <StudentDetailPage />
        </InstructorLoadingBoundary>
    );
}
