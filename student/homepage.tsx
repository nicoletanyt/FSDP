import { Link } from "react-router";
import {
  CalendarDays,
  ClipboardCheck,
  IdCard,
  Presentation,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mockStudent, type Student } from "./student";
import StudentShell from "./student-shell";

/* ---------- Helpers ---------- */
function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function gradingProgress(r: Student["requirements"]) {
  const parts = [
    Math.min(r.sessions.done / r.sessions.required, 1),
    Math.min(r.monthsInRank.done / r.monthsInRank.required, 1),
    r.feePaid ? 1 : 0,
  ];
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

/* ---------- Small components ---------- */
function BeltIcon({ hex }: { hex: string }) {
  return (
    <svg viewBox="0 0 64 64" className="size-14" aria-hidden="true">
      <rect x="4" y="25" width="56" height="14" rx="3" fill={hex} stroke="rgb(0 0 0 / .25)" />
      <rect x="26" y="21" width="12" height="22" rx="3" fill={hex} stroke="rgb(0 0 0 / .35)" />
      <path d="M32 43l-7 13M32 43l7 13" stroke={hex} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function Requirement({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <li className="rounded-xl bg-muted px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <b className="block text-base tabular-nums">
        {value}
        {done && <span className="ml-1 text-primary">✓</span>}
      </b>
    </li>
  );
}

type TileProps = {
  title: string;
  status: string;
  to: string;
  icon: LucideIcon;
  badge?: number;
};

function Tile({ title, status, to, icon: Icon, badge }: TileProps) {
  return (
    <Link
      to={to}
      className="group relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {!!badge && (
        <span
          className="absolute right-3 top-3 grid h-6 min-w-6 place-items-center rounded-full bg-destructive px-2 text-xs font-bold text-destructive-foreground"
          aria-label={`${badge} pending`}
        >
          {badge}
        </span>
      )}
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-muted-foreground">{status}</span>
    </Link>
  );
}

/* ---------- Page ---------- */
export default function StudentHome() {
  // TODO: swap for a Supabase-backed hook, e.g. useStudentDashboard()
  const student = mockStudent;
  const { belt, nextBelt, requirements: r, counts, nextClass } = student;

  const pct = gradingProgress(r);
  const ctaLabel = student.gradingOpen
    ? "Apply for grading"
    : pct === 100
      ? "Choose grading timeslot"
      : "View grading requirements";

  const tiles: TileProps[] = [
    { title: "Timetable", to: "/timetable", icon: CalendarDays, status: "View this week's classes" },
    { title: "Attendance History", to: "/attendance", icon: UserCheck, status: `${counts.attendanceRate}% attendance` },
    { title: "Classes", to: "/classes", icon: Presentation, status: `${counts.classesEnrolled} enrolled` },
    {
      title: "Grading Applications",
      to: "/grading",
      icon: ClipboardCheck,
      status: counts.pendingGrading ? "Action needed" : "No pending actions",
      badge: counts.pendingGrading,
    },
    { title: "Membership Profile", to: "/profile", icon: IdCard, status: `Status: ${student.membershipStatus}` },
  ];

  return (
    <StudentShell>
      <main className="flex flex-col gap-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-red-ink">
            Student dashboard
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {greetingFor(new Date().getHours())}, {student.firstName}
          </h1>
          <p className="mt-2 inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
            Membership {student.membershipStatus.toLowerCase()}
          </p>
        </header>

        {/* Overview */}
        <section aria-label="Overview" className="mt-6 grid gap-4 md:grid-cols-[1.6fr_1fr]">
          {/* Belt rank */}
          <Card className="gap-4 rounded-2xl p-5">
            <div className="flex items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-primary/10">
                <BeltIcon hex={belt.hex} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold leading-tight tracking-tight">
                  {belt.name} ({belt.colour} belt)
                </h2>
                <p className="text-sm text-muted-foreground">Training towards {nextBelt.name}</p>
              </div>
            </div>

            <div>
  <div className="mb-1.5 flex justify-between text-sm">
    <span>Progress to {nextBelt.name} grading</span>
    <strong className="tabular-nums">{pct}%</strong>
  </div>

  <div
    role="progressbar"
    aria-label={`Progress to ${nextBelt.name} grading`}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={pct}
    className="h-3 overflow-hidden rounded-full bg-muted"
  >
    <div
      className="h-full bg-primary transition-all"
      style={{ width: `${pct}%` }}
    />
  </div>
</div>

<ul className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
  <Requirement
    label="Sessions attended"
    value={`${r.sessions.done} / ${r.sessions.required}`}
    done={r.sessions.done >= r.sessions.required}
  />
  <Requirement
    label="Time in rank"
    value={`${r.monthsInRank.done} / ${r.monthsInRank.required} months`}
    done={r.monthsInRank.done >= r.monthsInRank.required}
  />
  <Requirement label="Grading fee" value={r.feePaid ? "Paid" : "Unpaid"} done={r.feePaid} />
</ul>

<Link to="/grading" className={buttonVariants({ className: "self-start" })}>
  {ctaLabel}
</Link>
          </Card>

          {/* Next class */}
          <Card className="gap-3 rounded-2xl p-5">
            <h2 className="font-bold">Your next class</h2>
            {nextClass ? (
              <dl className="grid gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">When</dt>
                  <dd className="text-xl font-semibold tracking-tight">{formatWhen(nextClass.startsAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Class</dt>
                  <dd className="font-semibold">{nextClass.title}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Where</dt>
                  <dd className="font-semibold">
                    {nextClass.centre}, {nextClass.instructor}
                  </dd>
                </div>
                {nextClass.recommended && (
                  <span className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    Recommended for your rank
                  </span>
                )}
              </dl>
            ) : (
              <div className="grid gap-3">
                <p className="text-muted-foreground">No upcoming classes.</p>
                <Link
                  to="/classes"
                  className={buttonVariants({ variant: "outline", className: "w-fit" })}
                >
                  Browse classes
                </Link>
              </div>
            )}
          </Card>
        </section>

        {/* Tiles */}
        <h2 className="mb-3.5 mt-8 text-lg font-semibold">Self-service</h2>
        <nav aria-label="Student self-service" className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
          {tiles.map((t) => (
            <Tile key={t.to} {...t} />
          ))}
        </nav>
      </main>
    </StudentShell>
  );
}