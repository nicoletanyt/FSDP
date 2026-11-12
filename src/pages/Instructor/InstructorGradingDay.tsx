import { useParams } from "react-router";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import GradingDayView from "@/components/grading/GradingDayView";
import { GradingBackLink, GradingNote } from "@/components/grading/GradingParts";
import { useGradingDayLayout } from "@/hooks/use-grading-day-layout";
import { useGradingDay } from "@/hooks/use-grading-day";
import { useExaminerPhotos } from "@/hooks/use-examiner-photos";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { gradingStamp } from "@/lib/grading/format";
import type { GradingSessionSummary } from "@/lib/instructor/grading-panels";

// The signed-in examiner's own progress, only once there is some (the button already says "Start grading").
const myStatus = (session: GradingSessionSummary) => !session.myBatch
    ? undefined
    : `${session.myBatch.status === "submitted" ? "Submitted" : "Draft saved"} ${gradingStamp(session.myBatch.submittedAt ?? session.myBatch.updatedAt)}`;

// Examiners can't sort; an administrator does once applications close.
function UnsortedNote() {
    return <GradingNote>No sessions yet.</GradingNote>;
}

export default function InstructorGradingDay() {
    const { eventId } = useParams();
    const day = useGradingDay(eventId);
    const view = useGradingDayLayout();
    const api = useInstructorApi();
    const photos = useExaminerPhotos(day.data?.panel.map((member) => member.instructorId) ?? [], api.getInstructorPhotos);
    return (
        <section className="w-full space-y-4">
            <GradingBackLink to="/instructor/gradings">Back to gradings</GradingBackLink>
            {day.isPending ? (
                <InstructorDataStatus loading onRetry={() => void day.refetch()} variant="card" />
            ) : day.isError ? (
                <InstructorDataStatus error={day.error.message} onRetry={() => void day.refetch()} />
            ) : (
                <GradingDayView day={day.data} list={view.list} onListChange={view.setList} viewerIsChief={day.data.isChief} photos={photos}
                    studentHref={(studentId) => `/instructor/students/${studentId}`}
                    emptySessions={<UnsortedNote />}
                    actionFor={(session) => ({
                        href: `/instructor/grading/${day.data.eventId}?session=${encodeURIComponent(session.id)}`,
                        label: session.myBatch ? "Continue grading" : "Start grading",
                        status: myStatus(session),
                    })} />
            )}
        </section>
    );
}
