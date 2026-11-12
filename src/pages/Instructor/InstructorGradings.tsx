import { Link } from "react-router";
import { CalendarDays, ChevronRight, Clock3, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import {
    ExaminerPanel, GradingCardFooter, GradingFacts, GradingNote, GradingStatusBadge, gradingActionClass,
} from "@/components/grading/GradingParts";
import { useMyGradingPanels } from "@/hooks/use-my-grading-panels";
import { candidateCount, gradingDate, gradingTimeLabel, singaporeToday } from "@/lib/grading/format";
import { gradingTitle, groupExaminerSessions } from "@/lib/instructor/grading-panels";
import type { ExaminerSession } from "@/lib/instructor/grading-panels";

function SessionCard({ session }: { session: ExaminerSession }) {
    return (
        <Card className="relative transition-shadow hover:ring-primary/40 focus-within:ring-2 focus-within:ring-ring">
            <CardHeader className="border-b">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CardTitle className="text-lg font-semibold">
                        <Link to={`/instructor/gradings/${session.eventId}`}
                            className="outline-none after:absolute after:inset-0 after:content-['']">
                            {gradingTitle(session)}
                        </Link>
                    </CardTitle>
                    <GradingStatusBadge status={session.status} />
                </div>
                <GradingFacts items={[
                    { key: "date", icon: CalendarDays, label: gradingDate(session.gradingDate) },
                    { key: "time", icon: Clock3, label: gradingTimeLabel(session.startsAt, session.endsAt, session.reportingTime) },
                    { key: "centre", icon: MapPin, label: session.centre.name },
                ]} />
            </CardHeader>
            <CardContent>
                <ExaminerPanel panel={session.panel} viewerIsChief={session.isChief} label={`Examiners for ${gradingTitle(session)}`} />
            </CardContent>
            <GradingCardFooter status={candidateCount(session.candidates)}>
                <span aria-hidden="true" className={gradingActionClass}>
                    View grading day
                    <ChevronRight className="size-4" />
                </span>
            </GradingCardFooter>
        </Card>
    );
}

function SessionList({ id, title, sessions, empty }: { id: string; title: string; sessions: ExaminerSession[]; empty?: string }) {
    if (!sessions.length && !empty) return null;
    return (
        <section className="space-y-4" aria-labelledby={id}>
            <h2 id={id} className="text-xl font-semibold">{title}</h2>
            {sessions.length ? (
                <div className="grid gap-4">
                    {sessions.map((session) => <SessionCard key={session.eventId} session={session} />)}
                </div>
            ) : <GradingNote>{empty}</GradingNote>}
        </section>
    );
}

export default function InstructorGradings() {
    const sessions = useMyGradingPanels();
    const { upcoming, past } = groupExaminerSessions(sessions.data ?? [], singaporeToday());

    return (
        <section className="w-full space-y-8">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Gradings</h1>
            </header>
            {sessions.isPending ? (
                <InstructorDataStatus loading onRetry={() => void sessions.refetch()} variant="card" />
            ) : sessions.isError ? (
                <InstructorDataStatus error={sessions.error.message} onRetry={() => void sessions.refetch()} />
            ) : sessions.data.length === 0 ? (
                <GradingNote>
                    <span className="block font-medium text-foreground">You’re not on any grading panel</span>
                    This page is only for examiners. An administrator can add you to a grading’s panel.
                </GradingNote>
            ) : (
                <>
                    <SessionList id="upcoming-gradings" title="Upcoming" sessions={upcoming} empty="No upcoming gradings on your panels." />
                    <SessionList id="past-gradings" title="Past" sessions={past} />
                </>
            )}
        </section>
    );
}
