import { Suspense, useState } from "react";
import { Link, Outlet, useLocation, useMatch } from "react-router";
import { LayoutDashboard, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { dashboardPaths } from "@/lib/auth";
import ThemeToggle from "@/components/theme-toggle";
import StudentNavigation from "@/components/student/StudentNavigation";
import MobileNavigation from "@/components/MobileNavigation";

export default function RootLayout() {
    const { session, profile, loading, signOut } = useAuth();
    const isInstructorPortal = useMatch("/instructor/*");
    const { pathname } = useLocation();
    const isStudent = Boolean(session && profile?.role === "student");
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

    if (isInstructorPortal) {
        return (
            <Suspense
                fallback={
                    <p
                        role="status"
                        className="mx-auto w-full p-4 text-muted-foreground lg:w-[70%] lg:px-0 lg:py-6"
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
            {isStudent ? <StudentNavigation /> : <>
                <MobileNavigation loading={loading} links={session ? profile ? [
                    { label: "Dashboard", to: dashboardPaths[profile.role], icon: LayoutDashboard, active: pathname === dashboardPaths[profile.role] },
                ] : [] : [
                    { label: "Sign in", to: "/login", icon: LogIn, active: pathname === "/login" || pathname === "/staff/login" },
                    { label: "Sign up", to: "/signup", icon: UserPlus, active: pathname === "/signup" },
                ]} onSignOut={session ? handleSignOut : undefined} signingOut={signingOut} error={error} />
                <header className="sticky top-0 z-40 hidden border-b border-border bg-background/90 backdrop-blur lg:block">
                <nav
                    aria-label="Main navigation"
                    className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 lg:gap-4 lg:px-6 lg:py-5"
                >
                    <Link
                        to="/"
                        className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-0"
                    >
                        <img
                            src="/logo.png"
                            alt="Aikido Shinju-Kai logo"
                            width={40}
                            height={40}
                            className="size-8 rounded-full lg:size-10"
                        />
                        <span className="text-xs font-semibold tracking-tight lg:text-base">
                            <span className="text-primary">Aikido</span>{" "}
                            <span className="text-brand-red-ink">Shinju-Kai</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-0 lg:gap-4">
                        <ThemeToggle />
                        {!loading && (
                            <div className="hidden items-center gap-4 text-sm lg:flex">
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
                    </div>
                </nav>
                {error && (
                    <p
                        role="alert"
                        className="mx-auto w-full px-4 pb-3 text-sm break-words text-destructive lg:w-[70%] lg:px-0"
                    >
                        {error}
                    </p>
                )}
            </header></>}
            <main className={`mx-auto w-full p-4 lg:w-[70%] lg:px-0 ${isStudent ? "lg:py-8" : "lg:py-12"}`}>
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
            <div aria-hidden="true" className="h-24 shrink-0 lg:hidden" />
            {!isStudent && <footer className="border-t border-border">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>&copy; {new Date().getFullYear()} Aikido Shinju-Kai</p>
                    <p>FSDP project portal</p>
                </div>
            </footer>}
        </div>
    );
}
