import { Link, useLocation } from "react-router";
import { CalendarDays, ScanLine, Users } from "lucide-react";
import logo from "@/assets/logo.png";
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
    const { profile } = useAuth();
    const { pathname } = useLocation();
    const name =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        "Instructor";
    const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("");
    const isCalendarRelated =
        pathname === "/instructor/dashboard" ||
        pathname.startsWith("/instructor/assessments/") ||
        pathname.startsWith("/instructor/reports/");

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
                    <div className="relative ml-2 leading-tight">
                        <p className="whitespace-nowrap text-base">
                            <span className="text-primary">Aikido</span>{" "}
                            <span className="text-brand-red-ink">Shinju-Kai</span>
                        </p>
                        <p className="mt-0.5 text-[10px] leading-none font-normal tracking-normal text-muted-foreground">
                            Instructor
                        </p>
                    </div>
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
                    <Link
                        to="/instructor/profile"
                        aria-label={`View profile for ${name}`}
                        aria-current={
                            pathname === "/instructor/profile" ? "page" : undefined
                        }
                        className={cn(
                            "flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                            pathname === "/instructor/profile" && "bg-accent",
                        )}
                    >
                        <span
                            className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                            aria-hidden="true"
                        >
                            {initials}
                        </span>
                    </Link>
                </div>
            </div>
        </header>
    );
}
