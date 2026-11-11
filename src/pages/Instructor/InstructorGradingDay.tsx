import { Link, useParams, useSearchParams } from "react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LayoutGrid, List, MapPin, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradeBadge, { beltFor } from "@/components/instructor/DatabaseGradeBadge";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import { useGradingDay } from "@/hooks/use-grading-day";
import { gradingTitle } from "@/lib/instructor/grading-panels";
import type { GradeSession, GradingDay } from "@/lib/instructor/grading-panels";
import { cn } from "@/lib/utils";

type Layout = "list" | "grid";

const showDate = (value: string) =>
    new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-SG", {
        weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Singapore",
    });
const showTime = (value: string) =>
    new Date(value).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" });
const showStamp = (value: string) =>
    new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));
const timeRange = (startsAt: string | null, endsAt: string | null) =>
    startsAt && endsAt ? `${showTime(startsAt)} – ${showTime(endsAt)}` : null;

function BackToGradings() {
    return (
        <Link to="/instructor/gradings"
            className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            <ChevronLeft className="size-4" aria-hidden="true" /> Back to gradings
        </Link>
    );
}

function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
    const options = [
        { value: "list" as const, label: "List view", Icon: List },
        { value: "grid" as const, label: "Grid view", Icon: LayoutGrid },
    ];
    return (
        <div role="group" aria-label="Grading session layout" className="inline-flex rounded-lg border bg-background p-0.5">
            {options.map(({ value, label, Icon }) => (
                <Button key={value} type="button" size="sm" variant={layout === value ? "secondary" : "ghost"}
                    aria-pressed={layout === value} onClick={() => onChange(value)} className="h-9 gap-1.5 px-3">
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="max-sm:sr-only">{value === "list" ? "List" : "Grid"}</span>
                    <span className="sr-only sm:hidden">{label}</span>
                </Button>
            ))}
        </div>
    );
}

function GradeSessionCard({ eventId, session, compact }: { eventId: string; session: GradeSession; compact: boolean }) {
    const count = session.candidates.length;
    const belt = beltFor(session.grade);
    const time = timeRange(session.startsAt, session.endsAt);
    const status = !session.myBatch
        ? "Not started"
        : `${session.myBatch.status === "submitted" ? "Submitted" : "Draft saved"} · ${showStamp(session.myBatch.submittedAt ?? session.myBatch.updatedAt)}`;
    return (
        <Card className="h-full pb-0">
            <CardHeader className="border-b">
                <CardTitle className="flex min-w-0 items-center gap-2.5 text-base">
                    {belt && <span aria-hidden="true" className={`size-4 shrink-0 rounded-xs border ${belt.indicator}`} />}
                    {session.grade.label}
                </CardTitle>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Clock3 className="size-4" aria-hidden="true" />
                        {time ?? "Time to be confirmed"}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Users className="size-4" aria-hidden="true" />
                        {count === 1 ? "1 candidate" : `${count} candidates`}
                    </span>
                </p>
            </CardHeader>
            <CardContent className="flex-1 px-0">
                <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">Candidates for {session.grade.label}</caption>
                    <thead>
                        <tr className="border-b text-left text-muted-foreground">
                            <th scope="col" className="w-14 px-4 pb-2 text-center font-medium">No.</th>
                            <th scope="col" className="px-2 pb-2 font-medium">Student</th>
                            {!compact && <th scope="col" className="hidden px-2 pb-2 font-medium sm:table-cell">Member no.</th>}
                            <th scope="col" className="px-4 pb-2 font-medium">Current grade</th>
                        </tr>
                    </thead>
                    <tbody>
                        {session.candidates.map((candidate) => (
                            <tr key={candidate.studentId} className="border-b last:border-0">
                                <td className="px-4 py-2.5 text-center tabular-nums">{candidate.candidateNumber ?? "—"}</td>
                                <th scope="row" className="px-2 py-2.5 text-left font-medium">
                                    <Link to={`/instructor/students/${candidate.studentId}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                                        {candidate.name}
                                    </Link>
                                </th>
                                {!compact && <td className="hidden px-2 py-2.5 tabular-nums text-muted-foreground sm:table-cell">{candidate.memberNo ?? "—"}</td>}
                                <td className="px-4 py-2.5"><GradeBadge grade={candidate.currentGrade} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                <p className="text-muted-foreground">{status}</p>
                <Link to={`/instructor/grading/${eventId}?grade=${encodeURIComponent(session.grade.id)}`}
                    className="inline-flex min-h-11 items-center gap-1 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring">
                    {session.myBatch ? "Continue grading" : "Start grading"}
                    <span className="sr-only">: {session.grade.label}</span>
                    <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
            </div>
        </Card>
    );
}

function DayDetails({ day, layout, onLayoutChange }: { day: GradingDay; layout: Layout; onLayoutChange: (layout: Layout) => void }) {
    const active = day.grades.filter((session) => session.candidates.length);
    const total = active.reduce((sum, session) => sum + session.candidates.length, 0);
    const time = timeRange(day.startsAt, day.endsAt) ?? "Time to be confirmed";
    return (
        <div className="space-y-6">
            <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="min-w-0 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{gradingTitle(day)}</h1>
                    {day.status !== "scheduled" && <Badge variant="secondary">{day.status === "cancelled" ? "Cancelled" : "Completed"}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" />{showDate(day.gradingDate)}</span>
                    <span className="flex items-center gap-1.5"><Clock3 className="size-4" aria-hidden="true" />{time}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{day.centre.name}</span>
                    <span className="flex items-center gap-1.5"><Users className="size-4" aria-hidden="true" />
                        {total === 1 ? "1 candidate" : `${total} candidates`} across {active.length === 1 ? "1 grade" : `${active.length} grades`}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="flex items-center gap-1.5 font-medium"><ShieldCheck className="size-4 text-primary" aria-hidden="true" />Panel:</span>
                    {day.panel.map((member) => (
                        <span key={member.instructorId} className="rounded-md border bg-background px-2 py-0.5 text-xs">
                            <span className="font-semibold">{member.name}</span>
                            {member.isChief && <span className="text-muted-foreground">{day.isChief ? " · Chief (you)" : " · Chief"}</span>}
                        </span>
                    ))}
                </div>
            </header>
            <section className="space-y-4" aria-labelledby="grade-sessions">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="grade-sessions" className="text-xl font-semibold">Grading sessions</h2>
                    {active.length > 1 && <LayoutToggle layout={layout} onChange={onLayoutChange} />}
                </div>
                {active.length ? (
                    <div className={cn("grid gap-4", layout === "grid" && "md:grid-cols-2 xl:grid-cols-3")}>
                        {active.map((session) => (
                            <GradeSessionCard key={session.grade.id} eventId={day.eventId} session={session} compact={layout === "grid"} />
                        ))}
                    </div>
                ) : <p className="rounded-lg border p-4 text-sm text-muted-foreground">No candidates have applied for this grading yet.</p>}
            </section>
        </div>
    );
}

export default function InstructorGradingDay() {
    const { eventId } = useParams();
    const day = useGradingDay(eventId);
    // Kept in the URL, like the calendar's display mode, so it survives reloads and back navigation.
    const [search, setSearch] = useSearchParams();
    const layout: Layout = search.get("view") === "grid" ? "grid" : "list";
    const changeLayout = (next: Layout) => setSearch((current) => {
        const params = new URLSearchParams(current);
        if (next === "grid") params.set("view", "grid");
        else params.delete("view");
        return params;
    }, { replace: true });
    return (
        <section className="w-full space-y-4">
            <BackToGradings />
            {day.isPending ? (
                <InstructorDataStatus loading onRetry={() => void day.refetch()} variant="card" />
            ) : day.isError ? (
                <InstructorDataStatus error={day.error.message} onRetry={() => void day.refetch()} />
            ) : (
                <DayDetails day={day.data} layout={layout} onLayoutChange={changeLayout} />
            )}
        </section>
    );
}
