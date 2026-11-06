import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GradeBadge from "@/components/instructor/DatabaseGradeBadge";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import InstructorLoadingBoundary from "@/components/instructor/InstructorLoadingBoundary";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { assessmentKey, sessionCalendarHref, sessionDateLabel, sessionStudentHref } from "@/lib/instructor/session-reads";
import type { AssessmentDetail } from "@/lib/instructor/types";
import { useInstructorSessionSave } from "@/hooks/use-instructor-session-save";
import { assessmentEditable, assessmentSnapshot } from "@/lib/instructor/session-writes";

function AssessmentForm({ detail }: { detail: AssessmentDetail }) {
    const mutation = useInstructorSessionSave("assessment", { eventId: detail.record.event_id, studentId: detail.record.student_id });
    const { session, student, record, application, targetGrade } = mutation.data ?? detail;
    const [draft, setDraft] = useState(() => assessmentSnapshot(detail.record));
    const [expected, setExpected] = useState(() => assessmentSnapshot(detail.record));
    const [notice, setNotice] = useState("");
    const canEdit = assessmentEditable(session.event);
    const locked = !canEdit || mutation.pending || Boolean(mutation.error);
    const dirty = draft.status !== expected.status || (draft.notes?.trim() || null) !== (expected.notes?.trim() || null);
    async function finish(data: Awaited<ReturnType<typeof mutation.retry>>) {
        if (!data || !mutation.isCurrent()) return;
        const value = assessmentSnapshot(data.record);
        setExpected(value); setDraft(value); setNotice("Assessment saved.");
    }
    const name = [student.student.first_name, student.student.last_name].filter(Boolean).join(" ") || student.student.email;
    const track = session.grading?.track;

    return (
        <section className="space-y-6">
            <Link
                to={sessionCalendarHref(session)}
                className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
                <ChevronLeft aria-hidden="true" className="size-4" /> Back to assessment
                class
            </Link>
            <header>
                <p className="mb-2 text-xs text-muted-foreground">
                    Recorded assessment{!canEdit && " · Read-only"}
                </p>
                <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                    Assess {name}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {session.event.name} · {sessionDateLabel(session)} · {session.centre?.name ?? "Dojo not recorded"}
                </p>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>Grading assessment</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        className="space-y-5"
                        onSubmit={async (submit) => {
                            submit.preventDefault();
                            if (!locked && dirty) await finish(await mutation.save({ kind: "assessment", ...draft, expected }));
                        }}
                    >
                        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4 text-sm">
                            <div>
                                <dt className="text-xs text-muted-foreground">Current rank</dt>
                                <dd className="mt-1"><GradeBadge grade={student.grade} showBeltLabel className="[&>span:first-child]:whitespace-normal" /></dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">Target rank</dt>
                                <dd className="mt-1">{targetGrade
                                    ? <GradeBadge grade={targetGrade} showBeltLabel className="[&>span:first-child]:whitespace-normal" />
                                    : application ? "Target grade details unavailable" : "Target grade not recorded"}</dd>
                            </div>
                        </dl>
                        <p className="text-xs text-muted-foreground">{track === "children" ? "Children’s grading" : track === "adult" ? "Adults’ grading" : "Grading track not recorded"}</p>
                        <fieldset className="space-y-2">
                            <legend className="mb-2 text-sm font-medium">
                                Assessment status
                            </legend>
                            <div className="flex gap-2">
                                {(["pending", "completed"] as const).map((status) => (
                                    <Button
                                        key={status}
                                        type="button"
                                        variant={
                                            draft.status === status ? "default" : "outline"
                                        }
                                        aria-pressed={draft.status === status}
                                        disabled={locked}
                                        onClick={() => { setDraft(current => ({ ...current, status: current.status === status ? null : status })); setNotice(""); }}
                                        className="capitalize"
                                    >
                                        {status === "completed" && <Check aria-hidden="true" />}
                                        {status}
                                    </Button>
                                ))}
                            </div>
                            {draft.status === null && <p className="text-xs text-muted-foreground">No assessment status recorded.</p>}
                        </fieldset>
                        <div className="space-y-2">
                            <Label htmlFor="assessment-notes">Assessment notes</Label>
                            <Textarea
                                id="assessment-notes"
                                value={draft.notes ?? ""}
                                readOnly={locked}
                                onChange={change => { const notes = change.target.value; setDraft(current => ({ ...current, notes })); setNotice(""); }}
                                placeholder="No assessment notes recorded."
                                rows={5}
                            />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <Link
                                to={sessionStudentHref(session, student.student.id, "grading")}
                                className="text-sm underline underline-offset-4"
                            >
                                View student profile
                            </Link>
                            <Button type="submit" disabled={locked || !dirty}>{mutation.pending ? "Saving…" : "Save Assessment"}</Button>
                        </div>
                        <p role="status" className="min-h-5 text-xs text-muted-foreground">
                            {notice || (!canEdit ? "Cancelled sessions are read-only." : dirty ? "Unsaved changes" : "No unsaved changes")}
                        </p>
                        {mutation.error && <div className="space-y-2">
                            <p role="alert" className="text-sm text-destructive">{mutation.error}</p>
                            <Button type="button" variant="outline" disabled={mutation.pending} onClick={async () => {
                                if (mutation.retryMode === "write") await finish(await mutation.retry());
                                else {
                                    const fresh = await mutation.reload();
                                    if (fresh && mutation.isCurrent()) { setExpected(assessmentSnapshot(fresh.record)); setNotice("Saved record reloaded. Your draft is kept; review the latest saved notes below."); }
                                }
                            }}>{mutation.retryLabel}</Button>
                        </div>}
                        {notice.startsWith("Saved record reloaded") && <div className="space-y-1 rounded-lg bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">Latest saved assessment · {record.assessment_status ?? "Unrecorded"}</p>
                            <p className="whitespace-pre-wrap text-sm wrap-break-word">{record.assessment_notes || "No assessment notes recorded."}</p>
                        </div>}
                    </form>
                </CardContent>
            </Card>
        </section>
    );
}

function GradingAssessmentPage() {
    const { assessmentId, eventId, studentId } = useParams();
    const api = useInstructorApi();
    const load = useCallback((signal: AbortSignal) => api.getAssessment(assessmentKey({ assessmentId, eventId, studentId }), signal), [api, assessmentId, eventId, studentId]);
    const query = useInstructorQuery(JSON.stringify(["assessment", assessmentId, eventId, studentId]), load);
    if (query.status !== "success") return <section className="space-y-4">
        <Link to="/instructor/calendar" className="text-sm underline">Back to calendar</Link>
        <InstructorDataStatus loading={query.status === "loading"} error={query.error} onRetry={query.retry} />
    </section>;
    if (!query.data) {
        return (
            <section className="space-y-4">
                <Link to="/instructor/calendar" className="text-sm underline">
                    Back to calendar
                </Link>
                <h1 className="text-2xl font-semibold">Assessment not found</h1>
                <p className="text-sm text-muted-foreground">
                    Open a candidate’s assessment from a grading session in the calendar.
                </p>
            </section>
        );
    }
    return (
        <AssessmentForm
            key={`${query.data.record.event_id}:${query.data.record.student_id}`}
            detail={query.data}
        />
    );
}

export default function InstructorGradingAssessment() {
    return <InstructorLoadingBoundary title="Loading grading assessment"><GradingAssessmentPage /></InstructorLoadingBoundary>;
}
