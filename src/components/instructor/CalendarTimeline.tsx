import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { CalendarCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { availabilityStyle } from "@/components/instructor/CalendarAvailability";
import SelectedClassIndicator from "@/components/instructor/SelectedClassIndicator";
import CalendarDaySelector from "@/components/instructor/CalendarDaySelector";
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
    getEventStyle,
    formatTime,
    fullDate,
    weekDates,
} from "@/lib/instructor-calendar";
import { rosterSizeLabel } from "@/lib/instructor/calendar-view";
import type { CalendarEventsForDate, CalendarViewEvent as CalendarEvent } from "@/lib/instructor/calendar-view";
import { cn } from "@/lib/utils";

type TimelineItem = { id: string; startTime: string; endTime: string } & (
    | { kind: "class"; event: CalendarEvent }
    | { kind: "availability"; slot: AvailabilitySlot }
);
type DragRange = { day: Date; anchor: number; end: number; pointerId: number };

export default function CalendarTimeline({
    getEvents,
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
    isDesktop,
}: {
    getEvents: CalendarEventsForDate;
    date: Date;
    now: Date;
    view: "day" | "week";
    focusRequest?: number;
    slots: AvailabilitySlot[];
    selectedId: string | null;
    onSelectClass: (event: CalendarEvent) => void;
    onSelectAvailability: (slot: AvailabilitySlot) => void;
    onSelectRange?: (range: AvailabilityRange) => void;
    onSelectDate: (day: Date) => void;
    isDesktop: boolean;
}) {
    const isDay = view === "day";
    const timelineStart = isDay ? 0 : TIMELINE_START;
    const timelineEnd = isDay ? 24 * 60 : TIMELINE_END;
    const slotHeight = isDay ? 48 : isDesktop ? 36 : 44;
    const pixelsPerMinute = slotHeight / 30;
    const height = (timelineEnd - timelineStart) * pixelsPerMinute;
    const intervals = Array.from(
        { length: (timelineEnd - timelineStart) / 30 },
        (_, index) => timelineStart + index * 30,
    );
    const days = view === "day" || !isDesktop ? [date] : weekDates(date);
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
    const focusDayKey = days.some((day) => dateKey(day) === todayKey)
        ? todayKey
        : dateKey(date);
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
            const viewingToday = dateKey(date) === dateKey(current);
            const focusMinute =
                isDay && !viewingToday
                    ? TIMELINE_START
                    : current.getHours() * 60 +
                    current.getMinutes() +
                    current.getSeconds() / 60;
            const minute = Math.max(
                timelineStart,
                Math.min(timelineEnd, focusMinute),
            );
            const position = (minute - timelineStart) * pixelsPerMinute;
            let left = viewport.scrollLeft;
            const column = focusDayRef.current;
            if (column) {
                const gutterWidth = headerRef.current?.offsetWidth ?? (isDay ? 56 : 64);
                const columnLeft =
                    column.getBoundingClientRect().left -
                    viewport.getBoundingClientRect().left +
                    viewport.scrollLeft -
                    viewport.clientLeft;
                left =
                    columnLeft -
                    gutterWidth -
                    Math.max(0, viewport.clientWidth - gutterWidth - column.offsetWidth) /
                    2;
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
    }, [rangeKey, focusRequest, timelineStart, timelineEnd, pixelsPerMinute]);

    function selectRange(range: AvailabilityRange) {
        if (!onSelectRange) return;
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
                timelineStart + Math.floor(y / slotHeight) * 30,
            ),
        );
    }

    return (
        <section
            aria-label={`${view === "day" ? "Daily" : "Weekly"} hourly timeline`}
            className="flex min-w-0 flex-col gap-2 lg:min-h-0 lg:flex-1"
        >
            {!isDesktop && view === "week" && <CalendarDaySelector date={date} today={now} onSelectDate={onSelectDate} />}
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
            {!days.some(day => getEvents(day).length || slots.some(slot => dateKey(slot.date) === dateKey(day))) &&
                <p role="status" className="text-xs text-muted-foreground">No classes or availability scheduled.</p>}
            <div
                ref={scrollRef}
                className="h-[min(60dvh,36rem)] min-h-48 overflow-auto overscroll-contain rounded-xl border bg-card lg:h-auto lg:min-h-0 lg:flex-1"
            >
                <div
                    className="grid"
                    style={{
                        minWidth: view === "week" && isDesktop ? 910 : undefined,
                        gridTemplateColumns: `${isDay ? 56 : 64}px repeat(${days.length}, minmax(0, 1fr))`,
                    }}
                >
                    {!isDay && (
                        <div
                            ref={headerRef}
                            className="sticky top-0 left-0 z-30 border-r border-b bg-card p-2 text-[10px] text-muted-foreground"
                        />
                    )}
                    {!isDay &&
                        days.map((day) => {
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
                        style={{ height: height + 20 }}
                        aria-hidden="true"
                    >
                        {Array.from(
                            { length: (timelineEnd - timelineStart) / 60 + 1 },
                            (_, index) => timelineStart + index * 60,
                        ).map((minute) => (
                            <span
                                key={minute}
                                className="absolute right-2 text-[10px] text-muted-foreground tabular-nums"
                                style={{
                                    top: (minute - timelineStart) * pixelsPerMinute,
                                    transform:
                                        minute === timelineStart ? undefined : "translateY(-50%)",
                                }}
                            >
                                {formatTime(minutesTime(minute % (24 * 60))).replace(":00", "")}
                            </span>
                        ))}
                    </div>
                    {days.map((day) => {
                        const key = dateKey(day);
                        const isToday = key === dateKey(now);
                        const daySlots = slots.filter((slot) => dateKey(slot.date) === key);
                        const items: TimelineItem[] = [
                            ...getEvents(day).map(
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
                                timeMinutes(item.endTime) > timelineStart &&
                                timeMinutes(item.startTime) < timelineEnd,
                        );
                        const dragStart = drag && Math.min(drag.anchor, drag.end);
                        const dragEnd = drag && Math.max(drag.anchor, drag.end) + 30;
                        return (
                            <div
                                key={key}
                                ref={key === focusDayKey ? focusDayRef : undefined}
                                className={cn(
                                    "relative border-r",
                                    isToday && !isDay && "bg-primary/[0.025]",
                                )}
                                style={{ height: height + 20 }}
                            >
                                <div
                                    className="relative select-none"
                                    style={{ height }}
                                    onPointerDown={(event) => {
                                        if (
                                            !onSelectRange ||
                                            event.button !== 0 ||
                                            event.pointerType === "touch" ||
                                            !(event.target instanceof HTMLElement) ||
                                            !event.target.closest(
                                                isDay
                                                    ? "[data-empty-slot]:not(:disabled)"
                                                    : "[data-empty-slot]",
                                            )
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
                                            !onSelectRange ||
                                            (isDay &&
                                                (minute < TIMELINE_START ||
                                                    minute + 30 > TIMELINE_END)) ||
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
                                                aria-label={`Add availability on ${fullDate(day)}, ${formatTime(startTime)} to ${formatTime(minutesTime((minute + 30) % (24 * 60)))}`}
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
                                                    isDay && "border-border/60 disabled:bg-transparent",
                                                    isDay &&
                                                    minute % 60 !== 0 &&
                                                    "border-solid border-border/25",
                                                )}
                                                style={{
                                                    top: (minute - timelineStart) * pixelsPerMinute,
                                                    height: slotHeight,
                                                }}
                                            />
                                        );
                                    })}
                                    {layoutTimelineItems(items).map(({ item, lane, lanes }) => {
                                        const start = Math.max(
                                            timelineStart,
                                            timeMinutes(item.startTime),
                                        );
                                        const end = Math.min(
                                            timelineEnd,
                                            timeMinutes(item.endTime),
                                        );
                                        const isClass = item.kind === "class";
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                aria-pressed={selectedId === item.id}
                                                aria-controls={
                                                    isDay && isClass && selectedId === item.id
                                                        ? `attendance-${item.id}`
                                                        : undefined
                                                }
                                                aria-label={`${isClass ? `${item.event.name}${isDay ? `, ${item.event.dojo}` : ""}` : "Available"}, ${fullDate(day)}, ${formatTime(item.startTime)} to ${formatTime(item.endTime)}. View details`}
                                                onClick={() => {
                                                    if (item.kind === "class") onSelectClass(item.event);
                                                    else onSelectAvailability(item.slot);
                                                }}
                                                className={cn(
                                                    "absolute z-10 flex flex-col items-start overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-left text-xs shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                                                    isClass
                                                        ? getEventStyle(item.event).card
                                                        : cn(availabilityStyle, "border-dashed"),
                                                    selectedId === item.id &&
                                                    "z-[15] ring-2 ring-primary ring-offset-2 ring-offset-card",
                                                    isDay &&
                                                    "rounded-lg px-2.5 py-[3px] text-[12px] leading-tight",
                                                    isDay &&
                                                    !isClass &&
                                                    "bg-emerald-50/80 dark:bg-emerald-950/80",
                                                )}
                                                style={{
                                                    top: (start - timelineStart) * pixelsPerMinute,
                                                    height: (end - start) * pixelsPerMinute,
                                                    left: `calc(${(lane * 100) / lanes}% + ${isDay ? 6 : 3}px)`,
                                                    width: `calc(${100 / lanes}% - ${isDay ? 12 : 6}px)`,
                                                }}
                                            >
                                                {isClass && selectedId === item.id && (
                                                    <SelectedClassIndicator className="absolute top-1 right-1" />
                                                )}
                                                <span
                                                    className={cn(
                                                        "block max-w-full truncate font-semibold",
                                                        isDay && "flex items-center gap-1.5",
                                                        isClass && selectedId === item.id && "pr-5",
                                                    )}
                                                >
                                                    {isDay && !isClass && (
                                                        <CalendarCheck
                                                            aria-hidden="true"
                                                            className="size-3 shrink-0"
                                                        />
                                                    )}
                                                    <span className="truncate">
                                                        {isClass ? item.event.name : "Available"}
                                                    </span>
                                                </span>
                                                <span className="block text-[10px] leading-tight">
                                                    {formatTime(item.startTime)} –{" "}
                                                    {formatTime(item.endTime)}
                                                </span>
                                                {isClass && isDay && (
                                                    <span className="flex max-w-full items-center gap-1 text-[10px] leading-tight opacity-80">
                                                        <MapPin
                                                            aria-hidden="true"
                                                            className="size-3 shrink-0"
                                                        />
                                                        <span className="truncate">{item.event.dojo}</span>
                                                    </span>
                                                )}
                                                {isClass && end - start >= 60 && !isDay && (
                                                    <span className="mt-1 flex w-full items-center justify-between gap-2 text-[10px] opacity-80">
                                                        <span className="min-w-0 truncate">
                                                            {item.event.dojo}
                                                        </span>
                                                        <span className="shrink-0">
                                                            {rosterSizeLabel(item.event)}
                                                        </span>
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
                                                    top: (dragStart - timelineStart) * pixelsPerMinute,
                                                    height: (dragEnd - dragStart) * pixelsPerMinute,
                                                }}
                                            >
                                                {formatTime(minutesTime(dragStart))} –{" "}
                                                {formatTime(minutesTime(dragEnd))}
                                            </div>
                                        )}
                                    {isToday &&
                                        nowMinutes >= timelineStart &&
                                        nowMinutes <= timelineEnd && (
                                            <div
                                                role="img"
                                                aria-label={`Current time: ${formatTime(minutesTime(Math.floor(nowMinutes)))}`}
                                                className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                                                style={{
                                                    top: (nowMinutes - timelineStart) * pixelsPerMinute,
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
