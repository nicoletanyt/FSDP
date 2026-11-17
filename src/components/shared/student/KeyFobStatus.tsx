import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/shared/status/StatusBadge";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/admin/format";
import { supabase } from "@/lib/supabase";

type KeyFob = {
    key_fob_status: "ordered" | "issued" | null;
    key_fob_ordered_at: string | null;
};

// key_fob_ordered_at is a timestamptz; formatDate wants a YYYY-MM-DD date, so take the Singapore calendar day.
const singaporeDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
function orderedDate(timestamp: string | null) {
    const date = timestamp ? new Date(timestamp) : null;
    return date && Number.isFinite(date.getTime())
        ? formatDate(singaporeDay.format(date))
        : "";
}

async function loadKeyFob(
    studentId: string,
    signal: AbortSignal,
): Promise<KeyFob | null> {
    const { data, error } = await supabase
        .from("students")
        .select("key_fob_status, key_fob_ordered_at")
        .eq("id", studentId)
        .abortSignal(signal)
        .maybeSingle();
    if (error) throw error;
    return data as KeyFob | null;
}

/** The key fob bought with the membership (set by the payment webhook; "issued" once staff issue a tag with scripts/nfc-tags.mjs). Admin only. */
export default function KeyFobStatus({ studentId }: { studentId: string }) {
    const { session } = useAuth();
    const fob = useQuery({
        queryKey: ["admin", session?.user.id, "student-key-fob", studentId],
        queryFn: ({ signal }) => loadKeyFob(studentId, signal),
        enabled: Boolean(session && studentId),
    });
    if (fob.isError)
        return <span className="text-sm text-muted-foreground">Unavailable</span>;
    if (fob.data === undefined)
        return <span className="text-sm text-muted-foreground">…</span>;
    if (fob.data?.key_fob_status === "ordered")
        return (
            <span className="inline-flex items-start gap-2">
                <StatusBadge tone="warning">To issue</StatusBadge>
                <span className="text-xs text-muted-foreground">
                    Paid {orderedDate(fob.data.key_fob_ordered_at)}
                </span>
            </span>
        );
    if (fob.data?.key_fob_status === "issued")
        return <StatusBadge tone="success">Issued</StatusBadge>;
    return <span className="text-sm text-muted-foreground">Not ordered</span>;
}
