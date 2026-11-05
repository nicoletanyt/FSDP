import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import {
    Calendar,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Columns2,
    Info,
    List,
    Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    addDays,
    addMonths,
    dateKey,
    eventStyles,
    formatTime,
    fullDate,
    getEventStyle,
    monthDates,
    weekDates,
} from "@/lib/instructor-calendar";
import { calendarClassStyle } from "@/lib/instructor/calendar-view";
import type { CalendarEventsForDate, CalendarViewEvent as CalendarEvent } from "@/lib/instructor/calendar-view";
import type { ClassTypeRow } from "@/lib/instructor/types";
import type {
    AvailabilityRange,
    AvailabilitySlot,
} from "@/lib/instructor-availability";
import { cn } from "@/lib/utils";
import MobileCalendarTimeline from "./MobileCalendarTimeline";

export type MobileCalendarView = "day" | "multi-day" | "month" | "list";
const viewIcons = {
    day: Calendar,
    "multi-day": Columns2,
    month: CalendarDays,
    list: List,
};
type Entry = { id: string; startTime: string; endTime: string } & (
    | { event: CalendarEvent; slot?: never }
    | { slot: AvailabilitySlot; event?: never }
);

function entriesForDate(date: Date, slots: AvailabilitySlot[], getEvents: CalendarEventsForDate): Entry[] {
    return [
        ...getEvents(date).map((event) => ({ ...event, event })),
        ...slots
            .filter((slot) => dateKey(slot.date) === dateKey(date))
            .map((slot) => ({ ...slot, slot })),
    ].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function Agenda({
    getEvents,
    date,
    slots,
    onSelectClass,
    onSelectAvailability,
}: {
    getEvents: CalendarEventsForDate;
    date: Date;
    slots: AvailabilitySlot[];
    onSelectClass: (event: CalendarEvent) => void;
    onSelectAvailability: (slot: AvailabilitySlot) => void;
}) {
    const entries = entriesForDate(date, slots, getEvents);
    return (
        <ul
            aria-label={`Schedule for ${fullDate(date)}`}
            className="divide-y divide-border/60"
        >
            {entries.length ? (
                entries.map((entry) => (
                    <li key={entry.id}>
                        <button
                            type="button"
                            onClick={() =>
                                entry.event
                                    ? onSelectClass(entry.event)
                                    : onSelectAvailability(entry.slot)
                            }
                            aria-label={`${entry.event?.name ?? "Available"}, ${fullDate(date)}, ${formatTime(entry.startTime)} to ${formatTime(entry.endTime)}. View details`}
                            className="flex min-h-18 w-full items-stretch gap-3 rounded-md py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="w-18 shrink-0 text-[13px] leading-5 tabular-nums text-muted-foreground">
                                <span className="block">{formatTime(entry.startTime)}</span>
                                <span className="block opacity-70">
                                    {formatTime(entry.endTime)}
                                </span>
                            </span>
                            <span
                                className={cn(
                                    "w-0.5 shrink-0 rounded-full",
                                    entry.event
                                        ? getEventStyle(entry.event).dot
                                        : "bg-emerald-500",
                                )}
                            />
                            <span className="min-w-0 flex-1 space-y-1">
                                <span className="block text-[16px] leading-snug font-medium [overflow-wrap:anywhere]">
                                    {entry.event?.name ?? "Available"}
                                </span>
                                <span className="block text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                                    {entry.event
                                        ? `${entry.event.dojo} · ${entry.event.rosterCount} students`
                                        : "Instructor availability"}
                                </span>
                            </span>
                            <ChevronRight
                                aria-hidden="true"
                                className="mt-1 size-4 shrink-0 text-muted-foreground/60"
                            />
                        </button>
                    </li>
                ))
            ) : (
                <li className="py-6 text-[15px] text-muted-foreground">
                    No classes or availability. A little room in your day.
                </li>
            )}
        </ul>
    );
}

function WeekStrip({
    date,
    today,
    onSelectDate,
}: {
    date: Date;
    today: Date;
    onSelectDate: (date: Date) => void;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekKey = dateKey(weekDates(date)[0]);
    const selectedKey = dateKey(date);
    useLayoutEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const element = viewport.current;
        if (element) element.scrollLeft = element.clientWidth;
    }, [weekKey, selectedKey]);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    return (
        <div
            ref={viewport}
            aria-label="Swipe to change week"
            className="-mx-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={() => {
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                    const element = viewport.current;
                    if (!element) return;
                    const page = Math.round(element.scrollLeft / element.clientWidth);
                    if (page !== 1) onSelectDate(addDays(date, (page - 1) * 7));
                }, 160);
            }}
        >
            {[-1, 0, 1].map((offset) => (
                <div
                    key={offset}
                    role="group"
                    aria-label={`${offset ? (offset < 0 ? "Previous" : "Next") : "Current"} week`}
                    className="grid w-full shrink-0 snap-center grid-cols-7"
                >
                    {weekDates(addDays(date, offset * 7)).map((day) => {
                        const selected = dateKey(day) === dateKey(date);
                        const isToday = dateKey(day) === dateKey(today);
                        return (
                            <button
                                key={dateKey(day)}
                                type="button"
                                tabIndex={offset === 0 ? 0 : -1}
                                onClick={() => onSelectDate(day)}
                                aria-label={day.toLocaleDateString("en-GB", {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                })}
                                aria-pressed={selected}
                                aria-current={isToday ? "date" : undefined}
                                className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="text-[11px] font-medium text-muted-foreground">
                                    {day
                                        .toLocaleDateString("en-GB", { weekday: "short" })
                                        .slice(0, 2)
                                        .toUpperCase()}
                                </span>
                                <span
                                    className={cn(
                                        "flex size-9 items-center justify-center rounded-full text-[18px] font-medium tabular-nums transition-colors motion-reduce:transition-none",
                                        selected
                                            ? "bg-primary text-primary-foreground"
                                            : isToday && "text-brand-red-ink",
                                    )}
                                >
                                    {day.getDate()}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function MonthGrid({
    getEvents,
    date,
    today,
    slots,
    onSelectDate,
}: {
    getEvents: CalendarEventsForDate;
    date: Date;
    today: Date;
    slots: AvailabilitySlot[];
    onSelectDate: (date: Date) => void;
}) {
    return (
        <div
            aria-label="Month dates"
            className="-mx-4 grid grid-cols-7 gap-y-1 border-b border-border/60 pt-2 pb-4"
        >
            {weekDates(date).map((day) => (
                <span
                    key={day.getDay()}
                    className="py-2 text-center text-[11px] font-medium text-muted-foreground"
                >
                    {day
                        .toLocaleDateString("en-GB", { weekday: "short" })
                        .slice(0, 2)
                        .toUpperCase()}
                </span>
            ))}
            {monthDates(date).map((day) => {
                const events = getEvents(day);
                const indicators = [
                    ...new Map(
                        events.map((event) => [
                            `${event.type}:${event.classType ?? ""}`,
                            getEventStyle(event).dot,
                        ]),
                    ).entries(),
                ];
                const available = slots.some(
                    (slot) => dateKey(slot.date) === dateKey(day),
                );
                const selected = dateKey(day) === dateKey(date);
                const isToday = dateKey(day) === dateKey(today);
                const sameMonth = day.getMonth() === date.getMonth();
                return (
                    <button
                        key={dateKey(day)}
                        type="button"
                        onClick={() => onSelectDate(day)}
                        aria-pressed={selected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${day.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, ${events.length} classes${available ? ", availability" : ""}`}
                        className={cn(
                            "flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            !sameMonth && "opacity-35",
                        )}
                    >
                        <span
                            className={cn(
                                "flex size-8 items-center justify-center rounded-full text-[17px] tabular-nums transition-colors motion-reduce:transition-none",
                                selected
                                    ? "bg-primary text-primary-foreground"
                                    : isToday && "font-semibold text-brand-red-ink",
                            )}
                        >
                            {day.getDate()}
                        </span>
                        <span aria-hidden="true" className="flex h-2 items-center gap-0.5">
                            {indicators.slice(0, 3).map(([type, color]) => (
                                <span key={type} className={cn("size-1 rounded-full", color)} />
                            ))}
                            {available && (
                                <span className="size-1 rounded-full bg-emerald-500" />
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export default function MobileInstructorCalendar({
    getEvents,
    classCatalogue,
    catalogueStatus,
    content,
    date,
    now,
    view,
    slots,
    focusRequest,
    onChangeView,
    onSelectDate,
    onSelectClass,
    onSelectAvailability,
    onSelectRange,
    onToday,
    onAddAvailability,
}: {
    getEvents: CalendarEventsForDate;
    classCatalogue: ClassTypeRow[];
    catalogueStatus?: ReactNode;
    content?: ReactNode;
    date: Date;
    now: Date;
    view: MobileCalendarView;
    slots: AvailabilitySlot[];
    focusRequest: number;
    onChangeView: (view: MobileCalendarView) => void;
    onSelectDate: (date: Date) => void;
    onSelectClass: (event: CalendarEvent) => void;
    onSelectAvailability: (slot: AvailabilitySlot) => void;
    onSelectRange?: (range: AvailabilityRange) => void;
    onToday: () => void;
    onAddAvailability?: () => void;
}) {
    const [viewPickerOpen, setViewPickerOpen] = useState(false);
    const ActiveViewIcon = viewIcons[view];
    const currentViewLabel = view === "multi-day" ? "Multi Day" : view;
    const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    const selectedDayLabel = date.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });
    function endSwipe(event: PointerEvent<HTMLDivElement>) {
        const start = gesture.current;
        gesture.current = null;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        suppressClick.current = start.moved;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5)
            onSelectDate(addDays(date, dx < 0 ? 1 : -1));
    }
    return (
        <section
            aria-label="Instructor calendar"
            data-mobile-calendar
            className="min-w-0"
        >
            <header className="-mx-4 -mt-4 space-y-3 border-b bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="min-w-0 flex-1 text-[24px] leading-tight font-semibold tracking-tight">
                        {date.toLocaleDateString("en-GB", { month: "long" })}{" "}
                        <span className="text-[15px] font-normal text-muted-foreground">
                            {date.getFullYear()}
                        </span>
                    </h1>
                    <Popover open={viewPickerOpen} onOpenChange={setViewPickerOpen}>
                        <PopoverTrigger
                            aria-label="Change calendar view"
                            aria-description={`Current view: ${currentViewLabel}`}
                            title={`${currentViewLabel} view`}
                            render={
                                <Button
                                    variant="outline"
                                    size="icon-touch"
                                    className="rounded-full"
                                />
                            }
                        >
                            <ActiveViewIcon aria-hidden="true" className="size-5" />
                        </PopoverTrigger>
                        <PopoverContent className="w-56 gap-3 p-4">
                            <PopoverTitle className="text-[13px] text-muted-foreground">
                                Calendar view
                            </PopoverTitle>
                            <div
                                role="group"
                                aria-label="Calendar view"
                                className="grid gap-2"
                            >
                                {(["day", "multi-day", "month", "list"] as const).map(
                                    (mode) => {
                                        const Icon = viewIcons[mode];
                                        return (
                                            <Button
                                                key={mode}
                                                variant="ghost"
                                                data-calendar-view={mode}
                                                aria-pressed={view === mode}
                                                aria-label={
                                                    mode === "multi-day"
                                                        ? "Multi Day (two-day schedule)"
                                                        : undefined
                                                }
                                                onClick={() => {
                                                    onChangeView(mode);
                                                    setViewPickerOpen(false);
                                                }}
                                                className={cn(
                                                    "h-11 justify-start gap-3 px-3 text-[15px] capitalize",
                                                    view === mode && "bg-accent text-accent-foreground",
                                                )}
                                            >
                                                <Icon aria-hidden="true" className="size-4" />
                                                <span className="flex-1 text-left">
                                                    {mode === "multi-day" ? "Multi Day" : mode}
                                                </span>
                                                {view === mode && (
                                                    <Check aria-hidden="true" className="size-4" />
                                                )}
                                            </Button>
                                        );
                                    },
                                )}
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
                        <Button
                            variant="ghost"
                            size="icon-touch"
                            aria-label={`Previous ${view === "month" ? "month" : "day"}`}
                            onClick={() =>
                                onSelectDate(
                                    view === "month" ? addMonths(date, -1) : addDays(date, -1),
                                )
                            }
                        >
                            <ChevronLeft aria-hidden="true" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-touch"
                            aria-label={`Next ${view === "month" ? "month" : "day"}`}
                            onClick={() =>
                                onSelectDate(
                                    view === "month" ? addMonths(date, 1) : addDays(date, 1),
                                )
                            }
                        >
                            <ChevronRight aria-hidden="true" />
                        </Button>
                    </div>
                    <div className="ml-auto flex items-center">
                        <Button
                            variant="ghost"
                            onClick={onAddAvailability}
                            disabled={!onAddAvailability}
                            className="h-11 gap-1.5 rounded-full px-3 text-[14px] font-medium text-primary"
                        >
                            <Plus aria-hidden="true" className="size-4" />
                            Add Availability
                        </Button>
                        <Popover>
                            <PopoverTrigger
                                aria-label="Calendar colours"
                                render={<Button variant="ghost" size="icon-touch" />}
                            >
                                <Info
                                    aria-hidden="true"
                                    className="size-4 text-muted-foreground"
                                />
                            </PopoverTrigger>
                            <PopoverContent className="gap-2 text-[14px]">
                                 <PopoverTitle>Calendar colours</PopoverTitle>
                                 {catalogueStatus}
                                 {!catalogueStatus && !classCatalogue.length && <p className="text-muted-foreground">No class types recorded.</p>}
                                <ul className="space-y-2">
                                    {classCatalogue.map(type => (
                                        <li key={type.id} className="space-y-0.5">
                                            <span
                                                className={cn(
                                                    "inline-block rounded-md border px-2 py-1 text-[13px]",
                                                    calendarClassStyle(type.id).badge,
                                                )}
                                            >
                                                {type.label}
                                            </span>
                                            <p className="text-[12px] text-muted-foreground">
                                                {type.description}
                                            </p>
                                        </li>
                                    ))}
                                    <li>
                                        <span
                                            className={cn(
                                                "inline-block rounded-md px-2 py-1 text-[13px]",
                                                eventStyles.grading.badge,
                                            )}
                                        >
                                            Grading
                                        </span>
                                    </li>
                                </ul>
                                <p>
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                        ●
                                    </span>{" "}
                                    Availability
                                </p>
                                <p className="text-muted-foreground">
                                    Tap an event for details. Times are shown in Singapore time.
                                </p>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </header>
            {view === "month" && !content ? (
                <MonthGrid
                    getEvents={getEvents}
                    date={date}
                    today={now}
                    slots={slots}
                    onSelectDate={onSelectDate}
                />
            ) : view !== "list" ? (
                <WeekStrip date={date} today={now} onSelectDate={onSelectDate} />
            ) : null}
            {view === "month" && (
                <h2
                    aria-live="polite"
                    aria-atomic="true"
                    className="py-3 text-[15px] font-semibold"
                >
                    {selectedDayLabel}
                </h2>
            )}
            <div
                className="touch-pan-y touch-pinch-zoom"
                onPointerDownCapture={(event) => {
                    suppressClick.current = false;
                    if (event.pointerType === "touch" && event.isPrimary)
                        gesture.current = {
                            x: event.clientX,
                            y: event.clientY,
                            moved: false,
                        };
                }}
                onPointerMoveCapture={(event) => {
                    if (
                        gesture.current &&
                        Math.hypot(
                            event.clientX - gesture.current.x,
                            event.clientY - gesture.current.y,
                        ) > 12
                    )
                        gesture.current.moved = true;
                }}
                onPointerUpCapture={endSwipe}
                onPointerCancel={() => {
                    gesture.current = null;
                    suppressClick.current = true;
                }}
                onClickCapture={(event) => {
                    if (suppressClick.current) {
                        event.preventDefault();
                        event.stopPropagation();
                        suppressClick.current = false;
                    }
                }}
            >
                <div className="animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                    {content ?? (view === "day" || view === "multi-day" ? (
                        <MobileCalendarTimeline
                            getEvents={getEvents}
                            date={date}
                            now={now}
                            slots={slots}
                            focusRequest={focusRequest}
                            dayCount={view === "multi-day" ? 2 : 1}
                            onSelectClass={onSelectClass}
                            onSelectAvailability={onSelectAvailability}
                            onSelectRange={onSelectRange}
                        />
                    ) : view === "month" ? (
                        <Agenda
                            getEvents={getEvents}
                            date={date}
                            slots={slots}
                            onSelectClass={onSelectClass}
                            onSelectAvailability={onSelectAvailability}
                        />
                    ) : (
                        <div aria-label="Chronological agenda" className="space-y-6 pt-4">
                            {Array.from({ length: 14 }, (_, index) =>
                                addDays(date, index),
                            ).map((day) => (
                                <section key={dateKey(day)}>
                                    <h3 className="border-b border-border/50 pb-2 text-[14px] font-semibold">
                                        {day.toLocaleDateString("en-GB", {
                                            weekday: "short",
                                            day: "numeric",
                                            month: "long",
                                        })}
                                    </h3>
                                    <Agenda
                                        getEvents={getEvents}
                                        date={day}
                                        slots={slots}
                                        onSelectClass={onSelectClass}
                                        onSelectAvailability={onSelectAvailability}
                                    />
                                </section>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
