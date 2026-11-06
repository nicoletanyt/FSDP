import { useCallback } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradeBadge from "@/components/instructor/DatabaseGradeBadge";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import InstructorLoadingBoundary from "@/components/instructor/InstructorLoadingBoundary";
import ReportEditor from "@/components/instructor/ReportEditor";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { parseEntityId, toAttendanceState } from "@/lib/instructor/adapters";
import { historyDate, instructorName } from "@/lib/instructor/student-detail";
import { loadClassReports, sessionCalendarHref, sessionDateLabel, sessionStudentHref } from "@/lib/instructor/session-reads";

function StudentReportsPage() {
    const { eventId } = useParams();
    const api = useInstructorApi();
    const load = useCallback((signal: AbortSignal) => loadClassReports(api, parseEntityId(eventId, "event"), signal), [api, eventId]);
    const query = useInstructorQuery(`session-reports:${eventId}`, load);
    if (query.status !== "success") {
        return <section className="space-y-4">
            <Link to="/instructor/calendar" className="text-sm underline">Back to calendar</Link>
            <InstructorDataStatus loading={query.status === "loading"} error={query.error} onRetry={query.retry} />
        </section>;
    }
    if (!query.data) {
        return (
            <section className="space-y-4">
                <Link to="/instructor/calendar" className="text-sm underline">
                    Back to calendar
                </Link>
                <h1 className="text-2xl font-semibold">Class report not found</h1>
            </section>
        );
    }
    const { session, reports } = query.data;

    return (
        <section className="space-y-6">
            <Link
                to={sessionCalendarHref(session)}
                className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
                <ChevronLeft aria-hidden="true" className="size-4" /> Back to class
            </Link>
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">
                    Student reports
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {session.event.name} · {sessionDateLabel(session)} · Reports and lesson feedback
                </p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
                {reports.map(({ student, record, reportAuthor, previousReports }) => (
                    <Card key={`${record.event_id}:${record.student_id}`} data-report-student-id={record.student_id} className="min-w-0">
                        <CardHeader>
                            <CardTitle>
                                <Link
                                    to={sessionStudentHref(session, student.student.id, "sessions")}
                                    className="break-words underline-offset-4 hover:underline"
                                >
                                    {[student.student.first_name, student.student.last_name].filter(Boolean).join(" ") || student.student.email}
                                </Link>
                            </CardTitle>
                            <div><GradeBadge grade={student.grade} /></div>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="rounded-lg bg-muted/50 p-3">
                                <h2 className="text-xs font-medium">
                                    Current session ·{" "}
                                    <span className="capitalize">
                                        {toAttendanceState(record.attendance_status)}
                                    </span>
                                </h2>
                                <ReportEditor event={session.event} record={record} author={reportAuthor} instructorId={session.event.instructor_id} compact />
                            </div>
                            <h2 className="flex items-center gap-1.5 text-xs font-semibold">
                                <FileText aria-hidden="true" className="size-3.5" /> Previous
                                lesson feedback
                            </h2>
                            <ul className="space-y-4">
                                {previousReports.length ? previousReports.map((previous) => (
                                        <li key={`${previous.record.event_id}:${previous.record.student_id}`} className="border-l-2 pl-3">
                                            <p className="text-xs font-medium">
                                                {historyDate(previous.event.starts_at)} · {previous.event.name}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {previous.reportAuthor ? `Report by ${instructorName(previous.reportAuthor)}` : "Report author not recorded"} · {previous.centre?.name ?? "Dojo not recorded"}
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                                                {previous.record.report}
                                            </p>
                                        </li>
                                )) : <li className="text-xs text-muted-foreground">No previous lesson feedback recorded.</li>}
                            </ul>
                        </CardContent>
                    </Card>
                ))}
            </div>
            {!reports.length && <p role="status" className="text-sm text-muted-foreground">No students are registered for this class.</p>}
        </section>
    );
}

export default function InstructorStudentReports() {
    return <InstructorLoadingBoundary title="Loading student reports"><StudentReportsPage /></InstructorLoadingBoundary>;
}
