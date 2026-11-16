import { useCallback, useRef } from "react";
import type { RefObject } from "react";
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
import ProgressChecklistEditor from "./ProgressChecklistEditor";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { directoryStudent, singaporeToday } from "@/lib/instructor/directory";
import { loadStudentGrading } from "@/lib/instructor/grading";
import {
    instructorQueryKeys as queryKeys,
    instructorQueryTimes as queryTimes,
} from "@/lib/instructor/query-keys";
import type { StudentEntry } from "@/lib/instructor/types";

// The calendar's quick progress checklist: the same layout as the student
// page's editor dialog, so both entry points look and behave alike.
function StudentTrainingContent({
    student,
    body,
}: {
    student: StudentEntry;
    body: RefObject<HTMLDivElement | null>;
}) {
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
            <DialogHeader className="shrink-0 gap-2 border-b p-4 lg:p-6">
                <div className="flex items-start justify-between gap-4">
                    <DialogTitle className="min-w-0 break-words text-[1.125rem] leading-7 font-semibold">
                        Progress checklist
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
                        <span className="sr-only">Close progress checklist</span>
                    </DialogClose>
                </div>
                <DialogDescription className="sr-only">
                    Technique progress for {profile.name}, {profile.memberNo}
                </DialogDescription>
            </DialogHeader>
            <div
                ref={body}
                role="region"
                aria-label="Progress checklist scroll area"
                tabIndex={-1}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 outline-none lg:p-6"
            >
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
                    <section aria-label="Progress checklist">
                        <ProgressChecklistEditor
                            detail={detail.data}
                            reads={grading}
                            onRetry={grading.retry}
                        />
                    </section>
                )}
            </div>
        </>
    );
}

export default function StudentTrainingDialog({
    handle,
    onOpenChange,
}: {
    handle: DialogPrimitive.Handle<StudentEntry>;
    onOpenChange?: (open: boolean) => void;
}) {
    const body = useRef<HTMLDivElement>(null);
    return (
        <DialogPrimitive.Root handle={handle} onOpenChange={(open) => onOpenChange?.(open)}>
            {({ payload }) => (
                <DialogContent
                    showCloseButton={false}
                    initialFocus={body}
                    data-student-training-dialog=""
                    className="student-detail-view flex h-auto max-h-[85dvh] w-[calc(100vw-2rem)] max-w-[40rem] flex-col gap-0 overflow-hidden p-0 lg:gap-0 lg:p-0"
                >
                    {payload && (
                        <StudentTrainingContent
                            key={payload.student.id}
                            student={payload}
                            body={body}
                        />
                    )}
                </DialogContent>
            )}
        </DialogPrimitive.Root>
    );
}
