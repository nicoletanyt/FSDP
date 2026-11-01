import { addDays, dateKey, eventsForDate } from "./instructor-calendar";

export type AvailabilitySlot = {
    id: string;
    date: Date;
    startTime: string;
    endTime: string;
};
export type AvailabilityRange = Omit<AvailabilitySlot, "id">;

export const TIMELINE_START = 8 * 60;
export const TIMELINE_END = 22 * 60;

export function timeMinutes(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

export function minutesTime(minutes: number) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function slotDateTime(date: Date, time: string) {
    const result = new Date(date);
    result.setHours(0, timeMinutes(time), 0, 0);
    return result;
}

export function dateInputValue(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function availabilityError(
    range: AvailabilityRange,
    slots: AvailabilitySlot[],
    editingId?: string,
    now = new Date(),
) {
    const start = timeMinutes(range.startTime);
    const end = timeMinutes(range.endTime);
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!Number.isFinite(range.date.getTime()) || !validTime.test(range.startTime) || !validTime.test(range.endTime))
        return "Enter a valid date, start time, and end time.";
    if (start < TIMELINE_START || end > TIMELINE_END)
        return "Availability must be between 8:00 AM and 10:00 PM.";
    if (end <= start) return "End time must be after start time.";
    if (slotDateTime(range.date, range.startTime) <= now)
        return "Choose a start date and time in the future.";
    const overlaps = (item: { startTime: string; endTime: string }) =>
        start < timeMinutes(item.endTime) && end > timeMinutes(item.startTime);
    if (slots.some((slot) => slot.id !== editingId && dateKey(slot.date) === dateKey(range.date) && overlaps(slot)))
        return "This time overlaps an existing availability slot. Choose another time.";
    if (eventsForDate(range.date).some(overlaps))
        return "This time overlaps a scheduled class. Choose an empty time range.";
    return null;
}

export function mockAvailability(today: Date): AvailabilitySlot[] {
    return [
        { id: "availability-demo-1", date: addDays(today, 1), startTime: "09:00", endTime: "11:00" },
        { id: "availability-demo-2", date: addDays(today, 1), startTime: "13:00", endTime: "14:00" },
        { id: "availability-demo-3", date: addDays(today, 3), startTime: "09:30", endTime: "11:30" },
    ].filter((slot) => !availabilityError(slot, [], undefined, today));
}

// Assign a lane to every interval, including transitive overlap groups.
// Adjacent intervals can share a lane; overlapping intervals never do.
export function layoutTimelineItems<T extends { id: string; startTime: string; endTime: string }>(items: T[]) {
    const sorted = [...items].sort((a, b) => timeMinutes(a.startTime) - timeMinutes(b.startTime) || timeMinutes(b.endTime) - timeMinutes(a.endTime));
    const result: { item: T; lane: number; lanes: number }[] = [];
    let group: typeof result = [];
    let laneEnds: number[] = [];
    let groupEnd = -1;
    function flush() {
        group.forEach((entry) => {
            entry.lanes = laneEnds.length;
        });
        result.push(...group);
        group = [];
        laneEnds = [];
        groupEnd = -1;
    }
    for (const item of sorted) {
        const start = timeMinutes(item.startTime);
        const end = timeMinutes(item.endTime);
        if (start >= groupEnd) flush();
        let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = end;
        group.push({ item, lane, lanes: 1 });
        groupEnd = Math.max(groupEnd, end);
    }
    flush();
    return result;
}
