import { Link, useLocation } from "react-router";
import { CalendarDays, Nfc, ScanLine, ShieldCheck, UserCircle, Users } from "lucide-react";
import logo from "@/assets/logo.png";
import ThemeToggle from "@/components/theme-toggle";
import InstructorAccountMenu from "@/components/instructor/InstructorAccountMenu";
import MobileNavigation from "@/components/MobileNavigation";
import OverflowNav from "@/components/OverflowNav";
import { cn } from "@/lib/utils";
import { useMyGradingPanels } from "@/hooks/use-my-grading-panels";

const baseNavigation = [
    { label: "Calendar", to: "/instructor/calendar", icon: CalendarDays },
    { label: "Students", to: "/instructor/students", icon: Users },
    { label: "QR Check-in", to: "/instructor/check-in", icon: ScanLine },
    { label: "NFC Check-in", to: "/instructor/nfc_checkin", icon: Nfc },
];
// Shown only to instructors who sit on at least one grading panel.
const gradingsLink = { label: "Gradings", to: "/instructor/gradings", icon: ShieldCheck };

export function instructorNavigation(onGradingPanel: boolean) {
    return onGradingPanel
        ? [...baseNavigation.slice(0, 2), gradingsLink, ...baseNavigation.slice(2)]
        : baseNavigation;
}

export default function InstructorNavigation({
    calendarTo,
    contentWidthClassName = "w-[calc(100%-2rem)] lg:w-[80%]",
}: {
    calendarTo: string;
    contentWidthClassName?: string;
}) {
    const { pathname } = useLocation();
    const panels = useMyGradingPanels();
    const navigation = instructorNavigation(Boolean(panels.data?.length));
    const isCalendarRelated =
        pathname === "/instructor/dashboard" ||
        pathname.startsWith("/instructor/assessments/");

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
                    "mx-auto flex items-center gap-6 px-6 py-5",
                    contentWidthClassName,
                )}
            >
                <Link
                    to={calendarTo}
                    className="flex shrink-0 items-center rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
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
                <OverflowNav
                    label="Instructor navigation"
                    items={navigation.map(({ label, to, icon }) => ({
                        label,
                        to: label === "Calendar" ? calendarTo : to,
                        icon,
                        active:
                            pathname === to ||
                            pathname.startsWith(`${to}/`) ||
                            (label === "Calendar" && isCalendarRelated),
                    }))}
                />
                <div className="flex shrink-0 items-center gap-1">
                    <ThemeToggle />
                    <InstructorAccountMenu />
                </div>
            </div>
        </header>
        </>
    );
}
