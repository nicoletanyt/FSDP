import { FeedbackDialog } from "@/components/shared/FeedbackDialog";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { Check, ChevronRight, LockKeyhole, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/lib/supabase";

export default function ChangePasswordDialog({ accountType }: { accountType: string }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [open, setOpen] = useState(false);
    const [passwordEdited, setPasswordEdited] = useState(false);

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

    function clearPasswordChanged() {
        if (!passwordChanged) return;
        void navigate(location, {
            replace: true,
            state: { ...location.state, passwordChanged: false },
        });
    }

    function handleOpenChange(nextOpen: boolean) {
        if (pending) return;
        setOpen(nextOpen);
        setNewPassword("");
        setConfirmPassword("");
        setPasswordEdited(false);
        setError("");
        if (nextOpen) clearPasswordChanged();
    }

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending) return;

        const form = event.currentTarget;
        const values = new FormData(form);
        const password = String(values.get("new-password") ?? "");
        const confirmation = String(values.get("confirm-password") ?? "");
        setError("");
        clearPasswordChanged();

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
            setOpen(false);
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
        <>
            <FeedbackDialog
                open={passwordChanged}
                onOpenChange={(next) => {
                    if (!next) clearPasswordChanged();
                }}
                title="Password changed"
                description="Your password has been updated. Use it next time you sign in."
            />
            <Dialog open={open} onOpenChange={handleOpenChange}>
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
                    className="overflow-y-auto"
                    showCloseButton={!pending}
                >
                    <DialogHeader>
                        <DialogTitle>Change password</DialogTitle>
                        <DialogDescription>
                            Choose a new password for your {accountType} account.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={handleSubmit}
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
        </>
    );
}
