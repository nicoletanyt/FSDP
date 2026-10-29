import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
    CalendarDays,
    ChevronDown,
    LogOut,
    ScanLine,
    UserRound,
    Users,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const navigation = [
    { label: "Calendar", to: "/instructor/calendar", icon: CalendarDays },
    { label: "Students", to: "/instructor/students", icon: Users },
    { label: "Check-in", to: "/instructor/check-in", icon: ScanLine },
];

export default function InstructorNavigation({
    calendarTo,
    contentWidthClassName = "w-[80%]",
}: {
    calendarTo: string;
    contentWidthClassName?: string;
}) {
    const { profile, signOut } = useAuth();
    const { pathname } = useLocation();
    const [signingOut, setSigningOut] = useState(false);
    const [error, setError] = useState("");
    const name =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        "Instructor";
    const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("");
    const isCalendarRelated =
        pathname.startsWith("/instructor/assessments/") ||
        pathname.startsWith("/instructor/reports/");

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

    return (
        <header className="shrink-0 border-b bg-background">
            <div
                className={cn(
                    "mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3",
                    contentWidthClassName,
                )}
            >
                <Link
                    to={calendarTo}
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
                        Instructor Portal
                    </span>
                </Link>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
                    <nav
                        aria-label="Instructor navigation"
                        className="order-3 flex w-full flex-wrap items-center gap-1 lg:order-0 lg:w-auto"
                    >
                        {navigation.map(({ label, to, icon: Icon }) => {
                            const active =
                                pathname === to ||
                                pathname.startsWith(`${to}/`) ||
                                (label === "Calendar" && isCalendarRelated);
                            return (
                                <Link
                                    key={to}
                                    to={label === "Calendar" ? calendarTo : to}
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
                        <DropdownMenuContent>
                            <div className="border-b px-2 py-2">
                                <p className="truncate font-medium">{name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {profile?.email}
                                </p>
                            </div>
                            <DropdownMenuItem render={<Link to="/instructor/profile" />}>
                                <UserRound aria-hidden="true" /> Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => void handleSignOut()}
                                disabled={signingOut}
                            >
                                <LogOut aria-hidden="true" />{" "}
                                {signingOut ? "Signing out…" : "Log out"}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            {error && (
                <p
                    role="alert"
                    className={cn(
                        "mx-auto pb-3 text-sm text-destructive",
                        contentWidthClassName,
                    )}
                >
                    {error}
                </p>
            )}
        </header>
    );
}
