import type { ReactNode } from "react";
import {
    Calendar,
    CalendarDays,
    ChevronRight,
    Columns2,
    List,
    Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { calendarClassStyle, calendarTimeLabel } from "@/lib/instructor/calendar-view";
import type { CalendarEventsForDate, CalendarViewEvent as CalendarEvent } from "@/lib/instructor/calendar-view";
import type { ClassTypeRow } from "@/lib/instructor/types";
import type {
    AvailabilityRange,
    AvailabilitySlot,
} from "@/lib/instructor-availability";
import { cn } from "@/lib/utils";
import MobileCalendarTimeline from "./MobileCalendarTimeline";
import WeekStrip from "@/components/shared/calendar/WeekStrip";
import MobileCalendarHeader from "@/components/shared/calendar/MobileCalendarHeader";
import type { MobileViewOption } from "@/components/shared/calendar/MobileCalendarHeader";
import { useSwipeDay } from "@/hooks/use-swipe-day";

export type MobileCalendarView = "day" | "multi-day" | "month" | "list";
const mobileViews: MobileViewOption<MobileCalendarView>[] = [
    { value: "day", label: "day", icon: Calendar },
    { value: "multi-day", label: "Multi Day", icon: Columns2, ariaLabel: "Multi Day (two-day schedule)" },
    { value: "month", label: "month", icon: CalendarDays },
    { value: "list", label: "list", icon: List },
];
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
                            data-prefetch-class={entry.event?.type === "training" ? entry.event.id : undefined}
                            onClick={() =>
                                entry.event
                                    ? onSelectClass(entry.event)
                                    : onSelectAvailability(entry.slot)
                            }
                            aria-label={`${entry.event?.name ?? "Available"}, ${fullDate(date)}, ${entry.event ? calendarTimeLabel(entry.event, " to ") : `${formatTime(entry.startTime)} to ${formatTime(entry.endTime)}`}. View details`}
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
    const swipe = useSwipeDay((direction) => onSelectDate(addDays(date, direction)));
    const selectedDayLabel = date.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });
    return (
        <section
            aria-label="Instructor calendar"
            data-mobile-calendar
            className="min-w-0"
        >
            <MobileCalendarHeader
                date={date}
                view={view}
                views={mobileViews}
                onViewChange={onChangeView}
                stepUnit={view === "month" ? "month" : "day"}
                onToday={onToday}
                onPrevious={() => onSelectDate(view === "month" ? addMonths(date, -1) : addDays(date, -1))}
                onNext={() => onSelectDate(view === "month" ? addMonths(date, 1) : addDays(date, 1))}
                extras={onAddAvailability && <Button
                    variant="ghost"
                    onClick={onAddAvailability}
                    className="h-11 gap-1.5 rounded-full px-3 text-[14px] font-medium text-primary"
                >
                    <Plus aria-hidden="true" className="size-4" />
                    Add Availability
                </Button>}
                legend={<>
                    {catalogueStatus}
                    {!catalogueStatus && !classCatalogue.length && <p className="text-muted-foreground">No class types recorded.</p>}
                    <ul className="space-y-2">
                        {classCatalogue.map(type => (
                            <li key={type.id} className="space-y-0.5">
                                <span className={cn("inline-block rounded-md border px-2 py-1 text-[13px]", calendarClassStyle(type.id).badge)}>
                                    {type.label}
                                </span>
                                <p className="text-[12px] text-muted-foreground">{type.description}</p>
                            </li>
                        ))}
                        <li>
                            <span className={cn("inline-block rounded-md px-2 py-1 text-[13px]", eventStyles.grading.badge)}>Grading</span>
                        </li>
                    </ul>
                    {onAddAvailability && <p>
                        <span className="text-emerald-600 dark:text-emerald-400">●</span>{" "}
                        Availability
                    </p>}
                    <p className="text-muted-foreground">
                        Tap an event for details. Times are shown in Singapore time.
                    </p>
                </>}
            />
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
            <div {...swipe}>
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
                                    <h3 className="sticky top-[var(--mobile-site-nav-height)] z-10 border-b border-border/50 bg-background py-2 text-[14px] font-semibold">
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
