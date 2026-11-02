import { Suspense, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  CalendarDays,
  ClipboardCheck,
  IdCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Presentation,
  X,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const NAV = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Timetable", to: "/timetable", icon: CalendarDays },
  { label: "Attendance", to: "/attendance", icon: UserCheck },
  { label: "Classes", to: "/classes", icon: Presentation },
  { label: "Grading", to: "/grading", icon: ClipboardCheck },
  { label: "Membership Profile", to: "/profile", icon: IdCard },
];

/** Shared timetable-style frame for student pages. */
export default function StudentLayout() {
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
    } catch (failure) {
      setSignOutError(failure instanceof Error ? failure.message : "Unable to sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30 text-foreground">
      <header className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-5 sm:px-6 lg:flex-nowrap lg:gap-x-6">
          <Link
            to="/dashboard"
            onClick={() => setMenuOpen(false)}
            className="flex shrink-0 items-center rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
          >
            <img
              src={logo}
              alt="Aikido Shinju-Kai logo"
              className="size-10 shrink-0 object-contain"
              width={40}
              height={40}
            />
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Student Portal
            </span>
          </Link>
          <div className="order-2 ml-auto flex shrink-0 items-center gap-1 lg:order-3 lg:ml-0">
            <ThemeToggle />
            <Button
              variant="ghost"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="hidden min-h-10 gap-2 lg:inline-flex"
            >
              <LogOut aria-hidden="true" className="size-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="student-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </Button>
          </div>
          <nav
            id="student-navigation"
            aria-label="Student navigation"
            className={cn(
              "order-3 w-full flex-col gap-1 lg:order-2 lg:flex lg:w-auto lg:flex-row",
              menuOpen ? "flex" : "hidden",
            )}
          >
            {NAV.map(({ label, to, icon: Icon }) => {
              const active = pathname === to || pathname.startsWith(`${to}/`);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-start gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:w-auto lg:justify-center lg:px-3",
                    label === "Membership Profile" && "whitespace-nowrap lg:gap-2 lg:px-2",
                    active && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </Link>
              );
            })}
            <Button
              variant="ghost"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="min-h-10 w-full justify-start gap-3 px-3 lg:hidden"
            >
              <LogOut aria-hidden="true" className="size-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </nav>
        </div>
      </header>
      {signOutError && (
        <p role="alert" className="mx-auto w-[80%] pt-3 text-sm text-destructive">
          {signOutError}
        </p>
      )}
      <div className="mx-auto flex w-[80%] flex-1 flex-col py-6">
        <Suspense fallback={<p role="status" className="py-12 text-muted-foreground">Loading…</p>}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
