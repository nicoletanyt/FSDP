import { Link } from "react-router";
import { Users } from "lucide-react";

import PageHeader from "@/components/shared/layout/PageHeader";
import { StatusBadge, type BadgeTone } from "@/components/shared/status/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MembershipStatus } from "@/hooks/use-membership-status";
import { greetingFor } from "@/lib/format";

const statusLabel: Record<Exclude<MembershipStatus, "active">, string> = {
  none: "Inactive",
  non_member: "Not applied",
  pending: "Pending",
  expired: "Expired",
};

const statusTone: Record<Exclude<MembershipStatus, "active">, BadgeTone> = {
  none: "neutral",
  non_member: "neutral",
  pending: "warning",
  expired: "danger",
};

type Props = {
  firstName: string;
  status: Exclude<MembershipStatus, "active">;
};

/** Shown to students who have an account but no active (paid) membership. */
export default function NonMemberDashboard({ firstName, status }: Props) {
  const label = statusLabel[status];

  return (
    <section className="w-full">
      <PageHeader
        title={`${greetingFor(new Date().getHours())}${firstName ? `, ${firstName}` : ""}`}
        actions={<StatusBadge tone={statusTone[status]}>{status === 'none' || status === 'non_member' ? 'No membership' : `Membership ${label.toLowerCase()}`}</StatusBadge>}
      />

      {/* Empty state, in place of the member page's key figures, next class and belt progress */}
      <section aria-label="Overview" className="mt-6">
        <Card className="min-h-72 items-center justify-center gap-4 p-5 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="size-7" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {status === "pending"
              ? "Your membership activates once payment is confirmed. In the meantime, you can look through our classes."
              : status === "expired"
                ? "Renew your membership to book classes again. You can still look through the class list."
                : "You can book classes without a membership by purchasing a $40 credit per class. Credits never expire."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {status !== "pending" && (
              <Link to="/apply-membership" className={buttonVariants()}>
                {status === "expired" ? "Renew membership" : "Apply for membership"}
              </Link>
            )}
            <Link to="/classes" className={buttonVariants({ variant: "outline" })}>
              Browse classes
            </Link>
            {(status === "none" || status === "non_member") && (
              <Link to="/student/credits" className={buttonVariants({ variant: "outline" })}>Buy class credits</Link>
            )}
          </div>
        </Card>
      </section>
    </section>
  );
}
