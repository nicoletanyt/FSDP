import { useEffect, useLayoutEffect, useRef } from "react";
import { addDays, dateKey, weekDates } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";

// A swipeable strip of weeks (previous, current, next) for picking a day on a
// phone. Shared by the instructor and admin calendars.
export default function WeekStrip({
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
