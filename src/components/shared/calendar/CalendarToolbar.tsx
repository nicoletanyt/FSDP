import type { ReactNode } from "react";
import {
    CalendarDays as CalendarDaysIcon,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Info,
    List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type CalendarRange = "day" | "week" | "month";
export type CalendarDisplayMode = "timeline" | "list";

/**
 * The desktop calendar toolbar shared by the instructor and admin calendars:
 * Today / previous / next, the visible range heading, range and display pickers
 * (with D/W/M/T/L shortcuts) and a legend popover.
 */
export default function CalendarToolbar({
    view,
    onViewChange,
    displayMode,
    onDisplayModeChange,
    heading,
    onToday,
    onPrevious,
    onNext,
    actions,
    legend,
    filter,
}: {
    view: CalendarRange;
    onViewChange: (view: CalendarRange) => void;
    displayMode: CalendarDisplayMode;
    onDisplayModeChange: (mode: CalendarDisplayMode) => void;
    heading: string;
    onToday: () => void;
    onPrevious: () => void;
    onNext: () => void;
    /** Extra controls placed before the range picker. */
    actions?: ReactNode;
    /** Body of the "Calendar legend" popover. */
    legend: ReactNode;
    /** The Filter button, always last (far right). */
    filter?: ReactNode;
}) {
    const viewLabel = `${view[0].toUpperCase()}${view.slice(1)}`;
    return (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 w-full items-center gap-3 lg:w-auto lg:gap-4">
                <div role="group" aria-label={`${viewLabel} navigation`} className="flex shrink-0 items-center gap-1 sm:gap-2">
                    <Button variant="outline" onClick={onToday} className="mr-1 h-11 px-4 lg:h-10">
                        Today
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-lg"
                        className="size-11 lg:size-10"
                        aria-label={`Previous ${view}`}
                        onClick={onPrevious}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-lg"
                        className="size-11 lg:size-10"
                        aria-label={`Next ${view}`}
                        onClick={onNext}
                    >
                        <ChevronRight aria-hidden="true" />
                    </Button>
                </div>
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium lg:flex-none" aria-live="polite">
                    {heading}
                </h2>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:w-auto">
                {actions}
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={<Button variant="outline" className="h-11 min-w-0 flex-1 justify-between gap-1 px-3 sm:min-w-28 sm:flex-none sm:gap-3 sm:px-4 lg:h-10" />}
                        aria-label={`Calendar date range: ${view}`}
                    >
                        {viewLabel}
                        <ChevronDown aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="p-1.5">
                        <DropdownMenuRadioGroup
                            value={view}
                            onValueChange={(value) => {
                                if (value === "day" || value === "week" || value === "month") onViewChange(value);
                            }}
                            aria-label="Calendar date range"
                        >
                            <DropdownMenuRadioItem value="day" closeOnClick aria-keyshortcuts="d" className="py-2.5 pr-4 pl-9">
                                Day<Kbd className="ml-auto" aria-hidden="true">D</Kbd>
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="week" closeOnClick aria-keyshortcuts="w" className="py-2.5 pr-4 pl-9">
                                Week<Kbd className="ml-auto" aria-hidden="true">W</Kbd>
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="month" closeOnClick aria-keyshortcuts="m" className="py-2.5 pr-4 pl-9">
                                Month<Kbd className="ml-auto" aria-hidden="true">M</Kbd>
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                {view !== "month" && <TooltipProvider>
                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger render={
                                <DropdownMenuTrigger
                                    render={<Button variant="outline" className="h-11 min-w-0 flex-1 justify-between gap-1 px-3 sm:min-w-28 sm:flex-none sm:gap-3 sm:px-4 lg:h-10" />}
                                    aria-label={`Calendar display mode: ${displayMode}`}
                                />
                            }>
                                {displayMode === "timeline" ? <CalendarDaysIcon aria-hidden="true" /> : <List aria-hidden="true" />}
                                {displayMode === "timeline" ? "Timeline" : "List"}
                                <ChevronDown aria-hidden="true" />
                            </TooltipTrigger>
                            <TooltipContent>Calendar display mode</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent className="p-1.5">
                            <DropdownMenuRadioGroup
                                aria-label="Calendar display mode"
                                value={displayMode}
                                onValueChange={(value) => {
                                    if (value === "timeline" || value === "list") onDisplayModeChange(value);
                                }}
                            >
                                <DropdownMenuRadioItem value="timeline" closeOnClick aria-keyshortcuts="t" className="gap-3 py-2.5 pr-4 pl-9">
                                    <CalendarDaysIcon aria-hidden="true" className="size-4" />Timeline<Kbd className="ml-auto" aria-hidden="true">T</Kbd>
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="list" closeOnClick aria-keyshortcuts="l" className="gap-3 py-2.5 pr-4 pl-9">
                                    <List aria-hidden="true" className="size-4" />List<Kbd className="ml-auto" aria-hidden="true">L</Kbd>
                                </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TooltipProvider>}
                <Popover>
                    <PopoverTrigger
                        render={<Button variant="ghost" size="icon-lg" className="size-11 lg:size-10" />}
                        aria-label="Calendar information"
                        title="Calendar information"
                    >
                        <Info aria-hidden="true" className="size-5" />
                    </PopoverTrigger>
                    <PopoverContent className="max-h-[min(36rem,calc(100dvh-3rem))] w-96 overflow-y-auto">
                        <PopoverTitle>Calendar legend</PopoverTitle>
                        {legend}
                    </PopoverContent>
                </Popover>
                {filter}
            </div>
        </div>
    );
}
