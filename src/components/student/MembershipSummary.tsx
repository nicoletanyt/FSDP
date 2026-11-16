import { CalendarClock } from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/shared/status/StatusBadge";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import type { StudentMembership } from "@/lib/student-membership";
import { cn } from "@/lib/utils";

// Dates only: the time of day doesn't change when a membership lapses.
const dateFormat = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
});
const DAY = 86_400_000;
// Membership dates are Singapore dates; compare calendar days, not UTC instants.
const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
const WARNING_DAYS = 30;

function singaporeDate(date: string) {
    return dateFormat.format(new Date(`${date}T00:00:00+08:00`));
}

/** Whole days from today (Singapore) until the given date; negative once it has passed. */
function daysUntil(date: string, now: number) {
    return Math.round(
        (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayKey.format(new Date(now))}T00:00:00Z`)) /
            DAY,
    );
}

/**
 * The membership itself, above the class passes it accompanies: status, when it
 * lapses, and the fee that bought it. Fees are payments, not credit batches, so
 * they would otherwise be invisible on this page.
 */
export default function MembershipSummary({
    membership,
    now = Date.now(),
}: {
    membership: StudentMembership;
    now?: number;
}) {
    const { status, memberNo, joinedAt, expiresOn, fee } = membership;
    if (status === "none") return null;

    const days = expiresOn ? daysUntil(expiresOn, now) : null;
    const pending = status === "pending";
    const expired = !pending && (status === "expired" || (days !== null && days < 0));
    const soon = !pending && !expired && days !== null && days <= WARNING_DAYS;

    const tone: BadgeTone = pending ? "warning" : expired ? "danger" : "success";
    const label = pending ? "Pending" : expired ? "Expired" : "Active";
    const timeLabel = pending
        ? "Starts after payment"
        : expired
            ? "Expired"
            : days === null
                ? "No expiry on record"
                : days === 0
                    ? "Expires today"
                    : `${days} days left`;

    const identity = [
        memberNo && `Member no. ${memberNo}`,
        joinedAt && `Joined ${singaporeDate(joinedAt)}`,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <Card
            data-membership={expired ? "expired" : pending ? "pending" : "active"}
            className={cn(
                "gap-2.5 p-4 max-sm:p-5",
                expired && "bg-muted/50 text-muted-foreground shadow-none",
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <CalendarClock aria-hidden="true" className="size-4" />
                    Membership
                </h3>
                <StatusBadge tone={tone}>{label}</StatusBadge>
            </div>

            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="text-lg font-semibold whitespace-nowrap tabular-nums">
                    {pending ? (
                        "Awaiting activation"
                    ) : expiresOn ? (
                        <>
                            {expired ? "Ended " : "Valid until "}
                            <time dateTime={expiresOn}>{singaporeDate(expiresOn)}</time>
                        </>
                    ) : (
                        "No expiry on record"
                    )}
                </p>
                <p
                    className={cn(
                        "flex shrink-0 items-center gap-1 font-semibold tabular-nums",
                        soon
                            ? "-my-0.5 rounded-md bg-warning/20 px-1.5 py-0.5 text-warning-foreground dark:text-warning"
                            : expired
                                ? "text-destructive"
                                : days === null || pending
                                    ? "font-normal text-muted-foreground"
                                    : "",
                    )}
                >
                    {timeLabel}
                </p>
            </div>

            <p className="text-xs text-muted-foreground">
                {identity || "Membership details are being confirmed."}
            </p>
            <p className="text-xs text-muted-foreground">
                {fee ? (
                    <>
                        {fee.description} {money.format(fee.amount)} · Paid{" "}
                        <time dateTime={fee.paidAt}>
                            {dateFormat.format(new Date(fee.paidAt))}
                        </time>
                    </>
                ) : (
                    "No membership fee recorded yet."
                )}
            </p>
        </Card>
    );
}
