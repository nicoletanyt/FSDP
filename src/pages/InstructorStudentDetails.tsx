import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
    ChevronLeft,
    ChevronRight,
    HeartPulse,
    Mail,
    MapPin,
    Phone,
    Target,
    TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StudentSessionHistory from "@/components/instructor/StudentSessionHistory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastProvider } from "@/components/ui/toast";
import {
    assessmentHref,
    calendarHref,
    findCalendarEvent,
    fullDate,
    studentDetailsHref,
    students,
} from "@/lib/instructor-calendar";
import type { CalendarEvent, Student } from "@/lib/instructor-calendar";
import {
    beltColorClass,
    getStudentProfile,
    studentAttendanceSummary,
    studentGradingHistory,
    studentSessionHistory,
} from "@/lib/instructor-student-details";
import { cn } from "@/lib/utils";

type Profile = ReturnType<typeof getStudentProfile>;
type DetailTab = "overview" | "sessions" | "grading";

function StudentInformation({ profile }: { profile: Profile }) {
    return (
        <Card size="sm" className="gap-3">
            <CardHeader className="gap-1.5">
                <h2 className="text-xs font-semibold text-muted-foreground">Student</h2>
                <CardTitle className="text-xl font-semibold group-data-[size=sm]/card:text-xl">
                    <h1>{profile.name}</h1>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{profile.studentNumber}</p>
                <p className="mt-1 flex items-center gap-2 text-sm">
                    <span
                        aria-hidden="true"
                        className={cn(
                            "size-3 shrink-0 rounded-full border",
                            beltColorClass(profile.beltGrade),
                        )}
                    />
                    {profile.beltGrade}
                </p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-3 border-t pt-3">
                    <div>
                        <dt className="text-xs text-muted-foreground">Principal dojo</dt>
                        <dd className="mt-0.5 flex items-center gap-1.5 text-xs">
                            <MapPin
                                aria-hidden="true"
                                className="size-3.5 text-muted-foreground"
                            />
                            {profile.principalDojo}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Membership</dt>
                        <dd
                            className={cn(
                                "mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                                profile.membershipStatus === "Active"
                                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                    : "bg-muted text-muted-foreground",
                            )}
                        >
                            {profile.membershipStatus}
                        </dd>
                    </div>
                </dl>
                <section
                    className="space-y-1.5 border-t pt-3"
                    aria-label="Contact information"
                >
                    <h2 className="text-xs font-semibold">Contact</h2>
                    <a
                        href={`mailto:${profile.email}`}
                        className="flex items-start gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <Mail aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                        <span className="break-all">{profile.email}</span>
                    </a>
                    <a
                        href={`tel:${profile.phone.replaceAll(" ", "")}`}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <Phone aria-hidden="true" className="size-3.5" />
                        {profile.phone}
                    </a>
                    <div className="space-y-1 pt-2" aria-label="Emergency contact">
                        <h3 className="text-[11px] font-medium text-muted-foreground">
                            Emergency contact
                        </h3>
                        <p className="text-xs">
                            <span className="font-medium">
                                {profile.emergencyContact.name}
                            </span>
                            <span className="text-muted-foreground">
                                {" "}
                                · {profile.emergencyContact.relationship}
                            </span>
                        </p>
                        <a
                            href={`tel:${profile.emergencyContact.phone.replaceAll(" ", "")}`}
                            className="inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                            {profile.emergencyContact.phone}
                        </a>
                    </div>
                </section>
                <section
                    className="space-y-2 border-t pt-3"
                    aria-label="Medical alerts"
                >
                    <h2 className="flex items-center gap-1.5 text-xs font-semibold">
                        <HeartPulse aria-hidden="true" className="size-3.5" />
                        Medical alerts
                    </h2>
                    {profile.medicalAlerts.length ? (
                        profile.medicalAlerts.map((alert) => (
                            <p
                                key={alert}
                                className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                                {alert}
                            </p>
                        ))
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            No medical alerts noted.
                        </p>
                    )}
                </section>
            </CardContent>
        </Card>
    );
}

function GradingRequirements({
    profile,
    attended,
}: {
    profile: Profile;
    attended: number;
}) {
    const requirements = [
        { label: "Training sessions", current: attended, required: 12 },
        {
            label: "Technique syllabus checks",
            current: profile.techniqueChecks,
            required: 8,
        },
        {
            label: "Kata assessment",
            current: profile.kataComplete ? 1 : 0,
            required: 1,
        },
    ];
    const progress = Math.round(
        (requirements.reduce(
            (total, item) => total + Math.min(item.current / item.required, 1),
            0,
        ) /
            requirements.length) *
        100,
    );
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                        <Target
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                        />
                        Next grading
                    </CardTitle>
                    <span className="text-xs font-medium tabular-nums">
                        {progress}% ready
                    </span>
                </div>
                <p className="text-xs text-muted-foreground">
                    {profile.beltGrade} <span aria-hidden="true">→</span>{" "}
                    {profile.targetGrade}
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {requirements.map((item) => (
                    <div key={item.label} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                            <span>{item.label}</span>
                            <span className="text-muted-foreground tabular-nums">
                                {item.current}/{item.required}
                            </span>
                        </div>
                        <progress
                            aria-label={item.label}
                            value={Math.min(item.current, item.required)}
                            max={item.required}
                            className="block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
                        />
                    </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                    Illustrative grading requirements · Dummy data
                </p>
            </CardContent>
        </Card>
    );
}

function NextGradingSummary({
    profile,
    assessmentRecorded,
    onViewGrading,
}: {
    profile: Profile;
    assessmentRecorded: boolean;
    onViewGrading: () => void;
}) {
    return (
        <section className="space-y-3">
            <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold">Next grading</h2>
                <Button variant="ghost" size="sm" onClick={onViewGrading} className="ml-auto">
                    View grading
                    <ChevronRight aria-hidden="true" />
                </Button>
            </div>
            <Card size="sm">
                <CardContent className="space-y-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                            <dt className="text-muted-foreground">Current rank</dt>
                            <dd className="mt-1 flex items-center gap-2 font-medium">
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "size-2.5 shrink-0 rounded-full border",
                                        beltColorClass(profile.beltGrade),
                                    )}
                                />
                                {profile.beltGrade}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Next grade</dt>
                            <dd className="mt-1 font-medium">{profile.targetGrade}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Eligibility</dt>
                            <dd className="mt-1 font-medium">Not yet verified</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Technical assessment</dt>
                            <dd className="mt-1 font-medium">
                                {assessmentRecorded ? "Recorded" : "Not yet verified"}
                            </dd>
                        </div>
                    </dl>
                    <p className="text-[11px] text-muted-foreground">
                        Eligibility is separate from technical assessment.
                    </p>
                </CardContent>
            </Card>
        </section>
    );
}

function StudentDetailContent({
    student,
    context,
    today,
    now,
}: {
    student: Student;
    context: CalendarEvent | undefined;
    today: Date;
    now: Date;
}) {
    const [params, setParams] = useSearchParams();
    const tabParam = params.get("tab");
    const activeTab: DetailTab =
        tabParam === "sessions" || tabParam === "grading" ? tabParam : "overview";
    const [sessions, setSessions] = useState(() =>
        studentSessionHistory(student, now, context),
    );
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
    const profile = getStudentProfile(student, today);
    const gradingHistory = studentGradingHistory(student, today, context);
    const roster = context
        ? context.studentIds
            .map((id) => students.find((item) => item.id === id))
            .filter((item): item is Student => !!item)
        : [];
    const position = roster.findIndex((item) => item.id === student.id);
    const previous = roster[position - 1];
    const next = roster[position + 1];
    const {
        pastSessions,
        markedSessions,
        attended,
        attendanceRate,
        lastAttended,
        periodStart,
        periodEnd,
        consecutiveAbsences,
    } = studentAttendanceSummary(sessions, now);
    const recentFeedback = pastSessions
        .filter((item) => item.feedback.trim())
        .slice(0, 2);
    const assessmentRecorded = gradingHistory.some(
        (assessment) =>
            assessment.status === "Completed" &&
            assessment.fromGrade === profile.beltGrade &&
            assessment.toGrade === profile.targetGrade,
    );
    const monthsInRank = Math.max(
        0,
        (today.getFullYear() - profile.rankAwardedOn.getFullYear()) * 12 +
        today.getMonth() -
        profile.rankAwardedOn.getMonth() -
        (today.getDate() < profile.rankAwardedOn.getDate() ? 1 : 0),
    );

    function selectTab(value: DetailTab) {
        setParams(
            (current) => {
                const nextParams = new URLSearchParams(current);
                nextParams.set("tab", value);
                return nextParams;
            },
            { replace: true },
        );
    }

    return (
        <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                    render={
                        <Link
                            to={context ? calendarHref(context) : "/instructor/students"}
                        />
                    }
                    nativeButton={false}
                    variant="ghost"
                    className="-ml-2"
                >
                    <ChevronLeft aria-hidden="true" />
                    {context ? "Back to calendar" : "Back to students"}
                </Button>
                {roster.length > 1 && (
                    <div
                        className="flex flex-wrap items-center gap-2 sm:gap-3"
                        role="group"
                        aria-label="Students in this class"
                    >
                        <Button
                            render={
                                previous ? (
                                    <Link
                                        to={studentDetailsHref(previous.id, context, activeTab)}
                                    />
                                ) : undefined
                            }
                            nativeButton={!previous}
                            variant="outline"
                            size="sm"
                            disabled={!previous}
                            className="disabled:bg-muted disabled:text-muted-foreground"
                            aria-label={
                                previous
                                    ? `Previous student: ${previous.name}`
                                    : "Previous student"
                            }
                        >
                            <ChevronLeft aria-hidden="true" />
                            Previous
                        </Button>
                        <span className="text-xs text-muted-foreground tabular-nums">
                            Student {position + 1} of {roster.length}
                        </span>
                        <Button
                            render={
                                next ? (
                                    <Link to={studentDetailsHref(next.id, context, activeTab)} />
                                ) : undefined
                            }
                            nativeButton={!next}
                            variant="outline"
                            size="sm"
                            disabled={!next}
                            className="disabled:bg-muted disabled:text-muted-foreground"
                            aria-label={next ? `Next student: ${next.name}` : "Next student"}
                        >
                            Next
                            <ChevronRight aria-hidden="true" />
                        </Button>
                    </div>
                )}
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
                <aside
                    ref={sidebarRef}
                    className={cn(
                        "order-2 min-w-0 lg:order-1",
                        sidebarFits && "lg:sticky lg:top-4",
                    )}
                >
                    <StudentInformation profile={profile} />
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
                    className="order-1 min-w-0 gap-4 lg:order-2"
                >
                    <TabsList aria-label="Student training details" className="w-full">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="sessions">Sessions</TabsTrigger>
                        <TabsTrigger value="grading">Grading</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-5">
                        <section className="space-y-3">
                            <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                                <h2 className="text-sm font-semibold">Attendance</h2>
                                <p className="ml-auto text-right text-[11px] text-muted-foreground">
                                    {periodStart && periodEnd
                                        ? `Reporting period: ${fullDate(periodStart)} – ${fullDate(periodEnd)}`
                                        : "No completed sessions recorded"}
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Card size="sm">
                                    <CardContent>
                                        <p className="text-xs text-muted-foreground">
                                            Attendance rate
                                        </p>
                                        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
                                            <span className="text-2xl font-semibold">
                                                {attendanceRate === null ? "—" : `${attendanceRate}%`}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                · {attended}/{markedSessions.length} sessions
                                            </span>
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card size="sm">
                                    <CardContent>
                                        <p className="text-xs text-muted-foreground">
                                            Last attended
                                        </p>
                                        <p className="mt-2 text-lg font-semibold tabular-nums">
                                            {lastAttended
                                                ? fullDate(lastAttended.event.date)
                                                : "Not recorded"}
                                        </p>
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                            {lastAttended
                                                ? `${lastAttended.event.name} · ${lastAttended.event.dojo}`
                                                : "No attended sessions in this history"}
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                            {consecutiveAbsences >= 2 && (
                                <p
                                    role="status"
                                    className="flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                                >
                                    <TriangleAlert
                                        aria-hidden="true"
                                        className="mt-0.5 size-3.5 shrink-0"
                                    />
                                    {consecutiveAbsences} consecutive absences in the most recent
                                    recorded sessions. Review attendance in the Sessions tab.
                                </p>
                            )}
                        </section>
                        <section className="space-y-3">
                            <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                                <h2 className="text-sm font-semibold">Recent lesson feedback</h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => selectTab("sessions")}
                                    className="ml-auto"
                                >
                                    All sessions
                                    <ChevronRight aria-hidden="true" />
                                </Button>
                            </div>
                            <Card size="sm">
                                <CardContent className="space-y-4">
                                    {recentFeedback.length ? (
                                        recentFeedback.map((session) => (
                                            <article key={session.event.id} className="border-l-2 pl-3">
                                                <p className="text-xs font-medium">
                                                    {session.event.name}{" "}
                                                    <span className="font-normal text-muted-foreground">
                                                        · {fullDate(session.event.date)} ·{" "}
                                                        {session.reportAuthor?.name ?? session.instructor}
                                                    </span>
                                                </p>
                                                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                                    {session.feedback}
                                                </p>
                                            </article>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            No feedback recorded yet. Add notes from the Sessions tab.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </section>
                        <NextGradingSummary
                            profile={profile}
                            assessmentRecorded={assessmentRecorded}
                            onViewGrading={() => selectTab("grading")}
                        />
                    </TabsContent>

                    <TabsContent value="sessions">
                        <StudentSessionHistory
                            sessions={sessions}
                            student={student}
                            contextId={context?.id}
                            now={now}
                            onSaved={() =>
                                setSessions(studentSessionHistory(student, now, context))
                            }
                        />
                    </TabsContent>

                    <TabsContent value="grading" className="space-y-4">
                        {context?.type === "grading" && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Selected grading session</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">
                                        {context.name} · {fullDate(context.date)}
                                    </p>
                                    <Button
                                        render={<Link to={assessmentHref(context, student.id)} />}
                                        nativeButton={false}
                                    >
                                        Open assessment
                                        <ChevronRight aria-hidden="true" />
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                        <Card>
                            <CardHeader>
                                <CardTitle>Current rank</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <dl className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <dt className="text-xs text-muted-foreground">
                                            Belt grade
                                        </dt>
                                        <dd className="mt-1 flex items-center gap-2 font-medium">
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "size-3 shrink-0 rounded-full border",
                                                    beltColorClass(student.beltGrade),
                                                )}
                                            />
                                            {student.beltGrade}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-muted-foreground">
                                            Time in rank
                                        </dt>
                                        <dd className="mt-1 font-medium">
                                            {monthsInRank} {monthsInRank === 1 ? "month" : "months"}
                                        </dd>
                                        <dd className="mt-1 text-[11px] text-muted-foreground">
                                            Since {fullDate(profile.rankAwardedOn)}
                                        </dd>
                                    </div>
                                </dl>
                            </CardContent>
                        </Card>
                        <GradingRequirements profile={profile} attended={attended} />
                        <Card>
                            <CardHeader>
                                <CardTitle>Previous grading assessments</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {gradingHistory.length ? (
                                    gradingHistory.map((assessment) => (
                                        <article key={assessment.id} className="border-l-2 pl-3">
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-xs font-medium">
                                                        {assessment.fromGrade} → {assessment.toGrade}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                                        {fullDate(assessment.date)} ·{" "}
                                                        {assessment.instructor}
                                                    </p>
                                                </div>
                                                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                                    {assessment.status}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                                {assessment.feedback}
                                            </p>
                                        </article>
                                    ))
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        No previous grading assessments. The first assessment will
                                        appear here.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </section>
    );
}

export default function InstructorStudentDetails() {
    const { studentId } = useParams();
    const [params] = useSearchParams();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const student = students.find((item) => item.id === studentId);
    const requestedContext = findCalendarEvent(
        params.get("session") ?? params.get("class") ?? undefined,
    );
    if (!student)
        return (
            <section className="space-y-4">
                <Button
                    render={
                        <Link
                            to={
                                requestedContext
                                    ? calendarHref(requestedContext)
                                    : "/instructor/students"
                            }
                        />
                    }
                    nativeButton={false}
                    variant="outline"
                >
                    <ChevronLeft aria-hidden="true" />
                    {requestedContext ? "Back to calendar" : "Back to students"}
                </Button>
                <h1 className="text-2xl font-semibold">Student not found</h1>
            </section>
        );
    const context = requestedContext?.studentIds.includes(student.id)
        ? requestedContext
        : undefined;
    return (
        <ToastProvider>
            <StudentDetailContent
                key={`${student.id}-${context?.id ?? "direct"}`}
                student={student}
                context={context}
                today={today}
                now={now}
            />
        </ToastProvider>
    );
}
