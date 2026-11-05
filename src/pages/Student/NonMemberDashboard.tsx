import { Link } from "react-router";
import {
  CalendarDays,
  ClipboardCheck,
  IdCard,
  Presentation,
  UserCheck,
} from "lucide-react";

import { buttonVariants } from "@/components/student/button";
import { Tile, type TileProps } from "@/components/student/DashboardTile";
import { Card } from "@/components/ui/card";
import type { MembershipStatus } from "@/hooks/use-membership-status";
import { greetingFor } from "@/lib/format";

const statusLabel: Record<Exclude<MembershipStatus, "active">, string> = {
  none: "Inactive",
  pending: "Pending",
  expired: "Expired",
};

type Props = {
  firstName: string;
  status: Exclude<MembershipStatus, "active">;
};

/** Shown to students who have an account but no active (paid) membership. */
export default function NonMemberDashboard({ firstName, status }: Props) {
  const label = statusLabel[status];

  const tiles: TileProps[] = [
    { title: "Timetable", to: "/timetable", icon: CalendarDays, status: "View this week's classes" },
    { title: "Attendance History", to: "/attendance", icon: UserCheck },
    { title: "Classes", to: "/classes", icon: Presentation },
    { title: "Grading Applications", to: "/grading", icon: ClipboardCheck, status: "No pending actions" },
    { title: "Membership Profile", to: "/profile", icon: IdCard, status: `Status: ${label}` },
  ];

  return (
    <main className="w-full">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {greetingFor(new Date().getHours())}{firstName && `, ${firstName}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {status === "expired"
              ? "Your membership has expired. Renew it to continue training."
              : status === "pending"
                ? "We've received your membership application."
                : "Apply for a membership to start training with us."}
          </p>
        </div>
        <p className="inline-flex rounded-full bg-brand-red/10 px-2.5 py-1 text-xs font-semibold text-brand-red-ink">
          Membership {label.toLowerCase()}
        </p>
      </header>

      {/* Empty state, in place of the member page's belt progress and next class */}
      <section aria-label="Overview" className="mt-6">
        <Card className="min-h-72 items-center justify-center gap-4 p-5 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Presentation className="size-7" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {status === "pending"
              ? "Your membership application is being processed. In the meantime, have a look at our classes!"
              : "No classes at the moment... Head to the classes tab to enrol into one!"}
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
          </div>
        </Card>
      </section>

      <section aria-labelledby="self-service-heading" className="mt-8">
        <h3 id="self-service-heading" className="mb-3.5 text-lg font-semibold">Self-service</h3>
        <nav aria-label="Student self-service" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => (
            <Tile key={t.to} {...t} />
          ))}
        </nav>
      </section>
    </main>
  );
}
