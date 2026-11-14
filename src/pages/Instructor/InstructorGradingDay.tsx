import { useParams } from "react-router";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import GradingDayView from "@/components/grading/GradingDayView";
import ScheduleNotice from "@/components/grading/ScheduleNotice";
import { GradingBackLink, GradingNote } from "@/components/grading/GradingParts";
import { useGradingDayLayout } from "@/hooks/use-grading-day-layout";
import { useGradingDay } from "@/hooks/use-grading-day";
import { useCalendarReturn } from "@/hooks/use-calendar-return";
import { useExaminerPhotos } from "@/hooks/use-examiner-photos";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { gradingStamp } from "@/lib/grading/format";
import type { GradingDay, GradingSessionSummary } from "@/lib/instructor/grading-panels";

// The signed-in examiner's own progress, only once there is some.
const myStatus = (session: GradingSessionSummary) => !session.myBatch
    ? undefined
    : `${session.myBatch.status === "submitted" ? "Submitted" : "Draft saved"} ${gradingStamp(session.myBatch.submittedAt ?? session.myBatch.updatedAt)}`;

// Examiners can't schedule; an administrator does once applications close.
// Other examiners only see the sessions once the schedule is published.
function UnsortedNote({ day }: { day: GradingDay }) {
    return <GradingNote>{!day.isChief && !day.publishedAt
        ? "Sessions will appear here once the administrator publishes the schedule."
        : "No sessions yet."}</GradingNote>;
}

export default function InstructorGradingDay() {
    const { eventId } = useParams();
    const day = useGradingDay(eventId);
    const view = useGradingDayLayout();
    const api = useInstructorApi();
    const calendarReturn = useCalendarReturn();
    const photos = useExaminerPhotos(day.data?.panel.map((member) => member.instructorId) ?? [], api.getInstructorPhotos);
    return (
        <section className="w-full space-y-4">
            {calendarReturn
                ? <GradingBackLink to={calendarReturn}>Back to calendar</GradingBackLink>
                : <GradingBackLink to="/instructor/gradings">Back to gradings</GradingBackLink>}
            {day.isPending ? (
                <InstructorDataStatus loading onRetry={() => void day.refetch()} variant="card" />
            ) : day.isError ? (
                <InstructorDataStatus error={day.error.message} onRetry={() => void day.refetch()} />
            ) : (
                <GradingDayView day={day.data} list={view.list} onListChange={view.setList} viewerIsChief={day.data.isChief} photos={photos}
                    studentHref={(studentId) => `/instructor/students/${studentId}`}
                    emptySessions={<UnsortedNote day={day.data} />}
                    notice={day.data.isChief ? <ScheduleNotice day={day.data} viewer="chief" /> : undefined}
                    // One page per session: mark your own checklist (once the session starts);
                    // the chief can also read the other examiners' submitted ones there.
                    actionFor={(session) => day.data.publishedAt ? ({
                        href: `/instructor/grading/session/${encodeURIComponent(session.id)}`,
                        label: "View checklist",
                        status: myStatus(session),
                    // A draft can't be graded yet; the chief sees it to review only.
                    }) : null} />
            )}
        </section>
    );
}
