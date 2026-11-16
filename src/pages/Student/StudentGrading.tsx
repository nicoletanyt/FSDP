import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronDown, ShieldCheck, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/admin/form-controls";
import PageHeader from "@/components/shared/layout/PageHeader";
import MembershipGate from "@/components/student/MembershipGate";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    DatabaseGradeBadge,
    gradeFromId,
} from "@/components/shared/grade/GradeBadge";
import {
    StatusBadge,
    type BadgeTone,
} from "@/components/shared/status/StatusBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import { gradingDate } from "@/lib/grading/format";
import EligibilityChecklist from "@/components/grading/EligibilityChecklist";
import type { ChecklistRequirement } from "@/components/grading/EligibilityChecklist";
import { gradingProgression } from "@/lib/grading-progression";
import {
    getGradingQuote,
    getGradingCheckoutUrl,
    getGradingTestCheckoutUrl,
    gradingCheckoutRequest,
    type GradingCheckoutOption,
} from "@/lib/grading-checkout";
import { randomUUID } from "@/lib/uuid";

type Readiness = ChecklistRequirement & {
    target_grade_id: string;
    target_grade_label: string;
};
type ApplicationDraft = {
    id: string;
    target_grade_id: string;
    status: string;
    created_at: string;
    base_fee_cents: number;
};

export default function StudentGrading() {
    return (
        <MembershipGate title="Grading application" feature="Applying for grading">
            <GradingApplication />
        </MembershipGate>
    );
}

function GradingApplication() {
    const { profile } = useAuth();
    const [params] = useSearchParams();
    const [options, setOptions] = useState<GradingCheckoutOption[]>([]);
    const [readiness, setReadiness] = useState<Readiness[]>([]);
    const [drafts, setDrafts] = useState<ApplicationDraft[]>([]);
    const [progression, setProgression] = useState<ReturnType<
        typeof gradingProgression
    > | null>(null);
    const [eventId, setEventId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [payment, setPayment] = useState("");
    const [processing, setProcessing] = useState(false);
    const submitting = useRef(false);
    const testRequestId = useRef(randomUUID());
    const targetBelt = progression?.target?.id ?? "";
    const targetDrafts = drafts.filter(
        (draft) => draft.target_grade_id === targetBelt,
    );
    const paidRequest = targetDrafts.find(
        (draft) => draft.status === "pending_review",
    );
    const verifyingRequest = targetDrafts.find(
        (draft) => draft.status === "preview_paid",
    );
    const savedDraft = paidRequest ?? verifyingRequest ?? targetDrafts[0];
    const studentName = [profile?.first_name, profile?.last_name]
        .filter(Boolean)
        .join(" ");
    const available = options.filter(
        (option) => !option.applied && option.target_grade === targetBelt,
    );
    const matching = available.filter(
        (option) => option.target_grade === targetBelt,
    );
    const selected =
        matching.find((option) => option.id === eventId) ?? matching[0];
    const isEligible = Boolean(selected);
    const testCheckout =
        !selected &&
        !paidRequest &&
        !verifyingRequest &&
        Boolean(progression?.target && progression.feeCents) &&
        (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").startsWith(
            "pk_test_",
        ) &&
        !options.some(
            (option) => option.applied && option.target_grade === targetBelt,
        );
    const baseFee =
        (paidRequest?.base_fee_cents ?? selected?.base_amount ?? 0) / 100;
    const lateFee = (selected?.late_amount ?? 0) / 100;
    const isLateSubmission = lateFee > 0;
    const totalFee =
        (paidRequest?.base_fee_cents ??
            selected?.total_amount ??
            (testCheckout ? progression?.feeCents : 0) ??
            0) / 100;
    const testReturn = params.get("checkout") === "test-success";
    const sessionId =
        params.get("checkout") === "success" || testReturn
            ? params.get("session_id")
            : null;

    useEffect(() => {
        if (!profile?.id) return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        setOptions([]);
        setReadiness([]);
        setDrafts([]);
        setProgression(null);
        setEventId("");
        void Promise.all([
            supabase
                .rpc("my_grading_checkout_options")
                .abortSignal(controller.signal),
            supabase.rpc("my_grading_readiness").abortSignal(controller.signal),
            supabase
                .from("students")
                .select("current_grade_id,date_of_birth")
                .eq("user_id", profile.id)
                .abortSignal(controller.signal)
                .maybeSingle(),
            supabase
                .from("grades")
                .select("id,label,sort_order")
                .abortSignal(controller.signal),
            supabase
                .from("grade_tracks")
                .select("grade_id,track")
                .abortSignal(controller.signal),
            supabase
                .from("grade_requirements")
                .select("grade_id,track,fee_cents")
                .abortSignal(controller.signal),
            supabase
                .from("grading_application_drafts")
                .select("id,target_grade_id,status,created_at,base_fee_cents")
                .eq("user_id", profile.id)
                .order("created_at", { ascending: false })
                .abortSignal(controller.signal),
        ])
            .then(
                ([
                    events,
                    ready,
                    student,
                    grades,
                    tracks,
                    requirements,
                    savedDrafts,
                ]) => {
                    if (controller.signal.aborted) return;
                    if (
                        [
                            events,
                            ready,
                            student,
                            grades,
                            tracks,
                            requirements,
                            savedDrafts,
                        ].some((result) => result.error)
                    ) {
                        throw new Error(
                            "Unable to load your grading records. Please try again.",
                        );
                    }
                    if (!student.data)
                        throw new Error(
                            "No student record is linked to your account. Please contact your dojo to record your current rank.",
                        );
                    setProgression(
                        gradingProgression(
                            student.data,
                            grades.data ?? [],
                            tracks.data ?? [],
                            requirements.data ?? [],
                        ),
                    );
                    setOptions(events.data ?? []);
                    setReadiness(ready.data ?? []);
                    setDrafts(savedDrafts.data ?? []);
                },
            )
            .catch((failure) => {
                if (!controller.signal.aborted)
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : "Unable to load your grading opportunities. Please try again.",
                    );
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [profile?.id, revision]);

    useEffect(() => {
        if (!sessionId) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let attempts = 0;
        setPayment(
            testReturn
                ? "Confirming your payment preview…"
                : "Confirming your Stripe payment… Your application will appear after verification.",
        );
        async function check() {
            try {
                const result = await gradingCheckoutRequest<{
                    paid: boolean;
                    draftSaved?: boolean;
                    paymentRecorded?: boolean;
                }>({
                    action: testReturn ? "test-status" : "status",
                    session_id: sessionId,
                });
                if (!active) return;
                if (result.paid) {
                    if (result.paymentRecorded && targetBelt && profile?.id) {
                        const { data: existing } = await supabase
                            .from("grading_applications")
                            .select("id")
                            .eq("user_id", profile.id)
                            .eq("target_grade_id", targetBelt)
                            .eq("status", "pending_review")
                            .maybeSingle();

                        if (!existing) {
                            await supabase.from("grading_applications").insert({
                                user_id: profile.id,
                                target_grade_id: targetBelt,
                                status: "pending_review",
                                amount_paid: totalFee,
                                payment_method: "stripe",
                                payment_date: new Date().toISOString(),
                            });
                        }
                    }

                    setPayment(
                        testReturn
                            ? result.paymentRecorded
                                ? "Payment confirmed and recorded. Your grading request is awaiting dojo eligibility review. No real charge was made."
                                : "Your checkout completed, but the payment record could not be verified. Contact your dojo; do not pay again."
                            : "Payment confirmed. Your grading application has been submitted.",
                    );
                    setRevision((previous) => previous + 1);
                } else if (++attempts < 30)
                    timer = setTimeout(() => void check(), 2000);
                else
                    setPayment(
                        "Payment verification is taking longer than expected. Refresh shortly; do not pay again.",
                    );
            } catch {
                if (active)
                    setPayment(
                        "Unable to check payment confirmation. Refresh shortly; do not pay again.",
                    );
            }
        }
        void check();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [sessionId, profile?.id, testReturn, targetBelt, totalFee]);

    const handleProceedToPayment = async () => {
        if (
            paidRequest ||
            verifyingRequest ||
            (!selected && !testCheckout) ||
            submitting.current
        )
            return;
        submitting.current = true;
        setProcessing(true);
        setError("");
        try {
            if (
                !selected &&
                testCheckout &&
                progression?.target &&
                progression.feeCents
            ) {
                window.location.assign(
                    await getGradingTestCheckoutUrl(
                        progression.target.id,
                        progression.feeCents,
                        testRequestId.current,
                    ),
                );
                return;
            }
            if (!selected) throw new Error("Select an eligible grading session.");
            const quote = await getGradingQuote(selected.id, selected.target_grade);
            if (quote.totalCents !== selected.total_amount) {
                throw new Error(
                    "The fee has changed. Refresh the grading options and review the new total before paying.",
                );
            }
            window.location.assign(await getGradingCheckoutUrl(quote));
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : "Unable to open Stripe checkout.",
            );
            setProcessing(false);
            submitting.current = false;
        }
    };

    const alreadyApplied = options.some(
        (option) => option.applied && option.target_grade === targetBelt,
    );
    // Where this application stands, as one pill on the order summary.
    const applicationState: { tone: BadgeTone; label: string } | null = loading
        ? null
        : paidRequest
            ? { tone: "success", label: "Payment confirmed" }
            : verifyingRequest
                ? { tone: "warning", label: "Verifying payment" }
                : alreadyApplied
                    ? { tone: "success", label: "Application submitted" }
                    : savedDraft
                        ? { tone: "neutral", label: "Draft saved" }
                        : null;
    // Why the pay button is unavailable, shown under it.
    const blockedReason =
        loading || error
            ? ""
            : paidRequest
                ? "Your request is awaiting dojo eligibility review. Do not pay again."
                : verifyingRequest
                    ? "Your payment is being verified. Do not pay again."
                    : selected || testCheckout
                        ? ""
                        : alreadyApplied
                            ? "You have already applied for this grading."
                            : "No eligible grading applications are open for your account. Your dojo must confirm your membership and training requirements before a formal grading application.";

    return (
        <section className="w-full space-y-6" aria-busy={loading}>
            <PageHeader
                title="Grading application"
                actions={
                    <Button
                        variant="outline"
                        nativeButton={false}
                        render={<Link to="/grading/requirements" />}
                    >
                        View more grading information
                    </Button>
                }
            />

            {/* Status: every message about this application, in one place and one style. */}
            {(payment ||
                params.get("checkout") === "cancel" ||
                params.get("checkout") === "test-cancel" ||
                error) && (
                    <div className="space-y-2">
                        {error && (
                            <RetryAlert
                                message={error}
                                onRetry={() => setRevision((previous) => previous + 1)}
                            />
                        )}
                        {payment && (
                            <Alert role="status">
                                <AlertDescription>{payment}</AlertDescription>
                            </Alert>
                        )}
                        {params.get("checkout") === "cancel" && (
                            <Alert role="status">
                                <AlertDescription>
                                    Stripe checkout was cancelled. Your application has not been
                                    submitted.
                                </AlertDescription>
                            </Alert>
                        )}
                        {params.get("checkout") === "test-cancel" && (
                            <Alert role="status">
                                <AlertDescription>
                                    Payment preview cancelled. No payment was made.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}
            {loading && (
                <p role="status" className="sr-only">
                    Loading your grading opportunities…
                </p>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_17rem] lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    {!loading && !error && (
                        <ReadinessCard
                            readiness={
                                readiness.length
                                    ? {
                                        targetId: readiness[0].target_grade_id,
                                        requirements: readiness,
                                    }
                                    : null
                            }
                        />
                    )}
                </div>

                <div className="lg:col-span-1">
                    <Card className="lg:sticky lg:top-6">
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-base leading-snug font-medium">
                                    Order summary
                                </h2>
                                {applicationState && (
                                    <StatusBadge tone={applicationState.tone}>
                                        {applicationState.label}
                                    </StatusBadge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {selected && (
                                <div className="mb-4 space-y-1.5 border-b pb-4">
                                    <Label htmlFor="grading-event">Grading session</Label>
                                    <NativeSelect
                                        id="grading-event"
                                        disabled={processing}
                                        value={selected.id}
                                        onChange={(event) => setEventId(event.target.value)}
                                        className="h-11 lg:h-10"
                                    >
                                        {matching.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name} · {gradingDate(option.grading_date)}
                                            </option>
                                        ))}
                                    </NativeSelect>
                                    <p className="text-xs text-muted-foreground">
                                        {selected.centre_name} · Applications close{" "}
                                        {gradingDate(selected.application_deadline)} (Singapore
                                        time)
                                    </p>
                                </div>
                            )}
                            <dl className="space-y-3 border-b pb-4 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Applicant</dt>
                                    <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">
                                        {studentName}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-muted-foreground">Current grade</dt>
                                    <dd id="current-grade">
                                        {loading ? (
                                            "—"
                                        ) : progression ? (
                                            <DatabaseGradeBadge
                                                grade={gradeFromId(progression.current.id)}
                                            />
                                        ) : (
                                            "Not recorded"
                                        )}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-muted-foreground">Target grade</dt>
                                    <dd id="target-grade" className="text-right">
                                        {loading ? (
                                            "—"
                                        ) : progression?.target ? (
                                            <DatabaseGradeBadge
                                                grade={gradeFromId(progression.target.id)}
                                            />
                                        ) : progression ? (
                                            "No further grade"
                                        ) : (
                                            "—"
                                        )}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Base fee</dt>
                                    <dd id="base-fee" className="font-medium tabular-nums">
                                        {selected || paidRequest
                                            ? money.format(baseFee)
                                            : progression?.feeCents != null
                                                ? money.format(progression.feeCents / 100)
                                                : "—"}
                                    </dd>
                                </div>
                                {isLateSubmission && (
                                    <div className="flex justify-between gap-3 rounded-md bg-warning/15 px-2 py-1.5 text-warning-foreground dark:text-warning">
                                        <dt className="flex items-center gap-1">
                                            <Info className="size-3.5" aria-hidden="true" /> Late
                                            submission
                                        </dt>
                                        <dd className="font-medium tabular-nums">
                                            +{money.format(lateFee)}
                                        </dd>
                                    </div>
                                )}
                            </dl>

                            <div className="mt-4 mb-5 flex items-end justify-between gap-3">
                                <span className="font-semibold">
                                    {paidRequest ? "Amount paid" : "Total due"}
                                </span>
                                <span className="text-3xl font-semibold tabular-nums">
                                    {selected || testCheckout || paidRequest
                                        ? money.format(totalFee)
                                        : "—"}
                                </span>
                            </div>

                            <Button
                                size="lg"
                                onClick={() => void handleProceedToPayment()}
                                disabled={
                                    Boolean(paidRequest || verifyingRequest) ||
                                    (!isEligible && !testCheckout) ||
                                    loading ||
                                    processing ||
                                    Boolean(error)
                                }
                                aria-describedby={
                                    testCheckout
                                        ? "payment-preview-note"
                                        : blockedReason
                                            ? "payment-blocked-reason"
                                            : undefined
                                }
                                className="w-full"
                            >
                                {paidRequest ? (
                                    "Payment confirmed"
                                ) : verifyingRequest ? (
                                    "Verifying payment"
                                ) : processing ? (
                                    <>
                                        <Loader2
                                            className="size-4 animate-spin motion-reduce:animate-none"
                                            aria-hidden="true"
                                        />{" "}
                                        Redirecting to Stripe…
                                    </>
                                ) : (
                                    "Proceed to payment"
                                )}
                            </Button>
                            {blockedReason && (
                                <p
                                    id="payment-blocked-reason"
                                    className="mt-3 text-sm text-muted-foreground"
                                >
                                    {blockedReason}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>
    );
}

/** The student's checklist for their next grade (moved here from the requirements page). */
function ReadinessCard({
    readiness,
}: {
    readiness: { targetId: string; requirements: ChecklistRequirement[] } | null;
}) {
    const [open, setOpen] = useState(false);
    if (!readiness) {
        return (
            <Card>
                <CardHeader>
                    <h2 className="text-base leading-snug font-medium">
                        Your next grade
                    </h2>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    You have reached the highest grade on your grading ladder.
                </CardContent>
            </Card>
        );
    }
    const met = readiness.requirements.filter(
        (requirement) => requirement.met,
    ).length;
    const total = readiness.requirements.length;
    const eligible = met === total;
    return (
        <Card aria-labelledby="your-eligibility">
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex items-center gap-1">
                        <h2
                            id="your-eligibility"
                            className="flex flex-wrap items-center gap-2 text-base leading-snug font-medium"
                        >
                            Your eligibility for
                            <DatabaseGradeBadge grade={gradeFromId(readiness.targetId)} />
                        </h2>
                        {/* How requirements are counted, on demand rather than always on screen. */}
                        <Popover>
                            <PopoverTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-touch"
                                        aria-label="How eligibility is counted"
                                    />
                                }
                            >
                                <Info
                                    aria-hidden="true"
                                    className="size-4 text-muted-foreground"
                                />
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-72 text-sm">
                                Requirements follow the published ASK grading sheets. Time and
                                training sessions count from your last grading (or from joining
                                if you have not graded yet).
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid gap-2">
                    <p
                        className={
                            eligible
                                ? "text-sm font-medium text-success tabular-nums"
                                : "text-sm text-muted-foreground tabular-nums"
                        }
                    >
                        {eligible
                            ? total === 1
                                ? "Requirement met"
                                : `All ${total} requirements met`
                            : `${met} of ${total} requirements met`}
                    </p>
                    {/* Same bar as the dashboard's grading card. */}
                    <progress
                        aria-label="Grading eligibility requirements met"
                        value={met}
                        max={total}
                        className={cn(
                            "block h-2 w-full overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
                            eligible
                                ? "[&::-moz-progress-bar]:bg-success [&::-webkit-progress-value]:bg-success"
                                : "[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary",
                        )}
                    />
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={open}
                    aria-controls="eligibility-requirements"
                    onClick={() => setOpen((value) => !value)}
                    className="-ml-2 min-h-11 gap-1 text-primary lg:min-h-9"
                >
                    {open ? "See less" : "See more"}
                    <ChevronDown
                        aria-hidden="true"
                        className={cn(
                            "size-4 transition-transform motion-reduce:transition-none",
                            open && "rotate-180",
                        )}
                    />
                </Button>
                {open && (
                    <div id="eligibility-requirements">
                        <EligibilityChecklist
                            requirements={readiness.requirements}
                            compact
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
