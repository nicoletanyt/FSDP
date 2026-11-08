import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import CalendarDaySelector from "@/components/instructor/CalendarDaySelector";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useInstructorCalendarRange, useInstructorSelectedEvent } from "@/hooks/use-instructor-class-queries";
import { useInstructorPrefetch } from "@/hooks/use-instructor-prefetch";
import { useAuth } from "@/hooks/use-auth";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { needsCalendarEventLookup } from "@/lib/instructor/calendar-queries";
import { invalidateAvailability } from "@/lib/instructor/cache-invalidation";
import { queryGeneration } from "@/lib/query-generation";
import { calendarClassStyle, calendarDateValue, calendarEventsForDate, calendarRange, calendarTimeLabel, rosterSizeLabel, singaporeClock } from "@/lib/instructor/calendar-view";
import type { CalendarEventsForDate, CalendarViewEvent as CalendarEvent } from "@/lib/instructor/calendar-view";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import MobileInstructorCalendar from "@/components/instructor/MobileInstructorCalendar";
import type { MobileCalendarView } from "@/components/instructor/MobileInstructorCalendar";
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
import type { AvailabilityRange, AvailabilitySlot } from "@/lib/instructor-availability";
import { availabilityError, minutesTime } from "@/lib/instructor-availability";
import {
    addDays,
    addMonths,
    dateKey,
    getEventStyle,
    formatTime,
    fullDate,
    monthDates,
    parseCalendarDate,
    weekDates,
    weekLabel,
} from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";

type CalendarView = "day" | "week" | "month";
type CalendarProps = {
    getEvents: CalendarEventsForDate;
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
    return (
        <Card
            size="sm"
            className={cn(
                "gap-0 rounded-lg border py-0 shadow-none ring-0 transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                style.card,
                layout === "panel" && "border-0 lg:h-full lg:min-h-0 lg:border",
                expanded && (detailsInPanel
                    ? "relative z-10 border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "border-primary/40 ring-1 ring-primary/15"),
            )}
        >
            <Button
                variant="ghost"
                data-prefetch-class={detailsInPanel && event.type === "training" ? event.id : undefined}
                onClick={onToggle}
                aria-expanded={expanded}
                aria-pressed={detailsInPanel ? expanded : undefined}
                aria-controls={detailsInPanel && !expanded ? undefined : `${showSummary || detailsInPanel ? "attendance" : "details"}-${event.id}`}
                aria-label={`${event.name}, ${fullDate(event.date)}, ${calendarTimeLabel(event, " to ")}, ${event.dojo}, ${rosterSizeLabel(event)}. ${expanded ? "Collapse" : "Expand"} class details`}
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
                            {calendarTimeLabel(event)}
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
                    {rosterSizeLabel(event)}
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
                        <ClassSessionDetails event={event} expanded={expanded} />
                    </div>
                </div>
            ))}
        </Card>
    );
}

function CalendarDays({
    getEvents,
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
    const days = view === "day" ? [date] : weekDates(date);

    return (
        <div
            aria-label={
                view === "day"
                    ? "Daily class calendar"
                    : "Weekly class calendar"
            }
            className="flex flex-col gap-3 lg:min-h-0 lg:flex-1"
        >
            {view === "week" && (
                <CalendarDaySelector date={date} today={today} onSelectDate={onSelectDate} />
            )}
            <div
                className={cn(
                    "flex flex-col rounded-xl lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden",
                    view === "week" && "border lg:divide-x",
                )}
            >
                {days.map((day) => {
                    const events = getEvents(day);
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
                                    "lg:min-h-0 lg:flex-1 lg:overflow-y-auto",
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
    getEvents,
    date,
    today,
    expandedClassId,
    onSelectDate,
    onToggleClass,
    availability,
    selectedAvailabilityId,
    onSelectAvailability,
}: CalendarProps) {
    const isNarrow = useMediaQuery("(max-width: 639px)");
    const selectedDay = useRef<HTMLElement>(null);
    const selectedKey = dateKey(date);
    const days = monthDates(date);
    useEffect(() => {
        if (isNarrow) return;
        selectedDay.current?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
        });
    }, [selectedKey, isNarrow]);

    if (isNarrow) {
        const entries = days.filter(day => day.getMonth() === date.getMonth()).map(day => ({
            day,
            events: getEvents(day),
            slots: availability.filter(slot => dateKey(slot.date) === dateKey(day)),
        }));
        const hasEntries = entries.some(group => group.events.length || group.slots.length);
        return <section aria-label="Monthly class agenda" className="space-y-4">
            {!hasEntries && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No classes or availability this month. Select a date to view that day.</p>}
            {entries.map(({ day, events, slots }) => <section key={dateKey(day)} className="space-y-2 rounded-xl border bg-card p-3">
                <Button variant="ghost" onClick={() => onSelectDate(day)} aria-current={dateKey(day) === dateKey(today) ? "date" : undefined} className="min-h-11 w-full justify-start whitespace-normal text-left">
                    {day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </Button>
                {[...events.map(event => ({ id: event.id, start: event.startTime, event, slot: null })), ...slots.map(slot => ({ id: slot.id, start: slot.startTime, event: null, slot }))]
                    .sort((a, b) => a.start.localeCompare(b.start)).map(({ id, event, slot }) => event
                        ? <EventCard key={id} event={event} detailsInPanel expanded={expandedClassId === id} onToggle={() => onToggleClass(event)} />
                        : slot && <AvailabilityCard key={id} slot={slot} selected={selectedAvailabilityId === id} onSelect={() => onSelectAvailability(slot)} />)}
            </section>)}
        </section>;
    }

    return (
        <div
            aria-label="Monthly class calendar"
            className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1"
        >
            {!days.some(day => getEvents(day).length || availability.some(slot => dateKey(slot.date) === dateKey(day))) &&
                <p role="status" className="py-3 text-sm text-muted-foreground">No classes or availability this month.</p>}
            <div
                aria-label="Month dates"
                className="flex min-w-0 flex-col rounded-xl border bg-card lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
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
                        const events = getEvents(day);
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
                                    "flex min-w-0 flex-col items-start gap-0.5 border-r border-b border-border/60 p-1 nth-[7n]:border-r-0 sm:p-1.5 lg:overflow-y-auto",
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
                                        "size-11 rounded-full text-xs tabular-nums lg:size-7",
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
                                        data-prefetch-class={event.type === "training" ? event.id : undefined}
                                        title={`${event.name} · ${formatTime(event.startTime)} · ${rosterSizeLabel(event)}`}
                                        aria-label={`${event.name}, ${fullDate(day)}, ${calendarTimeLabel(event, " to ")}. ${expandedClassId === event.id ? "Collapse" : "Expand"} class details`}
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
                                            "h-auto min-h-11 w-full min-w-0 flex-col items-start gap-0 rounded border-0 px-1 py-0.5 text-left text-xs leading-tight whitespace-normal lg:min-h-5 lg:text-[11px] xl:flex-row xl:items-center xl:gap-1",
                                            getEventStyle(event).card,
                                            expandedClassId === event.id &&
                                            "relative z-[1] pr-5 ring-2 ring-primary ring-offset-1 ring-offset-background",
                                        )}
                                    >
                                        {expandedClassId === event.id && <SelectedClassIndicator className="absolute top-0.5 right-0.5 size-3.5" />}
                                        <span className="w-full min-w-0 break-words font-medium lg:truncate xl:w-auto xl:flex-1">
                                            {event.name}
                                        </span>
                                        <span className="max-w-full font-normal opacity-80 lg:shrink-0 lg:truncate">
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
    const api = useInstructorApi();
    const client = useQueryClient();
    const { session } = useAuth();
    const active = useRef(true);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const isDesktop = useMediaQuery("(min-width: 1024px)");
    const [searchParams, setSearchParams] = useSearchParams();
    const [weekOverview, setWeekOverview] = useState(false);
    // Keep the chosen display in the same URL state as class selection. A route
    // remount or returning to class details must not reset Timeline to List.
    const displayMode = searchParams.get("display") === "timeline" ? "timeline" : "list";
    const dayDisplayMode = searchParams.get("dayDisplay") === "list" ? "list" : "timeline";
    const updateDisplayMode = useCallback((range: "day" | "week", mode: "timeline" | "list") => {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set(range === "day" ? "dayDisplay" : "display", mode);
            return next;
        });
    }, [setSearchParams]);
    const [timelineFocusRequest, setTimelineFocusRequest] = useState(0);
    const [mobileList, setMobileList] = useState(false);
    const classTriggerRef = useRef<HTMLElement | null>(null);
    const lastSelectedSession = useRef<CalendarEvent | null>(null);
    const [now, setNow] = useState(() => singaporeClock());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(singaporeClock()), 30_000);
        return () => window.clearInterval(timer);
    }, []);
    const requestedView = searchParams.get("view");
    const view: CalendarView =
        requestedView === "day" || requestedView === "month"
            ? requestedView
            : "week";
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [selectedAvailabilityId, setSelectedAvailabilityId] = useState<string | null>(null);
    const [availabilityDialog, setAvailabilityDialog] = useState<{
        range: AvailabilityRange;
        editingId?: string;
    } | null>(null);
    const requestedId = searchParams.get("session") ?? searchParams.get("class");
    const requestedDate = parseCalendarDate(searchParams.get("date"));
    const [resolvedSelectionDate, setResolvedSelectionDate] = useState<{ id: string; date: Date } | null>(null);
    const selectedDate = requestedDate ??
        (resolvedSelectionDate?.id === requestedId ? resolvedSelectionDate.date : today);
    const range = calendarRange(selectedDate, view, isDesktop, mobileList);
    const calendar = useInstructorCalendarRange(range);
    const canUseAvailability = calendar.canUseAvailability;
    const availability = calendar.data?.availability ?? [];
    useEffect(() => {
        if (!canUseAvailability) {
            setAvailabilityDialog(null);
            setSelectedAvailabilityId(null);
        }
    }, [canUseAvailability]);
    const events = calendar.data?.events ?? [];
    const prefetch = useInstructorPrefetch({ selectedDate, today, range, events, ready: calendar.status === 'success',
        weekView: view === 'week', isDesktop, mobileList });
    const rangeSession = events.find(event => event.id === requestedId);
    const needsSelection = needsCalendarEventLookup(requestedId, Boolean(requestedDate), calendar.status, Boolean(rangeSession));
    const selection = useInstructorSelectedEvent(requestedId, needsSelection);
    useEffect(() => {
        if (requestedId && !requestedDate && selection.data) {
            setResolvedSelectionDate({ id: requestedId, date: selection.data.date });
        }
    }, [requestedId, requestedDate, selection.data]);
    const getEvents = (date: Date) => calendarEventsForDate(events, date);
    const baseSession = rangeSession ?? selection.data;
    const requestedSession = baseSession ? calendarEventsForDate([baseSession], selectedDate)[0] : undefined;
    if (requestedSession) lastSelectedSession.current = requestedSession;
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
        if (!canUseAvailability) return;
        updateSelection(slot.date);
        setSelectedAvailabilityId(slot.id);
        setAvailabilityDialog({ range: slot, editingId: slot.id });
    }

    function selectRange(range: AvailabilityRange) {
        if (!canUseAvailability) return;
        updateSelection(range.date);
        setAvailabilityDialog({ range });
    }

    function addAvailability() {
        if (!canUseAvailability) return;
        const current = singaporeClock();
        const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate());
        let date = selectedDate < currentDay ? currentDay : selectedDate;
        let start = dateKey(date) === dateKey(current)
            ? Math.max(8 * 60, (Math.floor((current.getHours() * 60 + current.getMinutes()) / 30) + 1) * 30) : 8 * 60;
        for (let attempt = 0; attempt < 56; attempt++) {
            if (start >= 22 * 60) { date = addDays(date, 1); start = 8 * 60; }
            const range = { date, startTime: minutesTime(start), endTime: minutesTime(start + 30) };
            if (!availabilityError(range, availability, undefined, current, getEvents(date).filter(event => event.status !== "cancelled"))) {
                selectRange(range);
                return;
            }
            start += 30;
        }
        selectRange({ date: addDays(date, 1), startTime: "08:00", endTime: "08:30" });
    }

    async function saveAvailability(range: AvailabilityRange) {
        if (!canUseAvailability) throw new Error("Availability is only available to part-time instructors.");
        const userId = session?.user.id;
        const generation = queryGeneration(client);
        let saved;
        try {
            saved = await api.createAvailability({ date: calendarDateValue(range.date),
                startTime: range.startTime, endTime: range.endTime });
        } finally {
            if (userId) invalidateAvailability(client, generation, userId);
        }
        if (!active.current) return;
        updateSelection(range.date);
        setSelectedAvailabilityId(saved.id);
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
                setMobileList(false);
                changeView(nextView);
            } else if (key === "t" || key === "l") {
                event.preventDefault();
                setMobileList(key === "l");
                updateDisplayMode(view === "day" ? "day" : "week", key === "t" ? "timeline" : "list");
                if (view === "month") changeView("week");
            }
        }

        window.addEventListener("keydown", handleCalendarShortcut);
        return () => window.removeEventListener("keydown", handleCalendarShortcut);
    }, [availabilityDialog, changeView, expandedClassId, selectedDateKey, setSearchParams, updateDisplayMode, view]);

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
        getEvents,
        date: selectedDate,
        today,
        expandedClassId,
        onSelectDate: selectDay,
        onToggleClass: (event) => {
            if (document.activeElement instanceof HTMLElement) classTriggerRef.current = document.activeElement;
            updateSelection(
                event.date,
                expandedClassId === event.id ? null : event.id,
            );
        },
        availability,
        selectedAvailabilityId: selectedAvailability?.id ?? null,
        onSelectAvailability: selectAvailability,
    };

    const activeDisplayMode = view === "day" ? dayDisplayMode : displayMode;
    const isTimeline = view !== "month" && activeDisplayMode === "timeline";
    const showSidePanel = expandedClassId !== null;
    const calendarStatus = calendar.status !== 'success'
        ? <InstructorDataStatus loading={calendar.status === 'loading'} error={calendar.error} onRetry={calendar.retry} variant="calendar" /> : undefined;
    const catalogueStatus = calendar.status === 'loading'
        ? <InstructorDataStatus loading onRetry={calendar.retry} variant="inline" /> : calendarStatus;
    const selectionStatus = requestedId && !requestedSession
        ? selection.status === 'success'
            ? <div className="space-y-2 p-4"><p role="status" className="text-sm text-muted-foreground">Selected class not found for this date.</p><Button variant="outline" onClick={() => updateSelection(selectedDate)}>Back to calendar</Button></div>
            : <InstructorDataStatus loading={selection.status === 'loading'} error={selection.error} onRetry={selection.retry} variant="inline" />
        : undefined;

    return (
        <section aria-busy={calendar.status === 'loading'} className="flex flex-col gap-4 lg:min-h-0 lg:flex-1"
            onPointerOver={(event) => {
                if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
                const row = event.target.closest<HTMLElement>('[data-prefetch-class]');
                if (!row || !event.currentTarget.contains(row) || (event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) return;
                if (row.dataset.prefetchClass) prefetch.hoverClass(row.dataset.prefetchClass);
            }}
            onPointerOut={(event) => {
                if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
                const row = event.target.closest<HTMLElement>('[data-prefetch-class]');
                if (row && !(event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) prefetch.cancelHover();
            }}
            onTouchStart={(event) => {
                if (!(event.target instanceof Element)) return;
                const row = event.target.closest<HTMLElement>('[data-prefetch-class]');
                if (row && event.currentTarget.contains(row) && row.dataset.prefetchClass) prefetch.touchClass(row.dataset.prefetchClass);
            }}>
            {!isDesktop ? <MobileInstructorCalendar
                date={selectedDate} now={now} view={mobileList ? "list" : view === "week" ? "multi-day" : view} slots={availability} focusRequest={timelineFocusRequest}
                getEvents={getEvents} classCatalogue={calendar.data?.classTypes ?? []} catalogueStatus={catalogueStatus} content={calendarStatus ?? selectionStatus}
                onSelectDate={selectDay} onSelectClass={calendarProps.onToggleClass} onSelectAvailability={selectAvailability}
                onAddAvailability={canUseAvailability ? addAvailability : undefined} onSelectRange={canUseAvailability ? selectRange : undefined}
                onToday={() => { const current = singaporeClock(); setNow(current); updateSelection(new Date(current.getFullYear(), current.getMonth(), current.getDate())); setTimelineFocusRequest(value => value + 1); }}
                onChangeView={(mode: MobileCalendarView) => { setMobileList(mode === "list"); if (mode !== "list") changeView(mode === "multi-day" ? "week" : mode); }}
            /> : <>
            <header className="shrink-0">
                <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
                    Your calendar
                </h1>
            </header>
            <section className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 w-full flex-wrap items-center gap-3 lg:w-auto lg:gap-4">
                        <div
                            role="group"
                            aria-label={`${view[0].toUpperCase()}${view.slice(1)} navigation`}
                            className="flex items-center gap-2"
                        >
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const now = singaporeClock();
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
                                className="mr-1 h-11 px-4 lg:h-10"
                            >
                                Today
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                className="size-11 lg:size-10"
                                aria-label={`Previous ${view}`}
                                onClick={() => navigateDate(-1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                className="size-11 lg:size-10"
                                aria-label={`Next ${view}`}
                                onClick={() => navigateDate(1)}
                            >
                                <ChevronRight aria-hidden="true" />
                            </Button>
                        </div>
                        <h2 className="w-full text-sm font-medium lg:w-auto" aria-live="polite">
                            {heading}
                        </h2>
                    </div>
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:gap-3 lg:w-auto">
                        {canUseAvailability && <Button variant="outline" onClick={addAvailability} className="col-span-full h-11 w-full gap-2 px-4 sm:w-auto lg:h-10">
                            <Plus aria-hidden="true" />Add Availability
                        </Button>}
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={<Button variant="outline" className="h-11 min-w-0 justify-between gap-1 px-2 sm:min-w-28 sm:gap-3 sm:px-4 lg:h-10" />}
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
                                            render={<Button variant="outline" className="h-11 min-w-0 justify-between gap-1 px-2 sm:min-w-28 sm:gap-3 sm:px-4 lg:h-10" />}
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
                                                updateDisplayMode(view === "day" ? "day" : "week", value);
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
                                render={<Button variant="ghost" size="icon-lg" className="size-11 lg:size-10" />}
                                aria-label="Calendar information"
                                title="Calendar information"
                            >
                                <Info aria-hidden="true" className="size-5" />
                            </PopoverTrigger>
                            <PopoverContent className="max-h-[min(36rem,calc(100dvh-3rem))] w-96 overflow-y-auto">
                                <PopoverTitle>Calendar legend</PopoverTitle>
                                <p className="-mt-2 text-xs text-muted-foreground">Classes · Singapore time</p>
                                {catalogueStatus}
                                {calendar.status === 'success' && !calendar.data.classTypes.length && <p className="text-xs text-muted-foreground">No class types recorded.</p>}
                                <ul className="space-y-3 text-xs">
                                    {(calendar.data?.classTypes ?? []).map(type => (
                                        <li key={type.id} className="grid gap-1 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center sm:gap-3">
                                            <span className={cn("w-fit rounded-full border px-2 py-1 text-[10px] uppercase", calendarClassStyle(type.id).badge)}>{type.label}</span>
                                            <span className="text-muted-foreground">{type.description}</span>
                                        </li>
                                    ))}
                                </ul>
                                {canUseAvailability && <ul className="flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
                                    <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />Availability</li>
                                </ul>}
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <div className={cn(
                    "flex flex-col lg:min-h-0 lg:flex-1",
                    showSidePanel && "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1 lg:gap-3 lg:overflow-hidden",
                )}>
                    {calendarStatus ?? selectionStatus}
                    {calendar.status !== 'success' ? null : view === "month" ? (
                        <CalendarMonth {...calendarProps} onSelectDate={selectMonthDate} />
                    ) : isTimeline ? (
                        <CalendarTimeline
                            date={selectedDate}
                            now={now}
                            view={view}
                            focusRequest={timelineFocusRequest}
                            slots={availability}
                            getEvents={getEvents}
                            selectedId={selectedAvailability?.id ?? expandedClassId}
                            onSelectClass={calendarProps.onToggleClass}
                            onSelectAvailability={selectAvailability}
                            onSelectRange={canUseAvailability ? selectRange : undefined}
                            onSelectDate={selectDay}
                            isDesktop={isDesktop}
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
                    {isDesktop && showSidePanel && requestedSession && (view === "day" ? (
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
            </>}
            {!isDesktop && <Drawer open={Boolean(expandedClassId)} onOpenChange={(open) => { if (!open) updateSelection(selectedDate); }}>
                <DrawerContent finalFocus={() => classTriggerRef.current?.isConnected ? classTriggerRef.current : document.querySelector<HTMLElement>('[data-mobile-calendar] button')}>
                    <DrawerHeader>
                        <div className="min-w-0"><DrawerTitle className="text-[18px] font-semibold">Class details</DrawerTitle><DrawerDescription className="text-[13px] text-muted-foreground">{lastSelectedSession.current?.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</DrawerDescription></div>
                        <DrawerClose render={<Button variant="ghost" className="h-11 rounded-full px-3 text-[15px] text-primary" />}>Done</DrawerClose>
                    </DrawerHeader>
                    <DrawerBody className="pb-[max(1rem,env(safe-area-inset-bottom))]">
                        {lastSelectedSession.current && <EventCard key={lastSelectedSession.current.id} event={lastSelectedSession.current} layout="panel" expanded onToggle={() => updateSelection(selectedDate)} />}
                    </DrawerBody>
                </DrawerContent>
            </Drawer>}
            {canUseAvailability && availabilityDialog && <AvailabilityDialog
                key={`${availabilityDialog.editingId ?? "new"}-${dateKey(availabilityDialog.range.date)}-${availabilityDialog.range.startTime}`}
                initial={availabilityDialog.range}
                editingId={availabilityDialog.editingId}
                slots={availability}
                getEvents={getEvents}
                onClose={() => setAvailabilityDialog(null)}
                onSave={saveAvailability}
                readOnly={Boolean(availabilityDialog.editingId)}
            />}
        </section>
    );
}
