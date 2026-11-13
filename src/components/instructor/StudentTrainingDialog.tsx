import { useCallback } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import InstructorDataStatus from "./InstructorDataStatus";
import StudentGradingRead from "./StudentGradingRead";
import {
    StudentInformationActions,
    StudentInformationCards,
} from "./StudentInformation";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { directoryStudent, singaporeToday } from "@/lib/instructor/directory";
import { loadStudentGrading } from "@/lib/instructor/grading";
import {
    instructorQueryKeys as queryKeys,
    instructorQueryTimes as queryTimes,
} from "@/lib/instructor/query-keys";
import type { StudentEntry } from "@/lib/instructor/types";

function StudentTrainingContent({ student }: { student: StudentEntry }) {
    const api = useInstructorApi();
    const studentId = student.student.id;
    const loadDetail = useCallback(
        (signal: AbortSignal) => api.getStudentDetail(studentId, signal),
        [api, studentId],
    );
    const loadGrading = useCallback(
        (signal: AbortSignal) => loadStudentGrading(api, studentId, signal),
        [api, studentId],
    );
    const detail = useInstructorQuery(
        (userId) => queryKeys.studentDetail(userId, studentId),
        loadDetail,
        queryTimes.student,
    );
    const grading = useInstructorQuery(
        (userId) => queryKeys.studentGrading(userId, studentId),
        loadGrading,
        queryTimes.studentGrading,
    );
    const profile = directoryStudent(detail.data ?? student, singaporeToday());

    return (
        <>
            <DialogHeader className="shrink-0 gap-2 border-b p-4 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <DialogTitle className="min-w-0 break-words">
                        {profile.name}
                    </DialogTitle>
                    <DialogClose
                        render={
                            <Button
                                variant="ghost"
                                size="icon-touch"
                                className="-my-2 -mr-2 shrink-0"
                            />
                        }
                    >
                        <X aria-hidden="true" />
                        <span className="sr-only">Close student details</span>
                    </DialogClose>
                </div>
                <DialogDescription className="detail-meta text-sm">
                    {profile.memberNo}
                </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
                {detail.status !== "success" ? (
                    <InstructorDataStatus
                        loading={detail.status === "loading"}
                        error={detail.error}
                        onRetry={detail.retry}
                    />
                ) : !detail.data ? (
                    <p role="status" className="text-sm text-muted-foreground">
                        Student not found.
                    </p>
                ) : (
                    <div className="student-training-layout grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
                        <section
                            aria-label="Student details"
                            className="student-training-information flex min-w-0 flex-col gap-4 md:h-full"
                        >
                            <StudentInformationCards detail={detail.data} />
                            <StudentInformationActions detail={detail.data} />
                        </section>
                        <div
                            role="region"
                            aria-label="Technique checklist scroll area"
                            tabIndex={0}
                            className="min-h-0 min-w-0 overflow-y-auto overscroll-contain rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <StudentGradingRead
                                title="Technique checklist"
                                detail={detail.data}
                                reads={grading}
                                onRetry={grading.retry}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default function StudentTrainingDialog({
    handle,
}: {
    handle: DialogPrimitive.Handle<StudentEntry>;
}) {
    return (
        <DialogPrimitive.Root handle={handle}>
            {({ payload }) => (
                <DialogContent
                    showCloseButton={false}
                    data-student-training-dialog=""
                    className="student-detail-view flex flex-col gap-0 overflow-hidden p-0"
                >
                    {payload && (
                        <StudentTrainingContent
                            key={payload.student.id}
                            student={payload}
                        />
                    )}
                </DialogContent>
            )}
        </DialogPrimitive.Root>
    );
}
