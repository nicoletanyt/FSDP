import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MobileViewOption<T extends string> = {
    value: T;
    label: string;
    icon: LucideIcon;
    ariaLabel?: string;
};

// The phone calendar header shared by the instructor and admin calendars:
// month and year with a view picker, then Today / previous / next, optional
// extras (Add availability, Filter) and a legend popover.
export default function MobileCalendarHeader<T extends string>({
    date,
    view,
    views,
    onViewChange,
    stepUnit,
    onToday,
    onPrevious,
    onNext,
    extras,
    legendTitle = "Calendar colours",
    legend,
}: {
    date: Date;
    view: T;
    views: MobileViewOption<T>[];
    onViewChange: (view: T) => void;
    /** "month" or "day": names the previous/next buttons. */
    stepUnit: "month" | "day";
    onToday: () => void;
    onPrevious: () => void;
    onNext: () => void;
    extras?: ReactNode;
    legendTitle?: string;
    legend: ReactNode;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const active = views.find((option) => option.value === view) ?? views[0];
    const ActiveIcon = active.icon;
    return (
        <header className="-mx-4 -mt-4 space-y-3 border-b bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
                <h1 className="min-w-0 flex-1 text-[24px] leading-tight font-semibold tracking-tight">
                    {date.toLocaleDateString("en-GB", { month: "long" })}{" "}
                    <span className="text-[15px] font-normal text-muted-foreground">
                        {date.getFullYear()}
                    </span>
                </h1>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger
                        aria-label="Change calendar view"
                        aria-description={`Current view: ${active.label}`}
                        title={`${active.label} view`}
                        render={<Button variant="outline" size="icon-touch" className="rounded-full" />}
                    >
                        <ActiveIcon aria-hidden="true" className="size-5" />
                    </PopoverTrigger>
                    <PopoverContent className="w-56 gap-3 p-4">
                        <PopoverTitle className="text-[13px] text-muted-foreground">Calendar view</PopoverTitle>
                        <div role="group" aria-label="Calendar view" className="grid gap-2">
                            {views.map(({ value, label, icon: Icon, ariaLabel }) => (
                                <Button
                                    key={value}
                                    variant="ghost"
                                    data-calendar-view={value}
                                    aria-pressed={view === value}
                                    aria-label={ariaLabel}
                                    onClick={() => {
                                        onViewChange(value);
                                        setPickerOpen(false);
                                    }}
                                    className={cn(
                                        "h-11 justify-start gap-3 px-3 text-[15px] capitalize",
                                        view === value && "bg-accent text-accent-foreground",
                                    )}
                                >
                                    <Icon aria-hidden="true" className="size-4" />
                                    <span className="flex-1 text-left">{label}</span>
                                    {view === value && <Check aria-hidden="true" className="size-4" />}
                                </Button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-y-2">
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        onClick={onToday}
                        className="h-11 gap-1.5 rounded-full px-3 text-[14px] font-medium text-destructive"
                    >
                        Today
                    </Button>
                    <Button variant="ghost" size="icon-touch" aria-label={`Previous ${stepUnit}`} onClick={onPrevious}>
                        <ChevronLeft aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon-touch" aria-label={`Next ${stepUnit}`} onClick={onNext}>
                        <ChevronRight aria-hidden="true" />
                    </Button>
                </div>
                <div className="ml-auto flex items-center">
                    {extras}
                    <Popover>
                        <PopoverTrigger
                            aria-label="Calendar colours"
                            render={<Button variant="ghost" size="icon-touch" />}
                        >
                            <Info aria-hidden="true" className="size-4 text-muted-foreground" />
                        </PopoverTrigger>
                        <PopoverContent className="gap-2 text-[14px]">
                            <PopoverTitle>{legendTitle}</PopoverTitle>
                            {legend}
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </header>
    );
}
