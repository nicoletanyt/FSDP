import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { CalendarDays, Clock3, MapPin, UserX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import DatabaseGradeBadge from "@/components/instructor/DatabaseGradeBadge";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import GradingSignatureDialog from "@/components/instructor/GradingSignatureDialog";
import GradingChecklistTable from "@/components/grading/GradingChecklistTable";
import { GradingBackLink, GradingNote, GradingPageHeader } from "@/components/grading/GradingParts";
import { candidateCount, gradingDate, gradingStamp, gradingTimeLabel } from "@/lib/grading/format";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorGradingBatch } from "@/hooks/use-instructor-grading-batch";
import { parseEntityId } from "@/lib/instructor/adapters";
import {
    instructorQueryKeys as keys,
    instructorQueryTimes as times,
} from "@/lib/instructor/query-keys";
import { gradingTitle, sessionCandidates, sessionLabel } from "@/lib/instructor/grading-panels";
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
    requestedSession,
}: {
    session: CalendarEntry;
    entries: RosterEntry[];
    reference: InstructorReferenceData;
    identity: InstructorIdentity;
    initialBatch: GradingBatch | null;
    day: GradingDay;
    requestedSession: string | null;
}) {
    // The session comes from the grading day's link (?session=), else the one
    // last worked on, else the day's only session.
    const known = (id: string | null | undefined) => (id && day.sessions.some((item) => item.id === id) ? id : null);
    const sessionId = known(requestedSession) ?? known(initialBatch?.session_id) ?? (day.sessions.length === 1 ? day.sessions[0].id : "");
    const gradingSession = day.sessions.find((item) => item.id === sessionId) ?? null;
    const track = day.track ?? session.grading?.track ?? null;
    // Each candidate is graded on their own target grade's techniques.
    const candidateGrades = useMemo(() => new Map(gradingSession?.grades.flatMap((group) =>
        group.candidates.map((candidate) => [candidate.studentId, group.grade.id] as const)) ?? []), [gradingSession]);
    const gradeOrder = new Map(gradingSession?.grades.map((group, index) => [group.grade.id, index]) ?? []);
    const techniques = reference.syllabusItems
        .filter((item) => item.track === track && gradeOrder.has(item.grade_id))
        .sort((a, b) => gradeOrder.get(a.grade_id)! - gradeOrder.get(b.grade_id)! || a.category.localeCompare(b.category)
            || a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    const [signatureOpen, setSignatureOpen] = useState(false);
    const batch = useInstructorGradingBatch({ session, entries, identity, sessionId, candidateGrades, techniques });
    const canSave = Boolean(gradingSession && batch.ready && batch.students.length && batch.items.length && !batch.pending && !batch.readOnly && !batch.needsReload);
    const facts = [
        { key: "date", icon: CalendarDays, label: gradingDate(day.gradingDate, "long") },
        { key: "time", icon: Clock3, label: gradingSession ? gradingTimeLabel(gradingSession.startsAt, gradingSession.endsAt) : gradingTimeLabel(day.startsAt, day.endsAt, day.reportingTime) },
        { key: "centre", icon: MapPin, label: day.centre.name },
        ...(gradingSession ? [{ key: "candidates", icon: Users, label: candidateCount(sessionCandidates(gradingSession)) }] : []),
    ];
    const savedAt = batch.saved ? (batch.saved.status === "submitted" ? batch.saved.submitted_at! : batch.saved.updated_at) : null;
    // One checklist per grade in the session; a grade is only named above its
    // table when the session mixes grades (the header already names a lone grade).
    const mixed = (gradingSession?.grades.length ?? 0) > 1;
    // Candidates marked absent are hidden by default; their saved ticks and
    // comments stay in the batch untouched.
    const absent = new Set(entries.filter((entry) => entry.record.attendance_status === "absent").map((entry) => entry.record.student_id));
    const absentCount = batch.students.filter((student) => absent.has(student.student_id)).length;
    const [showAbsent, setShowAbsent] = useState(false);
    const groups = (gradingSession?.grades ?? []).map((group) => ({
        grade: group.grade,
        students: batch.students.filter((student) => student.target_grade_id === group.grade.id
            && (showAbsent || !absent.has(student.student_id))),
        items: batch.items.filter((item) => item.grade_id === group.grade.id),
    })).filter((group) => group.students.length);

    return (
        <div className="space-y-8">
            <GradingPageHeader
                title={gradingTitle(day)}
                badges={gradingSession && (
                    <div className="flex flex-wrap items-center gap-2" data-grading-group>
                        <Badge variant="secondary" data-session-label>{sessionLabel(gradingSession.position)}</Badge>
                        {gradingSession.grades.map((group) => <DatabaseGradeBadge key={group.grade.id} grade={group.grade} showBeltLabel />)}
                    </div>
                )}
                facts={facts}
                actions={<>
                    {/* Only offered once there is something new to save (or a failed save to retry). */}
                    {(batch.dirty || batch.retryMode === "draft") && (
                        <Button variant="outline" disabled={!canSave || batch.retryMode === "submit"} onClick={() => void batch.save(false)}>
                            {batch.pending && batch.retryMode !== "submit" ? "Saving…" : batch.retryMode === "draft" ? "Retry draft save" : "Save draft"}
                        </Button>
                    )}
                    <Button disabled={!canSave || batch.retryMode === "draft"} onClick={() => setSignatureOpen(true)}
                        className="bg-success text-success-foreground hover:bg-success/85" data-submit-grading>
                        {batch.retryMode === "submit" ? "Retry submission" : "Submit grading"}
                    </Button>
                </>}
            />
            <GradingSignatureDialog open={signatureOpen} onOpenChange={setSignatureOpen} name={identity.name}
                pending={batch.pending} error={batch.error} retrying={batch.retryMode === "submit"}
                onSubmit={(signature) => batch.save(true, signature)} />
            <section className="space-y-8" aria-label="Grading assessment">
                {!gradingSession ? (
                    <GradingNote>
                        Choose a session from the{" "}
                        <Link to={`/instructor/gradings/${session.event.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                            grading day
                        </Link>{" "}
                        to view its checklist.
                    </GradingNote>
                ) : !track ? (
                    <GradingNote>This grading has no track recorded, so its checklist cannot be shown.</GradingNote>
                ) : batch.query.status !== "success" || !batch.ready ? (
                    <InstructorDataStatus loading={batch.query.status !== "error"} error={batch.query.error} onRetry={batch.query.retry} variant="roster" />
                ) : !batch.students.length ? (
                    <GradingNote>No candidates are in this session.</GradingNote>
                ) : !batch.items.length ? (
                    <GradingNote>No techniques are recorded for this session’s grades.</GradingNote>
                ) : <>
                {absentCount > 0 && (
                    <label className="flex w-fit min-h-11 cursor-pointer items-center gap-2.5 text-sm" data-show-absent>
                        <Switch checked={showAbsent} onCheckedChange={setShowAbsent} />
                        Show absent ({absentCount})
                    </label>
                )}
                {!groups.length ? (
                    <GradingNote>All candidates in this session are marked absent.</GradingNote>
                ) : groups.map((group) => (
                    <div key={group.grade.id} className="space-y-3">
                        {mixed && (
                            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                                {group.grade.label}
                                <span className="text-sm font-normal text-muted-foreground">{candidateCount(group.students.length)}</span>
                            </h2>
                        )}
                        <GradingChecklistTable
                            label={mixed ? `Grading checklist: ${group.grade.label}` : undefined}
                            students={group.students}
                            items={group.items}
                            cell={(student, item) => (
                                <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                                    <input
                                        type="checkbox"
                                        aria-label={`${student.name}: ${item.label}`}
                                        checked={batch.checked(student.student_id, item.syllabus_item_id)}
                                        disabled={batch.locked || absent.has(student.student_id)}
                                        onChange={(event) => batch.change(student.student_id, item.syllabus_item_id, event.target.checked)}
                                        className="size-5 accent-primary"
                                    />
                                </label>
                            )}
                            comment={(student) => (
                                <textarea
                                    aria-label={`${student.name}: Comments`}
                                    value={batch.comment(student.student_id)}
                                    onChange={(event) => batch.changeComment(student.student_id, event.target.value)}
                                    disabled={batch.locked || absent.has(student.student_id)}
                                    maxLength={2000}
                                    rows={3}
                                    className="w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 sm:min-w-52"
                                />
                            )}
                            columnDisabled={(student) => absent.has(student.student_id)}
                            headerBadge={(student) => absent.has(student.student_id) && (
                                <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-2xs font-medium text-destructive" data-absent>
                                    <UserX aria-hidden="true" className="size-3" />Absent
                                </span>
                            )}
                        />
                    </div>
                ))}
                </>}
                {gradingSession && batch.ready && batch.error && !signatureOpen && <p role="alert" className="text-sm text-destructive">{batch.error}</p>}
                {gradingSession && batch.ready && batch.saved && savedAt && <p role="status" className="text-sm text-muted-foreground" data-grading-timestamp>
                    {batch.saved.status === "submitted" ? "Last submitted: " : "Last saved: "}
                    <time dateTime={savedAt}>{gradingStamp(savedAt)}</time>
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
            if (initialBatch) client.setQueryData<GradingBatch>(keys.gradingBatch(identity.userId, roster.session.event.id, initialBatch.session_id),
                current => !current || current.version <= initialBatch.version ? initialBatch : current);
            return { ...roster, reference, identity, initialBatch, day };
        },
        [api, eventId, client],
    );
    const [search] = useSearchParams();
    const requestedSession = search.get("session");
    const query = useInstructorQuery(
        (userId) => keys.gradingSession(userId, eventId ?? ""),
        load,
        times.roster,
    );
    return (
        <section className="w-full space-y-4">
            <GradingBackLink to={eventId ? `/instructor/gradings/${eventId}` : "/instructor/gradings"}>
                Back to grading sessions
            </GradingBackLink>
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
                <GradingTable key={`${eventId}:${requestedSession ?? ""}`} session={query.data.session} entries={query.data.entries}
                    reference={query.data.reference} identity={query.data.identity} initialBatch={query.data.initialBatch}
                    day={query.data.day} requestedSession={requestedSession} />
            )}
        </section>
    );
}
