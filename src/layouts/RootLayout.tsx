import { Suspense, useState } from "react";
import { Link, Outlet, useMatch } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { dashboardPaths } from "@/lib/auth";
import ThemeToggle from "@/components/theme-toggle";

export default function RootLayout() {
    const { session, profile, loading, signOut } = useAuth();
    const isInstructorPortal = useMatch("/instructor/*");
    const isStudentDashboard = useMatch("/dashboard");
    const isStudentProfile = useMatch("/profile");
    const isStudentPayments = useMatch("/payments");
    const isStudentPage = Boolean(
        isStudentDashboard || isStudentProfile || isStudentPayments,
    );
    const [signingOut, setSigningOut] = useState(false);
    const [error, setError] = useState("");

    async function handleSignOut() {
        setSigningOut(true);
        setError("");
        try {
            await signOut();
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : "Unable to sign out.",
            );
        } finally {
            setSigningOut(false);
        }
    }

    if (isInstructorPortal || isStudentPage) {
        return (
            <Suspense
                fallback={
                    <p
                        role="status"
                        className="mx-auto w-[70%] py-6 text-muted-foreground"
                    >
                        Loading…
                    </p>
                }
            >
                <Outlet />
            </Suspense>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
                <nav
                    aria-label="Main navigation"
                    className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3"
                >
                    <Link
                        to="/"
                        className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                        <img
                            src="/logo.png"
                            alt="Aikido Shinju-Kai logo"
                            width={40}
                            height={40}
                            className="size-10 rounded-full"
                        />
                        <span className="text-base font-semibold tracking-tight">
                            <span className="text-primary">Aikido</span>{" "}
                            <span className="text-brand-red-ink">Shinju-Kai</span>
                        </span>
                    </Link>
                    <ThemeToggle />
                    {!loading && (
                        <div className="flex items-center gap-4 text-sm">
                            {session ? (
                                <>
                                    {profile && (
                                        <Link
                                            to={dashboardPaths[profile.role]}
                                            className="font-medium hover:underline"
                                        >
                                            Dashboard
                                        </Link>
                                    )}
                                    <Button
                                        variant="outline"
                                        onClick={handleSignOut}
                                        disabled={signingOut}
                                    >
                                        {signingOut ? "Signing out…" : "Sign out"}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Link to="/login" className="hover:underline">
                                        Sign in
                                    </Link>
                                    <Link to="/signup" className="font-medium hover:underline">
                                        Sign up
                                    </Link>
                                </>
                            )}
                        </div>
                    )}
                </nav>
                {error && (
                    <p
                        role="alert"
                        className="mx-auto w-[70%] pb-3 text-sm text-destructive"
                    >
                        {error}
                    </p>
                )}
            </header>
            <main className="mx-auto w-[70%] py-12">
                <Suspense
                    fallback={
                        <p role="status" className="py-12 text-muted-foreground">
                            Loading…
                        </p>
                    }
                >
                    <Outlet />
                </Suspense>
            </main>
            <footer className="border-t border-border">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>&copy; {new Date().getFullYear()} Aikido Shinju-Kai</p>
                    <p>FSDP project portal</p>
                </div>
            </footer>
        </div>
    );
}
