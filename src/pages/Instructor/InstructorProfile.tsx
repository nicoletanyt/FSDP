import { useState } from "react";
import type { SubmitEvent } from "react";
import { Check, ChevronRight, LockKeyhole, LogOut, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/lib/supabase";

export default function InstructorProfile() {
    const { profile, signOut } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [passwordEdited, setPasswordEdited] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState("");
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
        if (pending || signingOut) return;

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

    async function handleSignOut() {
        if (signingOut || pending) return;
        setSigningOut(true);
        setSignOutError("");
        try {
            await signOut();
        } catch (failure) {
            setSignOutError(
                failure instanceof Error ? failure.message : "Unable to sign out. Try again.",
            );
        } finally {
            setSigningOut(false);
        }
    }

    return (
        <section className="grid w-full items-start gap-6 md:grid-cols-2">
            <header className="md:col-span-2">
                <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>Instructor information</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="space-y-4 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Name</dt>
                            <dd className="min-w-0 break-words font-medium sm:text-right">
                                {profile
                                    ? `${profile.first_name} ${profile.last_name}`
                                    : "Instructor"}
                            </dd>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="min-w-0 break-all sm:text-right">{profile?.email || "—"}</dd>
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
                            disabled={pending || signingOut}
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
                                <fieldset disabled={pending || signingOut} className="space-y-4">
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
                                    <Button type="submit" disabled={pending || signingOut || !canSavePassword}>
                                        {pending ? "Saving…" : "Save Changes"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <div className="space-y-3">
                        {signOutError && (
                            <Alert variant="destructive">
                                <AlertDescription>{signOutError}</AlertDescription>
                            </Alert>
                        )}
                        <Button
                            type="button"
                            variant="destructive"
                            className="h-10 w-full justify-start rounded-xl px-3"
                            onClick={() => void handleSignOut()}
                            disabled={signingOut || pending}
                            aria-busy={signingOut}
                        >
                            <LogOut aria-hidden="true" className="size-4" />
                            {signingOut ? "Signing out…" : "Sign out"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
