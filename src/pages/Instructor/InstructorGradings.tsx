import { Link } from "react-router";
import { CalendarDays, ChevronRight, Clock3, MapPin, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import {
    ExaminerPanel, GradingCardFooter, GradingFacts, GradingNote, GradingStatusBadge, GradingStatusPill, gradingActionClass,
} from "@/components/grading/GradingParts";
import { useMyGradingPanels } from "@/hooks/use-my-grading-panels";
import { useExaminerPhotos } from "@/hooks/use-examiner-photos";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { candidateCount, gradingDate, gradingTimeLabel, singaporeToday } from "@/lib/grading/format";
import { gradingTitle, groupExaminerSessions } from "@/lib/instructor/grading-panels";
import type { ExaminerSession } from "@/lib/instructor/grading-panels";

function SessionCard({ session, photos }: { session: ExaminerSession; photos: Record<string, string> }) {
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
                    {/* The same lifecycle pill as the admin schedule, once the application window is known. */}
                    {session.applicationDeadline || session.applicationOpensOn
                        ? <GradingStatusPill status={session.status} opensOn={session.applicationOpensOn}
                            closesOn={session.applicationDeadline} gradingDate={session.gradingDate} />
                        : <GradingStatusBadge status={session.status} />}
                </div>
                <GradingFacts items={[
                    { key: "date", icon: CalendarDays, label: gradingDate(session.gradingDate) },
                    { key: "time", icon: Clock3, label: gradingTimeLabel(session.startsAt, session.endsAt, session.reportingTime) },
                    { key: "centre", icon: MapPin, label: session.centre.name },
                    { key: "candidates", icon: Users, label: candidateCount(session.candidates) },
                ]} />
            </CardHeader>
            <CardContent>
                <ExaminerPanel panel={session.panel} viewerIsChief={session.isChief} label={`Examiners for ${gradingTitle(session)}`} photos={photos} />
            </CardContent>
            <GradingCardFooter status={null}>
                <span aria-hidden="true" className={gradingActionClass}>
                    View grading day
                    <ChevronRight className="size-4" />
                </span>
            </GradingCardFooter>
        </Card>
    );
}

function SessionList({ id, title, sessions, empty, photos }: { id: string; title: string; sessions: ExaminerSession[]; empty?: string; photos: Record<string, string> }) {
    if (!sessions.length && !empty) return null;
    return (
        <section className="space-y-4" aria-labelledby={id}>
            <h2 id={id} className="text-xl font-semibold">{title}</h2>
            {sessions.length ? (
                <div className="grid gap-4">
                    {sessions.map((session) => <SessionCard key={session.eventId} session={session} photos={photos} />)}
                </div>
            ) : <GradingNote>{empty}</GradingNote>}
        </section>
    );
}

export default function InstructorGradings() {
    const sessions = useMyGradingPanels();
    const { upcoming, past } = groupExaminerSessions(sessions.data ?? [], singaporeToday());
    const api = useInstructorApi();
    const photos = useExaminerPhotos((sessions.data ?? []).flatMap((session) => session.panel.map((member) => member.instructorId)), api.getInstructorPhotos);

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
                    <SessionList id="upcoming-gradings" title="Upcoming" sessions={upcoming} empty="No upcoming gradings on your panels." photos={photos} />
                    <SessionList id="past-gradings" title="Past" sessions={past} photos={photos} />
                </>
            )}
        </section>
    );
}
