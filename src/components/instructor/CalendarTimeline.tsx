import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { availabilityStyle } from "@/components/instructor/CalendarAvailability";
import SelectedClassIndicator from "@/components/instructor/SelectedClassIndicator";
import {
    availabilityError,
    layoutTimelineItems,
    minutesTime,
    slotDateTime,
    timeMinutes,
    TIMELINE_END,
    TIMELINE_START,
} from "@/lib/instructor-availability";
import type {
    AvailabilityRange,
    AvailabilitySlot,
} from "@/lib/instructor-availability";
import {
    dateKey,
    dojoCapacities,
    getEventStyle,
    eventsForDate,
    formatTime,
    fullDate,
    weekDates,
} from "@/lib/instructor-calendar";
import type { CalendarEvent } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";

const SLOT_HEIGHT = 36;
const PIXELS_PER_MINUTE = SLOT_HEIGHT / 30;
const HEIGHT = (TIMELINE_END - TIMELINE_START) * PIXELS_PER_MINUTE;
const intervals = Array.from(
    { length: (TIMELINE_END - TIMELINE_START) / 30 },
    (_, index) => TIMELINE_START + index * 30,
);
type TimelineItem = { id: string; startTime: string; endTime: string } & (
    | { kind: "class"; event: CalendarEvent }
    | { kind: "availability"; slot: AvailabilitySlot }
);
type DragRange = { day: Date; anchor: number; end: number; pointerId: number };

export default function CalendarTimeline({
    date,
    now,
    view,
    focusRequest = 0,
    slots,
    selectedId,
    onSelectClass,
    onSelectAvailability,
    onSelectRange,
    onSelectDate,
}: {
    date: Date;
    now: Date;
    view: "day" | "week";
    focusRequest?: number;
    slots: AvailabilitySlot[];
    selectedId: string | null;
    onSelectClass: (event: CalendarEvent) => void;
    onSelectAvailability: (slot: AvailabilitySlot) => void;
    onSelectRange: (range: AvailabilityRange) => void;
    onSelectDate: (day: Date) => void;
}) {
    const days = view === "day" ? [date] : weekDates(date);
    const [drag, setDrag] = useState<DragRange | null>(null);
    const dragRef = useRef<DragRange | null>(null);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const focusDayRef = useRef<HTMLDivElement>(null);
    const nowRef = useRef(now);
    nowRef.current = now;
    const rangeKey = `${view}:${dateKey(days[0])}`;
    const todayKey = dateKey(now);
    const focusDayKey = days.some(day => dateKey(day) === todayKey) ? todayKey : dateKey(date);
    const nowMinutes =
        now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    // Only navigation/Today requests refocus; clock ticks just update the marker.
    useLayoutEffect(() => {
        const viewport = scrollRef.current;
        if (!viewport) return;

        const focusCurrentTime = () => {
            const headerHeight = headerRef.current?.offsetHeight ?? 0;
            const visibleHoursHeight = viewport.clientHeight - headerHeight;
            if (visibleHoursHeight <= 0) return false;
            const current = nowRef.current;
            const minute = Math.max(TIMELINE_START, Math.min(TIMELINE_END,
                current.getHours() * 60 + current.getMinutes() + current.getSeconds() / 60,
            ));
            const position = (minute - TIMELINE_START) * PIXELS_PER_MINUTE;
            let left = viewport.scrollLeft;
            const column = focusDayRef.current;
            if (column) {
                const gutterWidth = headerRef.current?.offsetWidth ?? 64;
                const columnLeft = column.getBoundingClientRect().left
                    - viewport.getBoundingClientRect().left + viewport.scrollLeft - viewport.clientLeft;
                left = columnLeft - gutterWidth
                    - Math.max(0, viewport.clientWidth - gutterWidth - column.offsetWidth) / 2;
            }
            // Keep some earlier hours visible above now, below the sticky header.
            viewport.scrollTo({
                top: Math.max(0, position - visibleHoursHeight / 3),
                left: Math.max(0, left),
                behavior: "instant",
            });
            return true;
        };

        if (focusCurrentTime()) return;
        // A timeline mounted in a hidden/unsized panel focuses once it is visible.
        const observer = new ResizeObserver(() => {
            if (focusCurrentTime()) observer.disconnect();
        });
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [rangeKey, focusRequest]);

    function selectRange(range: AvailabilityRange) {
        const nextError = availabilityError(range, slots);
        setError(nextError);
        if (!nextError) onSelectRange(range);
    }

    function pointerMinute(event: PointerEvent<HTMLDivElement>) {
        const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
        return Math.max(
            TIMELINE_START,
            Math.min(
                TIMELINE_END - 30,
                TIMELINE_START + Math.floor(y / SLOT_HEIGHT) * 30,
            ),
        );
    }

    return (
        <section
            aria-label={`${view === "day" ? "Daily" : "Weekly"} hourly timeline`}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
        >
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border bg-card">
                <div
                    className="grid"
                    style={{
                        minWidth: view === "week" ? 910 : 300,
                        gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))`,
                    }}
                >
                    <div ref={headerRef} className="sticky top-0 left-0 z-30 border-r border-b bg-card p-2 text-[10px] text-muted-foreground"></div>
                    {days.map((day) => {
                        const isToday = dateKey(day) === dateKey(now);
                        return (
                            <div
                                key={dateKey(day)}
                                className={cn(
                                    "sticky top-0 z-20 border-r border-b bg-card px-3 py-2.5 text-center",
                                    isToday && "bg-accent",
                                )}
                            >
                                <Button
                                    variant="ghost"
                                    onClick={() => onSelectDate(day)}
                                    aria-current={isToday ? "date" : undefined}
                                    className="h-auto flex-col gap-1.5 px-4 py-2 text-xs"
                                >
                                    <span className="font-normal text-muted-foreground">
                                        {day.toLocaleDateString("en-GB", {
                                            weekday: "short",
                                        })}
                                    </span>
                                    <span
                                        className={cn(
                                            "flex size-7 items-center justify-center rounded-full text-sm",
                                            isToday && "bg-primary text-primary-foreground",
                                        )}
                                    >
                                        {day.getDate()}
                                    </span>
                                </Button>
                            </div>
                        );
                    })}
                    <div
                        className="sticky left-0 z-10 border-r bg-card"
                        style={{ height: HEIGHT + 20 }}
                        aria-hidden="true"
                    >
                        {Array.from(
                            { length: 15 },
                            (_, index) => TIMELINE_START + index * 60,
                        ).map((minute) => (
                            <span
                                key={minute}
                                className="absolute right-2 text-[10px] text-muted-foreground tabular-nums"
                                style={{
                                    top: (minute - TIMELINE_START) * PIXELS_PER_MINUTE,
                                    transform:
                                        minute === TIMELINE_START ? undefined : "translateY(-50%)",
                                }}
                            >
                                {formatTime(minutesTime(minute)).replace(":00", "")}
                            </span>
                        ))}
                    </div>
                    {days.map((day) => {
                        const key = dateKey(day);
                        const isToday = key === dateKey(now);
                        const daySlots = slots.filter((slot) => dateKey(slot.date) === key);
                        const items: TimelineItem[] = [
                            ...eventsForDate(day).map(
                                (event): TimelineItem => ({ ...event, kind: "class", event }),
                            ),
                            ...daySlots.map(
                                (slot): TimelineItem => ({
                                    ...slot,
                                    kind: "availability",
                                    slot,
                                }),
                            ),
                        ].filter(
                            (item) =>
                                timeMinutes(item.endTime) > TIMELINE_START &&
                                timeMinutes(item.startTime) < TIMELINE_END,
                        );
                        const dragStart = drag && Math.min(drag.anchor, drag.end);
                        const dragEnd = drag && Math.max(drag.anchor, drag.end) + 30;
                        return (
                            <div
                                key={key}
                                ref={key === focusDayKey ? focusDayRef : undefined}
                                className={cn(
                                    "relative border-r",
                                    isToday && "bg-primary/[0.025]",
                                )}
                                style={{ height: HEIGHT + 20 }}
                            >
                                <div
                                    className="relative select-none"
                                    style={{ height: HEIGHT }}
                                    onPointerDown={(event) => {
                                        if (
                                            event.button !== 0 ||
                                            event.pointerType === "touch" ||
                                            !(event.target instanceof HTMLElement) ||
                                            !event.target.closest("[data-empty-slot]")
                                        )
                                            return;
                                        const minute = pointerMinute(event);
                                        if (slotDateTime(day, minutesTime(minute)) <= new Date())
                                            return;
                                        event.preventDefault();
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        const next = {
                                            day,
                                            anchor: minute,
                                            end: minute,
                                            pointerId: event.pointerId,
                                        };
                                        dragRef.current = next;
                                        setDrag(next);
                                        setError(null);
                                    }}
                                    onPointerMove={(event) => {
                                        if (
                                            !dragRef.current ||
                                            dragRef.current.pointerId !== event.pointerId
                                        )
                                            return;
                                        const next = {
                                            ...dragRef.current,
                                            end: pointerMinute(event),
                                        };
                                        dragRef.current = next;
                                        setDrag(next);
                                    }}
                                    onPointerUp={(event) => {
                                        const current = dragRef.current;
                                        if (!current || current.pointerId !== event.pointerId)
                                            return;
                                        const end = pointerMinute(event);
                                        dragRef.current = null;
                                        setDrag(null);
                                        event.currentTarget.releasePointerCapture(event.pointerId);
                                        selectRange({
                                            date: current.day,
                                            startTime: minutesTime(Math.min(current.anchor, end)),
                                            endTime: minutesTime(Math.max(current.anchor, end) + 30),
                                        });
                                    }}
                                    onPointerCancel={() => {
                                        dragRef.current = null;
                                        setDrag(null);
                                    }}
                                >
                                    {intervals.map((minute) => {
                                        const startTime = minutesTime(minute);
                                        const endTime = minutesTime(minute + 30);
                                        const disabled =
                                            slotDateTime(day, startTime) <= now ||
                                            items.some(
                                                (item) =>
                                                    minute < timeMinutes(item.endTime) &&
                                                    minute + 30 > timeMinutes(item.startTime),
                                            );
                                        return (
                                            <button
                                                key={minute}
                                                type="button"
                                                data-empty-slot
                                                disabled={disabled}
                                                aria-label={`Add availability on ${fullDate(day)}, ${formatTime(startTime)} to ${formatTime(endTime)}`}
                                                onClick={(event) => {
                                                    // Mouse/pen selection is handled on pointer-up; touch and keyboard use click.
                                                    if (
                                                        event.detail !== 0 &&
                                                        (event.nativeEvent as globalThis.PointerEvent)
                                                            .pointerType !== "touch"
                                                    )
                                                        return;
                                                    selectRange({ date: day, startTime, endTime });
                                                }}
                                                className={cn(
                                                    "absolute inset-x-0 w-full border-t text-left outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring enabled:cursor-crosshair enabled:hover:bg-emerald-100/50 dark:enabled:hover:bg-emerald-900/30",
                                                    minute % 60 !== 0 && "border-dashed border-border/60",
                                                    disabled && "bg-muted/15",
                                                )}
                                                style={{
                                                    top: (minute - TIMELINE_START) * PIXELS_PER_MINUTE,
                                                    height: SLOT_HEIGHT,
                                                }}
                                            />
                                        );
                                    })}
                                    {layoutTimelineItems(items).map(({ item, lane, lanes }) => {
                                        const start = Math.max(
                                            TIMELINE_START,
                                            timeMinutes(item.startTime),
                                        );
                                        const end = Math.min(
                                            TIMELINE_END,
                                            timeMinutes(item.endTime),
                                        );
                                        const isClass = item.kind === "class";
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                aria-pressed={selectedId === item.id}
                                                aria-label={`${isClass ? item.event.name : "Available"}, ${fullDate(day)}, ${formatTime(item.startTime)} to ${formatTime(item.endTime)}. View details`}
                                                onClick={() => {
                                                    if (item.kind === "class") onSelectClass(item.event);
                                                    else onSelectAvailability(item.slot);
                                                }}
                                                className={cn(
                                                    "absolute z-10 flex flex-col items-start overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-left text-xs shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                                                    isClass
                                                        ? getEventStyle(item.event).card
                                                        : cn(availabilityStyle, "border-dashed"),
                                                    selectedId === item.id && "z-[15] ring-2 ring-primary ring-offset-2 ring-offset-card",
                                                )}
                                                style={{
                                                    top: (start - TIMELINE_START) * PIXELS_PER_MINUTE,
                                                    height: (end - start) * PIXELS_PER_MINUTE,
                                                    left: `calc(${(lane * 100) / lanes}% + 3px)`,
                                                    width: `calc(${100 / lanes}% - 6px)`,
                                                }}
                                            >
                                                {isClass && selectedId === item.id && <SelectedClassIndicator className="absolute top-1 right-1" />}
                                                <span className={cn("block max-w-full truncate font-semibold", isClass && selectedId === item.id && "pr-5")}>
                                                    {isClass ? item.event.name : "Available"}
                                                </span>
                                                <span className="block text-[10px] leading-tight">
                                                    {formatTime(item.startTime)} –{" "}
                                                    {formatTime(item.endTime)}
                                                </span>
                                                {isClass && end - start >= 60 && (
                                                    <span className="mt-1 flex w-full items-center justify-between gap-2 text-[10px] opacity-80">
                                                        <span className="min-w-0 truncate">{item.event.dojo}</span>
                                                        <span className="shrink-0">{item.event.studentIds.length}/{dojoCapacities[item.event.dojo]} students</span>
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                    {drag &&
                                        dateKey(drag.day) === key &&
                                        dragStart !== null &&
                                        dragEnd !== null && (
                                            <div
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-x-0 z-20 border-2 border-emerald-500 bg-emerald-200/60 px-1 text-xs text-emerald-950"
                                                style={{
                                                    top: (dragStart - TIMELINE_START) * PIXELS_PER_MINUTE,
                                                    height: (dragEnd - dragStart) * PIXELS_PER_MINUTE,
                                                }}
                                            >
                                                {formatTime(minutesTime(dragStart))} –{" "}
                                                {formatTime(minutesTime(dragEnd))}
                                            </div>
                                        )}
                                    {isToday &&
                                        nowMinutes >= TIMELINE_START &&
                                        nowMinutes <= TIMELINE_END && (
                                            <div
                                                role="img"
                                                aria-label={`Current time: ${formatTime(minutesTime(Math.floor(nowMinutes)))}`}
                                                className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                                                style={{
                                                    top:
                                                        (nowMinutes - TIMELINE_START) * PIXELS_PER_MINUTE,
                                                }}
                                            >
                                                <span className="absolute -top-[5px] -left-1 size-2 rounded-full bg-red-500" />
                                            </div>
                                        )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
