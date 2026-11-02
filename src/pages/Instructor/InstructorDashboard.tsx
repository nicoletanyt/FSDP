import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock3,
    CalendarDays as CalendarDaysIcon,
    Info,
    List,
    MapPin,
    Plus,
    Users,
} from "lucide-react";
import ClassSessionDetails from "@/components/instructor/ClassSessionDetails";
import DayClassDetails from "@/components/instructor/DayClassDetails";
import SelectedClassIndicator from "@/components/instructor/SelectedClassIndicator";
import CalendarTimeline from "@/components/instructor/CalendarTimeline";
import {
    AvailabilityCard,
    AvailabilityDialog,
} from "@/components/instructor/CalendarAvailability";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    availabilityError,
    minutesTime,
    mockAvailability,
    timeMinutes,
} from "@/lib/instructor-availability";
import type { AvailabilityRange, AvailabilitySlot } from "@/lib/instructor-availability";
import {
    addDays,
    addMonths,
    classTypes,
    dateKey,
    dojoCapacities,
    eventsForDate,
    findCalendarEvent,
    getEventStyle,
    formatTime,
    fullDate,
    monthDates,
    parseCalendarDate,
    weekDates,
    weekLabel,
} from "@/lib/instructor-calendar";
import type { CalendarEvent } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";

type CalendarView = "day" | "week" | "month";
type CalendarProps = {
    date: Date;
    today: Date;
    expandedClassId: string | null;
    onSelectDate: (date: Date) => void;
    onToggleClass: (event: CalendarEvent) => void;
    availability: AvailabilitySlot[];
    selectedAvailabilityId: string | null;
    onSelectAvailability: (slot: AvailabilitySlot) => void;
};

function EventCard({
    event,
    expanded,
    onToggle,
    layout = "week",
    detailsInPanel = false,
}: {
    event: CalendarEvent;
    expanded: boolean;
    onToggle: () => void;
    layout?: "day" | "week" | "panel";
    detailsInPanel?: boolean;
}) {
    const showSummary = layout !== "week";
    const style = getEventStyle(event);
    const capacity = dojoCapacities[event.dojo];
    return (
        <Card
            size="sm"
            className={cn(
                "gap-0 rounded-lg border py-0 shadow-none ring-0 transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                style.card,
                layout === "panel" && "h-full min-h-0",
                expanded && (detailsInPanel
                    ? "relative z-10 border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "border-primary/40 ring-1 ring-primary/15"),
            )}
        >
            <Button
                variant="ghost"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-pressed={detailsInPanel ? expanded : undefined}
                aria-controls={detailsInPanel && !expanded ? undefined : `${showSummary || detailsInPanel ? "attendance" : "details"}-${event.id}`}
                aria-label={`${event.name}, ${fullDate(event.date)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}, ${event.dojo}, ${event.studentIds.length} of ${capacity} students. ${expanded ? "Collapse" : "Expand"} class details`}
                className={cn(
                    "h-auto w-full flex-col items-stretch gap-3 rounded-lg p-3 text-left whitespace-normal text-inherit hover:bg-foreground/5 hover:text-inherit aria-expanded:text-inherit focus-visible:-outline-offset-2",
                    showSummary && "p-4",
                    layout === "day" && "gap-4 p-5",
                )}
            >
                <span
                    className={cn(
                        "flex items-start justify-between gap-2 text-xs leading-snug font-semibold",
                        layout === "day" && "text-sm sm:text-base",
                        layout === "panel" && "text-lg leading-tight sm:text-xl",
                    )}
                >
                    <span className="min-w-0 wrap-break-word">
                        {event.name}
                    </span>
                    {expanded && detailsInPanel ? <SelectedClassIndicator className="mt-0.5" /> : <ChevronDown
                        aria-hidden="true"
                        className={cn(
                            "mt-0.5 size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                            expanded && "rotate-180",
                            layout === "panel" && "mt-1 size-4",
                        )}
                    />}
                </span>
                <div
                    className={cn(
                        "flex gap-2",
                        expanded || showSummary
                            ? "flex-row flex-wrap items-center justify-between"
                            : "flex-col items-start",
                    )}
                >
                    <span className="flex items-center gap-1.5 text-2xs font-normal text-current opacity-80">
                        <Clock3
                            aria-hidden="true"
                            className="mt-0.5 size-3 shrink-0"
                        />
                        <span className="min-w-0 wrap-break-word">
                            {formatTime(event.startTime)} –{" "}
                            {formatTime(event.endTime)}
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-2xs font-normal text-current opacity-80">
                        <MapPin
                            aria-hidden="true"
                            className="size-3 shrink-0"
                        />{" "}
                        <span className="min-w-0 wrap-break-word">
                            {event.dojo}
                        </span>
                    </span>
                </div>
                <span className="flex items-center gap-1.5 text-2xs font-normal opacity-80">
                    <Users aria-hidden="true" className="size-3 shrink-0" />
                    {event.studentIds.length}/{capacity} students
                </span>
            </Button>
            {!detailsInPanel && (showSummary ? (
                <ClassSessionDetails
                    event={event}
                    summary
                    expanded={expanded}
                    showAttendanceToggle={layout !== "panel"}
                    fillHeight={layout === "panel"}
                    onToggle={onToggle}
                />
            ) : (
                <div
                    id={`details-${event.id}`}
                    aria-hidden={!expanded}
                    inert={!expanded}
                    className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none",
                        expanded
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0",
                    )}
                >
                    <div className="min-h-0 overflow-hidden">
                        <ClassSessionDetails event={event} />
                    </div>
                </div>
            ))}
        </Card>
    );
}

function CalendarDays({
    date,
    today,
    view,
    expandedClassId,
    expandSelectedDay,
    onSelectDate,
    onToggleClass,
    availability,
    selectedAvailabilityId,
    onSelectAvailability,
}: CalendarProps & {
    view: "day" | "week";
    expandSelectedDay: boolean;
}) {
    const selectedDateButton = useRef<HTMLButtonElement>(null);
    const selectedKey = dateKey(date);
    const days = view === "day" ? [date] : weekDates(date);
    useEffect(() => {
        selectedDateButton.current?.scrollIntoView({
            block: "nearest",
            inline: "center",
        });
    }, [selectedKey, view]);

    return (
        <div
            aria-label={
                view === "day"
                    ? "Daily class calendar"
                    : "Weekly class calendar"
            }
            className="flex min-h-0 flex-1 flex-col gap-3"
        >
            {view === "week" && (
                <div
                    role="group"
                    aria-label="Select agenda day"
                    className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:hidden"
                >
                    {days.map((day) => {
                        const isSelected = dateKey(day) === selectedKey;
                        const isToday = dateKey(day) === dateKey(today);
                        return (
                            <Button
                                key={dateKey(day)}
                                ref={
                                    isSelected ? selectedDateButton : undefined
                                }
                                variant="outline"
                                aria-pressed={isSelected}
                                aria-current={isToday ? "date" : undefined}
                                aria-label={`Select and expand ${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
                                onClick={() => onSelectDate(day)}
                                className={cn(
                                    "h-auto cursor-pointer flex-col gap-1 px-3 py-2 transition-colors duration-200",
                                    isSelected && "bg-accent hover:bg-accent",
                                )}
                            >
                                <span className="text-2xs font-normal">
                                    {day.toLocaleDateString("en-GB", {
                                        weekday: "short",
                                    })}
                                </span>
                                <span
                                    className={cn(
                                        "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                                        isToday &&
                                        "bg-primary text-primary-foreground",
                                    )}
                                >
                                    {fullDate(day)}
                                </span>
                            </Button>
                        );
                    })}
                </div>
            )}
            <div
                className={cn(
                    "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl lg:flex-row",
                    view === "week" && "border lg:divide-x",
                )}
            >
                {days.map((day) => {
                    const events = eventsForDate(day).filter(
                        (event) => view === "day" || event.type === "training",
                    );
                    const isToday = dateKey(day) === dateKey(today);
                    const isSelected = dateKey(day) === dateKey(date);
                    const isExpanded = isSelected && expandSelectedDay;
                    const slots = availability.filter((slot) => dateKey(slot.date) === dateKey(day));
                    const entries = [
                        ...events.map((event) => ({ id: event.id, startTime: event.startTime, event, slot: null })),
                        ...slots.map((slot) => ({ id: slot.id, startTime: slot.startTime, event: null, slot })),
                    ].sort((a, b) => a.startTime.localeCompare(b.startTime));
                    return (
                        <section
                            key={dateKey(day)}
                            aria-label={day.toLocaleDateString("en-GB", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                            })}
                            className={cn(
                                "min-h-0 min-w-0 grow flex-col bg-card transition-[flex-basis,flex-grow,background-color,box-shadow] duration-200 ease-in-out motion-reduce:transition-none lg:shrink-0",
                                isSelected ? "flex" : "hidden lg:flex",
                                isExpanded && view === "week"
                                    ? "bg-accent/60 lg:grow-0 lg:basis-[clamp(300px,24vw,320px)]"
                                    : "lg:grow lg:basis-0",
                            )}
                            data-selected={isExpanded}
                        >
                            {view === "week" && (
                                <header
                                    className={cn(
                                        "h-20 shrink-0 border-b p-2 transition-colors duration-200",
                                        isExpanded && "bg-accent/70",
                                    )}
                                >
                                    <Button
                                        variant="ghost"
                                        onClick={() => onSelectDate(day)}
                                        aria-label={`Select and expand ${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
                                        aria-current={
                                            isToday ? "date" : undefined
                                        }
                                        aria-pressed={isExpanded}
                                        className="h-full w-full cursor-pointer flex-col items-center gap-1 px-0 py-1 transition-colors duration-200"
                                    >
                                        <span
                                            className={cn(
                                                "flex h-6 shrink-0 items-center justify-center rounded-full px-1.5 text-3xs font-semibold tabular-nums",
                                                isExpanded && "text-xs",
                                                isToday &&
                                                "bg-primary text-primary-foreground",
                                            )}
                                        >
                                            {fullDate(day)}
                                        </span>
                                        <span className="h-5 max-w-full shrink-0 truncate px-2 text-xs font-normal text-muted-foreground">
                                            {day.toLocaleDateString("en-GB", {
                                                weekday: isExpanded
                                                    ? "long"
                                                    : "short",
                                            })}
                                            {isToday &&
                                                isExpanded &&
                                                " · Today"}
                                        </span>
                                    </Button>
                                </header>
                            )}
                            <div
                                className={cn(
                                    "min-h-0 flex-1 overflow-y-auto",
                                    view === "day"
                                        ? "grid auto-rows-max items-start gap-4 bg-muted/30 p-2 xl:grid-cols-2"
                                        : "space-y-3 p-3",
                                )}
                            >
                                {entries.length ? (
                                    entries.map(({ event, slot, id }) => event ? (
                                        <EventCard
                                            key={id}
                                            event={event}
                                            layout={view}
                                            detailsInPanel
                                            expanded={
                                                isSelected &&
                                                expandedClassId === event.id
                                            }
                                            onToggle={() =>
                                                onToggleClass(event)
                                            }
                                        />
                                    ) : slot && (
                                        <AvailabilityCard key={id} slot={slot} selected={selectedAvailabilityId === id} onSelect={() => onSelectAvailability(slot)} />
                                    ))
                                ) : (
                                    <p className="px-1 py-3 text-xs text-muted-foreground">
                                        No classes scheduled
                                    </p>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

function CalendarMonth({
    date,
    today,
    expandedClassId,
    onSelectDate,
    onToggleClass,
    availability,
    selectedAvailabilityId,
    onSelectAvailability,
}: CalendarProps) {
    const selectedDay = useRef<HTMLElement>(null);
    const selectedKey = dateKey(date);
    const days = monthDates(date);
    useEffect(() => {
        selectedDay.current?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
        });
    }, [selectedKey]);

    return (
        <div
            aria-label="Monthly class calendar"
            className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
            <div
                aria-label="Month dates"
                className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain rounded-xl border bg-card"
            >
                <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 border-b bg-card">
                    {days.slice(0, 7).map((day) => (
                        <div
                            key={day.getDay()}
                            className="py-2 text-center text-2xs font-medium text-muted-foreground sm:text-xs"
                        >
                            {day.toLocaleDateString("en-GB", {
                                weekday: "short",
                            })}
                        </div>
                    ))}
                </div>
                <div
                    className="grid min-h-0 flex-1 grid-cols-7 [--month-row-height:144px] xl:[--month-row-height:112px]"
                    style={{
                        gridTemplateRows: `repeat(${days.length / 7}, minmax(var(--month-row-height), 1fr))`,
                    }}
                >
                    {days.map((day) => {
                        const key = dateKey(day);
                        const isSelected = key === selectedKey;
                        const isToday = key === dateKey(today);
                        const isCurrentMonth =
                            day.getMonth() === date.getMonth();
                        const events = eventsForDate(day);
                        return (
                            <section
                                key={key}
                                ref={isSelected ? selectedDay : undefined}
                                aria-label={day.toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                })}
                                onClick={(event) => {
                                    if (event.target === event.currentTarget)
                                        onSelectDate(day);
                                }}
                                className={cn(
                                    "flex min-w-0 flex-col items-start gap-0.5 overflow-y-auto border-r border-b border-border/60 p-1 nth-[7n]:border-r-0 sm:p-1.5",
                                    !isCurrentMonth &&
                                    "bg-muted/40 text-muted-foreground",
                                    isSelected &&
                                    "bg-primary/5 ring-1 ring-primary/40 ring-inset",
                                )}
                            >
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Select ${day.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
                                    aria-current={isToday ? "date" : undefined}
                                    aria-pressed={isSelected}
                                    onClick={() => onSelectDate(day)}
                                    className={cn(
                                        "size-6 rounded-full text-2xs tabular-nums sm:size-7 sm:text-xs",
                                        isSelected &&
                                        "bg-primary/10 font-semibold text-primary",
                                        isToday &&
                                        "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                                    )}
                                >
                                    {day.getDate()}
                                </Button>
                                {events.map((event) => (
                                    <Button
                                        key={event.id}
                                        variant="ghost"
                                        title={`${event.name} · ${formatTime(event.startTime)} · ${event.studentIds.length}/${dojoCapacities[event.dojo]} students`}
                                        aria-label={`${event.name}, ${fullDate(day)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}. ${expandedClassId === event.id ? "Collapse" : "Expand"} class details`}
                                        aria-expanded={
                                            expandedClassId === event.id
                                        }
                                        aria-pressed={expandedClassId === event.id}
                                        aria-controls={
                                            expandedClassId === event.id
                                                ? `attendance-${event.id}`
                                                : undefined
                                        }
                                        onClick={() => onToggleClass(event)}
                                        className={cn(
                                            "h-auto min-h-5 w-full min-w-0 flex-col items-start gap-0 rounded border-0 px-1 py-0.5 text-left text-[11px] leading-tight xl:flex-row xl:items-center xl:gap-1",
                                            getEventStyle(event).card,
                                            expandedClassId === event.id &&
                                            "relative z-[1] pr-5 ring-2 ring-primary ring-offset-1 ring-offset-background",
                                        )}
                                    >
                                        {expandedClassId === event.id && <SelectedClassIndicator className="absolute top-0.5 right-0.5 size-3.5" />}
                                        <span className="w-full min-w-0 truncate font-medium xl:w-auto xl:flex-1">
                                            {event.name}
                                        </span>
                                        <span className="max-w-full shrink-0 truncate font-normal opacity-80">
                                            {formatTime(event.startTime)}
                                        </span>
                                    </Button>
                                ))}
                                {availability.filter((slot) => dateKey(slot.date) === key).map((slot) => (
                                    <AvailabilityCard key={slot.id} slot={slot} compact selected={selectedAvailabilityId === slot.id} onSelect={() => onSelectAvailability(slot)} />
                                ))}
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function InstructorDashboard() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [weekOverview, setWeekOverview] = useState(false);
    const [displayMode, setDisplayMode] = useState<"timeline" | "list">("list");
    const [dayDisplayMode, setDayDisplayMode] = useState<"timeline" | "list">("timeline");
    const [timelineFocusRequest, setTimelineFocusRequest] = useState(0);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, []);
    const requestedView = searchParams.get("view");
    const view: CalendarView =
        requestedView === "day" || requestedView === "month"
            ? requestedView
            : "week";
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [availability, setAvailability] = useState<AvailabilitySlot[]>(() =>
        mockAvailability(today),
    );
    const [selectedAvailabilityId, setSelectedAvailabilityId] = useState<string | null>(null);
    const [availabilityDialog, setAvailabilityDialog] = useState<{
        range: AvailabilityRange;
        editingId?: string;
    } | null>(null);
    const requestedEvent = findCalendarEvent(
        searchParams.get("session") ?? searchParams.get("class") ?? undefined,
    );
    const requestedSession = requestedEvent;
    const selectedDate =
        parseCalendarDate(searchParams.get("date")) ??
        requestedSession?.date ??
        today;
    const selectedDateKey = dateKey(selectedDate);
    const expandedClassId =
        requestedSession &&
            dateKey(requestedSession.date) === dateKey(selectedDate)
            ? requestedSession.id
            : null;
    const selectedAvailability = availability.find((slot) =>
        slot.id === selectedAvailabilityId && dateKey(slot.date) === dateKey(selectedDate),
    );

    function updateSelection(
        date: Date,
        sessionId: string | null = null,
        overview = false,
        nextView?: CalendarView,
    ) {
        setSelectedAvailabilityId(null);
        setWeekOverview(overview);
        const next = new URLSearchParams(searchParams);
        next.set("date", dateKey(date));
        if (nextView) next.set("view", nextView);
        next.delete("class");
        if (sessionId) next.set("session", sessionId);
        else next.delete("session");
        if (next.toString() !== searchParams.toString()) setSearchParams(next);
    }

    function selectDay(date: Date) {
        updateSelection(
            date,
            dateKey(date) === dateKey(selectedDate) ? expandedClassId : null,
        );
    }

    function selectMonthDate(date: Date) {
        updateSelection(date, null, false, "day");
    }

    function selectAvailability(slot: AvailabilitySlot) {
        updateSelection(slot.date);
        setSelectedAvailabilityId(slot.id);
        setAvailabilityDialog({ range: slot, editingId: slot.id });
    }

    function selectRange(range: AvailabilityRange) {
        updateSelection(range.date);
        setAvailabilityDialog({ range });
    }

    function addAvailability() {
        const currentTime = new Date();
        let date = selectedDate < today ? today : selectedDate;
        let start = dateKey(date) === dateKey(currentTime)
            ? Math.max(8 * 60, (Math.floor((currentTime.getHours() * 60 + currentTime.getMinutes()) / 30) + 1) * 30)
            : 8 * 60;
        // Prefer the first free half hour so the manual dialog starts with a usable range.
        for (let attempt = 0; attempt < 56; attempt++) {
            if (start >= 22 * 60) {
                date = addDays(date, 1);
                start = 8 * 60;
            }
            const range = {
                date,
                startTime: minutesTime(start),
                endTime: minutesTime(start + 30),
            };
            if (!availabilityError(range, availability, undefined, currentTime)) {
                selectRange(range);
                return;
            }
            start += 30;
        }
        selectRange({ date: addDays(date, 1), startTime: "08:00", endTime: "08:30" });
    }

    function deleteAvailability() {
        const id = availabilityDialog?.editingId;
        if (!id) return;
        setAvailability((slots) => slots.filter((slot) => slot.id !== id));
        setSelectedAvailabilityId(null);
        setAvailabilityDialog(null);
    }

    function navigateDate(direction: number) {
        if (view !== "week") {
            updateSelection(
                view === "month"
                    ? addMonths(selectedDate, direction)
                    : addDays(selectedDate, direction),
            );
            return;
        }
        const nextDate = addDays(selectedDate, direction * 7);
        const includesToday = weekDates(nextDate).some(
            (day) => dateKey(day) === dateKey(today),
        );
        updateSelection(includesToday ? today : nextDate, null, !includesToday);
    }

    const changeView = useCallback((value: unknown) => {
        if (value !== "day" && value !== "week" && value !== "month") return;
        const next = new URLSearchParams(searchParams);
        next.set("view", value);
        next.set("date", selectedDateKey);
        setSearchParams(next);
    }, [searchParams, selectedDateKey, setSearchParams]);

    useEffect(() => {
        function handleCalendarShortcut(event: KeyboardEvent) {
            if (
                event.defaultPrevented || event.repeat || event.isComposing ||
                event.ctrlKey || event.metaKey || event.altKey || availabilityDialog
            ) return;
            const target = event.target;
            if (target instanceof HTMLElement && (
                target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [role="combobox"]')
            )) return;
            // Hidden overlays such as the closed chatbot stay mounted in the page.
            const hasOpenOverlay = Array.from(document.querySelectorAll<HTMLElement>(
                '[role="dialog"], [role="alertdialog"], [role="menu"]',
            )).some((overlay) => {
                if (overlay.closest('[hidden], [inert], [aria-hidden="true"], [data-closed]')) return false;
                const style = window.getComputedStyle(overlay);
                return overlay.getClientRects().length > 0 && style.visibility === "visible" && style.opacity !== "0";
            });
            if (hasOpenOverlay) return;

            const key = event.key.toLowerCase();
            const nextView = key === "w" ? "week" : key === "d" ? "day" : key === "m" ? "month" : null;
            if (key === "escape" && expandedClassId) {
                event.preventDefault();
                setSearchParams((params) => {
                    const next = new URLSearchParams(params);
                    next.set("date", selectedDateKey);
                    next.delete("session");
                    next.delete("class");
                    return next;
                });
            } else if (nextView) {
                event.preventDefault();
                changeView(nextView);
            } else if (key === "t" || key === "l") {
                event.preventDefault();
                if (view === "day") setDayDisplayMode(key === "t" ? "timeline" : "list");
                else setDisplayMode(key === "t" ? "timeline" : "list");
                if (view === "month") changeView("week");
            }
        }

        window.addEventListener("keydown", handleCalendarShortcut);
        return () => window.removeEventListener("keydown", handleCalendarShortcut);
    }, [availabilityDialog, changeView, expandedClassId, selectedDateKey, setSearchParams, view]);

    const heading =
        view === "week"
            ? weekLabel(selectedDate)
            : selectedDate.toLocaleDateString("en-GB", {
                ...(view === "day"
                    ? { weekday: "long", day: "numeric" }
                    : {}),
                month: "long",
                year: "numeric",
            });
    const calendarProps: CalendarProps = {
        date: selectedDate,
        today,
        expandedClassId,
        onSelectDate: selectDay,
        onToggleClass: (event) =>
            updateSelection(
                event.date,
                expandedClassId === event.id ? null : event.id,
            ),
        availability,
        selectedAvailabilityId: selectedAvailability?.id ?? null,
        onSelectAvailability: selectAvailability,
    };

    const activeDisplayMode = view === "day" ? dayDisplayMode : displayMode;
    const isTimeline = view !== "month" && activeDisplayMode === "timeline";
    const showSidePanel = expandedClassId !== null;

    return (
        <section className="flex min-h-0 flex-1 flex-col gap-4">
            <header className="shrink-0">
                <h1 className="text-3xl font-semibold tracking-tight">
                    Your calendar
                </h1>
            </header>
            <section className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                        <div
                            role="group"
                            aria-label={`${view[0].toUpperCase()}${view.slice(1)} navigation`}
                            className="flex items-center gap-2"
                        >
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const now = new Date();
                                    setNow(now);
                                    setTimelineFocusRequest(request => request + 1);
                                    updateSelection(
                                        new Date(
                                            now.getFullYear(),
                                            now.getMonth(),
                                            now.getDate(),
                                        ),
                                    );
                                }}
                                className="mr-1 h-10 px-4"
                            >
                                Today
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                className="size-10"
                                aria-label={`Previous ${view}`}
                                onClick={() => navigateDate(-1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                className="size-10"
                                aria-label={`Next ${view}`}
                                onClick={() => navigateDate(1)}
                            >
                                <ChevronRight aria-hidden="true" />
                            </Button>
                        </div>
                        <h2 className="text-sm font-medium" aria-live="polite">
                            {heading}
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button variant="outline" onClick={addAvailability} className="h-10 gap-2 px-4">
                            <Plus aria-hidden="true" />Add Availability
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={<Button variant="outline" className="h-10 min-w-28 justify-between gap-3 px-4" />}
                                aria-label={`Calendar date range: ${view}`}
                            >
                                {view[0].toUpperCase()}{view.slice(1)}
                                <ChevronDown aria-hidden="true" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="p-1.5">
                                <DropdownMenuRadioGroup value={view} onValueChange={changeView} aria-label="Calendar date range">
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
                                            render={<Button variant="outline" className="h-10 min-w-28 justify-between gap-3 px-4" />}
                                            aria-label={`Calendar display mode: ${activeDisplayMode}`}
                                        />
                                    }>
                                        {activeDisplayMode === "timeline" ? <CalendarDaysIcon aria-hidden="true" /> : <List aria-hidden="true" />}
                                        {activeDisplayMode === "timeline" ? "Timeline" : "List"}
                                        <ChevronDown aria-hidden="true" />
                                    </TooltipTrigger>
                                    <TooltipContent>Calendar display mode</TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent className="p-1.5">
                                    <DropdownMenuRadioGroup
                                        aria-label="Calendar display mode"
                                        value={activeDisplayMode}
                                        onValueChange={(value) => {
                                            if (value === "timeline" || value === "list") {
                                                if (view === "day") setDayDisplayMode(value);
                                                else setDisplayMode(value);
                                            }
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
                                render={<Button variant="ghost" size="icon-lg" className="size-10" />}
                                aria-label="Calendar information"
                                title="Calendar information"
                            >
                                <Info aria-hidden="true" className="size-5" />
                            </PopoverTrigger>
                            <PopoverContent className="max-h-[min(36rem,calc(100dvh-3rem))] w-96 overflow-y-auto">
                                <PopoverTitle>Calendar legend</PopoverTitle>
                                <p className="-mt-2 text-xs text-muted-foreground">Classes · 60 minutes each</p>
                                <ul className="space-y-3 text-xs">
                                    {Object.entries(classTypes).map(([type, style]) => (
                                        <li key={type} className="grid grid-cols-[9.5rem_minmax(0,1fr)] items-center gap-3">
                                            <span className={cn("w-fit rounded-full border px-2 py-1 text-[10px] uppercase", style.badge)}>{style.label}</span>
                                            <span className="text-muted-foreground">{style.description}</span>
                                        </li>
                                    ))}
                                </ul>
                                <ul className="flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
                                    <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />Availability</li>
                                </ul>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <div className={cn(
                    "flex min-h-0 flex-1 flex-col",
                    showSidePanel && (view === "day"
                        ? "gap-3 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1"
                        : "grid grid-cols-1 grid-rows-[repeat(2,minmax(320px,1fr))] gap-3 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1 lg:overflow-hidden"),
                )}>
                    {view === "month" ? (
                        <CalendarMonth {...calendarProps} onSelectDate={selectMonthDate} />
                    ) : isTimeline ? (
                        <CalendarTimeline
                            date={selectedDate}
                            now={now}
                            view={view}
                            focusRequest={timelineFocusRequest}
                            slots={availability}
                            selectedId={selectedAvailability?.id ?? expandedClassId}
                            onSelectClass={calendarProps.onToggleClass}
                            onSelectAvailability={selectAvailability}
                            onSelectRange={selectRange}
                            onSelectDate={selectDay}
                        />
                    ) : (
                        <CalendarDays
                            {...calendarProps}
                            view={view}
                            expandSelectedDay={
                                view === "day" ||
                                !weekOverview ||
                                expandedClassId !== null
                            }
                        />
                    )}
                    {showSidePanel && requestedSession && (view === "day" ? (
                        <DayClassDetails onClose={() => updateSelection(selectedDate)}>
                            <EventCard
                                key={requestedSession.id}
                                event={requestedSession}
                                layout="panel"
                                expanded
                                onToggle={() => updateSelection(selectedDate)}
                            />
                        </DayClassDetails>
                    ) : (
                        <aside aria-label="Calendar selection details" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                            <EventCard
                                key={requestedSession.id}
                                event={requestedSession}
                                layout="panel"
                                expanded
                                onToggle={() => updateSelection(selectedDate)}
                            />
                        </aside>
                    ))}
                </div>
            </section>
            {availabilityDialog && <AvailabilityDialog
                key={`${availabilityDialog.editingId ?? "new"}-${dateKey(availabilityDialog.range.date)}-${availabilityDialog.range.startTime}`}
                initial={availabilityDialog.range}
                editingId={availabilityDialog.editingId}
                slots={availability}
                onClose={() => setAvailabilityDialog(null)}
                onDelete={deleteAvailability}
                onSave={(range) => {
                    const id = availabilityDialog.editingId ?? `availability-${crypto.randomUUID()}`;
                    setAvailability((slots) => [
                        ...slots.filter((slot) => slot.id !== id),
                        { ...range, id },
                    ].sort((a, b) =>
                        a.date.getTime() - b.date.getTime() || timeMinutes(a.startTime) - timeMinutes(b.startTime),
                    ));
                    updateSelection(range.date);
                    setSelectedAvailabilityId(id);
                    setAvailabilityDialog(null);
                }}
            />}
        </section>
    );
}
