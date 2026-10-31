import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock3,
    MapPin,
} from "lucide-react";
import ClassSessionDetails from "@/components/instructor/ClassSessionDetails";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    addDays,
    addMonths,
    dateKey,
    eventStyles,
    eventsForDate,
    findCalendarEvent,
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
};

function EventCard({
    event,
    expanded,
    onToggle,
    layout = "week",
}: {
    event: CalendarEvent;
    expanded: boolean;
    onToggle: () => void;
    layout?: "day" | "week" | "panel";
}) {
    const showSummary = layout !== "week";
    return (
        <Card
            size="sm"
            className={cn(
                "gap-0 rounded-lg border py-0 shadow-none ring-0 transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                expanded && "border-primary/40 ring-1 ring-primary/15",
            )}
        >
            <Button
                variant="ghost"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={`${showSummary ? "attendance" : "details"}-${event.id}`}
                aria-label={`${event.name}, ${fullDate(event.date)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}, ${event.dojo}, ${event.studentIds.length} students. ${expanded ? "Collapse" : "Expand"} class details`}
                className={cn(
                    "h-auto w-full flex-col items-stretch gap-2 rounded-lg p-2.5 text-left whitespace-normal hover:bg-foreground/5 focus-visible:-outline-offset-2",
                    showSummary && "p-3",
                    layout === "day" && "gap-3 p-4",
                )}
            >
                <span
                    className={cn(
                        "flex items-start justify-between gap-2 text-xs leading-snug font-semibold",
                        layout === "day" && "text-sm sm:text-base",
                    )}
                >
                    <span className="min-w-0 wrap-break-word">
                        {event.name}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className={cn(
                            "mt-0.5 size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                            expanded && "rotate-180",
                        )}
                    />
                </span>
                <div
                    className={cn(
                        "flex gap-2",
                        expanded || showSummary
                            ? "flex-row flex-wrap items-center justify-between"
                            : "flex-col items-start",
                    )}
                >
                    <span className="flex items-center gap-1.5 text-2xs font-normal text-muted-foreground">
                        <Clock3
                            aria-hidden="true"
                            className="mt-0.5 size-3 shrink-0"
                        />
                        <span className="min-w-0 wrap-break-word">
                            {formatTime(event.startTime)} –{" "}
                            {formatTime(event.endTime)}
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-2xs font-normal text-muted-foreground">
                        <MapPin
                            aria-hidden="true"
                            className="size-3 shrink-0"
                        />{" "}
                        <span className="min-w-0 wrap-break-word">
                            {event.dojo}
                        </span>
                    </span>
                </div>
                {showSummary && (
                    <span className="flex items-center justify-between gap-2 text-2xs font-normal text-muted-foreground">
                        <span
                            className={cn(
                                "rounded px-1.5 py-0.5",
                                eventStyles[event.type].badge,
                            )}
                        >
                            {eventStyles[event.type].label}
                        </span>
                        <span>{event.studentIds.length} students</span>
                    </span>
                )}
            </Button>
            {showSummary ? (
                <ClassSessionDetails
                    event={event}
                    summary
                    expanded={expanded}
                    showAttendanceToggle={layout !== "panel"}
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
            )}
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
                                        ? "grid auto-rows-max items-start gap-3 bg-muted/30 p-1 xl:grid-cols-2"
                                        : "space-y-2 p-2",
                                )}
                            >
                                {events.length ? (
                                    events.map((event) => (
                                        <EventCard
                                            key={event.id}
                                            event={event}
                                            layout={view}
                                            expanded={
                                                isSelected &&
                                                expandedClassId === event.id
                                            }
                                            onToggle={() =>
                                                onToggleClass(event)
                                            }
                                        />
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
}: CalendarProps) {
    const selectedDay = useRef<HTMLElement>(null);
    const selectedClass = useRef<HTMLDivElement>(null);
    const attendancePanel = useRef<HTMLElement>(null);
    const selectedKey = dateKey(date);
    const days = monthDates(date);
    const selectedEvents = eventsForDate(date);
    useEffect(() => {
        selectedDay.current?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
        });
        if (attendancePanel.current) attendancePanel.current.scrollTop = 0;
    }, [selectedKey]);
    useEffect(() => {
        selectedClass.current?.scrollIntoView({
            block: "start",
            inline: "nearest",
        });
    }, [expandedClassId]);

    return (
        <div
            aria-label="Monthly class calendar"
            className="grid min-h-0 flex-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)] lg:grid-rows-1"
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
                                    "flex min-w-0 flex-col items-start gap-0.5 border-r border-b border-border/60 p-1 nth-[7n]:border-r-0 sm:p-1.5",
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
                                        title={`${event.name} · ${formatTime(event.startTime)} · ${eventStyles[event.type].label}`}
                                        aria-label={`${event.name}, ${fullDate(day)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}. ${expandedClassId === event.id ? "Collapse" : "Expand"} class details`}
                                        aria-expanded={
                                            expandedClassId === event.id
                                        }
                                        aria-controls={
                                            expandedClassId === event.id
                                                ? `attendance-${event.id}`
                                                : undefined
                                        }
                                        onClick={() => onToggleClass(event)}
                                        className={cn(
                                            "h-auto min-h-5 w-full min-w-0 flex-col items-start gap-0 rounded border-0 px-1 py-0.5 text-left text-[11px] leading-tight xl:flex-row xl:items-center xl:gap-1",
                                            eventStyles[event.type].card,
                                            expandedClassId === event.id &&
                                            "ring-1 ring-primary ring-inset",
                                        )}
                                    >
                                        <span className="w-full min-w-0 truncate font-medium xl:w-auto xl:flex-1">
                                            {event.name}
                                        </span>
                                        <span className="max-w-full shrink-0 truncate font-normal text-muted-foreground">
                                            {formatTime(event.startTime)}
                                        </span>
                                    </Button>
                                ))}
                            </section>
                        );
                    })}
                </div>
            </div>
            <aside
                ref={attendancePanel}
                aria-label="Selected day classes"
                className="min-h-0 min-w-0 space-y-2 overflow-y-auto overscroll-contain lg:min-w-75"
            >
                <header className="sticky top-0 z-10 px-1 py-2">
                    <h3 className="text-sm font-medium">
                        {date.toLocaleDateString("en-GB", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}
                    </h3>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                        {selectedEvents.length}{" "}
                        {selectedEvents.length === 1 ? "class" : "classes"}
                    </p>
                </header>
                {selectedEvents.length ? (
                    selectedEvents.map((event) => (
                        <div
                            key={event.id}
                            ref={
                                expandedClassId === event.id
                                    ? selectedClass
                                    : undefined
                            }
                            className="scroll-mt-20"
                        >
                            <EventCard
                                event={event}
                                layout="panel"
                                expanded={expandedClassId === event.id}
                                onToggle={() => onToggleClass(event)}
                            />
                        </div>
                    ))
                ) : (
                    <p className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                        No classes scheduled
                    </p>
                )}
            </aside>
        </div>
    );
}

export default function InstructorDashboard() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [weekOverview, setWeekOverview] = useState(false);
    const requestedView = searchParams.get("view");
    const view: CalendarView =
        requestedView === "day" || requestedView === "month"
            ? requestedView
            : "week";
    const [today] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
    const requestedEvent = findCalendarEvent(
        searchParams.get("session") ?? searchParams.get("class") ?? undefined,
    );
    const requestedSession = requestedEvent;
    const selectedDate =
        parseCalendarDate(searchParams.get("date")) ??
        requestedSession?.date ??
        today;
    const expandedClassId =
        requestedSession &&
            dateKey(requestedSession.date) === dateKey(selectedDate)
            ? requestedSession.id
            : null;

    function updateSelection(
        date: Date,
        sessionId: string | null = null,
        overview = false,
    ) {
        setWeekOverview(overview);
        const next = new URLSearchParams(searchParams);
        next.set("date", dateKey(date));
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

    function changeView(value: unknown) {
        if (value !== "day" && value !== "week" && value !== "month") return;
        const next = new URLSearchParams(searchParams);
        next.set("view", value);
        next.set("date", dateKey(selectedDate));
        setSearchParams(next);
    }

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
    };

    return (
        <section className="flex min-h-0 flex-1 flex-col gap-4">
            <header className="shrink-0">
                <h1 className="text-3xl font-semibold tracking-tight">
                    Your calendar
                </h1>
            </header>
            <section className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <div
                            role="group"
                            aria-label={`${view[0].toUpperCase()}${view.slice(1)} navigation`}
                            className="flex items-center gap-1"
                        >
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const now = new Date();
                                    updateSelection(
                                        new Date(
                                            now.getFullYear(),
                                            now.getMonth(),
                                            now.getDate(),
                                        ),
                                    );
                                }}
                                className="mr-1 h-9 px-3"
                            >
                                Today
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                aria-label={`Previous ${view}`}
                                onClick={() => navigateDate(-1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
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
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="outline"
                                    className="ml-auto h-9 min-w-28 justify-between px-3"
                                />
                            }
                            aria-label={`Calendar view: ${view}`}
                        >
                            {view[0].toUpperCase()}
                            {view.slice(1)}
                            <ChevronDown aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuRadioGroup
                                aria-label="Calendar view"
                                value={view}
                                onValueChange={changeView}
                            >
                                <DropdownMenuRadioItem value="day" closeOnClick>
                                    Day
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem
                                    value="week"
                                    closeOnClick
                                >
                                    Week
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem
                                    value="month"
                                    closeOnClick
                                >
                                    Month
                                </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                    {view === "month" ? (
                        <CalendarMonth {...calendarProps} />
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
                </div>
            </section>
        </section>
    );
}
