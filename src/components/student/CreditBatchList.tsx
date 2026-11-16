import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { ChevronDown, RefreshCw, Ticket, TriangleAlert } from "lucide-react";
import EmptyState from "@/components/shared/layout/EmptyState";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { CardListSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useStudentCreditBatches } from "@/hooks/use-student-credit-batches";
import { useStudentMembership } from "@/hooks/use-student-membership";
import { creditBatchStatus, type CreditBatch } from "@/lib/student-credit-batches";
import { cn } from "@/lib/utils";
import MembershipSummary from "./MembershipSummary";

// Dates only: the time of day doesn't change when a student should use a pass.
const dateFormat = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
});
const DAY = 86_400_000;

function credits(count: number) {
    return `${count} ${count === 1 ? "credit" : "credits"}`;
}

/**
 * One pass, answering "how much is left, and how long do I have?".
 * Those two answers share the main line (credits left | time left); time left turns amber
 * with a warning icon within 3 weeks of expiry, and the bar follows. Dates are a quiet footnote.
 */
function PassRow({ batch, now }: { batch: CreditBatch; now: number }) {
    const status = creditBatchStatus(batch, now);
    const expired = status === "expired";
    const timeLeft = batch.expiresAt ? Date.parse(batch.expiresAt) - now : null;
    const days = timeLeft === null ? null : Math.ceil(timeLeft / DAY);
    const soon = status === "expiring";
    const timeLabel = expired
        ? "Expired"
        : days === null
            ? "No expiry"
            : days <= 1
                ? "Expires today"
                : `${days} days left`;
    const expiry = batch.expiresAt && (
        <time className="whitespace-nowrap" dateTime={batch.expiresAt}>
            {dateFormat.format(new Date(batch.expiresAt))}
        </time>
    );
    const bought = (
        <time className="whitespace-nowrap" dateTime={batch.createdAt}>
            {dateFormat.format(new Date(batch.createdAt))}
        </time>
    );

    return (
        <Card
            className={cn(
                "gap-2.5 p-4 max-sm:p-5",
                expired && "bg-muted/50 text-muted-foreground shadow-none",
            )}
        >
            <h3 className="text-sm font-medium text-muted-foreground">{batch.title}</h3>

            {/* The two answers: stacked the same way on every phone card, side by side from sm up. */}
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="text-lg font-semibold whitespace-nowrap tabular-nums">
                    {batch.unlimited
                        ? "Unlimited classes"
                        : expired
                            ? `${credits(batch.remaining)} unused`
                            : `${credits(batch.remaining)} left`}
                    {!batch.unlimited && !expired && (
                        <span className="text-sm font-normal text-muted-foreground"> of {batch.total}</span>
                    )}
                </p>
                <p
                    className={cn(
                        "flex shrink-0 items-center gap-1 font-semibold tabular-nums",
                        // The warning token is dark text meant for an amber ground, so it gets one (as the status pills do).
                        soon
                            ? "-my-0.5 rounded-md bg-warning/20 px-1.5 py-0.5 text-warning-foreground dark:text-warning"
                            : expired
                                ? "text-destructive"
                                : days === null
                                    ? "font-normal text-muted-foreground"
                                    : "",
                    )}
                >
                    {soon && <TriangleAlert aria-hidden="true" className="size-4 shrink-0 self-center" />}
                    {timeLabel}
                </p>
            </div>

            {!batch.unlimited && batch.total > 0 && (
                <progress
                    aria-label={`Credits left on ${batch.title}`}
                    value={batch.remaining}
                    max={batch.total}
                    className={cn(
                        "block h-1.5 w-full overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
                        expired
                            ? "[&::-moz-progress-bar]:bg-muted-foreground/40 [&::-webkit-progress-value]:bg-muted-foreground/40"
                            : soon
                                ? "[&::-moz-progress-bar]:bg-warning [&::-webkit-progress-value]:bg-warning"
                                : "[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary",
                    )}
                />
            )}

            {/* Dates support the answers above; one quiet line. */}
            <p className="text-xs text-muted-foreground">
                {expiry && <>{expired ? "Expired" : "Use by"} {expiry}</>}
                {expiry && " · "}
                {batch.legacy ? "Carried over from your previous balance" : <>Bought {bought}</>}
            </p>
        </Card>
    );
}

export default function CreditBatchList({
    userId,
}: {
    userId: string | undefined;
}) {
    const { hash } = useLocation();
    const { batches, loading, error, retry } = useStudentCreditBatches(userId);
    // Membership fees are payments, not credit batches: read them separately so the
    // fee the student paid and its expiry sit beside the passes.
    const {
        membership,
        loading: membershipLoading,
        error: membershipError,
        retry: retryMembership,
    } = useStudentMembership(userId);
    const refresh = () => {
        retry();
        retryMembership();
    };
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        if (hash === "#my-passes")
            document.getElementById("my-passes")?.scrollIntoView({ block: "start" });
    }, [hash]);
    const now = Date.now();
    // Soonest expiry first: that's the order bookings use credits in.
    const byExpiry = batches
        .filter((batch) => batch.unlimited || batch.remaining > 0)
        .sort(
            (a, b) =>
                (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) -
                (b.expiresAt ? Date.parse(b.expiresAt) : Infinity) ||
                a.createdAt.localeCompare(b.createdAt) ||
                a.id.localeCompare(b.id),
        );
    const usable = byExpiry.filter((batch) => creditBatchStatus(batch, now) !== "expired");
    const expired = byExpiry.filter((batch) => creditBatchStatus(batch, now) === "expired");
    const visible = expanded ? usable : usable.slice(0, 6);

    return (
        <section
            id="my-passes"
            aria-labelledby="my-passes-title"
            className="mt-8 scroll-mt-24"
        >
            <div className="mb-3 flex items-start justify-between gap-3 max-sm:mb-4">
                <div className="min-w-0">
                    <h2 id="my-passes-title" className="text-lg font-semibold">
                        My passes
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Bookings use the pass that expires first.
                    </p>
                </div>
                {/* Phones: icon only, so it sits beside the heading instead of taking a row. */}
                <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    className="shrink-0 text-muted-foreground max-sm:size-11 max-sm:px-0"
                    aria-label="Refresh passes and membership"
                    disabled={loading || membershipLoading || !userId}
                    onClick={refresh}
                >
                    <RefreshCw aria-hidden="true" className="size-4" />
                    <span className="max-sm:hidden">Refresh passes</span>
                </Button>
            </div>
            {/* Membership comes first: it is what the passes belong to, and the fee
                is a payment rather than a pass, so it needs its own row. */}
            {membershipLoading || membershipError || (membership && membership.status !== "none") ? (
                <div className="mb-3 max-sm:mb-4">
                    {membershipLoading ? (
                        <CardListSkeleton count={1} label="Loading your membership…" />
                    ) : membershipError ? (
                        <RetryAlert message={membershipError} onRetry={retryMembership} />
                    ) : membership ? (
                        <MembershipSummary membership={membership} now={now} />
                    ) : null}
                </div>
            ) : null}
            {loading ? (
                <CardListSkeleton count={2} label="Loading your passes…" />
            ) : error ? (
                <RetryAlert message={error} onRetry={retry} />
            ) : !userId ? (
                <EmptyState icon={Ticket} title="Sign in to view your passes." />
            ) : byExpiry.length === 0 ? (
                <EmptyState
                    icon={Ticket}
                    title="No passes yet"
                    description="New purchases will appear here after payment is confirmed."
                />
            ) : (
                <>
                    {usable.length ? (
                        <ul className="space-y-3 max-sm:space-y-4">
                            {visible.map((batch) => (
                                <li key={batch.id} data-credit-batch={batch.id}>
                                    <PassRow batch={batch} now={now} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            You have no passes you can book with right now.
                        </p>
                    )}
                    {usable.length > 6 && (
                        <Button
                            type="button"
                            variant="ghost"
                            className="mt-2"
                            aria-expanded={expanded}
                            onClick={() => setExpanded((value) => !value)}
                        >
                            {expanded ? "Show fewer passes" : `Show all ${usable.length} passes`}
                        </Button>
                    )}
                    {/* Expired credits can't be booked with, so they're kept out of the way. */}
                    {expired.length > 0 && (
                        <details className="group mt-4">
                            <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                                Expired passes ({expired.length})
                                <ChevronDown
                                    aria-hidden="true"
                                    className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                                />
                            </summary>
                            <ul className="mt-2 space-y-3 max-sm:space-y-4">
                                {expired.map((batch) => (
                                    <li key={batch.id} data-credit-batch={batch.id}>
                                        <PassRow batch={batch} now={now} />
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </>
            )}
        </section>
    );
}
