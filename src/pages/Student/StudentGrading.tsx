import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronDown, ShieldCheck, Info, Loader2, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/admin/form-controls";
import PageHeader from "@/components/shared/layout/PageHeader";
import MembershipGate from "@/components/student/MembershipGate";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatabaseGradeBadge, gradeFromId } from "@/components/shared/grade/GradeBadge";
import { StatusBadge } from "@/components/shared/status/StatusBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogDescription, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import { gradingDate } from "@/lib/grading/format";
import { singaporeDate } from "@/lib/grading-fees";
import EligibilityChecklist, { type ChecklistRequirement } from "@/components/grading/EligibilityChecklist";
import { gradingProgression } from "@/lib/grading-progression";
import { gradingTrackLabel, type GradingTrack } from "@/lib/grading-tracks";
import { getGradingQuote, getGradingCheckoutUrl, gradingCheckoutRequest, type GradingCheckoutOption } from "@/lib/grading-checkout";

// Dates come from public.gradings (official_schedule = true), seeded with the
// published ASK 2026 adult/children schedules. No browser-created event dates.
type OfficialDate = { id: string; name: string; grading_date: string };
type Readiness = ChecklistRequirement & { target_grade_id: string; track: GradingTrack };
type Application = {
    id: string;
    grading_event_id: string;
    target_grade_id: string;
    grading_date: string | null;
    status: string;
    amount_paid_cents: number | null;
    payment_confirmed_at: string | null;
    base_fee_cents: number | null;
    late_fee_cents: number | null;
};
type MembershipProfile = {
    full_name: string;
    phone: string;
    emergency_name: string;
    emergency_relationship: string;
    emergency_phone: string;
    medical_details: string;
    recorded_medical_details: string[];
};

const officialDateLabel = (date: string) => new Intl.DateTimeFormat("en-SG", {
    day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "Asia/Singapore",
}).format(new Date(`${date}T12:00:00+08:00`));

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
    const [dates, setDates] = useState<OfficialDate[]>([]);
    const [applications, setApplications] = useState<Application[]>([]);
    const [readiness, setReadiness] = useState<Readiness[]>([]);
    const [progression, setProgression] = useState<ReturnType<typeof gradingProgression> | null>(null);
    const [selectedGradingDate, setSelectedGradingDate] = useState("");
    const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
    const [membership, setMembership] = useState<MembershipProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState("");
    const [profileRevision, setProfileRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [checkoutError, setCheckoutError] = useState("");
    const [revision, setRevision] = useState(0);
    const [payment, setPayment] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [processing, setProcessing] = useState(false);
    const submitting = useRef(false);
    const modalOpen = useRef(false);
    const modalSession = useRef(0);
    const activeUser = useRef(profile?.id);
    activeUser.current = profile?.id;
    const formHeading = useRef<HTMLHeadingElement>(null);
    const sessionId = params.get("checkout") === "success" ? params.get("session_id") : null;
    const previewReturn = params.get("checkout") === "test-success";
    const [confirmedSession, setConfirmedSession] = useState("");
    const today = singaporeDate();
    const targetBelt = progression?.target?.id ?? "";
    const currentApplications = applications.filter((application) =>
        application.target_grade_id === targetBelt && application.status !== "withdrawn" &&
        application.grading_date && application.grading_date >= today);
    const existing = selectedGradingDate
        ? currentApplications.find((application) => application.grading_date === selectedGradingDate)
        : currentApplications.at(-1);
    const paid = Boolean(existing?.payment_confirmed_at);
    const selectedEvent = dates.find((date) => date.grading_date === selectedGradingDate);
    const selected = options.find((option) => option.id === selectedEvent?.id && option.target_grade === targetBelt && !option.applied);
    const requirementsMet = readiness.length > 0 && readiness.every((requirement) => requirement.met);
    const profileComplete = Boolean(membership?.full_name && membership.emergency_name &&
        membership.emergency_relationship && membership.emergency_phone);
    const paymentLocked = Boolean(sessionId && confirmedSession !== sessionId) || verifying || Boolean(confirmedSession);
    const baseCents = existing?.base_fee_cents ?? selected?.base_amount ?? progression?.feeCents;
    const lateCents = existing?.late_fee_cents ?? selected?.late_amount ?? 0;
    const totalCents = existing?.amount_paid_cents ?? selected?.total_amount;
    const canPay = Boolean(isApplyModalOpen && selectedGradingDate && selected && requirementsMet && profileComplete &&
        !existing && !paymentLocked && !previewReturn &&
        !loading && !profileLoading && !error && !profileError && !processing);
    const studentName = membership?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    const blockedReason = existing
        ? paid ? "Your payment is confirmed. Your application is awaiting dojo review. Do not pay again." : "You have already applied for this grading."
        : paymentLocked || previewReturn ? "Check your payment confirmation before starting another checkout. Do not pay again."
        : !isApplyModalOpen ? "Open your application to review your details and select an official grading date."
        : !selectedGradingDate ? "Select an official grading date to continue."
        : !requirementsMet || !selected ? "This grading is not open for your account, or your eligibility requirements have not been met."
        : !profileComplete ? "Your saved Membership Profile is missing required contact details. Contact your dojo to correct the membership record before paying."
        : "";

    useEffect(() => {
        modalOpen.current = false;
        modalSession.current += 1;
        setIsApplyModalOpen(false);
        setMembership(null);
        setSelectedGradingDate("");
        setOptions([]);
        setDates([]);
        setApplications([]);
        setReadiness([]);
        setProgression(null);
        setConfirmedSession("");
        setProcessing(false);
        submitting.current = false;
    }, [profile?.id]);

    useEffect(() => {
        if (!profile?.id) return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        void Promise.all([
            supabase.rpc("my_grading_checkout_options").abortSignal(controller.signal),
            supabase.rpc("my_official_grading_dates").abortSignal(controller.signal),
            supabase.rpc("my_grading_applications").abortSignal(controller.signal),
            supabase.rpc("my_grading_readiness").abortSignal(controller.signal),
            supabase.from("students").select("current_grade_id,date_of_birth").eq("user_id", profile.id).abortSignal(controller.signal).maybeSingle(),
            supabase.from("grades").select("id,label,sort_order").abortSignal(controller.signal),
            supabase.from("grade_tracks").select("grade_id,track").abortSignal(controller.signal),
            supabase.from("grade_requirements").select("grade_id,track,fee_cents").abortSignal(controller.signal),
        ]).then(([events, schedule, saved, ready, student, grades, tracks, requirements]) => {
            if (controller.signal.aborted) return;
            if ([events, schedule, saved, ready, student, grades, tracks, requirements].some((result) => result.error)) {
                throw new Error("Unable to load your grading records. Please try again.");
            }
            if (!student.data) throw new Error("No student record is linked to your account. Please contact your dojo.");
            const readinessRows = (ready.data ?? []) as Readiness[];
            const next = readinessRows[0];
            if (next && readinessRows.some(row => row.target_grade_id !== next.target_grade_id || row.track !== next.track)) {
                throw new Error("Your grading requirements disagree about the next grade. Please contact your dojo.");
            }
            const nextProgression = gradingProgression(student.data, grades.data ?? [], tracks.data ?? [], requirements.data ?? [], singaporeDate(), next);
            setProgression(nextProgression);
            setOptions(events.data ?? []);
            setDates(schedule.data ?? []);
            setApplications(saved.data ?? []);
            setReadiness(ready.data ?? []);
        }).catch((failure) => {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load grading records.");
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [profile?.id, revision]);

    // The owner-scoped RPC reads the submitted private Membership form, with
    // domain-record fallback for legacy members. This page never edits it.
    useEffect(() => {
        if (!profile?.id || !isApplyModalOpen) return;
        const controller = new AbortController();
        setProfileLoading(true);
        setProfileError("");
        void (async () => {
            try {
                const { data, error: failure } = await supabase.rpc("my_grading_profile").abortSignal(controller.signal);
                if (failure?.code === "PGRST202") throw new Error("Membership profile retrieval is not set up. Please ask your administrator to apply the grading membership database migrations.");
                if (failure || !data) throw new Error("Unable to retrieve your Membership Profile. Please try again.");
                if (!controller.signal.aborted) setMembership(data);
            } catch (failure) {
                if (!controller.signal.aborted) setProfileError(failure instanceof Error ? failure.message : "Unable to retrieve your profile.");
            } finally { if (!controller.signal.aborted) setProfileLoading(false); }
        })();
        return () => controller.abort();
    }, [profile?.id, isApplyModalOpen, profileRevision]);

    // The browser only polls server-owned state. The webhook, not this return
    // URL, creates the application and marks it paid in one database transaction.
    useEffect(() => {
        if (!sessionId || !profile?.id) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let attempts = 0;
        setVerifying(true);
        setPayment("Confirming your Stripe payment… Please do not pay again.");
        async function check() {
            try {
                const result = await gradingCheckoutRequest<{ paid: boolean }>({ action: "status", session_id: sessionId });
                if (!active) return;
                if (result.paid) {
                    setConfirmedSession(sessionId!);
                    setVerifying(false);
                    setPayment("Payment confirmed. Your grading application is awaiting dojo review.");
                    setRevision((previous) => previous + 1);
                } else if (++attempts < 30) timer = setTimeout(() => void check(), 2000);
                else {
                    setVerifying(false);
                    setPayment("Payment verification is taking longer than expected. Refresh shortly or contact your dojo; do not pay again.");
                }
            } catch {
                if (active) {
                    setVerifying(false);
                    setPayment("Unable to check payment confirmation. Refresh shortly or contact your dojo; do not pay again.");
                }
            }
        }
        void check();
        return () => { active = false; clearTimeout(timer); };
    }, [sessionId, profile?.id]);

    const handleProceedToPayment = async () => {
        if (!canPay || !selected || submitting.current) return;
        submitting.current = true;
        setProcessing(true);
        setCheckoutError("");
        const owner = profile?.id;
        const checkoutSession = modalSession.current;
        try {
            // Refresh the authoritative records immediately before payment. The
            // reservation RPC and unique constraints also cover concurrent tabs.
            const { data: saved, error: readError } = await supabase.rpc("my_grading_applications");
            if (readError) throw new Error("Unable to check existing applications. Please try again.");
            if (activeUser.current !== owner) return;
            if (((saved ?? []) as Application[]).some((application) => application.grading_date === selectedGradingDate && application.status !== "withdrawn")) {
                setApplications(saved);
                throw new Error("You have already applied for this grading date. Do not pay again.");
            }
            const quote = await getGradingQuote(selected.id, selected.target_grade);
            if (activeUser.current !== owner) return;
            if (!modalOpen.current || modalSession.current !== checkoutSession) {
                setProcessing(false);
                submitting.current = false;
                return;
            }
            if (quote.totalCents !== selected.total_amount) {
                setRevision((previous) => previous + 1);
                throw new Error("The fee has changed. Review the refreshed total before paying.");
            }
            const checkoutUrl = await getGradingCheckoutUrl(quote, selectedGradingDate);
            if (activeUser.current === owner) {
                if (modalOpen.current && modalSession.current === checkoutSession) window.location.assign(checkoutUrl);
                else {
                    setProcessing(false);
                    submitting.current = false;
                }
            }
        } catch (failure) {
            if (activeUser.current === owner) {
                if (modalOpen.current && modalSession.current === checkoutSession) setCheckoutError(failure instanceof Error ? failure.message : "Unable to open Stripe checkout. Please try again.");
                setProcessing(false);
                submitting.current = false;
            }
        }
    };

    const fields = [
        { key: "phone", label: "Your phone number", type: "tel", maxLength: 30, required: false },
        { key: "emergency_name", label: "Emergency contact name", type: "text", maxLength: 100, required: true },
        { key: "emergency_relationship", label: "Relationship", type: "text", maxLength: 50, required: true },
        { key: "emergency_phone", label: "Emergency contact phone", type: "tel", maxLength: 30, required: true },
    ] as const;

    function handleApplyModalChange(open: boolean) {
        modalOpen.current = open;
        if (!open) modalSession.current += 1;
        setIsApplyModalOpen(open);
        if (open) {
            setProfileLoading(true);
            setProfileError("");
            setCheckoutError("");
        }
    }

    function orderDetails() {
        return <>
            <dl className="space-y-3 border-b pb-5 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Applicant</dt><dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{studentName || "—"}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Current grade</dt><dd id="current-grade">{progression ? <DatabaseGradeBadge grade={gradeFromId(progression.current.id)} /> : "—"}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Target grade</dt><dd id="target-grade">{progression?.target ? <DatabaseGradeBadge grade={gradeFromId(progression.target.id)} /> : "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Grading date</dt><dd className="max-w-44 text-right font-medium">{selectedGradingDate || existing?.grading_date ? gradingDate(selectedGradingDate || existing!.grading_date!) : "Not selected"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Base fee</dt><dd id="base-fee" className="font-medium tabular-nums">{baseCents != null ? money.format(baseCents / 100) : "—"}</dd></div>
                {lateCents > 0 && <div className="flex justify-between gap-3 rounded-md bg-warning/15 px-2 py-1.5 text-warning-foreground dark:text-warning"><dt className="flex items-center gap-1"><Info aria-hidden="true" className="size-3.5" />Late submission</dt><dd className="font-medium tabular-nums">+{money.format(lateCents / 100)}</dd></div>}
            </dl>
            <div className="mt-5 flex items-end justify-between gap-3"><span className="font-semibold">{paid ? "Amount paid" : "Total due"}</span><span className="text-3xl font-semibold tabular-nums">{totalCents != null ? money.format(totalCents / 100) : "—"}</span></div>
        </>;
    }

    return (
        <Dialog open={isApplyModalOpen} onOpenChange={handleApplyModalChange}>
        <section className="mx-auto w-full max-w-3xl space-y-6" aria-busy={loading}>
            <PageHeader title="Grading application" actions={
                <Button variant="outline" nativeButton={false} render={<Link to="/grading/requirements" />}>
                    View more grading information
                </Button>
            } />
            {error && <RetryAlert message={error} onRetry={() => setRevision((value) => value + 1)} />}
            {payment && <Alert role="status"><AlertDescription>{payment}</AlertDescription></Alert>}
            {previewReturn && <Alert role="status"><AlertDescription>
                This was a test payment preview, not an official grading application. Contact your dojo to check the saved preview before paying again.
            </AlertDescription></Alert>}
            {["cancel", "test-cancel"].includes(params.get("checkout") ?? "") && (
                <Alert role="status"><AlertDescription>Checkout was cancelled. No application has been submitted by this checkout. Review your details before trying again.</AlertDescription></Alert>
            )}
            {loading && <p role="status" className="text-sm text-muted-foreground">Loading your grading opportunities…</p>}
            <div className="space-y-6">
                {!loading && !error && <ReadinessCard readiness={readiness} targetId={targetBelt} track={progression?.track} />}
                {!loading && !error && (!existing || selectedGradingDate) && !paymentLocked && !previewReturn && progression?.target && (
                    <div className="flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1 sm:min-w-0">
                            <h2 className="font-medium">Ready for your next grading?</h2>
                            <p className="text-sm text-muted-foreground">Review your membership details and choose an official date in the application.</p>
                        </div>
                        <DialogTrigger render={<Button id="apply-grading-trigger" size="lg" className="w-full sm:w-auto" />}>Apply for Grading</DialogTrigger>
                    </div>
                )}
                {!loading && !error && existing && (
                    <Card aria-labelledby="grading-application-status">
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 id="grading-application-status" className="text-base font-medium">Your grading application</h2>
                                <StatusBadge tone={paid || confirmedSession ? "success" : "neutral"}>{paid || confirmedSession ? "Payment confirmed" : "Application submitted"}</StatusBadge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <dl className="space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Grading date</dt><dd className="max-w-56 text-right font-medium">{existing.grading_date ? gradingDate(existing.grading_date) : "—"}</dd></div>
                                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Target grade</dt><dd id="application-target-grade">{progression?.target ? <DatabaseGradeBadge grade={gradeFromId(progression.target.id)} /> : "—"}</dd></div>
                                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{paid ? "Amount paid" : "Total due"}</dt><dd className="font-medium tabular-nums">{totalCents != null ? money.format(totalCents / 100) : "—"}</dd></div>
                            </dl>
                            <p className="text-sm text-muted-foreground">{paid ? "Awaiting dojo review. Your payment is confirmed — do not pay again." : "Your application is awaiting dojo review."}</p>
                            <Button disabled className="w-full sm:w-auto">{paid ? "Payment confirmed" : "Application submitted"}</Button>
                        </CardContent>
                    </Card>
                )}
            </div>
            <DialogPortal>
                <DialogPrimitive.Backdrop data-slot="grading-application-overlay" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <DialogPrimitive.Popup
                    id="grading-application-modal"
                    aria-modal="true"
                    initialFocus={formHeading}
                    className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-background text-foreground shadow-2xl ring-1 ring-border outline-none supports-[height:100dvh]:max-h-[90dvh]"
                >
                    <div className="relative shrink-0 border-b px-5 py-5 pr-16 sm:px-6 sm:pr-16">
                        <DialogTitle ref={formHeading} tabIndex={-1} className="text-lg leading-snug font-semibold outline-none">Your application details</DialogTitle>
                        <DialogDescription id="membership-profile-source" className="mt-1.5">Retrieved from your Membership Profile</DialogDescription>
                        <DialogClose render={<Button type="button" variant="ghost" size="icon-touch" className="absolute top-3 right-3" aria-label="Close grading application" />}>
                            <X className="size-5" aria-hidden="true" />
                        </DialogClose>
                    </div>
                    <div id="grading-application-form" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6" aria-busy={profileLoading}>
                        {error && <div className="mb-5"><RetryAlert message={error} onRetry={() => setRevision(value => value + 1)} /></div>}
                        {checkoutError && <Alert variant="destructive" role="alert" className="mb-5"><AlertDescription>{checkoutError}</AlertDescription></Alert>}
                        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
                            <div className="min-w-0 space-y-6">
                                {profileLoading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Retrieving your membership details…</p>}
                                {profileError && <RetryAlert message={profileError} onRetry={() => setProfileRevision(value => value + 1)} />}
                                {membership && !profileLoading && <div className="space-y-5" aria-describedby="membership-profile-source">
                                    <div className="space-y-1.5">
                                        <h3 className="text-sm font-medium">Membership details</h3>
                                        <p className="text-sm text-muted-foreground">These details are read-only. Contact your dojo if anything needs correcting.</p>
                                    </div>
                                    {!profileComplete && <Alert role="status"><AlertDescription>Your saved membership record is missing contact details. Please contact your dojo to check your submitted Membership application before paying.</AlertDescription></Alert>}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="grading-full-name">Full name</Label>
                                        <Input id="grading-full-name" value={membership.full_name} readOnly className="min-h-11 bg-muted" placeholder="Not recorded in your membership" />
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {fields.map(field => <div key={field.key} className="min-w-0 space-y-1.5">
                                            <Label htmlFor={`grading-${field.key}`}>{field.label}</Label>
                                            <Input id={`grading-${field.key}`} type={field.type} value={membership[field.key]} readOnly maxLength={field.maxLength} className="min-h-11 bg-muted" placeholder="Not recorded in your membership" />
                                        </div>)}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="grading-medical">Medical details</Label>
                                        <Textarea id="grading-medical" value={membership.medical_details || membership.recorded_medical_details.join("\n")} readOnly rows={4} className="bg-muted" placeholder="No medical details recorded" />
                                    </div>
                                </div>}
                                <div className="space-y-2 border-t pt-5">
                                    <Label htmlFor="official-grading-date">Official grading date *</Label>
                                    <NativeSelect id="official-grading-date" required value={selectedGradingDate} disabled={processing || paymentLocked || loading} className="h-11" aria-describedby="official-grading-date-note"
                                        onChange={event => { setSelectedGradingDate(event.target.value); setCheckoutError(""); }}>
                                        <option value="">Select an official grading date</option>
                                        {dates.map(date => <option key={date.id} value={date.grading_date}>{officialDateLabel(date.grading_date)}{applications.some(application => application.grading_event_id === date.id && application.status !== "withdrawn") ? " — Application submitted" : ""}</option>)}
                                    </NativeSelect>
                                    <p id="official-grading-date-note" className="text-xs text-muted-foreground">
                                        {dates.length ? "Official ASK dates for your age group. Payment is available only while applications are open and your requirements are met." : "No upcoming official grading dates are currently published for your age group. Please check with your dojo."}
                                        {" "}<a className="text-primary underline underline-offset-4" href="https://aikidoshinjukai.com.sg/grading-information/" target="_blank" rel="noreferrer">View official schedule</a>
                                    </p>
                                    {selected && <p className="text-sm text-muted-foreground">{selected.centre_name} · Applications close {gradingDate(selected.application_deadline)} (Singapore time)</p>}
                                </div>
                            </div>
                            <aside className="min-w-0 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6" aria-labelledby="modal-order-summary">
                                <h3 id="modal-order-summary" className="mb-4 text-base font-medium">Order summary</h3>
                                {orderDetails()}
                            </aside>
                        </div>
                    </div>
                    <div className="shrink-0 space-y-3 border-t bg-background px-5 py-4 sm:px-6">
                        {blockedReason && <p id="payment-blocked-reason" role="status" className="text-sm text-muted-foreground">{blockedReason}</p>}
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <DialogClose render={<Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" />}>Cancel</DialogClose>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />Secure checkout with Stripe</p>
                                <Button size="lg" onClick={() => void handleProceedToPayment()} disabled={!canPay} aria-describedby={blockedReason ? "payment-blocked-reason" : undefined} className="w-full sm:w-auto sm:min-w-48">
                                    {paid || confirmedSession ? "Payment confirmed" : existing ? "Application submitted" : verifying ? "Verifying payment" : processing ? <><Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Redirecting to Stripe…</> : "Proceed to Payment"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogPrimitive.Popup>
            </DialogPortal>
        </section>
        </Dialog>
    );
}

function ReadinessCard({ readiness, targetId, track }: { readiness: Readiness[]; targetId: string; track?: GradingTrack }) {
    const [open, setOpen] = useState(false);
    const met = readiness.filter((requirement) => requirement.met).length;
    const eligible = readiness.length > 0 && met === readiness.length;
    return (
        <Card aria-labelledby="your-eligibility">
            <CardHeader>
                <h2 id="your-eligibility" className="flex flex-wrap items-center gap-2 text-base font-medium">Eligibility{targetId && <> for <DatabaseGradeBadge grade={gradeFromId(targetId)} /></>}{track && <span className="font-normal text-muted-foreground">({gradingTrackLabel(track)})</span>}</h2>
                <p className="text-xs text-muted-foreground">Age group follows the age reached this calendar year. Training requirements and fees use the applicable grading track.</p>
            </CardHeader>
            <CardContent className="space-y-3">
                {!readiness.length ? <p className="text-sm text-muted-foreground">{targetId ? "Your dojo has not recorded the eligibility requirements for your next grade yet." : "No next grading level is available for your account. Contact your dojo if this looks incorrect."}</p> : <>
                    <p className={cn("text-sm tabular-nums", eligible ? "font-medium text-success" : "text-muted-foreground")}>{eligible ? `All ${readiness.length} requirements met` : `${met} of ${readiness.length} requirements met`}</p>
                    <progress aria-label="Grading eligibility requirements met" value={met} max={readiness.length} className={cn("block h-2 w-full overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full", eligible ? "[&::-moz-progress-bar]:bg-success [&::-webkit-progress-value]:bg-success" : "[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary")} />
                    <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls="eligibility-requirements" onClick={() => setOpen((value) => !value)} className="-ml-2 min-h-11 gap-1 text-primary lg:min-h-9">{open ? "See less" : "See more"}<ChevronDown aria-hidden="true" className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} /></Button>
                    {open && <div id="eligibility-requirements"><EligibilityChecklist requirements={readiness} compact /></div>}
                </>}
            </CardContent>
        </Card>
    );
}
