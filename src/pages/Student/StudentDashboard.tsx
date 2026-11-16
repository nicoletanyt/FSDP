import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import {
    ArrowRight,
    CalendarCheck,
    CalendarDays,
    ChevronRight,
    CreditCard,
    GraduationCap,
    IdCard,
    MapPin,
    Receipt,
    Plus,
    Ticket,
    TriangleAlert,
    UserRound,
    UserCheck,
} from "lucide-react";

import AttendanceQrCard, { type AttendanceQrState } from "@/components/student/AttendanceQrCard";
import DashboardCarousel from "@/components/student/DashboardCarousel";
import PaymentStatusBadge from "@/components/student/PaymentStatusBadge";
import { DatabaseGradeBadge, gradeFromId } from "@/components/shared/grade/GradeBadge";
import PageHeader from "@/components/shared/layout/PageHeader";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useAuth } from "@/hooks/use-auth";
import { useDashboardGrading } from "@/hooks/use-dashboard-grading";
import { useGradingReadiness } from "@/hooks/use-grading-readiness";
import { useMembershipStatus } from "@/hooks/use-membership-status";
import { useStudentDashboard } from "@/hooks/use-student-dashboard";
import { useStudentPayments } from "@/hooks/use-student-payments";
import { formatDate, greetingFor, money } from "@/lib/format";
import type { Belt, DashboardSummary } from "@/lib/student-dashboard";
import type { Payment } from "@/lib/student-profile";
import { cn } from "@/lib/utils";
import type { StudentContext } from "@/layouts/StudentLayout";
import NonMemberDashboard from "./NonMemberDashboard";

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
    const { creditAccount } = useOutletContext<Pick<StudentContext, 'creditAccount'>>();
    const [confirmChecks, setConfirmChecks] = useState(0);
    const firstName = profile?.first_name ?? "";
    const returnedFromCheckout = searchParams.get("checkout") === "success";

    // The webhook can land a few seconds after Stripe redirects back, so re-check briefly.
    useEffect(() => {
        if (!returnedFromCheckout || !status) return;
        if (status === "active" || creditAccount.payment === 'confirmed') {
            setSearchParams({}, { replace: true });
            return;
        }
        if (confirmChecks >= CONFIRM_ATTEMPTS) return;
        const timer = setTimeout(() => {
            setConfirmChecks((n) => n + 1);
            reload();
        }, CONFIRM_INTERVAL_MS);
        return () => clearTimeout(timer);
    }, [returnedFromCheckout, status, confirmChecks, reload, setSearchParams, creditAccount.payment]);

    if (loading) return <PageSkeleton label="Loading your dashboard…" />;
    if (error || !status) {
        return (
            <RetryAlert message="We couldn't load your dashboard." onRetry={reload} />
        );
    }
    if (status !== "active") {
        return (
            <>
                {returnedFromCheckout && (
                    <Alert role="status" className="mb-6">
                        <AlertDescription>
                            {confirmChecks < CONFIRM_ATTEMPTS
                                ? "Thanks. Confirming your payment…"
                                : "We've received your payment, but confirmation is taking longer than usual. Refresh this page in a minute."}
                        </AlertDescription>
                    </Alert>
                )}
                <NonMemberDashboard firstName={firstName} status={status} />
            </>
        );
    }
    return <MemberDashboard firstName={firstName} />;
}

function MemberDashboard({ firstName }: { firstName: string }) {
    const { summary, loading, error, reload } = useStudentDashboard();

    if (loading) return <PageSkeleton label="Loading your dashboard…" />;
    if (error || !summary) {
        return (
            <RetryAlert
                message="We couldn't load your training details."
                onRetry={reload}
            />
        );
    }
    return <MemberDashboardView firstName={firstName} summary={summary} />;
}

/* ---------- Helpers ---------- */
const badgeGrade = (belt: Belt | null) =>
    belt && { id: belt.label, label: belt.label, colour: belt.colour };

/** "Today", "Tomorrow" or "In N days", counted in calendar days. */
function relativeDay(iso: string) {
    const start = new Date(iso);
    const midnight = (date: Date) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round(
        (midnight(start) - midnight(new Date())) / 86_400_000,
    );
    return days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}

/** e.g. "Mon 16 Nov". */
const classDay = (iso: string) =>
    new Date(iso).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
/** e.g. "11:50 pm": the fact a student plans around, so it gets the most weight. */
const classTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });

/* ---------- Building blocks ---------- */
type Icon = ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true";
}>;

/** The shared frame of a carousel card: icon, eyebrow, optional badge, body and a CTA pinned to the bottom. */
function SlideCard({
    icon: Icon,
    eyebrow,
    badge,
    emphasis = false,
    footer,
    children,
    aside,
    id,
}: {
    icon: Icon;
    eyebrow: string;
    badge?: ReactNode;
    emphasis?: boolean;
    footer: ReactNode;
    children: ReactNode;
    /** Shown to the right of the heading and body, aligned to the top of the card. */
    aside?: ReactNode;
    id?: string;
}) {
    return (
        <Card
            id={id}
            className={cn(
                "w-full min-w-0 scroll-mt-24 gap-4 p-4 sm:p-5",
                emphasis &&
                "bg-linear-to-br from-primary/10 via-card to-card ring-primary/30!",
            )}
        >
            <div className="flex flex-1 items-stretch gap-3 sm:gap-4">
            <div className="grid min-w-0 flex-1 content-start gap-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span
                        className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-lg",
                            emphasis
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                        )}
                    >
                        <Icon className="size-4" aria-hidden="true" />
                    </span>
                    {eyebrow}
                </h2>
                {badge}
            </div>
            <div className="grid min-w-0 content-start gap-4">{children}</div>
            </div>
            {aside}
            </div>
            <div className="mt-auto">{footer}</div>
        </Card>
    );
}

function Fact({ icon: Icon, children }: { icon: Icon; children: ReactNode }) {
    return (
        <li className="flex min-w-0 items-start gap-2.5">
            <Icon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
            />
            <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{children}</span>
        </li>
    );
}

// cn() resolves the variant's border over the base transparent border, as <Button> does.
const ctaClass = (variant: "default" | "outline" = "outline") =>
    cn(buttonVariants({ variant, size: "touch", className: "w-full gap-2" }));

/* ---------- Carousel cards ---------- */
function NextClassCard({
    nextClass,
}: {
    nextClass: DashboardSummary["nextClass"];
}) {
    // While check-in is open, the QR button becomes the filled action and this one steps back.
    const [checkIn, setCheckIn] = useState<AttendanceQrState>("loading");
    if (!nextClass) {
        return (
            <SlideCard
                id="check-in"
                icon={CalendarDays}
                eyebrow="Your next class"
                emphasis
                footer={
                    <Link to="/classes" className={ctaClass("default")}>
                        Enrol in a class
                    </Link>
                }
            >
                <div className="grid gap-1">
                    <p className="text-xl font-semibold tracking-tight">
                        No upcoming classes
                    </p>
                    <p className="text-muted-foreground">
                        Book a session to see it here, with check-in on the day.
                    </p>
                </div>
            </SlideCard>
        );
    }
    return (
        <SlideCard
            id="check-in"
            icon={CalendarDays}
            eyebrow="Your next class"
            emphasis
            footer={
                <Link to="/timetable" className={ctaClass(checkIn === "ready" ? "outline" : "default")}>
                    View class details
                    <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
            }
            // Live, signed code for today's booked class: a tile at the top right of the card.
            aside={<AttendanceQrCard compact inline hideUnavailable onStatus={setCheckIn} />}
        >
            {/* When first (day, then the time in large type), then what and where. */}
                <div className="grid min-w-0 gap-3">
                    <div className="grid gap-0.5">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-semibold text-primary">{relativeDay(nextClass.startsAt)}</span>
                            {" · "}
                            {classDay(nextClass.startsAt)}
                        </p>
                        <p className="text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-3xl">
                            {classTime(nextClass.startsAt)}
                        </p>
                        <p className="text-lg font-semibold [overflow-wrap:anywhere]">{nextClass.title}</p>
                    </div>
                    <ul className="grid gap-2">
                        {nextClass.centre && <Fact icon={MapPin}>{nextClass.centre}</Fact>}
                        {nextClass.instructor && (
                            <Fact icon={UserRound}>{nextClass.instructor}</Fact>
                        )}
                    </ul>
                </div>
        </SlideCard>
    );
}

function TrainingCard({ belt, nextBelt }: Pick<DashboardSummary, "belt" | "nextBelt">) {
    const { profile } = useAuth();
    // The same eligibility rules the instructor's "Next grading" section and admin lists use.
    const readiness = useGradingReadiness(profile?.id);
    const rows = readiness.rows;
    const target = rows.length ? gradeFromId(rows[0].target_grade_id) ?? badgeGrade(nextBelt) : badgeGrade(nextBelt);
    const met = rows.filter((row) => row.met).length;
    const eligible = rows.length > 0 && met === rows.length;
    const badgeClass = "px-2.5 py-1 text-sm";

    return (
        <SlideCard
            icon={GraduationCap}
            eyebrow="Your training progress"
            footer={<Link to="/grading/requirements" className={ctaClass()}>View more grading information</Link>}
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="sr-only">Current grade:</span>
                <DatabaseGradeBadge grade={badgeGrade(belt)} className={badgeClass} />
                {target && (
                    <>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">Next grade:</span>
                        <DatabaseGradeBadge grade={target} className={badgeClass} />
                    </>
                )}
            </div>
            {readiness.loading ? (
                <div role="status" aria-label="Checking your grading eligibility" className="grid gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-1.5" />
                    <Skeleton className="h-10" />
                </div>
            ) : readiness.error ? (
                <div className="grid gap-2">
                    <p className="text-muted-foreground">We couldn&apos;t check your grading eligibility.</p>
                    <Button variant="link" className="h-auto w-fit p-0" onClick={readiness.retry}>Try again</Button>
                </div>
            ) : rows.length === 0 ? (
                <p className="text-muted-foreground">
                    {nextBelt
                        ? "Your eligibility for the next grade isn't available yet. Check the requirements before applying."
                        : "You've reached the highest grade on your track. Speak to your instructor about further gradings."}
                </p>
            ) : (
                <>
                    <div className="grid gap-2">
                        <p role="status" aria-atomic="true" className={cn("text-sm tabular-nums", eligible ? "font-medium text-success" : "text-muted-foreground")}>
                            {eligible ? `All ${rows.length} requirements met` : `${met} of ${rows.length} requirements met`}
                        </p>
                        <progress
                            aria-label="Grading eligibility requirements met"
                            value={met}
                            max={rows.length}
                            className={cn(
                                "block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
                                eligible
                                    ? "[&::-moz-progress-bar]:bg-success [&::-webkit-progress-value]:bg-success"
                                    : "[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary",
                            )}
                        />
                    </div>
                </>
            )}
        </SlideCard>
    );
}

/** The class-credit balance from the database (same data and notices as the Credits page). */
function CreditsCard() {
    const { creditAccount } = useOutletContext<StudentContext>();
    const { credits, unlimited, loading, error, payment, retry, expiring } = creditAccount;
    const daysLeft = expiring ? Math.ceil((Date.parse(expiring.expiresAt) - Date.now()) / 86_400_000) : 0;
    const display = loading ? "Loading…" : error ? "Unavailable" : unlimited ? "Unlimited" : String(credits);
    const notice = error || (payment === "pending"
        ? "Confirming your payment. Your balance will update automatically."
        : payment === "confirmed"
            ? "Payment confirmed. Your purchased credits are included in this balance."
            : payment === "delayed"
                ? "Payment confirmation is taking longer than expected. Check again shortly; do not purchase again."
                : "");

    return (
        <SlideCard
            icon={Ticket}
            eyebrow="Available credits"
            footer={
                <Link to="/student/credits" className={ctaClass()}>
                    <Plus className="size-4" aria-hidden="true" />
                    Top up credits
                </Link>
            }
        >
            <div className="grid gap-1">
                <p className="flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">{display}</span>
                    {!loading && !error && !unlimited && (
                        <span className="text-muted-foreground">{credits === 1 ? "credit" : "credits"}</span>
                    )}
                </p>
                <p className="text-sm text-muted-foreground">1 credit = 1 class</p>
            </div>
            {!loading && !error && expiring && daysLeft > 0 && daysLeft <= 21 && (
                <p role="status" data-expiry-notice className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm font-medium text-warning-foreground dark:text-warning">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>{expiring.credits} {expiring.credits === 1 ? "credit expires" : "credits expire"} in {daysLeft} {daysLeft === 1 ? "day" : "days"}</span>
                </p>
            )}
            {notice && (
                <p role="status" className="text-sm">
                    {notice}
                    {(error || payment === "delayed") && (
                        <button type="button" onClick={retry} className="ml-2 rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
                            Refresh balance
                        </button>
                    )}
                </p>
            )}
            <Link to="/student/credits#my-passes" className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
                View my passes and expiry
            </Link>
        </SlideCard>
    );
}

/* ---------- Below the carousel ---------- */
function QuickAction({
    to,
    icon: Icon,
    label,
    detail,
    count,
}: {
    to: string;
    icon: Icon;
    label: string;
    detail: string;
    count?: number;
}) {
    return (
        <Link
            to={to}
            // Phones: a compact stacked tile in a 2×2 grid; wider screens: a row.
            className="group flex min-w-0 flex-col items-start gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring sm:min-h-18 sm:flex-row sm:items-center sm:gap-3 sm:p-4"
        >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                    {label}
                    {count ? (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground max-md:h-6 max-md:min-w-6">
                            {count}
                        </span>
                    ) : null}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere] sm:line-clamp-none">
                    {detail}
                </span>
            </span>
            <ChevronRight
                className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
                aria-hidden="true"
            />
        </Link>
    );
}

const activityIcon: Record<string, Icon> = {
    Membership: IdCard,
    Grading: GraduationCap,
    "Class pass": Ticket,
};

function RecentActivity({
    payments,
    loading,
    error,
    retry,
}: {
    payments: Payment[];
    loading: boolean;
    error: string;
    retry: () => void;
}) {
    const recent = [...payments]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 4);
    return (
        <Card className="min-w-0 gap-3 p-4">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            {loading ? (
                <div
                    role="status"
                    aria-label="Loading recent activity"
                    className="grid gap-2"
                >
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-12" />
                    ))}
                </div>
            ) : error ? (
                <div className="grid gap-2">
                    <p className="text-muted-foreground">
                        We couldn&apos;t load your recent activity.
                    </p>
                    <Button variant="link" className="h-auto w-fit p-0" onClick={retry}>
                        Try again
                    </Button>
                </div>
            ) : recent.length === 0 ? (
                <p className="text-muted-foreground">
                    No payments or passes yet. Your recent activity will appear here.
                </p>
            ) : (
                <ul className="-mx-4 divide-y">
                    {recent.map((payment) => {
                        const ActivityIcon = activityIcon[payment.item] ?? Receipt;
                        return (
                            <li key={payment.id} className="flex items-start gap-3 px-4 py-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                                    <ActivityIcon className="size-4" aria-hidden="true" />
                                </span>
                                <span className="grid min-w-0 flex-1 gap-0.5">
                                    <span className="flex items-baseline justify-between gap-3">
                                        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                                            {payment.description}
                                        </span>
                                        <span className="shrink-0 font-medium tabular-nums">
                                            {money.format(payment.amount)}
                                        </span>
                                    </span>
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                        {payment.item} · {formatDate(payment.date)}
                                        {/* Paid is the normal state; only exceptions get a badge. */}
                                        {payment.status !== "Paid" && <PaymentStatusBadge status={payment.status} />}
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

/* ---------- View ---------- */
function MemberDashboardView({
    firstName,
    summary,
}: {
    firstName: string;
    summary: DashboardSummary;
}) {
    const { profile } = useAuth();
    const grading = useDashboardGrading(profile?.id);
    const payments = useStudentPayments(profile?.id);
    const { belt, nextBelt, counts, nextClass } = summary;

    return (
        <section className="flex w-full flex-col gap-6">
            <PageHeader
                title={`${greetingFor(new Date().getHours())}${firstName ? `, ${firstName}` : ""}`}
            />

            <DashboardCarousel
                label="Your overview"
                slideLabels={[
                    "Your next class",
                    "Available credits",
                    "Your training progress",
                ]}
            >
                <NextClassCard nextClass={nextClass} />
                <CreditsCard />
                <TrainingCard belt={belt} nextBelt={nextBelt} />
            </DashboardCarousel>

            <section aria-labelledby="quick-actions" className="grid gap-3">
                <h2 id="quick-actions" className="text-lg font-semibold">
                    Quick actions
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <QuickAction
                        to="/classes"
                        icon={CalendarCheck}
                        label="Enrol in a class"
                        detail={
                            counts.classesBooked
                                ? `${counts.classesBooked} upcoming ${counts.classesBooked === 1 ? "class" : "classes"} booked`
                                : "Find a class and book a seat"
                        }
                    />
                    <QuickAction
                        to="/grading"
                        icon={GraduationCap}
                        label="Apply for grading"
                        detail={grading.status}
                        count={grading.loading ? undefined : grading.badge}
                    />
                    <QuickAction
                        to="/payments"
                        icon={CreditCard}
                        label="Payment history"
                        detail="Receipts and past payments"
                    />
                    <QuickAction
                        to="/timetable"
                        icon={UserCheck}
                        label="Attendance"
                        detail={
                            counts.attendanceRate === null
                                ? "No sessions marked yet"
                                : `${counts.attendanceRate}% of marked sessions attended`
                        }
                    />
                </div>
            </section>

            <RecentActivity {...payments} />
        </section>
    );
}
