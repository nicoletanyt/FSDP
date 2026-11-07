import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, CalendarDays, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import GradingSignatureDialog from "@/components/instructor/GradingSignatureDialog";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { parseEntityId } from "@/lib/instructor/adapters";
import {
    instructorQueryKeys as keys,
    instructorQueryTimes as times,
} from "@/lib/instructor/query-keys";
import {
    sessionCalendarHref,
    sessionDateLabel,
} from "@/lib/instructor/session-reads";
import type {
    CalendarEntry,
    InstructorReferenceData,
    InstructorIdentity,
    RosterEntry,
} from "@/lib/instructor/types";

function GradingTable({
    session,
    entries,
    reference,
    identity,
}: {
    session: CalendarEntry;
    entries: RosterEntry[];
    reference: InstructorReferenceData;
    identity: InstructorIdentity;
}) {
    const [track, setTrack] = useState<"" | "children" | "adult">("");
    const [grade, setGrade] = useState("");
    const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
    const [signatureOpen, setSignatureOpen] = useState(false);
    const grades = reference.grades
        .filter((item) =>
            reference.syllabusItems.some(
                (syllabus) =>
                    syllabus.track === track && syllabus.grade_id === item.id,
            ),
        )
        .sort((a, b) => a.sort_order - b.sort_order);
    const techniques = reference.syllabusItems
        .filter((item) => item.track === track && item.grade_id === grade)
        .sort(
            (a, b) =>
                a.category.localeCompare(b.category) ||
                a.sort_order - b.sort_order ||
                a.id.localeCompare(b.id),
        );
    const date = session.event.starts_at
        ? `${new Intl.DateTimeFormat("en-SG", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(session.event.starts_at))} (Singapore time)`
        : `${sessionDateLabel(session)} · Time not recorded`;
    const reset = () => setUnchecked(new Set());

    return (
        <section className="mx-auto w-full max-w-7xl space-y-6">
            <Link
                to={sessionCalendarHref(session)}
                className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
                <ChevronLeft aria-hidden="true" className="size-4" /> Back to
                calendar
            </Link>
            <header className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="min-w-0 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                    {session.event.name}
                </h1>
                <Button disabled={!grade} onClick={() => setSignatureOpen(true)} className="bg-emerald-700 text-white hover:bg-emerald-800">Save grading</Button>
            </header>
            <GradingSignatureDialog open={signatureOpen} onOpenChange={setSignatureOpen} name={identity.name} />
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                    <p className="flex items-center gap-2">
                        <MapPin
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                        />
                        {session.centre?.name ?? "Location not recorded"}
                    </p>
                    <p className="flex items-center gap-2">
                        <CalendarDays
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                        />
                        {date}
                    </p>
            </div>
            <section
                className="space-y-4"
                aria-labelledby="grading-table-heading"
            >
                <div className="flex flex-wrap gap-4">
                    <label className="flex min-w-44 flex-col gap-1.5 text-sm font-medium">
                        Grading track
                        <select
                            value={track}
                            onChange={(event) => {
                                setTrack(event.target.value as typeof track);
                                setGrade("");
                                reset();
                            }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="">Select track</option>
                            <option value="children">Children</option>
                            <option value="adult">Adult</option>
                        </select>
                    </label>
                    <label className="flex min-w-44 flex-col gap-1.5 text-sm font-medium">
                        Target grade
                        <select
                            value={grade}
                            disabled={!track}
                            onChange={(event) => {
                                setGrade(event.target.value);
                                reset();
                            }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                        >
                            <option value="">Select grade</option>
                            {grades.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                {!entries.length ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                        No students are registered for this grading session.
                    </p>
                ) : !grade ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Choose a track and target grade to view the checklist.
                    </p>
                ) : !techniques.length ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                        No techniques are recorded for this track and grade.
                    </p>
                ) : (
                    <div
                        className="overflow-x-auto rounded-lg border"
                        role="region"
                        aria-label="Grading checklist table"
                        tabIndex={0}
                    >
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-muted/50">
                                    <th
                                        scope="col"
                                        className="sticky left-0 z-10 min-w-44 border-b bg-muted px-4 py-3 text-left font-semibold"
                                    >
                                        Student
                                    </th>
                                    {techniques.map((item) => (
                                        <th
                                            scope="col"
                                            key={item.id}
                                            className="min-w-36 border-b border-l px-3 py-3 text-left align-bottom font-medium"
                                        >
                                            <span className="block text-xs text-muted-foreground">
                                                {item.category}
                                            </span>
                                            {item.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(({ student }) => {
                                    const name =
                                        [
                                            student.student.first_name,
                                            student.student.last_name,
                                        ]
                                            .filter(Boolean)
                                            .join(" ") || student.student.email;
                                    return (
                                        <tr
                                            key={student.student.id}
                                            className="border-b last:border-0"
                                        >
                                            <th
                                                scope="row"
                                                className="sticky left-0 z-10 bg-background px-4 py-3 text-left font-medium"
                                            >
                                                {name}
                                            </th>
                                            {techniques.map((item) => {
                                                const key = JSON.stringify([
                                                    student.student.id,
                                                    item.id,
                                                ]);
                                                return (
                                                    <td
                                                        key={item.id}
                                                        className="border-l text-center"
                                                    >
                                                        <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`${name}: ${item.label}`}
                                                                checked={
                                                                    !unchecked.has(
                                                                        key,
                                                                    )
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    setUnchecked(
                                                                        (
                                                                            current,
                                                                        ) => {
                                                                            const next =
                                                                                new Set(
                                                                                    current,
                                                                                );
                                                                            if (
                                                                                event
                                                                                    .target
                                                                                    .checked
                                                                            )
                                                                                next.delete(
                                                                                    key,
                                                                                );
                                                                            else
                                                                                next.add(
                                                                                    key,
                                                                                );
                                                                            return next;
                                                                        },
                                                                    )
                                                                }
                                                                className="size-5 accent-primary"
                                                            />
                                                        </label>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </section>
    );
}

export default function InstructorGradingSession() {
    const { eventId } = useParams();
    const api = useInstructorApi();
    const load = useCallback(
        async (signal: AbortSignal) => {
            const roster = await api.getAttendanceRoster(
                parseEntityId(eventId, "event"),
                signal,
            );
        const [reference, identity] = await Promise.all([api.getReferenceData(signal), api.getCurrentInstructor(signal)]);
        return { ...roster, reference, identity };
        },
        [api, eventId],
    );
    const query = useInstructorQuery(
        (userId) => [...keys.event(userId, eventId ?? ""), "grading-table"],
        load,
        times.roster,
    );
    if (query.status !== "success")
        return (
            <section className="space-y-4">
                <Link to="/instructor/calendar" className="text-sm underline">
                    Back to calendar
                </Link>
                <InstructorDataStatus
                    loading={query.status === "loading"}
                    error={query.error}
                    onRetry={query.retry}
                />
            </section>
        );
    if (query.data.session.event.event_type !== "grading")
        return (
            <section className="space-y-4">
                <Link to="/instructor/calendar" className="text-sm underline">
                    Back to calendar
                </Link>
                <h1 className="text-2xl font-semibold">
                    Grading session not found
                </h1>
            </section>
        );
    return <GradingTable key={eventId} {...query.data} />;
}
