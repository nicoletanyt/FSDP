import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, SubmitEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    Check,
    ChevronRight,
    LockKeyhole,
    Pencil,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import GradeBadge from "@/components/instructor/DatabaseGradeBadge";
import TitleBadge from "@/components/instructor/TitleBadge";
import { InstructorAvatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useInstructorProfile } from "@/hooks/use-instructor-profile";
import { prepareInstructorPhoto } from "@/lib/instructor-calendar";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { instructorQueryKeys } from "@/lib/instructor/query-keys";
import { MAX_ADDRESS_LENGTH } from "@/lib/instructor/profile";
import type { InstructorProfileDetails } from "@/lib/instructor/profile";
import { queryGeneration } from "@/lib/query-generation";
import { supabase } from "@/lib/supabase";

const employmentStatusLabels = {
    part_time: "Part time",
    full_time: "Full time",
};

export default function InstructorProfile() {
    const { profile } = useAuth();
    const api = useInstructorApi();
    const queryClient = useQueryClient();
    const details = useInstructorProfile();
    const location = useLocation();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [passwordEdited, setPasswordEdited] = useState(false);
    const photo = details.data?.photoUrl;
    const photoInputRef = useRef<HTMLInputElement>(null);
    const photoRequestRef = useRef(0);
    const photoBusyRef = useRef(false);
    const [photoPending, setPhotoPending] = useState(false);
    const [photoError, setPhotoError] = useState("");
    const [photoFeedback, setPhotoFeedback] = useState("");
    const [addressEditing, setAddressEditing] = useState(false);
    const [addressDraft, setAddressDraft] = useState("");
    const [addressPending, setAddressPending] = useState(false);
    const [addressError, setAddressError] = useState("");
    const [addressFeedback, setAddressFeedback] = useState("");
    const addressBusyRef = useRef(false);
    const addressRequestRef = useRef(0);
    const addressEditRef = useRef<HTMLButtonElement>(null);
    const instructorName =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        profile?.email ||
        "Instructor";
    const profileReady = Boolean(
        profile?.id && details.isSuccess && !details.isFetching,
    );
    const photoControlsDisabled = !profileReady || photoPending || pending;

    async function updateSavedProfile(
        userId: string,
        generation: number,
        patch: Partial<InstructorProfileDetails>,
    ) {
        if (queryGeneration(queryClient) !== generation) return;
        await queryClient.cancelQueries({
            queryKey: instructorQueryKeys.profile(userId),
        });
        if (queryGeneration(queryClient) !== generation) return;
        queryClient.setQueryData<InstructorProfileDetails>(
            instructorQueryKeys.profile(userId),
            (saved) => (saved ? { ...saved, ...patch } : saved),
        );
    }

    useEffect(() => {
        setPhotoError("");
        setPhotoFeedback("");
        setPhotoPending(false);
        photoBusyRef.current = false;
        setAddressEditing(false);
        setAddressDraft("");
        setAddressPending(false);
        setAddressError("");
        setAddressFeedback("");
        addressBusyRef.current = false;
        return () => {
            photoRequestRef.current += 1;
            addressRequestRef.current += 1;
        };
    }, [profile?.id]);

    async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (
            !file ||
            !profile?.id ||
            !details.data ||
            photoControlsDisabled ||
            photoBusyRef.current
        )
            return;
        const userId = profile.id;
        const generation = queryGeneration(queryClient);
        const previousPath = details.data.photoPath;
        const request = ++photoRequestRef.current;
        photoBusyRef.current = true;
        setPhotoPending(true);
        setPhotoError("");
        setPhotoFeedback("");
        try {
            await queryClient.cancelQueries({
                queryKey: instructorQueryKeys.profile(userId),
            });
            const prepared = await prepareInstructorPhoto(file);
            if (request !== photoRequestRef.current) return;
            const saved = await api.uploadProfilePhoto(
                userId,
                previousPath,
                prepared,
            );
            await updateSavedProfile(userId, generation, saved);
            if (request !== photoRequestRef.current) return;
            setPhotoFeedback("Profile picture updated.");
        } catch (failure) {
            if (request === photoRequestRef.current) {
                setPhotoError(
                    failure instanceof Error
                        ? failure.message
                        : "Could not upload your photo. Please try again.",
                );
            }
        } finally {
            if (request === photoRequestRef.current) {
                photoBusyRef.current = false;
                setPhotoPending(false);
            }
        }
    }

    async function removePhoto() {
        if (
            !profile?.id ||
            !details.data ||
            photoControlsDisabled ||
            photoBusyRef.current
        )
            return;
        const userId = profile.id;
        const generation = queryGeneration(queryClient);
        const previousPath = details.data.photoPath;
        const request = ++photoRequestRef.current;
        photoBusyRef.current = true;
        setPhotoPending(true);
        setPhotoError("");
        setPhotoFeedback("");
        try {
            await queryClient.cancelQueries({
                queryKey: instructorQueryKeys.profile(userId),
            });
            const saved = await api.removeProfilePhoto(userId, previousPath);
            await updateSavedProfile(userId, generation, saved);
            if (request !== photoRequestRef.current) return;
            setPhotoFeedback("Profile picture removed.");
        } catch (failure) {
            if (request === photoRequestRef.current)
                setPhotoError(
                    failure instanceof Error
                        ? failure.message
                        : "Could not remove your photo. Please try again.",
                );
        } finally {
            if (request === photoRequestRef.current) {
                photoBusyRef.current = false;
                setPhotoPending(false);
            }
        }
    }

    function finishAddressEditing() {
        setAddressEditing(false);
        setAddressError("");
        requestAnimationFrame(() => addressEditRef.current?.focus());
    }

    function handleAddressDialogChange(open: boolean) {
        if (addressBusyRef.current) return;
        if (!open) {
            finishAddressEditing();
            return;
        }
        setAddressDraft(details.data?.address ?? "");
        setAddressError("");
        setAddressFeedback("");
        setAddressEditing(true);
    }

    async function saveAddress(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!profile?.id || !details.data || addressBusyRef.current) return;
        const userId = profile.id;
        const generation = queryGeneration(queryClient);
        const request = ++addressRequestRef.current;
        addressBusyRef.current = true;
        setAddressPending(true);
        setAddressError("");
        setAddressFeedback("");
        try {
            await queryClient.cancelQueries({
                queryKey: instructorQueryKeys.profile(userId),
            });
            const address = await api.saveAddress(userId, addressDraft);
            await updateSavedProfile(userId, generation, { address });
            if (request !== addressRequestRef.current) return;
            finishAddressEditing();
            setAddressFeedback(address ? "Address updated." : "Address removed.");
        } catch (failure) {
            if (request === addressRequestRef.current)
                setAddressError(
                    failure instanceof Error
                        ? failure.message
                        : "Unable to save your address. Please try again.",
                );
        } finally {
            if (request === addressRequestRef.current) {
                addressBusyRef.current = false;
                setAddressPending(false);
            }
        }
    }
    const passwordsMatch =
        newPassword.length > 0 && newPassword === confirmPassword;
    const passwordRequirements = [
        { label: "At least 8 characters", met: newPassword.length >= 8 },
        { label: "At least one letter", met: /[a-zA-Z]/.test(newPassword) },
        { label: "At least one number", met: /[0-9]/.test(newPassword) },
    ];
    const PasswordMatchIcon = passwordsMatch ? Check : X;
    const canSavePassword =
        passwordRequirements.every(({ met }) => met) &&
        newPassword.length <= 128 &&
        passwordsMatch;
    const passwordChanged = location.state?.passwordChanged === true;

    function handlePasswordDialogChange(open: boolean) {
        if (pending) return;
        setPasswordDialogOpen(open);
        setNewPassword("");
        setConfirmPassword("");
        setPasswordEdited(false);
        setError("");
        if (open && passwordChanged) {
            void navigate(location, {
                replace: true,
                state: { ...location.state, passwordChanged: false },
            });
        }
    }

    async function handlePasswordChange(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending) return;

        const form = event.currentTarget;
        const values = new FormData(form);
        const password = String(values.get("new-password") ?? "");
        const confirmation = String(values.get("confirm-password") ?? "");
        setError("");
        if (passwordChanged) {
            void navigate(location, {
                replace: true,
                state: { ...location.state, passwordChanged: false },
            });
        }

        if (
            password.length < 8 ||
            password.length > 128 ||
            !/[a-zA-Z]/.test(password) ||
            !/[0-9]/.test(password)
        ) {
            setError("Use 8–128 characters, including a letter and a number.");
            return;
        }
        if (password !== confirmation) {
            setError("The passwords do not match.");
            return;
        }

        setPending(true);
        try {
            const { error: authError } = await supabase.auth.updateUser({ password });
            if (authError) throw authError;
            form.reset();
            setPasswordDialogOpen(false);
            // Auth reloads the profile after USER_UPDATED; keep feedback across that remount.
            void navigate(location, {
                replace: true,
                state: { ...location.state, passwordChanged: true },
            });
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : "Unable to change your password. Try again.",
            );
        } finally {
            setPending(false);
        }
    }

    return (
        <section className="w-full space-y-6">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
            </header>
            <Card>
                <CardContent className="space-y-5">
                    {details.isError && (
                        <Alert variant="destructive" role="alert">
                            <AlertDescription className="space-y-2">
                                <p>{details.error.message}</p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        details.isFetching || photoPending || addressPending
                                    }
                                    onClick={() => {
                                        void details.refetch();
                                    }}
                                >
                                    {details.isFetching ? "Reloading…" : "Retry loading profile"}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                    {details.isPending && (
                        <p role="status" className="text-sm text-muted-foreground">
                            Loading saved profile…
                        </p>
                    )}
                    <div
                        className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto]"
                        aria-busy={photoPending}
                    >
                        <div
                            className="shrink-0"
                            role="img"
                            aria-label={`${instructorName}'s profile picture`}
                        >
                            <InstructorAvatar
                                profile={{
                                    id: profile?.id ?? "",
                                    name: instructorName,
                                    role: "Instructor",
                                    avatarUrl: photo ?? undefined,
                                }}
                                interactive={false}
                                showName={false}
                                avatarClassName="size-24"
                                fallbackClassName="text-3xl"
                            />
                        </div>
                        <div className="contents">
                            <div className="min-w-0 space-y-1">
                                <Label htmlFor="instructor-profile-photo">
                                    Profile picture
                                </Label>
                                <p
                                    id="instructor-photo-hint"
                                    className="text-xs leading-relaxed text-muted-foreground"
                                >
                                    JPG, PNG or WebP, up to 5 MB.
                                </p>
                            </div>
                            <input
                                ref={photoInputRef}
                                id="instructor-profile-photo"
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="sr-only"
                                tabIndex={-1}
                                disabled={photoControlsDisabled}
                                aria-describedby="instructor-photo-hint"
                                onChange={(event) => {
                                    void handlePhotoUpload(event);
                                }}
                            />
                            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => photoInputRef.current?.click()}
                                    disabled={photoControlsDisabled}
                                >
                                    <Upload aria-hidden="true" className="size-4" />
                                    {photoPending
                                        ? "Saving photo…"
                                        : photo
                                            ? "Change photo"
                                            : "Upload photo"}
                                </Button>
                                {photo && (
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={() => {
                                            void removePhoto();
                                        }}
                                        disabled={photoControlsDisabled}
                                    >
                                        <Trash2 aria-hidden="true" className="size-4" />
                                        Remove photo
                                    </Button>
                                )}
                            </div>
                            {photoError && (
                                <Alert
                                    variant="destructive"
                                    role="alert"
                                    className="col-span-full"
                                >
                                    <AlertDescription>{photoError}</AlertDescription>
                                </Alert>
                            )}
                            {photoError && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="col-span-full justify-self-end"
                                    disabled={photoPending || details.isFetching}
                                    onClick={() => {
                                        void details.refetch();
                                    }}
                                >
                                    Reload saved profile
                                </Button>
                            )}
                            {photoFeedback && (
                                <Alert
                                    role="status"
                                    className="col-span-full border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                >
                                    <Check aria-hidden="true" />
                                    <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                                        {photoFeedback}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>
                    <dl className="space-y-4 border-t pt-5 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Name</dt>
                            <dd className="min-w-0 break-words font-medium sm:text-right">
                                {instructorName}
                            </dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="min-w-0 break-all sm:text-right">
                                {profile?.email || "—"}
                            </dd>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                            <dt className="flex shrink-0 items-center gap-2">
                                <span className="text-muted-foreground">Address</span>
                                <Dialog
                                    open={addressEditing}
                                    onOpenChange={handleAddressDialogChange}
                                >
                                    <DialogTrigger
                                        ref={addressEditRef}
                                        render={
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-auto w-6 self-stretch p-0"
                                            />
                                        }
                                        aria-label="Edit address"
                                        title="Edit address"
                                        disabled={!profileReady || addressPending || pending}
                                    >
                                        <Pencil aria-hidden="true" className="size-4" />
                                    </DialogTrigger>
                                    <DialogContent
                                        className="sm:max-w-md"
                                        showCloseButton={!addressPending}
                                    >
                                        <DialogHeader className="pr-10">
                                            <DialogTitle>Edit address</DialogTitle>
                                            <DialogDescription>
                                                Update the address associated with your instructor
                                                account so administrators can contact you regarding
                                                makeup classes.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <form
                                            id="instructor-address-editor"
                                            className="space-y-4"
                                            onSubmit={saveAddress}
                                            aria-busy={addressPending}
                                        >
                                            <Textarea
                                                id="instructor-address"
                                                name="street-address"
                                                autoComplete="street-address"
                                                autoFocus
                                                rows={3}
                                                maxLength={MAX_ADDRESS_LENGTH}
                                                value={addressDraft}
                                                disabled={addressPending}
                                                aria-invalid={Boolean(addressError)}
                                                aria-describedby={
                                                    addressError
                                                        ? "instructor-address-hint instructor-address-error"
                                                        : "instructor-address-hint"
                                                }
                                                onChange={(event) =>
                                                    setAddressDraft(event.target.value)
                                                }
                                            />
                                            {addressError && (
                                                <Alert
                                                    id="instructor-address-error"
                                                    variant="destructive"
                                                    role="alert"
                                                >
                                                    <AlertDescription>{addressError}</AlertDescription>
                                                </Alert>
                                            )}
                                            <DialogFooter>
                                                <DialogClose
                                                    render={
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="min-h-11"
                                                        />
                                                    }
                                                    disabled={addressPending}
                                                >
                                                    Cancel
                                                </DialogClose>
                                                <Button
                                                    type="submit"
                                                    className="min-h-11"
                                                    disabled={
                                                        addressPending ||
                                                        (addressDraft.trim() || null) ===
                                                        (details.data?.address ?? null)
                                                    }
                                                >
                                                    {addressPending ? "Saving…" : "Save address"}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </dt>
                            <dd className="min-w-0 flex-1 sm:text-right">
                                <span className="whitespace-pre-wrap break-words">
                                    {details.isPending
                                        ? "Loading…"
                                        : details.isError
                                            ? "Unavailable"
                                            : details.data?.address || "Not provided"}
                                </span>
                                {addressFeedback && (
                                    <p
                                        role="status"
                                        className="mt-2 text-xs text-emerald-700 dark:text-emerald-400"
                                    >
                                        {addressFeedback}
                                    </p>
                                )}
                            </dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Grade</dt>
                            <dd>{details.isPending ? "Loading…" : details.isError ? "Unavailable" : <GradeBadge grade={details.data?.grade ?? null} />}</dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Instructor title</dt>
                            <dd>
                                {details.isPending ? (
                                    "Loading…"
                                ) : details.isError ? (
                                    "Unavailable"
                                ) : details.data && details.data.instructorTitle !== "none" ? (
                                    <TitleBadge title={details.data.instructorTitle} />
                                ) : (
                                    <span className="text-muted-foreground">None</span>
                                )}
                            </dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Examiner</dt>
                            <dd className="min-w-0 sm:text-right">
                                {details.isPending ? (
                                    "Loading…"
                                ) : details.isError ? (
                                    "Unavailable"
                                ) : details.data?.isExaminer ? (
                                    <Badge variant="secondary" className="h-auto px-2.5 py-1">
                                        Can sit on grading panels
                                    </Badge>
                                ) : (
                                    <span className="text-muted-foreground">No</span>
                                )}
                            </dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Employment status</dt>
                            <dd className="min-w-0 sm:text-right">
                                <Badge variant="secondary" className="h-auto px-2.5 py-1">
                                    {details.isPending
                                        ? "Loading…"
                                        : details.isError
                                            ? "Unavailable"
                                            : details.data?.employmentType
                                                ? employmentStatusLabels[details.data.employmentType]
                                                : "Not specified"}
                                </Badge>
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {passwordChanged && (
                        <Alert
                            role="status"
                            className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        >
                            <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                                Your password has been changed successfully.
                            </AlertDescription>
                        </Alert>
                    )}
                    <Dialog
                        open={passwordDialogOpen}
                        onOpenChange={handlePasswordDialogChange}
                    >
                        <DialogTrigger
                            render={<Button variant="ghost" />}
                            className="h-auto w-full justify-start gap-3 px-3 py-2 font-normal"
                            disabled={pending}
                        >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <LockKeyhole
                                    aria-hidden="true"
                                    className="size-4 text-muted-foreground"
                                />
                            </span>
                            <span>Change password</span>
                            <ChevronRight
                                aria-hidden="true"
                                className="ml-auto size-4 text-muted-foreground"
                            />
                        </DialogTrigger>
                        <DialogContent
                            className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
                            showCloseButton={!pending}
                        >
                            <DialogHeader className="pr-8">
                                <DialogTitle>Change password</DialogTitle>
                                <DialogDescription>
                                    Choose a new password for your instructor account.
                                </DialogDescription>
                            </DialogHeader>
                            <form
                                onSubmit={handlePasswordChange}
                                onReset={() => {
                                    setNewPassword("");
                                    setConfirmPassword("");
                                    setPasswordEdited(false);
                                }}
                                className="space-y-4"
                                aria-busy={pending}
                            >
                                {error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}
                                <fieldset disabled={pending} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="new-password">New password</Label>
                                        <PasswordInput
                                            id="new-password"
                                            name="new-password"
                                            value={newPassword}
                                            onChange={(event) => {
                                                setNewPassword(event.target.value);
                                                setPasswordEdited(true);
                                            }}
                                            autoComplete="new-password"
                                            required
                                            minLength={8}
                                            maxLength={128}
                                            pattern="(?=.*[a-zA-Z])(?=.*[0-9]).*"
                                            title="Use 8–128 characters, including a letter and a number."
                                            aria-describedby="new-password-hint"
                                        />
                                        <ul
                                            id="new-password-hint"
                                            aria-live="polite"
                                            className="space-y-1 text-xs"
                                        >
                                            {passwordRequirements.map(({ label, met }) => {
                                                const Icon = met ? Check : X;
                                                return (
                                                    <li
                                                        key={label}
                                                        className={`flex items-center gap-1.5 ${!passwordEdited ? "text-muted-foreground" : met ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                                                    >
                                                        <Icon
                                                            aria-hidden="true"
                                                            className="size-3.5 shrink-0"
                                                        />
                                                        <span className="sr-only">
                                                            {!passwordEdited
                                                                ? "Not yet checked: "
                                                                : met
                                                                    ? "Requirement met: "
                                                                    : "Requirement not met: "}
                                                        </span>
                                                        {label}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirm-password">
                                            Confirm new password
                                        </Label>
                                        <PasswordInput
                                            id="confirm-password"
                                            name="confirm-password"
                                            value={confirmPassword}
                                            onChange={(event) =>
                                                setConfirmPassword(event.target.value)
                                            }
                                            autoComplete="new-password"
                                            required
                                            minLength={8}
                                            maxLength={128}
                                            aria-describedby={
                                                confirmPassword ? "password-match-hint" : undefined
                                            }
                                            aria-invalid={
                                                confirmPassword.length > 0 && !passwordsMatch
                                            }
                                        />
                                        {confirmPassword.length > 0 && (
                                            <p
                                                id="password-match-hint"
                                                aria-live="polite"
                                                className={`flex items-center gap-1.5 text-xs ${passwordsMatch ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                                            >
                                                <PasswordMatchIcon
                                                    aria-hidden="true"
                                                    className="size-3.5 shrink-0"
                                                />
                                                {passwordsMatch
                                                    ? "Passwords match."
                                                    : "Passwords must match."}
                                            </p>
                                        )}
                                    </div>
                                </fieldset>
                                <DialogFooter>
                                    <DialogClose
                                        render={<Button type="button" variant="outline" />}
                                        disabled={pending}
                                    >
                                        Cancel
                                    </DialogClose>
                                    <Button type="submit" disabled={pending || !canSavePassword}>
                                        {pending ? "Saving…" : "Save Changes"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>
        </section>
    );
}
