import { Link } from "react-router";
import {
    CalendarDays,
    ChevronRight,
    Clock3,
    MapPin,
    ShieldCheck,
    Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import { useMyGradingPanels } from "@/hooks/use-my-grading-panels";
import { gradingTitle, groupExaminerSessions } from "@/lib/instructor/grading-panels";
import type { ExaminerSession } from "@/lib/instructor/grading-panels";

const today = () =>
    new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Singapore",
        dateStyle: "short",
    }).format(new Date());
const showDate = (value: string) =>
    new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-SG", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Singapore",
    });
const showTime = (value: string) =>
    new Date(value).toLocaleTimeString("en-SG", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Singapore",
    });

function SessionCard({ session }: { session: ExaminerSession }) {
    const time =
        session.startsAt && session.endsAt
            ? `${showTime(session.startsAt)} – ${showTime(session.endsAt)}`
            : session.reportingTime
                ? `Reporting ${showTime(`2026-01-01T${session.reportingTime.slice(0, 5)}:00+08:00`)}`
                : "Time to be confirmed";
    return (
        <Card className="group relative transition-colors hover:ring-primary/40 focus-within:ring-2 focus-within:ring-ring">
            <CardHeader className="border-b sm:flex sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                    <CardTitle className="text-lg">
                        <Link
                            to={`/instructor/gradings/${session.eventId}`}
                            className="outline-none after:absolute after:inset-0 after:content-['']"
                        >
                            {gradingTitle(session)}
                        </Link>
                    </CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1.5">
                            <CalendarDays className="size-4" aria-hidden="true" />
                            {showDate(session.gradingDate)}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Clock3 className="size-4" aria-hidden="true" />
                            {time}
                        </span>
                    </CardDescription>
                </div>
                {session.status !== "scheduled" && (
                    <Badge variant="secondary">
                        {session.status === "cancelled" ? "Cancelled" : "Completed"}
                    </Badge>
                )}
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <p className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                        {session.centre.name}
                        {session.centre.address ? ` · ${session.centre.address}` : ""}
                    </span>
                </p>
                <div className="space-y-1.5">
                    <p className="flex items-center gap-2 font-medium">
                        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                        Examiner panel
                    </p>
                    <ul
                        className="flex flex-wrap gap-1.5"
                        aria-label={`Examiners for ${gradingTitle(session)}`}
                    >
                        {session.panel.map((member) => (
                            <li
                                key={member.instructorId}
                                className="rounded-md border bg-background px-2 py-0.5 text-xs"
                            >
                                <span className="font-semibold">{member.name}</span>
                                {member.isChief && (
                                    <span className="text-muted-foreground">
                                        {session.isChief ? " · Chief (you)" : " · Chief"}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="flex items-center gap-2 text-muted-foreground">
                        <Users className="size-4" aria-hidden="true" />
                        {session.candidates === 1
                            ? "1 candidate"
                            : `${session.candidates} candidates`}
                    </p>
                    <span
                        aria-hidden="true"
                        className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 font-medium text-primary group-hover:bg-muted"
                    >
                        View grading sessions
                        <ChevronRight className="size-4" />
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

export default function InstructorGradings() {
    const sessions = useMyGradingPanels();
    const { upcoming, past } = groupExaminerSessions(
        sessions.data ?? [],
        today(),
    );

    return (
        <section className="w-full space-y-6">
            <header className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight">Gradings</h1>
            </header>
            {sessions.isPending ? (
                <InstructorDataStatus
                    loading
                    onRetry={() => void sessions.refetch()}
                    variant="card"
                />
            ) : sessions.isError ? (
                <InstructorDataStatus
                    error={sessions.error.message}
                    onRetry={() => void sessions.refetch()}
                />
            ) : sessions.data.length === 0 ? (
                <Card>
                    <CardContent className="space-y-1 py-2">
                        <p className="font-medium">You’re not on any grading panel</p>
                        <p className="text-sm text-muted-foreground">
                            This page is only for examiners. An administrator can add you to a
                            grading’s panel.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <section className="space-y-3" aria-labelledby="upcoming-gradings">
                        <h2 id="upcoming-gradings" className="text-xl font-semibold">
                            Upcoming
                        </h2>
                        {upcoming.length ? (
                            <div className="grid gap-4">
                                {upcoming.map((session) => (
                                    <SessionCard key={session.eventId} session={session} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No upcoming gradings on your panels.
                            </p>
                        )}
                    </section>
                    {past.length > 0 && (
                        <section className="space-y-3" aria-labelledby="past-gradings">
                            <h2 id="past-gradings" className="text-xl font-semibold">
                                Past
                            </h2>
                            <div className="grid gap-4">
                                {past.map((session) => (
                                    <SessionCard key={session.eventId} session={session} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </section>
    );
}
