import type { StudentRank } from "./student-grades";

export type EventType = "training" | "grading" | "seminar" | "workshop";
export type ClassType = keyof typeof classTypes;
export type CalendarEvent = {
    id: string;
    date: Date;
    name: string;
    type: EventType;
    classType?: ClassType;
    startTime: string;
    endTime: string;
    dojo: string;
    instructorId: string;
    studentIds: string[];
};
export type ClassTemplate = Omit<CalendarEvent, "id" | "date"> & { id: string; weekday: number };
export type Student = { id: string; name: string } & StudentRank;
export type Attendance = "unmarked" | "present" | "absent";
export type ReportAuthor = { id: string; name: string };
export type InstructorProfile = ReportAuthor & { role: string; avatarUrl?: string };
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

// Sign-offs retain a name snapshot for older/unknown accounts, but identity and
// live profile lookup always use the instructor ID, never a display-name match.
export function resolveInstructorProfile(
    instructorId: string,
    fallbackName = "",
    currentProfile?: InstructorProfile | null,
): InstructorProfile {
    if (currentProfile?.id === instructorId) return currentProfile;
    const instructor = instructors.find(item => item.id === instructorId);
    return {
        id: instructorId,
        name: (instructor?.name ?? fallbackName.trim()) || "Unknown instructor",
        role: "Instructor",
    };
}

const instructorPhotoPrefix = "instructor-profile-photo-v1:";
const instructorPhotoChanged = "instructor-profile-photo-changed";

export function getInstructorPhoto(instructorId: string | null | undefined): string | null {
    if (!instructorId) return null;
    try {
        const photo = localStorage.getItem(`${instructorPhotoPrefix}${instructorId}`);
        return photo && /^data:image\/(jpeg|png|webp);base64,/.test(photo) ? photo : null;
    } catch {
        return null;
    }
}

export function saveInstructorPhoto(instructorId: string, photo: string | null) {
    if (!instructorId) throw new Error("Your instructor profile is not ready yet.");
    const key = `${instructorPhotoPrefix}${instructorId}`;
    if (photo) localStorage.setItem(key, photo);
    else localStorage.removeItem(key);
    // Native storage events notify other tabs; this notifies this tab's avatars.
    window.dispatchEvent(new Event(instructorPhotoChanged));
}

export function subscribeInstructorPhotos(listener: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key.startsWith(instructorPhotoPrefix)) listener();
    };
    window.addEventListener(instructorPhotoChanged, listener);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(instructorPhotoChanged, listener);
        window.removeEventListener("storage", onStorage);
    };
}

export async function prepareInstructorPhoto(file: File): Promise<string> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Choose a JPG, PNG or WebP image.");
    }
    if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image of 5 MB or smaller.");
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = objectUrl;
        try {
            await image.decode();
        } catch {
            throw new Error("This image could not be opened. Please choose another photo.");
        }
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("Choose a valid profile photo.");
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Your browser could not prepare this photo. Please try again.");
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 512, 512);
        context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
        return canvas.toDataURL("image/jpeg", 0.85);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export const dojoCapacities: Record<string, number> = {
    "Central Dojo": 24,
    "Northside Dojo": 18,
};

export const students: Student[] = [
    { id: "student-1", name: "Emma Wilson", gradingSystem: "children", rank: "10-kyu" },
    { id: "student-2", name: "Noah Patel", gradingSystem: "children", rank: "8-kyu" },
    { id: "student-3", name: "Olivia Chen", gradingSystem: "children", rank: "10-kyu" },
    { id: "student-4", name: "Liam Taylor", gradingSystem: "adults", rank: "3-kyu" },
    { id: "student-5", name: "Ava Thompson", gradingSystem: "children", rank: "7-kyu" },
    { id: "student-6", name: "Ethan Lee", gradingSystem: "adults", rank: "1-kyu" },
    { id: "student-7", name: "Mia Roberts", gradingSystem: "children", rank: "10-kyu" },
    { id: "student-8", name: "Lucas Evans", gradingSystem: "children", rank: "8-kyu" },
    { id: "student-9", name: "Isla James", gradingSystem: "adults", rank: "2-kyu" },
    { id: "student-10", name: "Oliver Scott", gradingSystem: "adults", rank: "3-kyu" },
    { id: "student-11", name: "Amelia Lewis", gradingSystem: "adults", rank: "4-kyu" },
    { id: "student-12", name: "Leo Martin", gradingSystem: "adults", rank: "1-dan" },
    { id: "student-13", name: "Sophie Tan", gradingSystem: "children", rank: "10-kyu" },
    { id: "student-14", name: "Jayden Lim", gradingSystem: "children", rank: "8-kyu" },
    { id: "student-15", name: "Ella Ng", gradingSystem: "children", rank: "10-kyu" },
    { id: "student-16", name: "Daniel Wong", gradingSystem: "adults", rank: "2-kyu" },
    { id: "student-17", name: "Grace Teo", gradingSystem: "adults", rank: "3-kyu" },
    { id: "student-18", name: "Michael Ong", gradingSystem: "adults", rank: "6-kyu" },
    { id: "student-19", name: "Chloe Tan", gradingSystem: "adults", rank: "6-kyu" },
    { id: "student-20", name: "Sophia Lim", gradingSystem: "adults", rank: "5-kyu" },
    { id: "student-21", name: "Hannah Goh", gradingSystem: "adults", rank: "3-kyu" },
    { id: "student-22", name: "Rachel Ho", gradingSystem: "adults", rank: "2-kyu" },
];
export const classTemplates: ClassTemplate[] = [
    { id: "children-beginners-mon", weekday: 1, name: "Children Beginners", type: "training", classType: "children-beginners", startTime: "17:00", endTime: "18:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-1", "student-2", "student-3", "student-5", "student-7", "student-8"] },
    { id: "adults-tue", weekday: 2, name: "Adults", type: "training", classType: "adults", startTime: "18:00", endTime: "19:00", dojo: "Northside Dojo", instructorId: "instructor-1", studentIds: ["student-4", "student-6", "student-9", "student-10", "student-11", "student-12"] },
    { id: "intermediate-wed", weekday: 3, name: "Intermediate", type: "training", classType: "intermediate", startTime: "17:30", endTime: "18:30", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-2", "student-4", "student-5", "student-8", "student-10", "student-11"] },
    { id: "advanced-wed", weekday: 3, name: "Advanced", type: "training", classType: "advanced", startTime: "19:00", endTime: "20:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-6", "student-9", "student-12"] },
    { id: "children-beginners-thu", weekday: 4, name: "Children Beginners", type: "training", classType: "children-beginners", startTime: "16:00", endTime: "17:00", dojo: "Northside Dojo", instructorId: "instructor-1", studentIds: ["student-1", "student-2", "student-3", "student-5", "student-7", "student-8"] },
    { id: "mixed-family-fri", weekday: 5, name: "Mixed/Family", type: "training", classType: "mixed-family", startTime: "18:00", endTime: "19:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: students.map((student) => student.id) },
    { id: "weapons-sat", weekday: 6, name: "Weapons", type: "training", classType: "weapons", startTime: "14:30", endTime: "15:30", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-4", "student-6", "student-9", "student-12"] },
    { id: "children-grading-sat", weekday: 6, name: "Children Grading", type: "grading", startTime: "10:00", endTime: "12:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-1", "student-2", "student-3", "student-5"] },
    { id: "adults-grading-sat", weekday: 6, name: "Adults Grading", type: "grading", startTime: "12:30", endTime: "14:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-4", "student-6", "student-9", "student-12"] },
    { id: "other-instructor", weekday: 1, name: "Adults", type: "training", classType: "adults", startTime: "19:00", endTime: "20:00", dojo: "Northside Dojo", instructorId: "instructor-2", studentIds: ["student-2", "student-6"] },
    { id: "children-juniors-tue", weekday: 2, name: "Children Juniors", type: "training", classType: "children-juniors", startTime: "16:00", endTime: "17:00", dojo: "Northside Dojo", instructorId: "instructor-1", studentIds: ["student-13", "student-14", "student-15"] },
    { id: "sg50-sun", weekday: 0, name: "SG50", type: "training", classType: "sg50", startTime: "09:00", endTime: "10:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-16", "student-17", "student-18"] },
    { id: "ladies-thu", weekday: 4, name: "Ladies", type: "training", classType: "ladies", startTime: "18:00", endTime: "19:00", dojo: "Central Dojo", instructorId: "instructor-1", studentIds: ["student-19", "student-20", "student-21", "student-22"] },
];

// Reference timetable colours, shared by every calendar layout and the info popover.
export const classTypes = {
    "children-beginners": {
        label: "Children Beginners",
        description: "7th Kyu & above, ages 4 to 12",
        card: "border-[#598fb3] bg-[#5995bc] text-white hover:bg-[#5995bc] hover:text-white dark:border-[#6ca9cd] dark:bg-[#28516b] dark:text-white dark:hover:bg-[#28516b]",
        badge: "border-[#598fb3] bg-[#5995bc] text-white dark:border-[#6ca9cd] dark:bg-[#28516b] dark:text-white",
        dot: "bg-[#5995bc]",
    },
    "children-juniors": {
        label: "Children Juniors",
        description: "Suitable for all grades, ages 4 to 6",
        card: "border-[#81b6c8] bg-[#98cddd] text-[#102b37] dark:border-[#5d9fb3] dark:bg-[#244955] dark:text-cyan-50",
        badge: "border-[#81b6c8] bg-[#98cddd] text-[#102b37] dark:border-[#5d9fb3] dark:bg-[#244955] dark:text-cyan-50",
        dot: "bg-[#98cddd]",
    },
    adults: {
        label: "Adults",
        description: "13 years & above",
        card: "border-[#cbaa62] bg-[#f2e4b9] text-[#302a19] dark:border-[#a99052] dark:bg-[#51452a] dark:text-amber-50",
        badge: "border-[#cbaa62] bg-[#f2e4b9] text-[#302a19] dark:border-[#a99052] dark:bg-[#51452a] dark:text-amber-50",
        dot: "bg-[#f2e4b9]",
    },
    "mixed-family": {
        label: "Mixed/Family",
        description: "Suitable for all adults & children",
        card: "border-[#7661b4] bg-[#c9c2df] text-[#29213f] dark:border-[#9c88d1] dark:bg-[#3d345d] dark:text-violet-50",
        badge: "border-[#7661b4] bg-[#c9c2df] text-[#29213f] dark:border-[#9c88d1] dark:bg-[#3d345d] dark:text-violet-50",
        dot: "bg-[#c9c2df]",
    },
    weapons: {
        label: "Weapons",
        description: "Weapons class",
        card: "border-[#6ca34f] bg-[#c8d9c2] text-[#23331c] dark:border-[#82b268] dark:bg-[#30472b] dark:text-green-50",
        badge: "border-[#6ca34f] bg-[#c8d9c2] text-[#23331c] dark:border-[#82b268] dark:bg-[#30472b] dark:text-green-50",
        dot: "bg-[#c8d9c2]",
    },
    intermediate: {
        label: "Intermediate",
        description: "4th Kyu & above",
        card: "border-[#488fd5] bg-[#c3daf0] text-[#19344e] dark:border-[#6ba9e4] dark:bg-[#263f5c] dark:text-blue-50",
        badge: "border-[#488fd5] bg-[#c3daf0] text-[#19344e] dark:border-[#6ba9e4] dark:bg-[#263f5c] dark:text-blue-50",
        dot: "bg-[#c3daf0]",
    },
    advanced: {
        label: "Advanced",
        description: "1st Kyu & above only",
        card: "border-[#488998] bg-[#c3d8dd] text-[#1c373e] dark:border-[#6da8b5] dark:bg-[#29474e] dark:text-cyan-50",
        badge: "border-[#488998] bg-[#c3d8dd] text-[#1c373e] dark:border-[#6da8b5] dark:bg-[#29474e] dark:text-cyan-50",
        dot: "bg-[#c3d8dd]",
    },
    sg50: {
        label: "SG50",
        description: "Energy | KI Training",
        card: "border-[#b44c88] bg-[#dbc5d2] text-[#442236] dark:border-[#d47aaf] dark:bg-[#543345] dark:text-pink-50",
        badge: "border-[#b44c88] bg-[#dbc5d2] text-[#442236] dark:border-[#d47aaf] dark:bg-[#543345] dark:text-pink-50",
        dot: "bg-[#dbc5d2]",
    },
    ladies: {
        label: "Ladies",
        description: "Ladies only",
        card: "border-[#d96b7a] bg-[#e8c2c7] text-[#48232a] dark:border-[#e38a96] dark:bg-[#5b343e] dark:text-rose-50",
        badge: "border-[#d96b7a] bg-[#e8c2c7] text-[#48232a] dark:border-[#e38a96] dark:bg-[#5b343e] dark:text-rose-50",
        dot: "bg-[#e8c2c7]",
    },
} as const;

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

export function getEventStyle(event: Pick<CalendarEvent, "type" | "classType">) {
    if (event.type === "seminar" || event.type === "workshop") {
        return { ...eventStyles.training, label: event.type === "seminar" ? "Seminar" : "Workshop" };
    }
    return event.type === "training" && event.classType
        ? { ...classTypes[event.classType], label: eventStyles.training.label }
        : eventStyles[event.type];
}

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
    const [rawHours, minutes] = time.split(":").map(Number);
    const hours = rawHours % 24;
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

export function calendarHref(event: Pick<CalendarEvent, "id" | "date">) {
    const params = new URLSearchParams({ date: dateKey(event.date), session: event.id });
    return `/instructor/calendar?${params}`;
}

export function studentDetailsHref(studentId: string, event?: Pick<CalendarEvent, "id" | "date">, tab?: "overview" | "sessions" | "grading") {
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
