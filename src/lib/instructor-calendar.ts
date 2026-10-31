export type EventType = "training" | "grading";
export type CalendarEvent = {
    id: string;
    date: Date;
    name: string;
    type: EventType;
    startTime: string;
    endTime: string;
    dojo: string;
    instructorId: string;
    studentIds: string[];
};
export type ClassTemplate = Omit<CalendarEvent, "id" | "date"> & { id: string; weekday: number };
export type Student = { id: string; name: string; beltGrade: string; targetGrade: string };
export type Attendance = "unmarked" | "present" | "absent";
export type ReportAuthor = { id: string; name: string };
export type StudentSession = {
    attendance: Attendance;
    comment: string;
    reportAuthor?: ReportAuthor;
    assessmentStatus: "pending" | "completed";
    assessmentNotes: string;
};
export type SessionRecord = Record<string, StudentSession>;

// Dummy data only. These fixtures and local save helpers can be replaced by a data provider.
export const instructors = [
    { id: "instructor-1", name: "Alex Morgan" },
    { id: "instructor-2", name: "Jamie Chen" },
];
export const currentInstructor = instructors[0];
export const students: Student[] = [
    { id: "student-1", name: "Emma Wilson", beltGrade: "White belt", targetGrade: "Yellow belt" },
    { id: "student-2", name: "Noah Patel", beltGrade: "Yellow belt", targetGrade: "Orange belt" },
    { id: "student-3", name: "Olivia Chen", beltGrade: "White belt", targetGrade: "Yellow belt" },
    { id: "student-4", name: "Liam Taylor", beltGrade: "Green belt", targetGrade: "Blue belt" },
    { id: "student-5", name: "Ava Thompson", beltGrade: "Orange belt", targetGrade: "Green belt" },
    { id: "student-6", name: "Ethan Lee", beltGrade: "Brown belt", targetGrade: "Black belt · 1st Dan" },
    { id: "student-7", name: "Mia Roberts", beltGrade: "White belt", targetGrade: "Yellow belt" },
    { id: "student-8", name: "Lucas Evans", beltGrade: "Yellow belt", targetGrade: "Orange belt" },
    { id: "student-9", name: "Isla James", beltGrade: "Blue belt", targetGrade: "Brown belt" },
    { id: "student-10", name: "Oliver Scott", beltGrade: "Green belt", targetGrade: "Blue belt" },
    { id: "student-11", name: "Amelia Lewis", beltGrade: "Orange belt", targetGrade: "Green belt" },
    { id: "student-12", name: "Leo Martin", beltGrade: "Brown belt", targetGrade: "Black belt · 1st Dan" },
];
export const classTemplates: ClassTemplate[] = [
    { id: "children-beginners-mon", weekday: 1, name: "Children Beginners", type: "training", startTime: "17:00", endTime: "18:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-1", "student-2", "student-3", "student-5", "student-7", "student-8"] },
    { id: "adults-tue", weekday: 2, name: "Adults", type: "training", startTime: "18:00", endTime: "19:00", dojo: "Northside Dojo", instructorId: "instructor-1", studentIds: ["student-4", "student-6", "student-9", "student-10", "student-11", "student-12"] },
    { id: "intermediate-wed", weekday: 3, name: "Intermediate", type: "training", startTime: "17:30", endTime: "18:30", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-2", "student-4", "student-5", "student-8", "student-10", "student-11"] },
    { id: "advanced-wed", weekday: 3, name: "Advanced", type: "training", startTime: "19:00", endTime: "20:30", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-6", "student-9", "student-12"] },
    { id: "children-beginners-thu", weekday: 4, name: "Children Beginners", type: "training", startTime: "16:00", endTime: "17:00", dojo: "Northside Dojo", instructorId: "instructor-1", studentIds: ["student-1", "student-2", "student-3", "student-5", "student-7", "student-8"] },
    { id: "mixed-family-fri", weekday: 5, name: "Mixed/Family", type: "training", startTime: "18:00", endTime: "19:30", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: students.map((student) => student.id) },
    { id: "weapons-sat", weekday: 6, name: "Weapons", type: "training", startTime: "14:30", endTime: "16:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-4", "student-6", "student-9", "student-12"] },
    { id: "children-grading-sat", weekday: 6, name: "Children Grading", type: "grading", startTime: "10:00", endTime: "12:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-1", "student-2", "student-3", "student-5"] },
    { id: "adults-grading-sat", weekday: 6, name: "Adults Grading", type: "grading", startTime: "12:30", endTime: "14:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-4", "student-6", "student-9", "student-12"] },
    { id: "other-instructor", weekday: 1, name: "Adults", type: "training", startTime: "19:00", endTime: "20:00", dojo: "Northside Dojo", instructorId: "instructor-2", studentIds: ["student-2", "student-6"] },
];

export const eventStyles = {
    training: {
        label: "Training",
        card: "border-blue-200/80 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/30",
        badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
        dot: "bg-blue-500",
    },
    grading: {
        label: "Grading",
        card: "border-amber-200/80 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
        badge: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200",
        dot: "bg-amber-500",
    },
};

export function dateKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function addDays(date: Date, amount: number) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function addMonths(date: Date, amount: number) {
    const month = new Date(date.getFullYear(), date.getMonth() + amount, 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return new Date(month.getFullYear(), month.getMonth(), Math.min(date.getDate(), lastDay));
}

export function startOfWeek(date: Date) {
    return addDays(date, -((date.getDay() + 6) % 7));
}

export function weekDates(date: Date) {
    return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index));
}

export function monthDates(date: Date) {
    const start = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const end = addDays(startOfWeek(lastDay), 6);
    const days: Date[] = [];
    for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
    return days;
}

export function eventsForDate(date: Date): CalendarEvent[] {
    return classTemplates
        .filter((template) => template.instructorId === currentInstructor.id
            && template.weekday === date.getDay()
            && (template.type !== "grading" || Math.floor((date.getDate() - 1) / 7) % 2 === 0))
        .map((template) => ({ ...template, id: `${template.id}-${dateKey(date)}`, date }))
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function formatTime(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function fullDate(date: Date) {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function weekLabel(date: Date) {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(start.getFullYear() !== end.getFullYear() ? { year: "numeric" } : {}) });
    const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
}

export function parseCalendarDate(value: string | null) {
    if (!value || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function findCalendarEvent(id: string | undefined) {
    const match = id?.match(/-(\d{4}-\d{1,2}-\d{1,2})$/);
    const date = parseCalendarDate(match?.[1] ?? null);
    return date ? eventsForDate(date).find((event) => event.id === id) : undefined;
}

export function calendarHref(event: CalendarEvent) {
    const params = new URLSearchParams({ date: dateKey(event.date), session: event.id });
    return `/instructor/calendar?${params}`;
}

export function studentDetailsHref(studentId: string, event?: CalendarEvent, tab?: "overview" | "sessions" | "grading") {
    const params = new URLSearchParams();
    if (event) {
        params.set("date", dateKey(event.date));
        params.set("session", event.id);
    }
    if (tab) params.set("tab", tab);
    const query = params.toString();
    return `/instructor/students/${studentId}${query ? `?${query}` : ""}`;
}

// Demo assessment IDs associate a grading session with one candidate.
export function assessmentHref(event: CalendarEvent, studentId: string) {
    return `/instructor/assessments/${encodeURIComponent(`${event.id}--${studentId}`)}`;
}

// In-memory demo saves survive card/route changes, and reset on a page refresh.
const savedSessions = new Map<string, SessionRecord>();

export function loadSession(event: CalendarEvent): SessionRecord {
    const defaults = Object.fromEntries(event.studentIds.map((id) => [id, {
        attendance: "unmarked", comment: "", assessmentStatus: "pending", assessmentNotes: "",
    } satisfies StudentSession]));
    return structuredClone({ ...defaults, ...savedSessions.get(event.id) });
}

export function saveSession(eventId: string, record: SessionRecord) {
    savedSessions.set(eventId, structuredClone(record));
}

export function getSavedStudentSession(eventId: string, studentId: string): StudentSession | undefined {
    const value = savedSessions.get(eventId)?.[studentId];
    return value ? structuredClone(value) : undefined;
}

export function saveStudentFeedback(event: CalendarEvent, studentId: string, comment: string, fallbackAttendance: Attendance, author?: ReportAuthor) {
    const saved = savedSessions.get(event.id) ?? {};
    const value = saved[studentId] ?? { ...loadSession(event)[studentId], attendance: fallbackAttendance };
    savedSessions.set(event.id, { ...saved, [studentId]: {
        ...value,
        comment,
        reportAuthor: comment.trim() ? value.reportAuthor ?? author ?? currentInstructor : undefined,
    } });
}
