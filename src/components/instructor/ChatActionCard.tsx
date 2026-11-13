import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseEntityId } from "@/lib/instructor/adapters";
import { attendanceEditable, attendanceSnapshot, editableAttendanceRows } from "@/lib/instructor/attendance";
import { invalidateSessionChange } from "@/lib/instructor/cache-invalidation";
import type { ChatAction } from "@/lib/instructor/chat";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { toInstructorDataError } from "@/lib/instructor/errors";
import { instructorQueryKeys as keys } from "@/lib/instructor/query-keys";
import { queryGeneration } from "@/lib/query-generation";

type Phase = "idle" | "pending" | "done" | "dismissed" | "failed";

// A change DojoGPT proposed. Nothing happens until the instructor presses
// Confirm; the write then runs through the same InstructorApi methods (and
// server-side checks) as the regular attendance and endorsement controls.
export default function ChatActionCard({ action, userId }: { action: ChatAction; userId: string }) {
    const api = useInstructorApi();
    const client = useQueryClient();
    const [phase, setPhase] = useState<Phase>("idle");
    const [error, setError] = useState<string | null>(null);

    async function perform() {
        const studentId = parseEntityId(action.studentId, "student");
        if (action.kind === "endorse_student") {
            const result = await api.endorseStudent(studentId, action.targetGradeId);
            client.setQueryData(keys.endorsement(userId, studentId), result);
            return;
        }
        const eventId = parseEntityId(action.eventId, "event");
        const generation = queryGeneration(client);
        const roster = await api.getAttendanceRoster(eventId, AbortSignal.timeout(30_000));
        if (!roster.canEditAttendance || !attendanceEditable(roster.session.event)) {
            throw new Error("Attendance for this class can no longer be changed.");
        }
        const entry = editableAttendanceRows(roster.entries, roster.session.event.starts_at)
            .find((item) => item.record.student_id === studentId);
        if (!entry) throw new Error("This student’s attendance is read-only or they are no longer on the roster.");
        await api.saveAttendance({
            requestId: crypto.randomUUID(),
            expectedUserId: parseEntityId(userId, "auth-user"),
            eventId,
            scope: "student",
            status: action.status,
            expected: [attendanceSnapshot(entry.record)],
        });
        invalidateSessionChange(client, generation, userId, eventId, [studentId], "attendance", false);
    }

    async function confirm() {
        if (phase === "pending" || phase === "done") return;
        setPhase("pending");
        setError(null);
        try {
            await perform();
            setPhase("done");
        } catch (failure) {
            setError(toInstructorDataError(failure, "Unable to apply this change. Please try again.").message);
            setPhase("failed");
        }
    }

    if (phase === "dismissed") return null;

    return (
        <div
            data-chat-action={action.kind}
            className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm"
        >
            <p className="font-medium [overflow-wrap:anywhere]">{action.label}</p>
            {phase === "done" ? (
                <p role="status" className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                    <Check aria-hidden="true" className="size-4" /> Done
                </p>
            ) : (
                <>
                    <p className="mt-1 text-xs text-muted-foreground">Nothing has changed yet. Confirm to apply.</p>
                    {error && (
                        <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={confirm} disabled={phase === "pending"}>
                            {phase === "pending" && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                            {phase === "failed" ? "Try again" : "Confirm"}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setPhase("dismissed")}
                            disabled={phase === "pending"}
                        >
                            <X aria-hidden="true" /> Dismiss
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
