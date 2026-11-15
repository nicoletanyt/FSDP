import { useCallback } from "react";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { DatabaseGradeBadge as GradeBadge } from "@/components/shared/grade/GradeBadge";
import InstructorDataStatus from "./InstructorDataStatus";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { instructorQueryKeys as keys, instructorQueryTimes as times } from "@/lib/instructor/query-keys";
import { historyDate, historyTimeRange } from "@/lib/instructor/student-detail";
import type { StudentApplication, StudentId } from "@/lib/instructor/types";

const statusLabel: Record<StudentApplication["status"], string> = {
    submitted: "Submitted", under_review: "Under review", withdrawn: "Withdrawn",
};

// Upcoming gradings first (soonest first), then past ones (most recent first).
function sortApplications(applications: StudentApplication[], today: string) {
    const date = (item: StudentApplication) => item.gradingDate ?? "";
    const upcoming = applications.filter((item) => date(item) >= today).sort((a, b) => date(a).localeCompare(date(b)));
    const past = applications.filter((item) => date(item) < today).sort((a, b) => date(b).localeCompare(date(a)));
    return [...upcoming, ...past];
}

// The student's grading applications, or a note when there are none yet.
export default function StudentApplications({ studentId, today }: { studentId: StudentId; today: string }) {
    const api = useInstructorApi();
    const load = useCallback((signal: AbortSignal) => api.getStudentApplications(studentId, signal), [api, studentId]);
    const query = useInstructorQuery((userId) => keys.studentApplications(userId, studentId), load, times.studentGrading);
    if (query.status === "loading") return null;
    return (
        <section className="detail-section" aria-label="Grading applications">
            <div className="detail-section-header">
                <h2>Grading applications</h2>
            </div>
            {query.status === "error" ? (
                <InstructorDataStatus error={query.error} onRetry={query.retry} />
            ) : !query.data.length ? (
                <Card size="sm" className="detail-card">
                    <CardContent>
                        <p className="detail-body text-sm text-muted-foreground" data-no-applications>No grading applications so far.</p>
                    </CardContent>
                </Card>
            ) : (
                <Card size="sm" className="detail-card">
                    <CardContent className="space-y-4">
                        {sortApplications(query.data, today).map((application) => {
                            const upcoming = (application.gradingDate ?? "") >= today;
                            return (
                                <article key={application.id} data-application-id={application.id}
                                    className="space-y-2 not-first:border-t not-first:pt-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0 space-y-1.5">
                                            <h3 className="text-base font-medium">{application.eventName}</h3>
                                            {application.targetGrade && <>
                                                <span className="sr-only">Target grade:</span>
                                                <GradeBadge grade={application.targetGrade} showBeltLabel />
                                            </>}
                                        </div>
                                        <span data-application-status className={cn("detail-status rounded-md px-2 py-0.5 text-xs font-medium",
                                            application.status === "withdrawn" ? "bg-muted text-muted-foreground"
                                                : upcoming ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                                    : "bg-muted text-foreground")}>
                                            <span className="sr-only">Application: </span>
                                            {application.eventStatus === "cancelled" ? "Grading cancelled"
                                                : !upcoming && application.status !== "withdrawn" ? "Past grading" : statusLabel[application.status]}
                                        </span>
                                    </div>
                                    <ul className="detail-meta flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <li className="flex items-center gap-1.5">
                                            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                                            {application.gradingDate ? historyDate(`${application.gradingDate}T00:00:00+08:00`) : "Date not recorded"}
                                        </li>
                                        {application.session && <li className="flex items-center gap-1.5" data-application-session>
                                            <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
                                            Session {application.session.position} · {historyTimeRange(application.session.startsAt, application.session.endsAt)}
                                        </li>}
                                        <li className="flex items-center gap-1.5">
                                            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                                            {application.centreName ?? "Dojo not recorded"}
                                        </li>
                                    </ul>
                                    <p className="detail-meta text-xs text-muted-foreground">Applied {historyDate(application.submittedAt)}</p>
                                </article>
                            );
                        })}
                    </CardContent>
                </Card>
            )}
        </section>
    );
}
