import { useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import PaymentStatusBadge from "@/components/student/PaymentStatusBadge";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { instructorQueryKeys as keys, instructorQueryTimes as times } from "@/lib/instructor/query-keys";
import { formatDate, money } from "@/lib/format";
import type { StudentId } from "@/lib/instructor/types";

// The student's payment history, newest first, or a note when there are none yet.
export default function StudentPayments({ studentId }: { studentId: StudentId }) {
    const api = useInstructorApi();
    const load = useCallback((signal: AbortSignal) => api.getStudentPayments(studentId, signal), [api, studentId]);
    const query = useInstructorQuery((userId) => keys.studentPayments(userId, studentId), load, times.studentHistory);
    if (query.status === "loading") return null;
    const total = query.status === "success"
        ? query.data.filter((payment) => payment.status === "Paid").reduce((sum, payment) => sum + payment.amount, 0)
        : 0;
    return (
        <section className="detail-section" aria-label="Payment history">
            <div className="detail-section-header">
                <h2>Payment history</h2>
                {query.status === "success" && query.data.length > 0 && (
                    <p className="detail-meta tabular-nums">Total paid {money.format(total)}</p>
                )}
            </div>
            {query.status === "error" ? (
                <InstructorDataStatus error={query.error} onRetry={query.retry} />
            ) : !query.data.length ? (
                <Card size="sm" className="detail-card">
                    <CardContent>
                        <p className="detail-body text-sm text-muted-foreground">No payments so far.</p>
                    </CardContent>
                </Card>
            ) : (
                <Card size="sm" className="detail-card">
                    <CardContent>
                        <ul className="divide-y">
                            {query.data.map((payment) => (
                                <li key={payment.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                    <div className="min-w-0">
                                        <p className="font-medium [overflow-wrap:anywhere]">{payment.description}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {payment.item} · {formatDate(payment.date)} · {payment.method}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        <span className="tabular-nums">{money.format(payment.amount)}</span>
                                        <PaymentStatusBadge status={payment.status} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </section>
    );
}
