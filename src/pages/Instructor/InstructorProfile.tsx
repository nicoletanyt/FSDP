import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, SubmitEvent } from "react";
import { Check, ChevronRight, LockKeyhole, Trash2, Upload, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InstructorAvatar, useInstructorPhoto } from "@/components/ui/avatar";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import { useAuth } from "@/hooks/use-auth";
import { prepareInstructorPhoto, saveInstructorPhoto } from "@/lib/instructor-calendar";
import { supabase } from "@/lib/supabase";

const employmentStatusLabels = { part_time: "Part time", full_time: "Full time" };
// Placeholder until employment status is available on the instructor profile.
const employmentStatus: keyof typeof employmentStatusLabels = "full_time";

export default function InstructorProfile() {
    const { profile } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [passwordEdited, setPasswordEdited] = useState(false);
    const photo = useInstructorPhoto(profile?.id);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const photoRequestRef = useRef(0);
    const [photoPending, setPhotoPending] = useState(false);
    const [photoError, setPhotoError] = useState("");
    const [photoFeedback, setPhotoFeedback] = useState("");
    const instructorName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "Instructor";
    const photoControlsDisabled = !profile?.id || photoPending || pending;

    useEffect(() => {
        setPhotoError("");
        setPhotoFeedback("");
        setPhotoPending(false);
        return () => { photoRequestRef.current += 1; };
    }, [profile?.id]);

    async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file || !profile?.id || photoPending) return;
        const instructorId = profile.id;
        const request = ++photoRequestRef.current;
        setPhotoPending(true);
        setPhotoError("");
        setPhotoFeedback("");
        try {
            const prepared = await prepareInstructorPhoto(file);
            if (request !== photoRequestRef.current) return;
            try {
                saveInstructorPhoto(instructorId, prepared);
            } catch {
                throw new Error("Could not save your photo in this browser. Please try again.");
            }
            setPhotoFeedback("Profile picture updated.");
        } catch (failure) {
            if (request === photoRequestRef.current) {
                setPhotoError(failure instanceof Error ? failure.message : "Could not upload your photo. Please try again.");
            }
        } finally {
            if (request === photoRequestRef.current) setPhotoPending(false);
        }
    }

    function removePhoto() {
        if (!profile?.id || photoControlsDisabled) return;
        setPhotoError("");
        setPhotoFeedback("");
        try {
            saveInstructorPhoto(profile.id, null);
            setPhotoFeedback("Profile picture removed.");
        } catch {
            setPhotoError("Could not remove your photo from this browser. Please try again.");
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
    const canSavePassword = passwordRequirements.every(({ met }) => met) && newPassword.length <= 128 && passwordsMatch;
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
                <CardHeader>
                    <CardTitle>Instructor information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="shrink-0" role="img" aria-label={`${instructorName}'s profile picture`}>
                            <InstructorAvatar
                                profile={{ id: profile?.id ?? "", name: instructorName, role: "Instructor" }}
                                interactive={false}
                                showName={false}
                                avatarClassName="size-24"
                                fallbackClassName="text-3xl"
                            />
                        </div>
                        <div className="min-w-0 flex-1 space-y-3" aria-busy={photoPending}>
                            <div className="space-y-1">
                                <Label htmlFor="instructor-profile-photo">Profile picture</Label>
                                <p id="instructor-photo-hint" className="text-xs leading-relaxed text-muted-foreground">JPG, PNG or WebP, up to 5 MB. Stored only in this browser.</p>
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
                                onChange={(event) => { void handlePhotoUpload(event); }}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={() => photoInputRef.current?.click()} disabled={photoControlsDisabled}>
                                    <Upload aria-hidden="true" className="size-4" />
                                    {photoPending ? "Saving photo…" : photo ? "Change photo" : "Upload photo"}
                                </Button>
                                {photo && <Button type="button" variant="destructive" onClick={removePhoto} disabled={photoControlsDisabled}><Trash2 aria-hidden="true" className="size-4" />Remove photo</Button>}
                            </div>
                            {photoError && <Alert variant="destructive" role="alert"><AlertDescription>{photoError}</AlertDescription></Alert>}
                            {photoFeedback && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{photoFeedback}</p>}
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
                            <dd className="min-w-0 break-all sm:text-right">{profile?.email || "—"}</dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Address</dt>
                            <dd className="min-w-0 break-words sm:text-right">123 Example Street, Singapore 123456</dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Employment status</dt>
                            <dd className="min-w-0 sm:text-right">
                                <Badge variant="secondary" className="h-auto px-2.5 py-1">{employmentStatusLabels[employmentStatus]}</Badge>
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
                    <Dialog open={passwordDialogOpen} onOpenChange={handlePasswordDialogChange}>
                        <DialogTrigger
                            render={<Button variant="ghost" />}
                            className="h-auto w-full justify-start gap-3 px-3 py-2 font-normal"
                            disabled={pending}
                        >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <LockKeyhole aria-hidden="true" className="size-4 text-muted-foreground" />
                            </span>
                            <span>Change password</span>
                            <ChevronRight aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
                        </DialogTrigger>
                        <DialogContent
                            className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
                            showCloseButton={!pending}
                        >
                            <DialogHeader className="pr-8">
                                <DialogTitle>Change password</DialogTitle>
                                <DialogDescription>Choose a new password for your instructor account.</DialogDescription>
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
                                        <ul id="new-password-hint" aria-live="polite" className="space-y-1 text-xs">
                                            {passwordRequirements.map(({ label, met }) => {
                                                const Icon = met ? Check : X;
                                                return (
                                                    <li
                                                        key={label}
                                                        className={`flex items-center gap-1.5 ${!passwordEdited ? "text-muted-foreground" : met ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                                                    >
                                                        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                                                        <span className="sr-only">
                                                            {!passwordEdited ? "Not yet checked: " : met ? "Requirement met: " : "Requirement not met: "}
                                                        </span>
                                                        {label}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirm-password">Confirm new password</Label>
                                        <PasswordInput
                                            id="confirm-password"
                                            name="confirm-password"
                                            value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                            autoComplete="new-password"
                                            required
                                            minLength={8}
                                            maxLength={128}
                                            aria-describedby={confirmPassword ? "password-match-hint" : undefined}
                                            aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                                        />
                                        {confirmPassword.length > 0 && (
                                            <p
                                                id="password-match-hint"
                                                aria-live="polite"
                                                className={`flex items-center gap-1.5 text-xs ${passwordsMatch ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                                            >
                                                <PasswordMatchIcon aria-hidden="true" className="size-3.5 shrink-0" />
                                                {passwordsMatch ? "Passwords match." : "Passwords must match."}
                                            </p>
                                        )}
                                    </div>
                                </fieldset>
                                <DialogFooter>
                                    <DialogClose render={<Button type="button" variant="outline" />} disabled={pending}>
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
