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
    addDays,
    dateKey,
    eventStyles,
    eventsForDate,
    formatTime,
    fullDate,
    parseCalendarDate,
    weekDates,
    weekLabel,
} from "@/lib/instructor-calendar";
import type { CalendarEvent } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";

function EventCard({
    event,
    expanded,
    onToggle,
}: {
    event: CalendarEvent;
    expanded: boolean;
    onToggle: () => void;
}) {
    const style = eventStyles[event.type];
    return (
        <Card
            size="sm"
            className={cn(
                "gap-0 rounded-lg border py-0 shadow-none ring-0 transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 hover:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring",
                style.card,
            )}
        >
            <Button
                variant="ghost"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={`details-${event.id}`}
                aria-label={`${event.name}, ${style.label}, ${fullDate(event.date)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}, ${event.dojo}, ${event.studentIds.length} ${event.type === "grading" ? "candidates" : "students"}. ${expanded ? "Collapse" : "Expand"} class details`}
                className="h-auto w-full flex-col items-stretch gap-2 rounded-lg p-2.5 text-left whitespace-normal hover:bg-foreground/5 focus-visible:-outline-offset-2"
            >
                <span className="flex items-start justify-between gap-1 text-xs leading-snug font-semibold">
                    <span className="min-w-0 wrap-break-word">{event.name}</span>
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
                        expanded
                            ? "flex-row items-center justify-between"
                            : "flex-col items-start",
                    )}
                >
                    <span className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
                        <Clock3 aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                        <span className="min-w-0 wrap-break-word">
                            {formatTime(event.startTime)} – {formatTime(event.endTime)}
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
                        <MapPin aria-hidden="true" className="size-3 shrink-0" />{" "}
                        <span className="min-w-0 wrap-break-word">{event.dojo}</span>
                    </span>
                </div>
            </Button>
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
        </Card>
    );
}

function CalendarWeek({
    date,
    today,
    expandedClassId,
    onSelectDate,
    onToggleClass,
}: {
    date: Date;
    today: Date;
    expandedClassId: string | null;
    onSelectDate: (date: Date) => void;
    onToggleClass: (event: CalendarEvent) => void;
}) {
    const selectedDateButton = useRef<HTMLButtonElement>(null);
    const selectedKey = dateKey(date);
    useEffect(() => {
        selectedDateButton.current?.scrollIntoView({
            block: "nearest",
            inline: "center",
        });
    }, [selectedKey]);

    return (
        <div
            aria-label="Weekly class calendar"
            className="flex min-h-0 flex-1 flex-col gap-3"
        >
            <div
                role="group"
                aria-label="Select agenda day"
                className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:hidden"
            >
                {weekDates(date).map((day) => {
                    const isSelected = dateKey(day) === selectedKey;
                    const isToday = dateKey(day) === dateKey(today);
                    return (
                        <Button
                            key={dateKey(day)}
                            ref={isSelected ? selectedDateButton : undefined}
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
                            <span className="text-[11px] font-normal">
                                {day.toLocaleDateString("en-GB", { weekday: "short" })}
                            </span>
                            <span
                                className={cn(
                                    "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                                    isToday && "bg-primary text-primary-foreground",
                                )}
                            >
                                {fullDate(day)}
                            </span>
                        </Button>
                    );
                })}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border lg:flex-row lg:divide-x">
                {weekDates(date).map((day) => {
                    const events = eventsForDate(day);
                    const isToday = dateKey(day) === dateKey(today);
                    const isSelected = dateKey(day) === dateKey(date);
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
                                isSelected
                                    ? "flex bg-accent/60 lg:grow-0 lg:basis-[clamp(300px,24vw,320px)]"
                                    : "hidden lg:flex lg:grow lg:basis-0",
                            )}
                            data-selected={isSelected}
                        >
                            <header
                                className={cn(
                                    "h-20 shrink-0 border-b p-2 transition-colors duration-200",
                                    isSelected && "bg-accent/70",
                                )}
                            >
                                <Button
                                    variant="ghost"
                                    onClick={() => onSelectDate(day)}
                                    aria-label={`Select and expand ${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
                                    aria-current={isToday ? "date" : undefined}
                                    aria-pressed={isSelected}
                                    className="h-full w-full cursor-pointer flex-col items-center gap-1 px-0 py-1 transition-colors duration-200"
                                >
                                    <span
                                        className={cn(
                                            "flex h-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                                            isSelected && "text-xs",
                                            isToday && "bg-primary text-primary-foreground",
                                        )}
                                    >
                                        {fullDate(day)}
                                    </span>
                                    <span className="h-4 max-w-full shrink-0 truncate px-2 text-xs leading-4 font-normal text-muted-foreground">
                                        {day.toLocaleDateString("en-GB", {
                                            weekday: isSelected ? "long" : "short",
                                        })}
                                        {isToday && isSelected && " · Today"}
                                    </span>
                                </Button>
                            </header>
                            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                                {events.length ? (
                                    events.map((event) => (
                                        <EventCard
                                            key={event.id}
                                            event={event}
                                            expanded={isSelected && expandedClassId === event.id}
                                            onToggle={() => onToggleClass(event)}
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

export default function InstructorDashboard() {
    const [searchParams] = useSearchParams();
    const [today] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
    const [selection, setSelection] = useState(() => {
        const selectedDate = parseCalendarDate(searchParams.get("date")) ?? today;
        const requestedClass = searchParams.get("class");
        return {
            selectedDate,
            expandedClassId: eventsForDate(selectedDate).some(
                (event) => event.id === requestedClass,
            )
                ? requestedClass
                : null,
        };
    });
    const { selectedDate, expandedClassId } = selection;

    function selectDay(date: Date) {
        setSelection((current) => ({
            selectedDate: date,
            expandedClassId:
                dateKey(date) === dateKey(current.selectedDate)
                    ? current.expandedClassId
                    : null,
        }));
    }

    function navigateWeek(direction: number) {
        setSelection((current) => ({
            selectedDate: addDays(current.selectedDate, direction * 7),
            expandedClassId: null,
        }));
    }

    return (
        <section className="flex min-h-0 flex-1 flex-col gap-5">
            <header className="shrink-0">
                <h1 className="text-3xl font-semibold tracking-tight">Your calendar</h1>
            </header>
            <section className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div
                            role="group"
                            aria-label="Week navigation"
                            className="flex items-center gap-1"
                        >
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const now = new Date();
                                    setSelection({
                                        selectedDate: new Date(
                                            now.getFullYear(),
                                            now.getMonth(),
                                            now.getDate(),
                                        ),
                                        expandedClassId: null,
                                    });
                                }}
                                className="mr-1 h-9 px-3"
                            >
                                Today
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                aria-label="Previous week"
                                onClick={() => navigateWeek(-1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                aria-label="Next week"
                                onClick={() => navigateWeek(1)}
                            >
                                <ChevronRight aria-hidden="true" />
                            </Button>
                        </div>
                    </div>
                    <div
                        aria-label="Event categories"
                        className="flex gap-4 text-xs text-muted-foreground"
                    >
                        {(["training", "grading"] as const).map((type) => (
                            <span key={type} className="flex items-center gap-1.5">
                                <span
                                    className={cn("size-2 rounded-full", eventStyles[type].dot)}
                                />{" "}
                                {eventStyles[type].label}
                            </span>
                        ))}
                    </div>
                </div>
                <CalendarWeek
                    date={selectedDate}
                    today={today}
                    expandedClassId={expandedClassId}
                    onSelectDate={selectDay}
                    onToggleClass={(event) =>
                        setSelection((current) => ({
                            selectedDate: event.date,
                            expandedClassId:
                                current.expandedClassId === event.id ? null : event.id,
                        }))
                    }
                />
            </section>
        </section>
    );
}
