import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useStudentUserId } from "@/hooks/use-student-query";
import { queryGeneration } from "@/lib/query-generation";
import { studentQueryKeys as keys } from "@/lib/student/query-keys";
import { scheduleQueryOptions } from "@/lib/student/schedule-query";
import type { StudentScheduleSnapshot as Snapshot } from "@/lib/student/schedule-query";
import type { ClassOffering, Enrollment } from "@/lib/student-schedule";

type Action = "enrol" | "cancel" | "join" | "leave";

const dayFormat = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Singapore",
    dateStyle: "short",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});
const statuses = {
    present: "attended",
    absent: "missed",
    late: "late",
    excused: "excused",
} as const;

export function useLiveStudentSchedule(onCreditChange?: () => void) {
    const client = useQueryClient();
    const userId = useStudentUserId();
    const query = useQuery({
        ...scheduleQueryOptions(userId ?? ""),
        enabled: Boolean(userId),
    });
    const snapshot = query.data ?? null;
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    // Cached data stays visible while a refresh fails or runs (as in the instructor calendar).
    const loading = !snapshot && (!userId || query.isPending || query.isFetching);
    const error =
        !snapshot && !loading && query.isError
            ? "Could not load your class schedule. Try again."
            : "";

    const { classes, enrollments, waitlist } = useMemo(() => {
        const classes: ClassOffering[] = [];
        const enrollments: Enrollment[] = [];
        const waitlist: string[] = [];
        for (const session of snapshot?.sessions ?? []) {
            const starts = new Date(session.starts_at);
            const ends = new Date(session.ends_at);
            const dateId = dayFormat.format(starts);
            const startTime = timeFormat.format(starts);
            classes.push({
                id: session.id,
                templateId: JSON.stringify([
                    session.class_type_id,
                    session.name,
                    session.centre,
                    session.instructor,
                    startTime,
                ]),
                date: new Date(`${dateId}T12:00:00`),
                dateId,
                title: session.name,
                centre: session.centre,
                instructor: session.instructor ?? "Instructor to be announced",
                startTime,
                endTime:
                    dayFormat.format(ends) === dateId ? timeFormat.format(ends) : "24:00",
                startsAt: session.starts_at,
                endsAt: session.ends_at,
                scheduled: session.status === "scheduled",
                bookable: session.status === "scheduled" && session.capacity !== null,
                classType: session.class_type,
                level: session.description ?? session.class_type,
                capacity: session.capacity ?? 0,
                occupied: session.occupied,
            });
            if (session.booked)
                enrollments.push({
                    id: session.id,
                    status: session.attendance_status
                        ? statuses[session.attendance_status]
                        : session.status === "cancelled"
                            ? "cancelled"
                            : session.moved_from_event_id
                                ? "make-up"
                                : "enrolled",
                    movedFrom: session.moved_from_event_id ?? undefined,
                });
            if (session.waitlisted) waitlist.push(session.id);
        }
        return { classes, enrollments, waitlist };
    }, [snapshot]);

    const isBooked = (id: string) => enrollments.some((entry) => entry.id === id);
    const isWaitlisted = (id: string) => waitlist.includes(id);
    const isFull = (session: ClassOffering) =>
        session.occupied >= session.capacity;

    async function change(
        action: Action,
        targetId: string,
    ): Promise<string | null> {
        if (savingRef.current) return "A booking change is already in progress.";
        if (!userId) return "Could not update your booking. Try again.";
        savingRef.current = true;
        setSaving(true);
        // Never write a late response into a later login's cache.
        const generation = queryGeneration(client);
        const current = () => queryGeneration(client) === generation;
        try {
            const { data, error } = await supabase.rpc(
                "change_student_class_booking",
                {
                    action,
                    target_id: targetId,
                    // Only rescheduling used this; students can't reschedule any more.
                    original_id: null,
                },
            );
            if (error) {
                if (error.code !== "P0001")
                    return "Could not update your booking. Try again.";
                if (current())
                    await client.invalidateQueries({ queryKey: keys.schedule(userId) });
                return error.message;
            }
            if (current()) {
                await client.cancelQueries({ queryKey: keys.schedule(userId) });
                client.setQueryData(keys.schedule(userId), data as Snapshot);
            }
            if (action === "enrol" && current()) {
                try {
                    // The booking and credit change have committed; email delivery is separate.
                    // A mail failure must never turn a successful booking into an error.
                    const { error: mailError } = await supabase.functions.invoke(
                        "send-class-enrolment-email",
                        { body: { event_id: targetId } },
                    );
                    if (mailError)
                        console.error("Class enrolment confirmation email could not be sent.");
                } catch {
                    console.error("Class enrolment confirmation email could not be sent.");
                }
            }
            return null;
        } catch {
            return "Could not update your booking. Try again.";
        } finally {
            // Also refresh after ambiguous network errors: the server may have
            // committed the debit/refund even if its response did not arrive.
            if (current()) {
                void client.invalidateQueries({ queryKey: keys.creditsAll(userId) });
                void client.invalidateQueries({ queryKey: keys.creditBatches(userId) });
            }
            onCreditChange?.();
            savingRef.current = false;
            setSaving(false);
        }
    }

    return {
        classes,
        enrollments,
        waitlist,
        loading,
        error,
        saving,
        grade: snapshot?.grade,
        linked: snapshot?.linked ?? false,
        active: snapshot?.active ?? false,
        isFetching: query.isFetching,
        retry: () => {
            void query.refetch();
        },
        isBooked,
        isWaitlisted,
        isFull,
        enroll: (session: ClassOffering) => change("enrol", session.id),
        cancel: (id: string) => change("cancel", id),
        joinWaitlist: (session: ClassOffering) => change("join", session.id),
        leaveWaitlist: (id: string) => change("leave", id),
    };
}
