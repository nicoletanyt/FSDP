import { Button } from "@/components/ui/button";
import { dateKey, weekDates } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";

export default function CalendarDaySelector({ date, today, onSelectDate }: {
    date: Date;
    today: Date;
    onSelectDate: (day: Date) => void;
}) {
    return <div role="group" aria-label="Select agenda day" className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:hidden">
        {weekDates(date).map((day) => {
            const selected = dateKey(day) === dateKey(date);
            const isToday = dateKey(day) === dateKey(today);
            return <Button key={dateKey(day)} variant="outline" aria-pressed={selected}
                aria-current={isToday ? "date" : undefined}
                aria-label={day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                onClick={() => onSelectDate(day)}
                className={cn("h-auto min-h-11 min-w-0 flex-col gap-0 px-1 py-1 text-xs", selected && "bg-accent") }>
                <span>{day.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                <span className={cn("rounded-full px-1.5 tabular-nums", isToday && "bg-primary text-primary-foreground")}>{day.getDate()}</span>
            </Button>;
        })}
    </div>;
}
