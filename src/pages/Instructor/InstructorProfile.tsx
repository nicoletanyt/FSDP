import { useState } from "react";
import type { SubmitEvent } from "react";
import { Check, LockKeyhole, UserRound, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

export default function InstructorProfile() {
    const { profile } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const passwordsMatch =
        newPassword.length > 0 && newPassword === confirmPassword;
    const passwordRequirements = [
        { label: "At least 8 characters", met: newPassword.length >= 8 },
        { label: "At least one letter", met: /[a-zA-Z]/.test(newPassword) },
        { label: "At least one number", met: /[0-9]/.test(newPassword) },
    ];
    const PasswordMatchIcon = passwordsMatch ? Check : X;
    const passwordChanged = location.state?.passwordChanged === true;

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
        <section className="space-y-6">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
            </header>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserRound
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                        />{" "}
                        Instructor information
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <dl className="grid gap-5 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs text-muted-foreground">Name</dt>
                            <dd className="mt-1 font-medium">
                                {profile
                                    ? `${profile.first_name} ${profile.last_name}`
                                    : "Instructor"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Email</dt>
                            <dd className="mt-1 break-all">{profile?.email || "—"}</dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LockKeyhole
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                        />
                        Change password
                    </CardTitle>
                    <CardDescription>
                        Choose a new password for your instructor account.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={handlePasswordChange}
                        onReset={() => {
                            setNewPassword("");
                            setConfirmPassword("");
                        }}
                        className="space-y-5"
                        aria-busy={pending}
                    >
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
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
                        <fieldset disabled={pending} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="new-password">New password</Label>
                                <PasswordInput
                                    id="new-password"
                                    name="new-password"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
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
                                                className={`flex items-center gap-1.5 ${met ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                                            >
                                                <Icon
                                                    aria-hidden="true"
                                                    className="size-3.5 shrink-0"
                                                />
                                                <span className="sr-only">
                                                    {met ? "Requirement met: " : "Requirement not met: "}
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
                                    aria-describedby="password-match-hint"
                                />
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
                            </div>
                            <Button type="submit" disabled={pending}>
                                {pending ? "Changing password…" : "Change password"}
                            </Button>
                        </fieldset>
                    </form>
                </CardContent>
            </Card>
        </section>
    );
}
