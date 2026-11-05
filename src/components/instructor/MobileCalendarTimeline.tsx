import { useEffect, useRef, useState } from "react";
import {
    availabilityError,
    layoutTimelineItems,
    minutesTime,
    slotDateTime,
    timeMinutes,
} from "@/lib/instructor-availability";
import type {
    AvailabilityRange,
    AvailabilitySlot,
} from "@/lib/instructor-availability";
import {
    addDays,
    dateKey,
    formatTime,
    fullDate,
    getEventStyle,
} from "@/lib/instructor-calendar";
import type {
    CalendarEventsForDate,
    CalendarViewEvent as CalendarEvent,
} from "@/lib/instructor/calendar-view";
import { cn } from "@/lib/utils";
import { availabilityStyle } from "./CalendarAvailability";

// Selected-day or two-day timeline in document flow. All geometry uses the same
// minutes-to-pixels scale, including overlaps, free-time targets and the clock.
export default function MobileCalendarTimeline({
    getEvents,
    date,
    now,
    slots,
    focusRequest,
    dayCount = 1,
    onSelectClass,
    onSelectAvailability,
    onSelectRange,
}: {
    getEvents: CalendarEventsForDate;
    date: Date;
    now: Date;
    slots: AvailabilitySlot[];
    focusRequest: number;
    dayCount?: 1 | 2;
    onSelectClass: (event: CalendarEvent) => void;
    onSelectAvailability: (slot: AvailabilitySlot) => void;
    onSelectRange?: (range: AvailabilityRange) => void;
}) {
    const key = dateKey(date);
    const days = Array.from({ length: dayCount }, (_, index) => {
        const day = addDays(date, index);
        return {
            day,
            items: [
                ...getEvents(day).map((event) => ({ ...event, event, slot: null })),
                ...slots
                    .filter((slot) => dateKey(slot.date) === dateKey(day))
                    .map((slot) => ({ ...slot, event: null, slot })),
            ],
        };
    });
    const items = days.flatMap((day) => day.items);
    const start = Math.min(
        8 * 60,
        ...items.map((item) => Math.floor(timeMinutes(item.startTime) / 60) * 60),
    );
    const end = Math.max(
        22 * 60,
        ...items.map((item) => Math.ceil(timeMinutes(item.endTime) / 60) * 60),
    );
    const scale = 1.6;
    const height = (end - start) * scale;
    const currentMinute = now.getHours() * 60 + now.getMinutes();
    const timeline = useRef<HTMLDivElement>(null);
    const previousFocusRequest = useRef(focusRequest);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setError(null);
    }, [key]);
    useEffect(() => {
        if (previousFocusRequest.current === focusRequest) return;
        previousFocusRequest.current = focusRequest;
        if (!timeline.current) return;
        const rect = timeline.current.getBoundingClientRect();
        const offset =
            (Math.max(start, Math.min(end, currentMinute)) - start) * scale;
        const headerHeight =
            document.querySelector("[data-mobile-site-nav]")?.getBoundingClientRect()
                .height ?? 0;
        const visibleCenter =
            headerHeight + Math.max(0, window.innerHeight - headerHeight) / 2;
        window.scrollTo({
            top: Math.max(0, window.scrollY + rect.top + offset - visibleCenter),
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
        });
        // Only the explicit Today action refocuses; clock ticks and date swipes
        // keep the user's document scroll position.
    }, [focusRequest]);

    return (
        <section
            aria-label={
                dayCount === 2
                    ? "Two-day hourly timeline"
                    : "Selected day hourly timeline"
            }
            className="pt-4"
        >
            {error && (
                <p role="alert" className="mb-3 text-[14px] text-destructive">
                    {error}
                </p>
            )}
            {dayCount === 2 && (
                <div className="mb-4 grid grid-cols-[3rem_repeat(2,minmax(0,1fr))]">
                    <span aria-hidden="true" />
                    {days.map(({ day }) => (
                        <h3
                            key={dateKey(day)}
                            className="text-center text-[13px] font-semibold"
                            aria-label={day.toLocaleDateString("en-GB", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                            })}
                        >
                            {day.toLocaleDateString("en-GB", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                            })}
                        </h3>
                    ))}
                </div>
            )}
            <div
                ref={timeline}
                className="relative grid"
                style={{
                    height: height + 24,
                    gridTemplateColumns: `3rem repeat(${dayCount}, minmax(0, 1fr))`,
                }}
            >
                <div
                    aria-hidden="true"
                    className="relative text-[11px] tabular-nums text-muted-foreground"
                >
                    {Array.from(
                        { length: (end - start) / 60 + 1 },
                        (_, i) => start + i * 60,
                    ).map((minute) => (
                        <span
                            key={minute}
                            className="absolute right-2 -translate-y-1/2"
                            style={{ top: (minute - start) * scale }}
                        >
                            {formatTime(minutesTime(minute)).replace(":00", "")}
                        </span>
                    ))}
                </div>
                {days.map(({ day, items: dayItems }) => (
                    <div
                        key={dateKey(day)}
                        data-mobile-timeline-day={dateKey(day)}
                        className={cn(
                            "relative min-w-0",
                            dayCount === 2 && "border-l border-border/50",
                        )}
                        style={{ height }}
                    >
                        {Array.from(
                            { length: (end - start) / 30 },
                            (_, i) => start + i * 30,
                        ).map((minute) => {
                            const range = {
                                date: day,
                                startTime: minutesTime(minute),
                                endTime: minutesTime(minute + 30),
                            };
                            const disabled =
                                !onSelectRange ||
                                minute < 8 * 60 ||
                                minute >= 22 * 60 ||
                                slotDateTime(day, range.startTime) <= now ||
                                dayItems.some(
                                    (item) =>
                                        minute < timeMinutes(item.endTime) &&
                                        minute + 30 > timeMinutes(item.startTime),
                                );
                            return (
                                <button
                                    key={minute}
                                    type="button"
                                    data-mobile-free-slot
                                    disabled={disabled}
                                    aria-label={`Add availability on ${fullDate(day)}, ${formatTime(range.startTime)} to ${formatTime(range.endTime)}`}
                                    onClick={() => {
                                        const message = availabilityError(
                                            range,
                                            slots,
                                            undefined,
                                            now,
                                            getEvents(day).filter(
                                                (event) => event.status !== "cancelled",
                                            ),
                                        );
                                        setError(message);
                                        if (!message) onSelectRange?.(range);
                                    }}
                                    className={cn(
                                        "absolute inset-x-0 border-t border-border/60 text-left outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring enabled:hover:bg-emerald-500/5",
                                        minute % 60 !== 0 && "border-border/25",
                                    )}
                                    style={{ top: (minute - start) * scale, height: 30 * scale }}
                                />
                            );
                        })}
                        {layoutTimelineItems(dayItems).map(({ item, lane, lanes }) => (
                            <button
                                key={item.id}
                                type="button"
                                data-mobile-event
                                aria-label={`${item.event?.name ?? "Available"}, ${fullDate(day)}, ${formatTime(item.startTime)} to ${formatTime(item.endTime)}. View details`}
                                onClick={() =>
                                    item.event
                                        ? onSelectClass(item.event)
                                        : item.slot && onSelectAvailability(item.slot)
                                }
                                className={cn(
                                    "absolute z-10 flex min-w-0 flex-col overflow-hidden rounded-md border-0 border-l-[3px] px-2 py-1 text-left outline-none transition-colors hover:brightness-95 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                                    timeMinutes(item.endTime) - timeMinutes(item.startTime) >=
                                    60 && "py-2",
                                    item.event
                                        ? getEventStyle(item.event).card
                                        : cn(
                                            availabilityStyle,
                                            "bg-emerald-50/80 dark:bg-emerald-950/80",
                                        ),
                                )}
                                style={{
                                    top: (timeMinutes(item.startTime) - start) * scale + 1,
                                    height:
                                        (timeMinutes(item.endTime) - timeMinutes(item.startTime)) *
                                        scale -
                                        2,
                                    left: `calc(${(lane * 100) / lanes}% + 4px)`,
                                    width: `calc(${100 / lanes}% - 8px)`,
                                }}
                            >
                                <span className="w-full text-[14px] leading-tight font-semibold [overflow-wrap:anywhere]">
                                    {item.event?.name ?? "Available"}
                                </span>
                                <span className="mt-1 text-[11px] leading-tight">
                                    {formatTime(item.startTime)} – {formatTime(item.endTime)}
                                </span>
                                {item.event && (
                                    <span className="mt-1 truncate text-[12px] opacity-75">
                                        {item.event.dojo}
                                    </span>
                                )}
                            </button>
                        ))}
                        {dateKey(day) === dateKey(now) &&
                            currentMinute >= start &&
                            currentMinute <= end && (
                                <div
                                    aria-label={`Current time: ${formatTime(minutesTime(currentMinute))}`}
                                    role="img"
                                    className="pointer-events-none absolute inset-x-0 z-20 border-t border-brand-red"
                                    style={{ top: (currentMinute - start) * scale }}
                                >
                                    <span className="absolute -top-1 -left-1 size-2 rounded-full bg-brand-red" />
                                </div>
                            )}
                    </div>
                ))}
            </div>
        </section>
    );
}
