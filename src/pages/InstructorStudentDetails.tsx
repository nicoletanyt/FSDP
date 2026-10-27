import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleX,
    HeartPulse,
    Mail,
    MapPin,
    MessageSquare,
    Pencil,
    Phone,
    Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
    assessmentHref,
    calendarHref,
    findCalendarEvent,
    formatTime,
    fullDate,
    saveStudentFeedback,
    studentDetailsHref,
    students,
} from "@/lib/instructor-calendar";
import type {
    Attendance,
    CalendarEvent,
    Student,
} from "@/lib/instructor-calendar";
import {
    beltColorClass,
    getStudentProfile,
    studentGradingHistory,
    studentSessionHistory,
} from "@/lib/instructor-student-details";
import type { StudentHistorySession } from "@/lib/instructor-student-details";
import { cn } from "@/lib/utils";

type Profile = ReturnType<typeof getStudentProfile>;
type DetailTab = "overview" | "sessions" | "grading";

function AttendanceBadge({ value }: { value: Attendance }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize",
                value === "present"
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : value === "absent"
                        ? "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                        : "bg-muted text-muted-foreground",
            )}
        >
            {value === "present" && (
                <CircleCheck aria-hidden="true" className="size-3" />
            )}
            {value === "absent" && <CircleX aria-hidden="true" className="size-3" />}
            {value}
        </span>
    );
}

function StudentInformation({ profile }: { profile: Profile }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{profile.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{profile.studentNumber}</p>
                <p className="mt-2 flex items-center gap-2 text-sm">
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
            <CardContent className="space-y-5 text-sm">
                <dl className="space-y-3 border-t pt-4">
                    <div>
                        <dt className="text-xs text-muted-foreground">Principal dojo</dt>
                        <dd className="mt-1 flex items-center gap-1.5">
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
                    className="space-y-2 border-t pt-4"
                    aria-label="Contact information"
                >
                    <h2 className="text-xs font-semibold">Contact information</h2>
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
                </section>
                <section
                    className="space-y-1 border-t pt-4"
                    aria-label="Emergency contact"
                >
                    <h2 className="mb-2 text-xs font-semibold">Emergency contact</h2>
                    <p className="text-xs font-medium">{profile.emergencyContact.name}</p>
                    <p className="text-xs text-muted-foreground">
                        {profile.emergencyContact.relationship}
                    </p>
                    <a
                        href={`tel:${profile.emergencyContact.phone.replaceAll(" ", "")}`}
                        className="inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                        {profile.emergencyContact.phone}
                    </a>
                </section>
                <section
                    className="space-y-2 border-t pt-4"
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
                                className="rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/40 dark:text-amber-200"
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

function SessionFeedback({
    session,
    student,
    selected,
    onSaved,
}: {
    session: StudentHistorySession;
    student: Student;
    selected: boolean;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(session.feedback);
    const [notice, setNotice] = useState("");
    return (
        <Card className={cn(selected && "bg-muted/30")}>
            <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                            {fullDate(session.event.date)} ·{" "}
                            {formatTime(session.event.startTime)}
                            {selected && " · Selected class"}
                        </p>
                        <CardTitle className="text-sm">{session.event.name}</CardTitle>
                    </div>
                    <AttendanceBadge value={session.attendance} />
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin aria-hidden="true" className="size-3" />
                    {session.event.dojo}
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
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
                            );
                            setEditing(false);
                            setNotice("Feedback saved locally.");
                            onSaved();
                        }}
                    >
                        <Label htmlFor={`feedback-${session.event.id}`} className="text-xs">
                            Instructor feedback
                        </Label>
                        <Textarea
                            id={`feedback-${session.event.id}`}
                            value={draft}
                            onChange={(change) => setDraft(change.target.value)}
                            rows={2}
                            className="min-h-16 bg-background"
                            placeholder="What went well? What should they work on next?"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditing(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" size="sm">
                                <Check aria-hidden="true" />
                                Save feedback
                            </Button>
                        </div>
                    </form>
                ) : (
                    <>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            {session.feedback || "No feedback recorded for this session."}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">
                                {session.instructor}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setDraft(session.feedback);
                                    setEditing(true);
                                    setNotice("");
                                }}
                            >
                                <Pencil aria-hidden="true" />
                                {session.feedback ? "Edit feedback" : "Add feedback"}
                            </Button>
                        </div>
                    </>
                )}
                {notice && (
                    <p role="status" className="text-[11px] text-muted-foreground">
                        {notice}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function StudentDetailContent({
    student,
    context,
    today,
}: {
    student: Student;
    context: CalendarEvent | undefined;
    today: Date;
}) {
    const [params, setParams] = useSearchParams();
    const tabParam = params.get("tab");
    const activeTab: DetailTab =
        tabParam === "sessions" || tabParam === "grading" ? tabParam : "overview";
    const [sessions, setSessions] = useState(() =>
        studentSessionHistory(student, today, context),
    );
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
    const markedSessions = sessions.filter(
        (item) => item.event.date <= today && item.attendance !== "unmarked",
    );
    const attended = markedSessions.filter(
        (item) => item.attendance === "present",
    ).length;
    const attendanceRate = markedSessions.length
        ? Math.round((attended / markedSessions.length) * 100)
        : 0;
    const recentFeedback = sessions.filter((item) => item.feedback).slice(0, 3);
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
                    render={<Link to={context ? calendarHref(context) : "/instructor/students"} />}
                    nativeButton={false}
                    variant="ghost"
                    className="-ml-2"
                >
                    <ChevronLeft aria-hidden="true" />
                    {context ? "Back to calendar" : "Back to students"}
                </Button>
                {roster.length > 1 && (
                    <div
                        className="flex items-center gap-4"
                        role="group"
                        aria-label="Students in this class"
                    >
                        <Button
                            render={
                                previous ? <Link to={studentDetailsHref(previous.id, context, activeTab)} /> : undefined
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
                            {position + 1}/{roster.length}
                        </span>
                        <Button
                            render={
                                next ? <Link to={studentDetailsHref(next.id, context, activeTab)} /> : undefined
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
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">
                    {student.name}
                </h1>
                {context && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {context.name} · {fullDate(context.date)}
                    </p>
                )}
            </header>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
                <aside className="order-2 min-w-0 lg:order-1">
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

                    <TabsContent value="overview" className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Card size="sm">
                                <CardContent>
                                    <p className="text-xs text-muted-foreground">
                                        Attendance rate
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                                        {attendanceRate}%
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        {markedSessions.length} marked sessions
                                    </p>
                                </CardContent>
                            </Card>
                            <Card size="sm">
                                <CardContent>
                                    <p className="text-xs text-muted-foreground">
                                        Sessions attended
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                                        {attended}
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        In this training history
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="flex items-center gap-2">
                                        <MessageSquare
                                            aria-hidden="true"
                                            className="size-4 text-muted-foreground"
                                        />
                                        Recent lesson feedback
                                    </CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => selectTab("sessions")}
                                    >
                                        All sessions
                                        <ChevronRight aria-hidden="true" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {recentFeedback.length ? (
                                    recentFeedback.map((session) => (
                                        <article key={session.event.id} className="border-l-2 pl-3">
                                            <p className="text-xs font-medium">
                                                {session.event.name}{" "}
                                                <span className="font-normal text-muted-foreground">
                                                    · {fullDate(session.event.date)}
                                                </span>
                                            </p>
                                            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                                {session.feedback}
                                            </p>
                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                                {session.instructor}
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
                        <GradingRequirements profile={profile} attended={attended} />
                    </TabsContent>

                    <TabsContent value="sessions" className="space-y-4">
                        <div>
                            <h2 className="flex items-center gap-2 font-semibold">
                                <CalendarDays
                                    aria-hidden="true"
                                    className="size-4 text-muted-foreground"
                                />
                                Session history
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Newest first · Add or edit feedback for each lesson. Changes
                                save locally for this session.
                            </p>
                        </div>
                        {sessions.length ? (
                            sessions.map((session) => (
                                <SessionFeedback
                                    key={session.event.id}
                                    session={session}
                                    student={student}
                                    selected={session.event.id === context?.id}
                                    onSaved={() =>
                                        setSessions(studentSessionHistory(student, today, context))
                                    }
                                />
                            ))
                        ) : (
                            <Card>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">
                                        No training sessions recorded.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="grading" className="space-y-4">
                        {context?.type === "grading" && (
                            <Card>
                                <CardHeader><CardTitle>Selected grading session</CardTitle></CardHeader>
                                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">{context.name} · {fullDate(context.date)}</p>
                                    <Button render={<Link to={assessmentHref(context, student.id)} />} nativeButton={false}>
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
    const [today] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
    const student = students.find((item) => item.id === studentId);
    const requestedContext = findCalendarEvent(params.get("session") ?? params.get("class") ?? undefined);
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
        <StudentDetailContent
            key={`${student.id}-${context?.id ?? "direct"}`}
            student={student}
            context={context}
            today={today}
        />
    );
}
