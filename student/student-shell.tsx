import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  IdCard,
  LayoutDashboard,
  LogOut,
  Presentation,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
export default function StudentShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const name =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Student";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

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
        <div className="mx-auto flex w-[80%] flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
          <Link
            to="/dashboard"
            className="flex items-center rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
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
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
            <nav
              aria-label="Student navigation"
              className="order-3 flex w-full flex-wrap items-center gap-1 lg:order-0 lg:w-auto"
            >
              {NAV.map(({ label, to, icon: Icon }) => {
                const active = pathname === to || pathname.startsWith(`${to}/`);
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:px-3 sm:text-sm lg:flex-none",
                      active && "bg-accent text-accent-foreground",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" className="min-h-10 gap-2" />}
                aria-label={`Account menu for ${name}`}
                disabled={signingOut}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                  aria-hidden="true"
                >
                  {initials}
                </span>
                <span className="hidden max-w-36 truncate md:inline">
                  {signingOut ? "Signing out…" : name}
                </span>
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="border-b px-2 py-2">
                  <p className="truncate font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile?.email}
                  </p>
                </div>
                <DropdownMenuItem
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                >
                  <LogOut aria-hidden="true" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      {signOutError && (
        <p role="alert" className="mx-auto w-[80%] pt-3 text-sm text-destructive">
          {signOutError}
        </p>
      )}
      <div className="mx-auto flex w-[80%] flex-1 flex-col py-6">{children}</div>
    </div>
  );
}