import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Menu } from "lucide-react";
import { Link, useLocation } from "react-router";
import logo from "@/assets/logo.png";
import ThemeToggle from "@/components/theme-toggle";
import {
    Avatar,
    AvatarFallback,
    InstructorAvatar,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export type MobileNavigationLink = {
    label: string;
    to: string;
    icon: LucideIcon;
    active: boolean;
};

export default function MobileNavigation({
    homeTo = "/",
    links,
    onSignOut,
    signingOut,
    error,
    loading,
}: {
    homeTo?: string;
    links: MobileNavigationLink[];
    onSignOut?: () => Promise<void>;
    signingOut?: boolean;
    error?: string;
    loading?: boolean;
}) {
    const { profile } = useAuth();
    const { pathname, search } = useLocation();
    const isDesktop = useMediaQuery("(min-width: 1024px)");
    const [open, setOpen] = useState(false);
    const name =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        "Welcome";
    const role = profile
        ? {
            instructor: "Instructor",
            student: "Student",
            administrator: "Administrator",
        }[profile.role]
        : "Guest";
    const initials = name
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    useEffect(() => {
        setOpen(false);
    }, [pathname, search, isDesktop]);

    return (
        <header
            data-mobile-site-nav
            className="sticky top-0 z-40 h-[var(--mobile-site-nav-height)] shrink-0 border-b bg-background px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 lg:hidden"
        >
            <div className="flex h-11 items-center justify-between gap-3">
                <Link
                    to={homeTo}
                    aria-label="Aikido Shinju-Kai home"
                    className="flex min-h-11 min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <img
                        src={logo}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 shrink-0 object-contain"
                    />
                    <span className="min-w-0 leading-tight">
                        <span className="block text-[14px] font-semibold">
                            <span className="text-primary">Aikido</span>{" "}
                            <span className="whitespace-nowrap text-brand-red-ink">
                                Shinju-Kai
                            </span>
                        </span>
                        {profile?.role === "instructor" && (
                            <span className="mt-0.5 block text-3xs leading-none font-normal tracking-normal text-muted-foreground">
                                Instructor
                            </span>
                        )}
                    </span>
                </Link>
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger
                        aria-label="Open navigation menu"
                        render={
                            <Button
                                variant="outline"
                                className="h-11 gap-2 px-3 text-[14px]"
                            />
                        }
                    >
                        <Menu aria-hidden="true" className="size-4" />
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[calc(100%-2rem)] max-w-sm">
                        <SheetHeader>
                            <SheetTitle>Menu</SheetTitle>
                        </SheetHeader>
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
                            <div className="flex min-w-0 items-center gap-3 border-b pb-4">
                                {profile?.role === "instructor" ? (
                                    <InstructorAvatar
                                        profile={{ id: profile.id, name, role }}
                                        interactive={false}
                                        showName={false}
                                        avatarClassName="size-10"
                                    />
                                ) : (
                                    <Avatar className="size-10">
                                        <AvatarFallback>{initials}</AvatarFallback>
                                    </Avatar>
                                )}
                                <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                                    <p className="text-[16px] font-semibold">{name}</p>
                                    {profile?.email && (
                                        <p className="text-[13px] text-muted-foreground">
                                            {profile.email}
                                        </p>
                                    )}
                                    <p className="text-[13px] text-muted-foreground">{role}</p>
                                </div>
                            </div>
                            {loading ? (
                                <p role="status" className="text-sm text-muted-foreground">
                                    Loading account…
                                </p>
                            ) : (
                                <nav aria-label={`${role} navigation`} className="grid gap-2">
                                    {links.map(({ label, to, icon: Icon, active }) => (
                                        <Link
                                            key={to}
                                            to={to}
                                            onClick={() => setOpen(false)}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "flex min-h-12 items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-[16px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                                                active &&
                                                "border-primary bg-accent font-medium text-accent-foreground",
                                            )}
                                        >
                                            <Icon aria-hidden="true" className="size-5 shrink-0" />
                                            <span className="min-w-0 flex-1">{label}</span>
                                            {active && (
                                                <Check aria-hidden="true" className="size-4 shrink-0" />
                                            )}
                                        </Link>
                                    ))}
                                </nav>
                            )}
                            {onSignOut && (
                                <Button
                                    variant="outline"
                                    onClick={() => void onSignOut()}
                                    disabled={signingOut}
                                    className="h-11 w-full"
                                >
                                    {signingOut ? "Signing out…" : "Sign out"}
                                </Button>
                            )}
                            {error && (
                                <p
                                    role="alert"
                                    className="text-sm text-destructive [overflow-wrap:anywhere]"
                                >
                                    {error}
                                </p>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center justify-between border-t pt-4">
                            <span className="text-[14px]">Appearance</span>
                            <ThemeToggle />
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        </header>
    );
}
