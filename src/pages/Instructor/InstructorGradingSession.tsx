import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { CalendarDays, ChevronLeft, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import GradingSignatureDialog from "@/components/instructor/GradingSignatureDialog";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorGradingBatch } from "@/hooks/use-instructor-grading-batch";
import { parseEntityId } from "@/lib/instructor/adapters";
import {
    instructorQueryKeys as keys,
    instructorQueryTimes as times,
} from "@/lib/instructor/query-keys";
import { sessionDateLabel } from "@/lib/instructor/session-reads";
import type { GradingDay } from "@/lib/instructor/grading-panels";
import type {
    CalendarEntry,
    InstructorReferenceData,
    InstructorIdentity,
    RosterEntry,
    GradingBatch,
} from "@/lib/instructor/types";

function GradingTable({
    session,
    entries,
    reference,
    identity,
    initialBatch,
    day,
    requestedGrade,
}: {
    session: CalendarEntry;
    entries: RosterEntry[];
    reference: InstructorReferenceData;
    identity: InstructorIdentity;
    initialBatch: GradingBatch | null;
    day: GradingDay;
    requestedGrade: string | null;
}) {
    const requested = requestedGrade && day.grades.some((item) => item.grade.id === requestedGrade) ? requestedGrade : null;
    const [track, setTrack] = useState<"" | "children" | "adult">(
        requested ? (session.grading?.track ?? initialBatch?.track ?? "") : (initialBatch?.track ?? session.grading?.track ?? ""));
    const [grade, setGrade] = useState(requested ?? initialBatch?.target_grade_id ?? "");
    // Each target grade is its own session: only its applicants are graded.
    const candidateCounts = new Map(day.grades.map((item) => [item.grade.id, item.candidates.length]));
    const gradeEntries = useMemo(() => {
        const ids = new Set(day.grades.find((item) => item.grade.id === grade)?.candidates.map((candidate) => candidate.studentId) ?? []);
        return entries.filter((entry) => ids.has(entry.record.student_id));
    }, [day, entries, grade]);
    const [signatureOpen, setSignatureOpen] = useState(false);
    const grades = reference.grades
        .filter((item) =>
            (initialBatch?.track === track && initialBatch.target_grade_id === item.id) || (!session.targetGrades.length || session.targetGrades.some(target => target.id === item.id)) && reference.gradeTracks.some(
                (gradeTrack) =>
                    gradeTrack.track === track && gradeTrack.grade_id === item.id,
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
    const batch = useInstructorGradingBatch({ session, entries: gradeEntries, identity, track, grade, techniques });
    const canSave = Boolean(grade && batch.ready && batch.students.length && batch.items.length && !batch.pending && !batch.readOnly && !batch.needsReload);
    const date = session.event.starts_at
        ? `${new Intl.DateTimeFormat("en-SG", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(session.event.starts_at))} (Singapore time)`
        : `${sessionDateLabel(session)} · Time not recorded`;

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="min-w-0 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                    {session.event.name}
                </h1>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={!canSave || batch.retryMode === "submit"} onClick={() => void batch.save(false)}>
                        {batch.pending && batch.retryMode !== "submit" ? "Saving…" : batch.retryMode === "draft" ? "Retry draft save" : "Save draft"}
                    </Button>
                    <Button disabled={!canSave || batch.retryMode === "draft"} onClick={() => setSignatureOpen(true)}>
                        {batch.retryMode === "submit" ? "Retry submission" : "Submit grading"}
                    </Button>
                </div>
            </header>
            <GradingSignatureDialog open={signatureOpen} onOpenChange={setSignatureOpen} name={identity.name}
                pending={batch.pending} error={batch.error} retrying={batch.retryMode === "submit"}
                onSubmit={(signature) => batch.save(true, signature)} />
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
                aria-label="Grading assessment"
            >
                <div className="flex flex-wrap gap-4">
                    <label className="flex min-w-44 flex-col gap-1.5 text-sm font-medium">
                        Grading track
                        <select
                            value={track}
                            disabled={batch.groupLocked}
                            onChange={(event) => {
                                if (batch.groupLocked) return;
                                setTrack(event.target.value as typeof track);
                                setGrade("");
                            }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="">Select track</option>
                            <option value="children" disabled={session.grading?.track === "adult"}>Children</option>
                            <option value="adult" disabled={session.grading?.track === "children"}>Adult</option>
                        </select>
                    </label>
                    <label className="flex min-w-44 flex-col gap-1.5 text-sm font-medium">
                        Target grade
                        <select
                            value={grade}
                            disabled={!track || batch.groupLocked}
                            onChange={(event) => {
                                if (batch.groupLocked) return;
                                setGrade(event.target.value);
                            }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                        >
                            <option value="">Select grade</option>
                            {grades.map((item) => {
                                const count = candidateCounts.get(item.id) ?? 0;
                                return (
                                    <option key={item.id} value={item.id} disabled={!count && item.id !== grade}>
                                        {item.label} ({count === 1 ? "1 candidate" : `${count} candidates`})
                                    </option>
                                );
                            })}
                        </select>
                    </label>
                </div>
                {!grade ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Choose a track and target grade to view the checklist.
                    </p>
                ) : batch.query.status !== "success" || !batch.ready ? (
                    <InstructorDataStatus loading={batch.query.status !== "error"} error={batch.query.error} onRetry={batch.query.retry} variant="roster" />
                ) : !batch.students.length ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                        No candidates are attempting this grade.
                    </p>
                ) : !batch.items.length ? (
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
                                        className="sticky left-0 z-10 w-16 min-w-16 border-b bg-muted px-4 py-3 text-center font-semibold"
                                    >
                                        ID
                                    </th>
                                    <th
                                        scope="col"
                                        className="min-w-44 border-b border-l px-4 py-3 text-left font-semibold"
                                    >
                                        Student
                                    </th>
                                    {batch.items.map((item) => (
                                        <th
                                            scope="col"
                                            key={item.syllabus_item_id}
                                            className="min-w-36 border-b border-l px-3 py-3 text-left align-bottom font-medium"
                                        >
                                            <span className="block text-xs text-muted-foreground">
                                                {item.category}
                                            </span>
                                            {item.label}
                                        </th>
                                    ))}
                                    <th scope="col" className="min-w-60 border-b border-l px-3 py-3 text-left align-bottom font-medium">Comments</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batch.students.map((student) => {
                                    const name = student.name;
                                    return (
                                        <tr
                                            key={student.student_id}
                                            className="border-b last:border-0"
                                        >
                                            <td className="sticky left-0 z-10 bg-background px-4 py-3 text-center tabular-nums">
                                                {student.candidate_number}
                                            </td>
                                            <th
                                                scope="row"
                                                className="border-l px-4 py-3 text-left font-medium"
                                            >
                                                {name}
                                            </th>
                                            {batch.items.map((item) => {
                                                return (
                                                    <td
                                                        key={item.syllabus_item_id}
                                                        className="border-l text-center"
                                                    >
                                                        <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`${name}: ${item.label}`}
                                                                checked={
                                                                    batch.checked(student.student_id, item.syllabus_item_id)
                                                                }
                                                                disabled={batch.locked}
                                                                onChange={(event) => batch.change(student.student_id, item.syllabus_item_id, event.target.checked)}
                                                                className="size-5 accent-primary"
                                                            />
                                                        </label>
                                                    </td>
                                                );
                                            })}
                                            <td className="border-l px-3 py-2">
                                                <textarea
                                                    aria-label={`${name}: Comments`}
                                                    value={batch.comment(student.student_id)}
                                                    onChange={(event) => batch.changeComment(student.student_id, event.target.value)}
                                                    disabled={batch.locked}
                                                    maxLength={2000}
                                                    rows={2}
                                                    className="w-full min-w-52 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {grade && batch.ready && batch.error && !signatureOpen && <p role="alert" className="text-sm text-destructive">{batch.error}</p>}
                {grade && batch.ready && batch.saved && <p role="status" className="text-sm text-muted-foreground" data-grading-timestamp>
                    {batch.saved.status === "submitted" ? "Last submitted: " : "Last saved: "}
                    <time dateTime={batch.saved.status === "submitted" ? batch.saved.submitted_at! : batch.saved.updated_at}>
                        {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(batch.saved.status === "submitted" ? batch.saved.submitted_at! : batch.saved.updated_at))}
                    </time> (Singapore time)
                </p>}
            </section>
        </div>
    );
}

export default function InstructorGradingSession() {
    const { eventId } = useParams();
    const api = useInstructorApi();
    const client = useQueryClient();
    const load = useCallback(
        async (signal: AbortSignal) => {
            const roster = await api.getAttendanceRoster(
                parseEntityId(eventId, "event"),
                signal,
            );
            if (roster.session.event.event_type !== "grading") return { ...roster, day: null, reference: null, identity: null, initialBatch: null };
            // The grading day also checks panel membership: non-examiners get an error here.
            const [reference, identity, initialBatch, day] = await Promise.all([
                api.getReferenceData(signal), api.getCurrentInstructor(signal),
                api.getLatestGradingBatch(roster.session.event.id, signal),
                api.getGradingDay(roster.session.event.id, signal),
            ]);
            signal.throwIfAborted();
            if (initialBatch) client.setQueryData<GradingBatch>(keys.gradingBatch(identity.userId, roster.session.event.id, initialBatch.track, initialBatch.target_grade_id),
                current => !current || current.version <= initialBatch.version ? initialBatch : current);
            return { ...roster, reference, identity, initialBatch, day };
        },
        [api, eventId, client],
    );
    const [search] = useSearchParams();
    const requestedGrade = search.get("grade");
    const query = useInstructorQuery(
        (userId) => keys.gradingSession(userId, eventId ?? ""),
        load,
        times.roster,
    );
    return (
        <section className="w-full space-y-4">
            <Link
                to={eventId ? `/instructor/gradings/${eventId}` : "/instructor/gradings"}
                className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
                <ChevronLeft aria-hidden="true" className="size-4" /> Back to grading sessions
            </Link>
            {query.status !== "success" ? (
                <InstructorDataStatus
                    loading={query.status === "loading"}
                    error={query.error}
                    onRetry={query.retry}
                    variant="grading"
                />
            ) : query.data.session.event.event_type !== "grading" || !query.data.day || !query.data.reference || !query.data.identity ? (
                <h1 className="text-2xl font-semibold">
                    Grading session not found
                </h1>
            ) : (
                <GradingTable key={`${eventId}:${requestedGrade ?? ""}`} session={query.data.session} entries={query.data.entries}
                    reference={query.data.reference} identity={query.data.identity} initialBatch={query.data.initialBatch}
                    day={query.data.day} requestedGrade={requestedGrade} />
            )}
        </section>
    );
}
