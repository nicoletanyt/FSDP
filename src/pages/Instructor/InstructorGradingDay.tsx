import { useParams } from "react-router";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import GradingDayView from "@/components/grading/GradingDayView";
import { GradingBackLink, GradingNote } from "@/components/grading/GradingParts";
import { useGradingDayLayout } from "@/hooks/use-grading-day-layout";
import { useGradingDay } from "@/hooks/use-grading-day";
import { gradingDate, gradingStamp, singaporeToday } from "@/lib/grading/format";
import type { GradingDay, GradingSessionSummary } from "@/lib/instructor/grading-panels";

// The signed-in examiner's own progress on one session's checklist.
const myStatus = (session: GradingSessionSummary) => !session.myBatch
    ? "Not started"
    : `${session.myBatch.status === "submitted" ? "Submitted" : "Draft saved"} · ${gradingStamp(session.myBatch.submittedAt ?? session.myBatch.updatedAt)}`;

// Examiners can't sort; tell them when the sessions will appear.
function UnsortedNote({ day }: { day: GradingDay }) {
    const open = day.applicationDeadline !== null && singaporeToday() <= day.applicationDeadline;
    return (
        <GradingNote>
            {open
                ? `Applications close on ${gradingDate(day.applicationDeadline!)}. An administrator sorts candidates into sessions after that.`
                : "Candidates haven’t been sorted into sessions yet. An administrator will sort them before the grading."}
        </GradingNote>
    );
}

export default function InstructorGradingDay() {
    const { eventId } = useParams();
    const day = useGradingDay(eventId);
    const view = useGradingDayLayout();
    return (
        <section className="w-full space-y-4">
            <GradingBackLink to="/instructor/gradings">Back to gradings</GradingBackLink>
            {day.isPending ? (
                <InstructorDataStatus loading onRetry={() => void day.refetch()} variant="card" />
            ) : day.isError ? (
                <InstructorDataStatus error={day.error.message} onRetry={() => void day.refetch()} />
            ) : (
                <GradingDayView day={day.data} list={view.list} layout={view.layout}
                    onListChange={view.setList} onLayoutChange={view.setLayout} viewerIsChief={day.data.isChief}
                    studentHref={(studentId) => `/instructor/students/${studentId}`}
                    emptySessions={<UnsortedNote day={day.data} />}
                    actionFor={(session) => ({
                        href: `/instructor/grading/${day.data.eventId}?session=${encodeURIComponent(session.id)}`,
                        label: session.myBatch ? "Continue grading" : "Start grading",
                        status: myStatus(session),
                    })} />
            )}
        </section>
    );
}
