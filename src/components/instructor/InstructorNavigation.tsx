import { Link, useLocation } from "react-router";
import { CalendarDays, Nfc, ScanLine, UserCircle, Users } from "lucide-react";
import logo from "@/assets/logo.png";
import ThemeToggle from "@/components/theme-toggle";
import { InstructorAvatar } from "@/components/ui/avatar";
import MobileNavigation from "@/components/MobileNavigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const navigation = [
    { label: "Calendar", to: "/instructor/calendar", icon: CalendarDays },
    { label: "Students", to: "/instructor/students", icon: Users },
    { label: "QR Check-in", to: "/instructor/check-in", icon: ScanLine },
    { label: "NFC Check-in", to: "/instructor/nfc_checkin", icon: Nfc },
];

export default function InstructorNavigation({
    calendarTo,
    contentWidthClassName = "w-[calc(100%-2rem)] lg:w-[80%]",
}: {
    calendarTo: string;
    contentWidthClassName?: string;
}) {
    const { profile } = useAuth();
    const { pathname } = useLocation();
    const name =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        "Instructor";
    const isCalendarRelated =
        pathname === "/instructor/dashboard" ||
        pathname.startsWith("/instructor/assessments/") ||
        pathname.startsWith("/instructor/reports/");

    return (
        <>
        <MobileNavigation homeTo={calendarTo} links={[
            ...navigation.map(({ label, to, icon }) => ({ label, to: label === "Calendar" ? calendarTo : to, icon,
                active: pathname === to || pathname.startsWith(`${to}/`) || (label === "Calendar" && isCalendarRelated) })),
            { label: "Profile", to: "/instructor/profile", icon: UserCircle, active: pathname === "/instructor/profile" },
        ]} />
        <header className="hidden shrink-0 border-b bg-background lg:block">
            <div
                className={cn(
                    "mx-auto flex flex-wrap items-center gap-y-2 py-3 lg:justify-between lg:gap-x-6 lg:gap-y-3 lg:px-6 lg:py-5",
                    contentWidthClassName,
                )}
            >
                <Link
                    to={calendarTo}
                    className="mr-auto flex min-h-11 min-w-0 items-center rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring lg:mr-0 lg:min-h-0"
                >
                    <img
                        src={logo}
                        alt="Aikido Shinju-Kai logo"
                        className="size-8 shrink-0 object-contain lg:size-10"
                        width={40}
                        height={40}
                    />
                    <div className="relative ml-2 leading-tight">
                        <p className="whitespace-nowrap text-xs lg:text-base">
                            <span className="text-primary">Aikido</span>{" "}
                            <span className="text-brand-red-ink">Shinju-Kai</span>
                        </p>
                        <p className="mt-0.5 text-3xs leading-none font-normal tracking-normal text-muted-foreground">
                            Instructor
                        </p>
                    </div>
                </Link>
                <div className="contents lg:flex lg:min-w-0 lg:flex-wrap lg:items-center lg:justify-between lg:gap-1">
                    <nav
                        aria-label="Instructor navigation"
                        className="hidden items-center gap-1 lg:flex"
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
                                        "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:gap-2 sm:px-3 sm:text-sm lg:min-h-10 lg:flex-none lg:px-3",
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
                    <Link
                        to="/instructor/profile"
                        aria-label={`View profile for ${name}`}
                        aria-current={
                            pathname === "/instructor/profile" ? "page" : undefined
                        }
                        className={cn(
                            "hidden size-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring lg:flex",
                            pathname === "/instructor/profile" && "bg-accent",
                        )}
                    >
                        <InstructorAvatar
                            profile={{ id: profile?.id ?? "", name, role: "Instructor" }}
                            interactive={false}
                            showName={false}
                            avatarClassName="size-7"
                            fallbackClassName="text-xs font-semibold"
                        />
                    </Link>
                </div>
            </div>
        </header>
        </>
    );
}
