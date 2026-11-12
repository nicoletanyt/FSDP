import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ClipboardCheck,
  CreditCard,
  IdCard,
  QrCode,
  Presentation,
  UserCheck,
} from "lucide-react";

import { buttonVariants } from "@/components/student/button";
import { Tile, type TileProps } from "@/components/student/DashboardTile";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { useAuth } from "@/hooks/use-auth";
import { useMembershipStatus } from "@/hooks/use-membership-status";
import { useStudentDashboard } from "@/hooks/use-student-dashboard";
import { formatDateTime, greetingFor, money } from "@/lib/format";
import type { DashboardSummary } from "@/lib/student-dashboard";
import { beltHexFor } from "@/lib/student-profile";
import CreditBalanceCard from "./CreditBalanceCard";
import NonMemberDashboard from "./NonMemberDashboard";

/* ---------- Helpers ---------- */
function isClassDay(iso: string) {
  const classDate = new Date(iso);
  return !Number.isNaN(classDate.getTime()) && classDate.toDateString() === new Date().toDateString();
}

/** Average of the requirements that apply to the next grade (a minimum of 0 counts as met). */
function gradingProgress(r: DashboardSummary["requirements"]) {
  const share = (done: number, required: number | null) =>
    required === null ? null : required <= 0 ? 1 : Math.min(done / required, 1);
  const parts = [
    share(r.sessionsDone, r.sessionsRequired),
    share(r.monthsDone, r.monthsRequired),
    r.feePaid ? 1 : 0,
  ].filter((part): part is number => part !== null);
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

/* ---------- Page ---------- */
const CONFIRM_ATTEMPTS = 10; // every 2s → about 20s
const CONFIRM_INTERVAL_MS = 2000;

// /dashboard: paid (active) members get the full dashboard; everyone else
// gets the non-member one. Paying via Stripe flips the DB status to active
// (through the webhook), so returning from checkout or refreshing shows the
// member page.
export default function StudentDashboard() {
  const { profile } = useAuth();
  const { status, loading, error, reload } = useMembershipStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmChecks, setConfirmChecks] = useState(0);
  const firstName = profile?.first_name ?? "";
  const returnedFromCheckout = searchParams.get("checkout") === "success";

  // The webhook can land a few seconds after Stripe redirects back, so re-check briefly.
  useEffect(() => {
    if (!returnedFromCheckout || !status) return;
    if (status === "active") {
      setSearchParams({}, { replace: true });
      return;
    }
    if (confirmChecks >= CONFIRM_ATTEMPTS) return;
    const timer = setTimeout(() => {
      setConfirmChecks((n) => n + 1);
      reload();
    }, CONFIRM_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [returnedFromCheckout, status, confirmChecks, reload, setSearchParams]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your dashboard…</p>;
  }
  if (error || !status) {
    return (
      <p role="alert" className="text-sm text-brand-red-ink">
        We couldn't load your dashboard. Please refresh the page.
      </p>
    );
  }
  if (status !== "active") {
    return (
      <>
        {returnedFromCheckout && (
          <p role="status" className="mb-6 rounded-lg bg-primary/10 p-4 text-sm font-medium text-primary">
            {confirmChecks < CONFIRM_ATTEMPTS
              ? "Thanks! Confirming your payment…"
              : "We've received your payment, but confirmation is taking longer than usual. Refresh this page in a minute."}
          </p>
        )}
        <NonMemberDashboard firstName={firstName} status={status} />
      </>
    );
  }
  return <MemberDashboard firstName={firstName} />;
}

function MemberDashboard({ firstName }: { firstName: string }) {
  const { summary, loading, error } = useStudentDashboard();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your dashboard…</p>;
  }
  if (error || !summary) {
    return (
      <p role="alert" className="text-sm text-brand-red-ink">
        We couldn't load your training details. Please refresh the page.
      </p>
    );
  }
  return <MemberDashboardView firstName={firstName} summary={summary} />;
}

function MemberDashboardView({ firstName, summary }: { firstName: string; summary: DashboardSummary }) {
  const [attendanceQrOpen, setAttendanceQrOpen] = useState(false);
  const { belt, nextBelt, requirements: r, counts, nextClass } = summary;
  const attendanceQrAvailable = nextClass ? isClassDay(nextClass.startsAt) : false;

  const pct = gradingProgress(r);
  // Applying and paying live on /grading; requirements are read-only on their own page.
  const cta = counts.gradingsOpen
    ? { label: "Apply for grading", to: "/grading" }
    : r.feePaid
      ? { label: "View grading application", to: "/grading" }
      : { label: "View grading requirements", to: "/grading/requirements" };
  const feeValue = r.feePaid
    ? "Paid"
    : r.feeCents !== null
      ? `${money.format(r.feeCents / 100)} due`
      : "Not set";

  const tiles: TileProps[] = [
    { title: "Class Credits", to: "/student/credits", icon: CreditCard, status: "Top up your balance" },
    {
      title: "Attendance History",
      to: "/timetable",
      icon: UserCheck,
      status: counts.attendanceRate === null ? "No sessions marked yet" : `${counts.attendanceRate}% attendance`,
    },
    { title: "Classes", to: "/classes", icon: Presentation, status: `${counts.classesBooked} booked` },
    {
      title: "Grading Applications",
      to: "/grading",
      icon: ClipboardCheck,
      status: counts.gradingsOpen ? "Action needed" : "No pending actions",
      badge: counts.gradingsOpen,
    },
    { title: "Membership Profile", to: "/profile", icon: IdCard, status: "Status: Active" },
  ];

  return (
      <main className="w-full">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {greetingFor(new Date().getHours())}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your training progress, upcoming classes and student services.
            </p>
          </div>
          {/* Members are already members; the apply button lives on NonMemberDashboard. */}
          <p className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            Membership active
          </p>
        </header>

        <div className="mt-6">
          <CreditBalanceCard />
        </div>

        {/* Overview */}
        <section aria-label="Overview" className="mt-6 grid gap-4 xl:grid-cols-2">
          {/* Belt rank */}
          <Card className="min-w-0 gap-5 p-5">
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary/10">
                <BeltIcon hex={beltHexFor(belt?.colour ?? null)} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">{belt?.label ?? "Unranked"}</h3>
                <p className="text-sm text-muted-foreground">
                  {nextBelt
                    ? `Training towards ${nextBelt.label}`
                    : "You've reached the highest grade on your track. Speak to your instructor about further gradings."}
                </p>
              </div>
            </div>

            {nextBelt && (
              <>
                <div>
                  <div className="mb-1.5 flex justify-between gap-3 text-sm">
                    <span>Progress to {nextBelt.label} grading</span>
                    <strong className="tabular-nums">{pct}%</strong>
                  </div>

                  <div
                    role="progressbar"
                    aria-label={`Progress to ${nextBelt.label} grading`}
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
                  {r.sessionsRequired !== null && (
                    <Requirement
                      label="Sessions attended"
                      value={`${r.sessionsDone} / ${r.sessionsRequired}`}
                      done={r.sessionsDone >= r.sessionsRequired}
                    />
                  )}
                  {r.monthsRequired !== null && (
                    <Requirement
                      label="Time in rank"
                      value={`${r.monthsDone} / ${r.monthsRequired} months`}
                      done={r.monthsDone >= r.monthsRequired}
                    />
                  )}
                  <Requirement label="Grading fee" value={feeValue} done={r.feePaid} />
                </ul>
              </>
            )}

            <Link
              to={cta.to}
              className={buttonVariants({ className: "mt-auto w-full self-start whitespace-normal sm:w-auto" })}
            >
              {cta.label}
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
                      {[nextClass.centre, nextClass.instructor].filter(Boolean).join(", ")}
                    </dd>
                  </div>
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
                  <DialogContent className="w-[calc(100%-2rem)] max-w-lg p-4 sm:max-w-lg lg:p-6">
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
                        className="grid aspect-square w-64 max-w-full place-items-center rounded-2xl border-2 border-dashed border-primary/40 bg-muted/50 text-primary sm:w-80"
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
