import { useState } from "react";
import { Link } from "react-router";
import {
  CalendarDays,
  ClipboardCheck,
  IdCard,
  QrCode,
  Presentation,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/student/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { mockStudent, type Student } from "@/lib/student-dashboard";

/* ---------- Helpers ---------- */
function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function isClassDay(iso: string) {
  const classDate = new Date(iso);
  return !Number.isNaN(classDate.getTime()) && classDate.toDateString() === new Date().toDateString();
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
    <li className="min-w-0 rounded-lg bg-muted px-4 py-3 text-sm">
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
      className="relative flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl bg-card p-5 text-center text-sm text-card-foreground ring-1 ring-foreground/10 transition-colors hover:bg-accent hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {!!badge && (
        <span
          className="absolute right-3 top-3 grid min-h-7 min-w-7 place-items-center rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground"
          aria-label={`${badge} pending`}
        >
          {badge}
        </span>
      )}
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="font-semibold">{title}</span>
      <span className="text-muted-foreground">{status}</span>
    </Link>
  );
}

/* ---------- Page ---------- */
export default function StudentDashboard() {
  // TODO: swap for a Supabase-backed hook, e.g. useStudentDashboard()
  const [attendanceQrOpen, setAttendanceQrOpen] = useState(false);
  const student = mockStudent;
  const { belt, nextBelt, requirements: r, counts, nextClass } = student;
  const attendanceQrAvailable = nextClass ? isClassDay(nextClass.startsAt) : false;

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
      <main className="w-full">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {greetingFor(new Date().getHours())}, {student.firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your training progress, upcoming classes and student services.
            </p>
          </div>
          <p className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            Membership {student.membershipStatus.toLowerCase()}
          </p>
        </header>

        {/* Overview */}
        <section aria-label="Overview" className="mt-6 grid gap-4 xl:grid-cols-2">
          {/* Belt rank */}
          <Card className="min-w-0 gap-5 p-5">
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary/10">
                <BeltIcon hex={belt.hex} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">
                  {belt.name} ({belt.colour} belt)
                </h3>
                <p className="text-sm text-muted-foreground">Training towards {nextBelt.name}</p>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex justify-between gap-3 text-sm">
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

            <ul className="grid gap-2.5 sm:grid-cols-3">
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

            <Link to="/grading" className={buttonVariants({ className: "mt-auto w-full self-start whitespace-normal sm:w-auto" })}>
              {ctaLabel}
            </Link>
          </Card>

          {/* Next class */}
          <Card className="min-w-0 gap-4 p-5">
            <h3 className="text-lg font-semibold">Your next class</h3>
            {nextClass ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_11rem]">
                <dl className="min-w-0 space-y-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">When</dt>
                    <dd className="text-lg font-semibold tracking-tight">{formatDateTime(nextClass.startsAt)}</dd>
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
                    <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      Recommended for your rank
                    </span>
                  )}
                </dl>
                <Dialog open={attendanceQrOpen} onOpenChange={setAttendanceQrOpen}>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        disabled={!attendanceQrAvailable}
                        aria-label={
                          attendanceQrAvailable
                            ? "Open attendance QR placeholder"
                            : "Attendance QR unavailable until the class day"
                        }
                        className={`grid min-h-40 w-full place-items-center rounded-xl border border-dashed p-5 text-center transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed ${
                          attendanceQrAvailable
                            ? "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10"
                            : "border-border bg-muted/50 text-muted-foreground"
                        }`}
                      />
                    }
                  >
                    <span className="grid justify-items-center gap-2">
                      <QrCode className="size-8" aria-hidden="true" />
                      <span className="font-semibold">
                        {attendanceQrAvailable ? "Attendance QR" : "QR unavailable"}
                      </span>
                      <span className="text-sm">
                        {attendanceQrAvailable
                          ? "Tap to view attendance placeholder"
                          : "Available on class day"}
                      </span>
                    </span>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-2rem)] max-w-lg p-6 sm:max-w-lg">
                    <div className="grid justify-items-center gap-5 py-2 text-center">
                      <div>
                        <DialogTitle className="text-xl font-semibold">
                          Attendance QR
                        </DialogTitle>
                        <DialogDescription className="mt-2">
                          QR placeholder for {nextClass.title}. No attendance will be recorded yet.
                        </DialogDescription>
                      </div>
                      <div
                        aria-label="QR code placeholder; no code generated"
                        className="grid size-64 place-items-center rounded-2xl border-2 border-dashed border-primary/40 bg-muted/50 text-primary sm:size-80"
                      >
                        <div className="grid justify-items-center gap-3">
                          <QrCode className="size-16" aria-hidden="true" />
                          <span className="text-sm font-medium">QR placeholder</span>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
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
