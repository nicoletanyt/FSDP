import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useStudentQuery } from "@/hooks/use-student-query";
import {
    studentQueryKeys as keys,
    studentQueryTimes as times,
} from "@/lib/student/query-keys";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Check, ChevronDown, ChevronUp, UploadCloud } from "lucide-react";
import { NativeSelect } from "@/components/admin/form-controls";
import FilterCombobox from "@/components/shared/filters/FilterCombobox";
import { DatabaseGradeBadge } from "@/components/shared/grade/GradeBadge";
import PageHeader from "@/components/shared/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, money } from "@/lib/format";
import { createMembershipCheckout } from "@/lib/stripe";
import {
    saveStudentPhoto,
    studentPhotoError,
    uploadStudentPhoto,
} from "@/lib/student-photo";
import { supabase } from "@/lib/supabase";
import {
    DATE_OF_BIRTH_STORAGE_KEY,
    MEMBERSHIP_TYPES,
    MEMBERSHIP_TYPE_STORAGE_KEY,
    calculateAge,
    membershipLabel,
} from "@/lib/membership";
import { cn } from "@/lib/utils";
import { randomUUID } from "@/lib/uuid";

const STEPS = [
    { id: 1, title: "Personal information" },
    { id: 2, title: "Training information" },
    { id: 3, title: "Emergency and medical" },
    { id: 4, title: "Review and submit" },
];

// Shown for information only; the amount charged is set on the server.
const MEMBERSHIP_FEE = 60;

const NATIONALITIES = [
    { value: "singaporean", label: "Singaporean" },
    { value: "pr", label: "Singapore PR" },
    { value: "foreigner", label: "Foreigner" },
];
const GENDERS = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
];
const EMERGENCY_RELATIONSHIPS = [
    { value: "parent", label: "Parent" },
    { value: "spouse", label: "Spouse" },
    { value: "sibling", label: "Sibling" },
    { value: "friend", label: "Friend" },
];
const GUARDIAN_RELATIONSHIPS = [
    { value: "parent", label: "Parent" },
    { value: "guardian", label: "Legal guardian" },
    { value: "sibling", label: "Sibling" },
    { value: "other", label: "Other" },
];
const labelOf = (options: { value: string; label: string }[], value: string) =>
    options.find((option) => option.value === value)?.label ?? "";

// Same range the database accepts: not in the future, at most 120 years ago.
function localDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const today = new Date();
const MAX_DOB = localDate(today);
const MIN_DOB = localDate(
    new Date(today.getFullYear() - 120, today.getMonth(), today.getDate()),
);
const validDob = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= MIN_DOB && value <= MAX_DOB;

const PARQ_QUESTIONS = [
    {
        key: "heart",
        label:
            "Has a doctor ever said you have a heart condition and should only do physical activity recommended by a doctor?",
    },
    {
        key: "dizziness",
        label:
            "Do you lose your balance because of dizziness, or do you ever lose consciousness?",
    },
    {
        key: "joint",
        label:
            "Do you have a bone or joint problem that could be made worse by a change in your physical activity?",
    },
];

// Singapore NRIC/FIN: S/T (citizens and PRs, born before/from 2000), F/G/M (FIN), 7 digits, a letter.
// Same loose check the database applies: something@something.something, no spaces.
const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidNric = (nric: string) => /^[STFGM]\d{7}[A-Z]$/.test(nric);
// Uppercase and drop spaces or dashes from pasted values, e.g. "t 0123456 j".
const formatNric = (value: string) =>
    value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 9);
const NRIC_FORMAT_ERROR =
    "Use S, T, F, G or M, then 7 digits and a letter, for example T0123456J.";
const formatPhone = (value: string) => value.replace(/\D/g, "").slice(0, 8);

type Errors = Record<string, string>;
const fieldId = (key: string) => `apply-${key}`;

/** A labelled control with its hint and inline error. */
/** Red asterisk for required fields; screen readers get "required" from the control itself. */
function RequiredMark() {
    return (
        <span aria-hidden="true" className="text-destructive">
            *
        </span>
    );
}

function FormField({
    name,
    label,
    optional,
    error,
    hint,
    className,
    children,
}: {
    name: string;
    label: string;
    optional?: boolean;
    error?: string;
    hint?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn("space-y-1.5", className)}>
            <Label htmlFor={fieldId(name)}>
                {label}
                {optional ? (
                    <span className="font-normal text-muted-foreground">(optional)</span>
                ) : (
                    <RequiredMark />
                )}
            </Label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            {error && (
                <p id={`${fieldId(name)}-error`} className="text-sm text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}

const selectClass =
    "h-11 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 lg:h-10";
const inputClass = "lg:h-10";
const groupClass = "space-y-4 rounded-lg border p-4";

function PhoneInput(props: React.ComponentProps<typeof Input>) {
    return (
        <div className="flex gap-2">
            <span
                aria-hidden="true"
                className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground lg:h-10"
            >
                +65
            </span>
            <Input
                type="tel"
                inputMode="numeric"
                maxLength={8}
                placeholder="8-digit number"
                {...props}
                className={cn("flex-1", inputClass)}
            />
        </div>
    );
}

function ReviewItem({ term, children }: { term: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{term}</dt>
            <dd className="[overflow-wrap:anywhere]">{children || "—"}</dd>
        </div>
    );
}

export default function ApplyMembership() {
    const [searchParams] = useSearchParams();
    const cancelled = searchParams.get("checkout") === "cancel";
    const [currentStep, setCurrentStep] = useState(1);
    const [showGuardian, setShowGuardian] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [errors, setErrors] = useState<Errors>({});
    const [isDeclared, setIsDeclared] = useState(false);
    const [waiverSigned, setWaiverSigned] = useState(false);
    const queryClient = useQueryClient();
    const dojoQuery = useStudentQuery(
        keys.centres,
        async (_userId, signal) => {
            const { data, error } = await supabase
                .from("centres")
                .select("id, name")
                .eq("status", "active")
                .order("name")
                .abortSignal(signal);
            if (error) throw error;
            return data ?? [];
        },
        times.reference,
    );
    const gradeQuery = useStudentQuery(
        keys.grades,
        async (_userId, signal) => {
            const { data, error } = await supabase
                .from("grades")
                .select("id, label, colour, sort_order")
                .order("sort_order")
                .abortSignal(signal);
            if (error) throw error;
            return data ?? [];
        },
        times.reference,
    );
    // "Unranked" is what someone who hasn't trained gets, so it isn't offered here.
    const grades = (gradeQuery.data ?? []).filter(
        (grade) => grade.id !== "unranked",
    );
    const gradesLoading =
        gradeQuery.data === undefined &&
        (gradeQuery.isPending || gradeQuery.isFetching);
    const gradesError =
        gradeQuery.data === undefined && !gradesLoading && gradeQuery.isError
            ? "Unable to load belts. Please try again."
            : "";
    const dojos = dojoQuery.data ?? [];
    const dojosLoading =
        dojoQuery.data === undefined &&
        (dojoQuery.isPending || dojoQuery.isFetching);
    const dojosError =
        dojoQuery.data === undefined && !dojosLoading && dojoQuery.isError
            ? "Unable to load dojos. Please try again."
            : "";
    // Same key for retries of an unchanged submission; Stripe then returns the same session.
    const retryKey = useRef(randomUUID());
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState("");
    // Reuse an upload when the student retries with the same photo.
    const uploadedPhoto = useRef<{ file: File; path: string } | null>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    // After a failed check, focus moves to the first invalid field; after a step change, to the step heading.
    const focusField = useRef<string | null>(null);
    const shownStep = useRef(1);

    // Name and email start from the sign-up details; the student can still edit them.
    const { profile } = useAuth();
    const [formData, setFormData] = useState(() => ({
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        nric: "",
        nationality: "",
        dob: "",
        gender: "",
        email: profile?.email ?? "",
        mobile: "",
        address: "",
        photoName: "",
        principalDojo: "",
        membershipType: "",
        hasExperience: "",
        currentBelt: "",
        experienceDetails: "",
        emergencyName: "",
        emergencyRelationship: "",
        emergencyPhone: "",
        medicalDetails: "",
        guardianName: "",
        guardianNric: "",
        guardianRelationship: "",
        guardianPhone: "",
    }));

    const [parqAnswers, setParqAnswers] = useState<Record<string, boolean>>({
        heart: false,
        dizziness: false,
        joint: false,
    });

    // If the profile arrives after the form opens, fill only fields still empty,
    // and only once, so nothing the student has typed or cleared is overwritten.
    const prefilled = useRef(Boolean(profile));
    useEffect(() => {
        if (!profile || prefilled.current) return;
        prefilled.current = true;
        setFormData((previous) => ({
            ...previous,
            firstName: previous.firstName || profile.first_name || "",
            lastName: previous.lastName || profile.last_name || "",
            email: previous.email || profile.email || "",
        }));
    }, [profile]);

    useEffect(() => {
        if (!photoFile) {
            setPhotoPreview("");
            return;
        }
        const url = URL.createObjectURL(photoFile);
        setPhotoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [photoFile]);

    useEffect(() => {
        if (focusField.current) {
            document.getElementById(fieldId(focusField.current))?.focus();
            focusField.current = null;
        } else if (shownStep.current !== currentStep) {
            headingRef.current?.focus();
        }
        shownStep.current = currentStep;
    }, [currentStep, errors]);

    const centreName = dojos.find((d) => d.id === formData.principalDojo)?.name;

    const age = calculateAge(formData.dob);
    const isMinor = age !== null && age < 18;

    useEffect(() => {
        if (isMinor) setShowGuardian(true);
    }, [isMinor]);

    function clearError(key: string) {
        setErrors((previous) => {
            if (!previous[key]) return previous;
            const next = { ...previous };
            delete next[key];
            return next;
        });
    }

    function setField(key: keyof typeof formData, value: string) {
        setFormData((previous) => ({ ...previous, [key]: value }));
        clearError(key);
    }

    /** Accessibility attributes that tie a control to its label and inline error. */
    function control(key: string, required = true) {
        return {
            id: fieldId(key),
            "aria-required": required || undefined,
            "aria-invalid": errors[key] ? true : undefined,
            "aria-describedby": errors[key] ? `${fieldId(key)}-error` : undefined,
        };
    }

    /** Problems in one step, keyed by field, in the order the fields appear. */
    function stepErrors(step: number): Errors {
        const found: Errors = {};
        if (step === 1) {
            if (!formData.firstName.trim())
                found.firstName = "Enter your first name.";
            if (!formData.lastName.trim()) found.lastName = "Enter your last name.";
            if (!formData.email.trim()) found.email = "Enter your email address.";
            else if (!isValidEmail(formData.email.trim()))
                found.email = "Enter an email address like name@example.com.";
            if (!formData.nric) found.nric = "Enter your NRIC or FIN.";
            else if (!isValidNric(formData.nric)) found.nric = NRIC_FORMAT_ERROR;
            if (!formData.nationality) found.nationality = "Select your nationality.";
            if (!formData.dob) found.dob = "Enter your date of birth.";
            else if (!validDob(formData.dob))
                found.dob = "Enter a valid date of birth. It can’t be in the future.";
            if (!formData.gender) found.gender = "Select your gender.";
            if (!formData.mobile) found.mobile = "Enter your mobile number.";
            else if (formData.mobile.length !== 8)
                found.mobile = "Mobile number must be exactly 8 digits.";
            if (!formData.address) found.address = "Enter your residential address.";
            if (!formData.photoName)
                found.photo = "Upload a profile photo to continue.";
        }
        if (step === 2) {
            if (!formData.principalDojo)
                found.principalDojo = "Select your principal dojo.";
            if (!formData.membershipType)
                found.membershipType = "Select a membership type.";
            if (!formData.hasExperience)
                found.hasExperience =
                    "Tell us whether you have trained in aikido before.";
            else if (formData.hasExperience === "yes" && !formData.currentBelt)
                found.currentBelt = "Select your current belt.";
        }
        if (step === 3) {
            if (!formData.emergencyName)
                found.emergencyName = "Enter your emergency contact’s name.";
            if (!formData.emergencyRelationship)
                found.emergencyRelationship = "Select their relationship to you.";
            if (!formData.emergencyPhone)
                found.emergencyPhone = "Enter their contact number.";
            else if (formData.emergencyPhone.length !== 8)
                found.emergencyPhone = "Contact number must be exactly 8 digits.";
            if (!waiverSigned)
                found.waiver =
                    "You must sign the Deed of Waiver & Indemnity to proceed.";
            if (isMinor && !formData.guardianName)
                found.guardianName = "Members under 18 must provide a guardian’s name.";
            if (isMinor && !formData.guardianNric)
                found.guardianNric =
                    "Members under 18 must provide a guardian’s NRIC or FIN.";
            else if (formData.guardianNric && !isValidNric(formData.guardianNric))
                found.guardianNric = NRIC_FORMAT_ERROR;
            if (isMinor && !formData.guardianRelationship)
                found.guardianRelationship =
                    "Select the guardian’s relationship to the member.";
            if (isMinor && !formData.guardianPhone)
                found.guardianPhone =
                    "Members under 18 must provide a guardian’s contact number.";
            else if (formData.guardianPhone && formData.guardianPhone.length !== 8)
                found.guardianPhone = "Contact number must be exactly 8 digits.";
        }
        if (step === 4) {
            if (!isDeclared)
                found.declaration =
                    "You must agree to the declaration before submitting.";
        }
        return found;
    }

    /** Show a step's problems and move focus to the first one. Returns false if there are any. */
    function passes(step: number) {
        const found = stepErrors(step);
        const first = Object.keys(found)[0];
        setErrorMsg("");
        setErrors(found);
        if (!first) return true;
        if (first.startsWith("guardian")) setShowGuardian(true);
        focusField.current = first;
        setCurrentStep(step);
        return false;
    }

    const handleNext = async () => {
        if (isSubmitting) return;
        if (!passes(currentStep)) return;

        if (currentStep < 4) {
            setCurrentStep(currentStep + 1);
        } else {
            for (let step = 1; step <= 3; step++) {
                if (!passes(step)) return;
            }
            const firstName = formData.firstName.trim();
            const lastName = formData.lastName.trim();
            const trained = formData.hasExperience === "yes";
            setIsSubmitting(true);
            // The Credits page picks class passes from these. Save them before leaving
            // for Stripe; blocked storage (e.g. private browsing) must not stop checkout.
            try {
                localStorage.setItem(DATE_OF_BIRTH_STORAGE_KEY, formData.dob);
                localStorage.setItem(
                    MEMBERSHIP_TYPE_STORAGE_KEY,
                    formData.membershipType,
                );
            } catch {
                // The Credits page falls back to the date of birth or adult passes.
            }
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user)
                    throw new Error("Please sign in again to submit your application.");
                // Upload the photo first: if that fails, nothing has been submitted or charged.
                let photoPath =
                    uploadedPhoto.current?.file === photoFile
                        ? uploadedPhoto.current.path
                        : null;
                if (photoFile && !photoPath) {
                    photoPath = await uploadStudentPhoto(photoFile, user.id);
                    uploadedPhoto.current = { file: photoFile, path: photoPath };
                }

                // 1. Save the full application as a pending membership (safe to repeat on retry).
                // One authenticated transaction writes students, private application
                // details and contacts. Ownership, member ID and grade are server-owned.
                const { data, error } = await supabase.rpc(
                    "submit_my_membership_application",
                    {
                        application: {
                            ...formData,
                            firstName,
                            lastName,
                            email: formData.email.trim(),
                            // Kept for older database versions that still read one name field.
                            fullName: `${firstName} ${lastName}`,
                            // Someone who hasn't trained starts unranked; the follow-up answers only apply after a yes.
                            currentBelt: trained ? formData.currentBelt : "unranked",
                            experienceDetails: trained ? formData.experienceDetails : "",
                            parqAnswers,
                            waiverSigned,
                            isDeclared,
                        },
                    },
                );
                if (error) throw error;
                if (!data?.membershipId || !data?.startDate)
                    throw new Error("The server did not return a membership record.");
                // A students row now exists, so cached membership/profile reads are out of date.
                for (const key of [
                    keys.membership(user.id),
                    keys.profileAll(user.id),
                    keys.dashboard(user.id),
                ]) {
                    void queryClient.invalidateQueries({ queryKey: key });
                }

                // The application now has a student record, so the photo can become their
                // profile photo. Best-effort: a failure here must never block the payment.
                if (photoPath) {
                    try {
                        await saveStudentPhoto(user.id, photoPath);
                    } catch (photoError) {
                        console.warn("Could not attach the profile photo:", photoError);
                    }
                }

                // 2. Pay. The membership activates, and the welcome email is sent, only after Stripe's verified webhook.
                const checkoutUrl = await createMembershipCheckout(
                    {
                        first_name: firstName,
                        last_name: lastName,
                        phone: formData.mobile.trim(), // same plain number the application saved
                        date_of_birth: formData.dob,
                        home_centre_id: formData.principalDojo,
                        emergency_contact: {
                            name: formData.emergencyName.trim(),
                            relationship: formData.emergencyRelationship,
                            phone: formData.emergencyPhone.trim(),
                        },
                        medical_details: formData.medicalDetails.trim(),
                    },
                    retryKey.current,
                );
                // The browser is now leaving for Stripe Checkout, so stay in the submitting state.
                window.location.assign(checkoutUrl);
                return;
            } catch (error) {
                const failure = error as { code?: string; message?: string };
                setErrorMsg(
                    failure?.code === "PGRST202"
                        ? "Membership setup is missing. Please apply the membership_application_submit database migration."
                        : failure?.message || "Unable to start checkout. Please try again.",
                );
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const handleBack = () => {
        setErrorMsg("");
        setErrors({});
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const problem = studentPhotoError(file);
        if (problem) {
            setErrors((previous) => ({ ...previous, photo: problem }));
            setPhotoFile(null);
            setFormData((previous) => ({ ...previous, photoName: "" }));
            e.target.value = "";
            return;
        }
        clearError("photo");
        setPhotoFile(file);
        setFormData((previous) => ({ ...previous, photoName: file.name }));
    };

    const errorCount = Object.keys(errors).length;
    const step = STEPS[currentStep - 1];

    return (
        <section className="w-full max-w-3xl space-y-6">
            <PageHeader title="Apply for membership" />

            <Card>
                <CardContent className="space-y-6">
                    {/* Progress */}
                    <div className="space-y-3">
                        <ol
                            aria-label="Application steps"
                            className="flex items-center gap-2"
                        >
                            {STEPS.map((item) => (
                                <li
                                    key={item.id}
                                    aria-current={currentStep === item.id ? "step" : undefined}
                                    className="flex flex-1 items-center gap-2 last:flex-none"
                                >
                                    <span
                                        className={cn(
                                            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                            currentStep >= item.id
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground",
                                        )}
                                    >
                                        {currentStep > item.id ? (
                                            <Check className="size-4" aria-hidden="true" />
                                        ) : (
                                            item.id
                                        )}
                                        <span className="sr-only">
                                            {item.title}
                                            {currentStep > item.id ? ", completed" : ""}
                                        </span>
                                    </span>
                                    {item.id < STEPS.length && (
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                "h-0.5 flex-1 rounded-full",
                                                currentStep > item.id ? "bg-primary" : "bg-border",
                                            )}
                                        />
                                    )}
                                </li>
                            ))}
                        </ol>
                        <p className="text-sm text-muted-foreground">
                            Step {currentStep} of {STEPS.length}
                        </p>
                    </div>

                    {cancelled && (
                        <Alert role="status">
                            <AlertDescription>
                                Payment was cancelled, so your membership isn’t active yet.
                                Submit the form again whenever you’re ready to pay.
                            </AlertDescription>
                        </Alert>
                    )}

                    {errorMsg && (
                        <Alert variant="destructive">
                            <AlertDescription>{errorMsg}</AlertDescription>
                        </Alert>
                    )}

                    {errorCount > 0 && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {errorCount === 1
                                    ? "Check the highlighted field below."
                                    : `Check the ${errorCount} highlighted fields below.`}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-1">
                        <h2
                            ref={headingRef}
                            tabIndex={-1}
                            className="text-lg font-semibold outline-none"
                        >
                            {step.title}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {currentStep === 1
                                ? "Your personal details for your membership profile."
                                : currentStep === 2
                                    ? "Where and how you will train."
                                    : currentStep === 3
                                        ? "Who to contact in an emergency, and anything we should know about your health."
                                        : "Check your details before paying."}
                        </p>
                    </div>

                    {/* Step 1 */}
                    {currentStep === 1 && (
                        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                            <FormField
                                name="firstName"
                                label="First name"
                                error={errors.firstName}
                            >
                                <Input
                                    {...control("firstName")}
                                    autoComplete="given-name"
                                    maxLength={50}
                                    className={inputClass}
                                    value={formData.firstName}
                                    onChange={(e) => setField("firstName", e.target.value)}
                                />
                            </FormField>
                            <FormField
                                name="lastName"
                                label="Last name"
                                error={errors.lastName}
                            >
                                <Input
                                    {...control("lastName")}
                                    autoComplete="family-name"
                                    maxLength={50}
                                    className={inputClass}
                                    value={formData.lastName}
                                    onChange={(e) => setField("lastName", e.target.value)}
                                />
                            </FormField>
                            <FormField name="nric" label="NRIC / FIN" error={errors.nric}>
                                <Input
                                    {...control("nric")}
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    className={cn(inputClass, "uppercase")}
                                    value={formData.nric}
                                    onChange={(e) => setField("nric", formatNric(e.target.value))}
                                />
                            </FormField>
                            <FormField
                                name="nationality"
                                label="Nationality"
                                error={errors.nationality}
                            >
                                <NativeSelect
                                    {...control("nationality")}
                                    className={selectClass}
                                    value={formData.nationality}
                                    onChange={(e) => setField("nationality", e.target.value)}
                                >
                                    <option value="" disabled>
                                        Select nationality
                                    </option>
                                    {NATIONALITIES.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </NativeSelect>
                            </FormField>
                            <FormField name="dob" label="Date of birth" error={errors.dob}>
                                <Input
                                    {...control("dob")}
                                    type="date"
                                    min={MIN_DOB}
                                    max={MAX_DOB}
                                    autoComplete="bday"
                                    className={inputClass}
                                    value={formData.dob}
                                    onChange={(e) => setField("dob", e.target.value)}
                                />
                            </FormField>
                            <FormField name="gender" label="Gender" error={errors.gender}>
                                <NativeSelect
                                    {...control("gender")}
                                    className={selectClass}
                                    value={formData.gender}
                                    onChange={(e) => setField("gender", e.target.value)}
                                >
                                    <option value="" disabled>
                                        Select gender
                                    </option>
                                    {GENDERS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </NativeSelect>
                            </FormField>
                            <FormField
                                name="email"
                                label="Email address"
                                error={errors.email}
                            >
                                <Input
                                    {...control("email")}
                                    type="email"
                                    autoComplete="email"
                                    maxLength={254}
                                    className={inputClass}
                                    value={formData.email}
                                    onChange={(e) => setField("email", e.target.value)}
                                />
                            </FormField>
                            <FormField
                                name="mobile"
                                label="Mobile number"
                                error={errors.mobile}
                            >
                                <PhoneInput
                                    {...control("mobile")}
                                    autoComplete="tel-national"
                                    value={formData.mobile}
                                    onChange={(e) =>
                                        setField("mobile", formatPhone(e.target.value))
                                    }
                                />
                            </FormField>
                            <FormField
                                name="address"
                                label="Residential address"
                                error={errors.address}
                                className="sm:col-span-2"
                            >
                                <Textarea
                                    {...control("address")}
                                    rows={3}
                                    autoComplete="street-address"
                                    value={formData.address}
                                    onChange={(e) => setField("address", e.target.value)}
                                />
                            </FormField>
                            <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor={fieldId("photo")}>
                                    Profile photo <RequiredMark />
                                </Label>
                                <label
                                    htmlFor={fieldId("photo")}
                                    className={cn(
                                        "flex min-h-28 cursor-pointer items-center justify-center gap-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                                        errors.photo && "border-destructive",
                                    )}
                                >
                                    {photoPreview ? (
                                        <img
                                            src={photoPreview}
                                            alt=""
                                            className="size-16 shrink-0 rounded-lg object-cover"
                                        />
                                    ) : (
                                        <UploadCloud
                                            className="size-8 shrink-0"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span className="min-w-0 [overflow-wrap:anywhere]">
                                        <span className="font-medium text-primary">
                                            {formData.photoName ? "Change photo" : "Choose a photo"}
                                        </span>
                                        <span className="block">
                                            {formData.photoName
                                                ? `Selected: ${formData.photoName}`
                                                : "JPEG, PNG or WebP"}
                                        </span>
                                    </span>
                                    <input
                                        {...control("photo")}
                                        type="file"
                                        className="sr-only"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={handlePhotoUpload}
                                    />
                                </label>
                                {errors.photo && (
                                    <p
                                        id={`${fieldId("photo")}-error`}
                                        className="text-sm text-destructive"
                                    >
                                        {errors.photo}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2 */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <FormField
                                name="principalDojo"
                                label="Principal dojo"
                                error={errors.principalDojo}
                                hint="Your principal dojo training fees must be paid before the start of each term."
                            >
                                <FilterCombobox
                                    id={fieldId("principalDojo")}
                                    options={dojos.map((dojo) => ({
                                        value: dojo.id,
                                        label: dojo.name,
                                    }))}
                                    value={formData.principalDojo}
                                    onChange={(value) => setField("principalDojo", value)}
                                    placeholder={dojosLoading ? "Loading dojos…" : "Select dojo"}
                                    emptyText="No dojos match your search."
                                    disabled={dojosLoading || Boolean(dojosError)}
                                    invalid={Boolean(errors.principalDojo)}
                                    describedBy={
                                        errors.principalDojo
                                            ? `${fieldId("principalDojo")}-error`
                                            : undefined
                                    }
                                    className="h-11 lg:h-10"
                                />
                                {dojosError && (
                                    <p role="alert" className="text-sm text-destructive">
                                        {dojosError}{" "}
                                        <button
                                            type="button"
                                            className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                                            onClick={() => void dojoQuery.refetch()}
                                        >
                                            Try again
                                        </button>
                                    </p>
                                )}
                                {!dojosLoading && !dojosError && dojos.length === 0 && (
                                    <p role="status" className="text-sm text-destructive">
                                        No active dojos are available. Please contact the dojo.
                                    </p>
                                )}
                            </FormField>
                            <FormField
                                name="membershipType"
                                label="Membership type"
                                error={errors.membershipType}
                                hint={
                                    MEMBERSHIP_TYPES.find(
                                        (type) => type.value === formData.membershipType,
                                    )?.description ??
                                    "Your membership type determines which class passes you can purchase and any discounts applied."
                                }
                            >
                                <NativeSelect
                                    {...control("membershipType")}
                                    className={selectClass}
                                    value={formData.membershipType}
                                    onChange={(e) => setField("membershipType", e.target.value)}
                                >
                                    <option value="" disabled>
                                        Select type
                                    </option>
                                    {MEMBERSHIP_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </NativeSelect>
                            </FormField>
                            <fieldset
                                className="space-y-2"
                                aria-required="true"
                                aria-invalid={errors.hasExperience ? true : undefined}
                                aria-describedby={
                                    errors.hasExperience
                                        ? `${fieldId("hasExperience")}-error`
                                        : undefined
                                }
                            >
                                <legend className="text-sm font-medium">
                                    Have you trained in aikido before? <RequiredMark />
                                </legend>
                                <div className="flex items-center gap-6">
                                    {[
                                        { value: "yes", label: "Yes" },
                                        { value: "no", label: "No" },
                                    ].map((option, index) => (
                                        <label
                                            key={option.value}
                                            className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                                        >
                                            <input
                                                // The first option takes the field id, so a failed check can focus it.
                                                id={index === 0 ? fieldId("hasExperience") : undefined}
                                                type="radio"
                                                name="hasExperience"
                                                value={option.value}
                                                checked={formData.hasExperience === option.value}
                                                onChange={(e) =>
                                                    setField("hasExperience", e.target.value)
                                                }
                                                className="size-4 accent-primary"
                                            />
                                            {option.label}
                                        </label>
                                    ))}
                                </div>
                                {errors.hasExperience && (
                                    <p
                                        id={`${fieldId("hasExperience")}-error`}
                                        className="text-sm text-destructive"
                                    >
                                        {errors.hasExperience}
                                    </p>
                                )}
                            </fieldset>
                            {formData.hasExperience === "yes" && (
                                // Follow-up questions for students who have trained before.
                                <div className="space-y-4 border-l-2 border-primary/30 pl-4">
                                    <FormField
                                        name="currentBelt"
                                        label="Current belt"
                                        error={errors.currentBelt}
                                    >
                                        <FilterCombobox
                                            id={fieldId("currentBelt")}
                                            options={grades.map((grade) => ({
                                                value: grade.id,
                                                label: grade.label,
                                            }))}
                                            value={formData.currentBelt}
                                            onChange={(value) => setField("currentBelt", value)}
                                            placeholder={
                                                gradesLoading ? "Loading belts…" : "Select belt"
                                            }
                                            emptyText="No belts match your search."
                                            disabled={gradesLoading || Boolean(gradesError)}
                                            invalid={Boolean(errors.currentBelt)}
                                            describedBy={
                                                errors.currentBelt
                                                    ? `${fieldId("currentBelt")}-error`
                                                    : undefined
                                            }
                                            renderOption={(option) => (
                                                <DatabaseGradeBadge
                                                    grade={
                                                        grades.find((grade) => grade.id === option.value) ??
                                                        null
                                                    }
                                                    showBeltLabel
                                                    className="px-2.5 py-1 text-sm"
                                                />
                                            )}
                                            className="h-11 lg:h-10"
                                        />
                                        {gradesError && (
                                            <p role="alert" className="text-sm text-destructive">
                                                {gradesError}{" "}
                                                <button
                                                    type="button"
                                                    className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                                                    onClick={() => void gradeQuery.refetch()}
                                                >
                                                    Try again
                                                </button>
                                            </p>
                                        )}
                                    </FormField>
                                    <FormField
                                        name="experienceDetails"
                                        label="Details of your experience"
                                        optional
                                    >
                                        <Textarea
                                            id={fieldId("experienceDetails")}
                                            rows={3}
                                            value={formData.experienceDetails}
                                            onChange={(e) =>
                                                setField("experienceDetails", e.target.value)
                                            }
                                        />
                                    </FormField>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3 */}
                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <div className={groupClass}>
                                <h3 className="font-semibold">Emergency contact</h3>
                                <FormField
                                    name="emergencyName"
                                    label="Name"
                                    error={errors.emergencyName}
                                >
                                    <Input
                                        {...control("emergencyName")}
                                        className={inputClass}
                                        value={formData.emergencyName}
                                        onChange={(e) => setField("emergencyName", e.target.value)}
                                    />
                                </FormField>
                                <FormField
                                    name="emergencyRelationship"
                                    label="Relationship"
                                    error={errors.emergencyRelationship}
                                >
                                    <NativeSelect
                                        {...control("emergencyRelationship")}
                                        className={selectClass}
                                        value={formData.emergencyRelationship}
                                        onChange={(e) =>
                                            setField("emergencyRelationship", e.target.value)
                                        }
                                    >
                                        <option value="" disabled>
                                            Select relationship
                                        </option>
                                        {EMERGENCY_RELATIONSHIPS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </NativeSelect>
                                </FormField>
                                <FormField
                                    name="emergencyPhone"
                                    label="Contact number"
                                    error={errors.emergencyPhone}
                                >
                                    <PhoneInput
                                        {...control("emergencyPhone")}
                                        value={formData.emergencyPhone}
                                        onChange={(e) =>
                                            setField("emergencyPhone", formatPhone(e.target.value))
                                        }
                                    />
                                </FormField>
                            </div>

                            <div className={groupClass}>
                                <div>
                                    <h3 className="font-semibold">Medical declaration (PAR-Q)</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Answer to the best of your knowledge.
                                    </p>
                                </div>
                                <div className="divide-y">
                                    {PARQ_QUESTIONS.map((q) => (
                                        <fieldset
                                            key={q.key}
                                            className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
                                        >
                                            <legend className="float-left text-sm sm:flex-1">
                                                {q.label}
                                            </legend>
                                            <div className="flex shrink-0 items-center gap-5">
                                                {[
                                                    { value: true, label: "Yes" },
                                                    { value: false, label: "No" },
                                                ].map((option) => (
                                                    <label
                                                        key={option.label}
                                                        className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={`parq-${q.key}`}
                                                            checked={parqAnswers[q.key] === option.value}
                                                            onChange={() =>
                                                                setParqAnswers((prev) => ({
                                                                    ...prev,
                                                                    [q.key]: option.value,
                                                                }))
                                                            }
                                                            className="size-4 accent-primary"
                                                        />
                                                        {option.label}
                                                    </label>
                                                ))}
                                            </div>
                                        </fieldset>
                                    ))}
                                </div>
                                <FormField
                                    name="medicalDetails"
                                    label="Additional medical details"
                                    optional
                                    hint="For example allergies, asthma or past surgeries."
                                >
                                    <Textarea
                                        id={fieldId("medicalDetails")}
                                        rows={3}
                                        value={formData.medicalDetails}
                                        onChange={(e) => setField("medicalDetails", e.target.value)}
                                    />
                                </FormField>
                            </div>

                            <div
                                className={cn(
                                    "rounded-lg border p-4",
                                    errors.waiver
                                        ? "border-destructive"
                                        : "border-destructive/30 bg-destructive/5",
                                )}
                            >
                                <label className="flex cursor-pointer items-start gap-3 text-sm">
                                    <input
                                        {...control("waiver")}
                                        type="checkbox"
                                        checked={waiverSigned}
                                        onChange={(e) => {
                                            setWaiverSigned(e.target.checked);
                                            clearError("waiver");
                                        }}
                                        className="mt-0.5 size-5 shrink-0 accent-primary"
                                    />
                                    <span className="leading-relaxed">
                                        <span className="block font-semibold">
                                            Deed of Waiver & Indemnity <RequiredMark />
                                        </span>
                                        I have read and agree to the Deed of Waiver & Indemnity. I
                                        understand that no training is allowed without signing this
                                        form.
                                    </span>
                                </label>
                                {errors.waiver && (
                                    <p
                                        id={`${fieldId("waiver")}-error`}
                                        className="mt-2 text-sm text-destructive"
                                    >
                                        {errors.waiver}
                                    </p>
                                )}
                            </div>

                            <div className={groupClass}>
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold">Guardian information</h3>
                                        <p
                                            className={cn(
                                                "mt-1 text-sm",
                                                isMinor
                                                    ? "font-medium text-destructive"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {isMinor
                                                ? "Required because the member is under 18."
                                                : "Required for members under 18."}
                                        </p>
                                    </div>
                                    {!isMinor && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-expanded={showGuardian}
                                            onClick={() => setShowGuardian(!showGuardian)}
                                        >
                                            {showGuardian ? "Hide" : "Add"}
                                            {showGuardian ? (
                                                <ChevronUp aria-hidden="true" />
                                            ) : (
                                                <ChevronDown aria-hidden="true" />
                                            )}
                                        </Button>
                                    )}
                                </div>

                                {showGuardian && (
                                    <>
                                        <FormField
                                            name="guardianName"
                                            label="Guardian name"
                                            optional={!isMinor}
                                            error={errors.guardianName}
                                        >
                                            <Input
                                                {...control("guardianName", isMinor)}
                                                className={inputClass}
                                                value={formData.guardianName}
                                                onChange={(e) =>
                                                    setField("guardianName", e.target.value)
                                                }
                                            />
                                        </FormField>
                                        <FormField
                                            name="guardianNric"
                                            label="Guardian NRIC / FIN"
                                            optional={!isMinor}
                                            error={errors.guardianNric}
                                        >
                                            <Input
                                                {...control("guardianNric", isMinor)}
                                                autoCapitalize="characters"
                                                spellCheck={false}
                                                className={cn(inputClass, "uppercase")}
                                                value={formData.guardianNric}
                                                onChange={(e) =>
                                                    setField("guardianNric", formatNric(e.target.value))
                                                }
                                            />
                                        </FormField>
                                        <FormField
                                            name="guardianRelationship"
                                            label="Relationship to member"
                                            optional={!isMinor}
                                            error={errors.guardianRelationship}
                                        >
                                            <NativeSelect
                                                {...control("guardianRelationship", isMinor)}
                                                className={selectClass}
                                                value={formData.guardianRelationship}
                                                onChange={(e) =>
                                                    setField("guardianRelationship", e.target.value)
                                                }
                                            >
                                                <option value="" disabled>
                                                    Select relationship
                                                </option>
                                                {GUARDIAN_RELATIONSHIPS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </NativeSelect>
                                        </FormField>
                                        <FormField
                                            name="guardianPhone"
                                            label="Guardian contact number"
                                            optional={!isMinor}
                                            error={errors.guardianPhone}
                                        >
                                            <PhoneInput
                                                {...control("guardianPhone", isMinor)}
                                                value={formData.guardianPhone}
                                                onChange={(e) =>
                                                    setField("guardianPhone", formatPhone(e.target.value))
                                                }
                                            />
                                        </FormField>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 4 */}
                    {currentStep === 4 && (
                        <div className="space-y-4">
                            <div className={groupClass}>
                                <div className="flex items-center justify-between gap-3 border-b pb-3">
                                    <h3 className="font-semibold">Personal information</h3>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCurrentStep(1)}
                                    >
                                        Edit<span className="sr-only"> personal information</span>
                                    </Button>
                                </div>
                                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                    <ReviewItem term="First name">
                                        {formData.firstName}
                                    </ReviewItem>
                                    <ReviewItem term="Last name">{formData.lastName}</ReviewItem>
                                    <ReviewItem term="NRIC / FIN">{formData.nric}</ReviewItem>
                                    <ReviewItem term="Nationality">
                                        {labelOf(NATIONALITIES, formData.nationality)}
                                    </ReviewItem>
                                    <ReviewItem term="Date of birth">
                                        {validDob(formData.dob)
                                            ? formatDate(`${formData.dob}T00:00:00`)
                                            : ""}
                                    </ReviewItem>
                                    <ReviewItem term="Mobile number">
                                        {formData.mobile && `+65 ${formData.mobile}`}
                                    </ReviewItem>
                                    <ReviewItem term="Email address">{formData.email}</ReviewItem>
                                </dl>
                            </div>

                            <div className={groupClass}>
                                <div className="flex items-center justify-between gap-3 border-b pb-3">
                                    <h3 className="font-semibold">Training information</h3>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCurrentStep(2)}
                                    >
                                        Edit<span className="sr-only"> training information</span>
                                    </Button>
                                </div>
                                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                    <ReviewItem term="Principal dojo">{centreName}</ReviewItem>
                                    <ReviewItem term="Membership type">
                                        {formData.membershipType
                                            ? membershipLabel(formData.membershipType)
                                            : ""}
                                    </ReviewItem>
                                    <ReviewItem term="Trained in aikido before">
                                        {formData.hasExperience === "yes"
                                            ? "Yes"
                                            : formData.hasExperience === "no"
                                                ? "No"
                                                : ""}
                                    </ReviewItem>
                                    {formData.hasExperience === "yes" && (
                                        <ReviewItem term="Current belt">
                                            {formData.currentBelt &&
                                                grades.find(
                                                    (grade) => grade.id === formData.currentBelt,
                                                )?.label}
                                        </ReviewItem>
                                    )}
                                </dl>
                            </div>

                            <div className={groupClass}>
                                <div className="flex items-center justify-between gap-3 border-b pb-3">
                                    <h3 className="font-semibold">Emergency contact</h3>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCurrentStep(3)}
                                    >
                                        Edit
                                        <span className="sr-only">
                                            {" "}
                                            emergency and medical details
                                        </span>
                                    </Button>
                                </div>
                                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                    <ReviewItem term="Name">{formData.emergencyName}</ReviewItem>
                                    <ReviewItem term="Relationship">
                                        {labelOf(
                                            EMERGENCY_RELATIONSHIPS,
                                            formData.emergencyRelationship,
                                        )}
                                    </ReviewItem>
                                    <ReviewItem term="Contact number">
                                        {formData.emergencyPhone &&
                                            `+65 ${formData.emergencyPhone}`}
                                    </ReviewItem>
                                </dl>
                            </div>

                            <div className="space-y-2 rounded-lg bg-muted p-4">
                                <h3 className="font-semibold">Fee summary</h3>
                                <div className="flex items-center justify-between gap-3 border-b pb-2 text-sm">
                                    <span>Membership application fee</span>
                                    <span className="text-lg font-semibold tabular-nums">
                                        {money.format(MEMBERSHIP_FEE)}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Includes current year membership fee, student handbook, and
                                    membership booklet.
                                </p>
                            </div>

                            <div
                                className={cn(
                                    "rounded-lg border p-4",
                                    errors.declaration && "border-destructive",
                                )}
                            >
                                <label className="flex cursor-pointer items-start gap-3 text-sm">
                                    <input
                                        {...control("declaration")}
                                        type="checkbox"
                                        checked={isDeclared}
                                        onChange={(e) => {
                                            setIsDeclared(e.target.checked);
                                            clearError("declaration");
                                        }}
                                        className="mt-0.5 size-5 shrink-0 accent-primary"
                                    />
                                    <span className="leading-relaxed">
                                        I declare that all the information provided is true and
                                        accurate. <RequiredMark />
                                    </span>
                                </label>
                                {errors.declaration && (
                                    <p
                                        id={`${fieldId("declaration")}-error`}
                                        className="mt-2 text-sm text-destructive"
                                    >
                                        {errors.declaration}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                        {currentStep > 1 ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="touch"
                                className="min-w-24"
                                onClick={handleBack}
                                disabled={isSubmitting}
                            >
                                Back
                            </Button>
                        ) : (
                            <span />
                        )}
                        <Button
                            type="button"
                            size="touch"
                            className="h-auto min-h-11 min-w-24 shrink py-2 whitespace-normal lg:min-h-10"
                            onClick={handleNext}
                            disabled={isSubmitting}
                            aria-busy={isSubmitting}
                        >
                            {currentStep < 4
                                ? "Next"
                                : isSubmitting
                                    ? "Redirecting to payment…"
                                    : `Submit and pay ${money.format(MEMBERSHIP_FEE)}`}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
