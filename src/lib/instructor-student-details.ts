import { addDays, classTemplates, currentInstructor, dateKey, eventsForDate, getSavedStudentSession, students } from "@/lib/instructor-calendar";
import type { Attendance, CalendarEvent, Student } from "@/lib/instructor-calendar";

export type StudentHistorySession = {
    event: CalendarEvent;
    attendance: Attendance;
    feedback: string;
    instructor: string;
};

const feedbackExamples = [
    "Good progress with stance and balance. Keep practising the turning sequence before the next lesson.",
    "More confident with combinations today. Focus on a consistent guard and controlled finishes.",
    "Strong effort throughout the lesson. Footwork is improving; continue working on timing with a partner.",
    "Kata sequence is coming together well. Slow the transitions down and maintain a steady posture.",
];
const beltOrder = ["White belt", "Yellow belt", "Orange belt", "Green belt", "Blue belt", "Brown belt", "Black belt · 1st Dan"];
const beltColors: Record<string, string> = {
    White: "border-slate-300 bg-white dark:border-slate-500",
    Yellow: "border-yellow-500 bg-yellow-400",
    Orange: "border-orange-500 bg-orange-500",
    Green: "border-green-600 bg-green-600",
    Blue: "border-blue-600 bg-blue-600",
    Brown: "border-amber-900 bg-amber-800",
    Black: "border-slate-950 bg-slate-950 dark:border-slate-300",
};

export function beltColorClass(grade: string) {
    return beltColors[grade.split(" ")[0]] ?? "border-border bg-muted";
}

export function getStudentProfile(student: Student, today: Date) {
    const index = students.findIndex((item) => item.id === student.id);
    const surname = student.name.split(" ").at(-1);
    return {
        ...student,
        studentNumber: `STU-${String(index + 1).padStart(4, "0")}`,
        principalDojo: index % 3 === 1 ? "Northside Dojo" : "Central Dojo",
        membershipStatus: index === 10 ? "Paused" : "Active",
        email: `${student.name.toLowerCase().replaceAll(" ", ".")}@example.com`,
        phone: `+44 7700 900${String(index + 101).padStart(3, "0")}`,
        emergencyContact: { name: `Sam ${surname}`, relationship: index % 2 ? "Partner" : "Parent / guardian", phone: `+44 7700 900${String(index + 201).padStart(3, "0")}` },
        medicalAlerts: index === 0 ? ["Mild asthma. Carries an inhaler to training."] : index === 4 ? ["Previous left ankle injury. Avoid high-impact drills if uncomfortable."] : [],
        rankAwardedOn: new Date(today.getFullYear(), today.getMonth() - 3 - index % 4, 12),
        techniqueChecks: 4 + index % 4,
        kataComplete: index % 3 !== 0,
    };
}

export function defaultStudentClass(student: Student, today: Date) {
    const template = classTemplates.find((item) => item.instructorId === currentInstructor.id && item.type === "training" && item.studentIds.includes(student.id));
    if (!template) return undefined;
    const date = addDays(today, -((today.getDay() - template.weekday + 7) % 7));
    return eventsForDate(date).find((event) => event.id === `${template.id}-${dateKey(date)}`);
}

export function studentSessionHistory(student: Student, today: Date, context?: CalendarEvent): StudentHistorySession[] {
    const index = students.findIndex((item) => item.id === student.id);
    const events = Array.from({ length: 56 }, (_, daysAgo) => eventsForDate(addDays(today, -daysAgo)))
        .flat().filter((event) => event.type === "training" && event.studentIds.includes(student.id))
        .sort((a, b) => b.date.getTime() - a.date.getTime() || b.startTime.localeCompare(a.startTime))
        .slice(0, 12);
    if (context?.type === "training" && context.studentIds.includes(student.id) && !events.some((event) => event.id === context.id)) events.push(context);

    return events.map((event, eventIndex) => {
        const saved = getSavedStudentSession(event.id, student.id);
        const historical = dateKey(event.date) !== dateKey(today) && event.date < today;
        const attendance: Attendance = saved?.attendance ?? (historical ? ((eventIndex + index) % 7 === 3 ? "absent" : "present") : "unmarked");
        return {
            event,
            attendance,
            feedback: saved?.comment ?? (historical && attendance === "present" ? feedbackExamples[(eventIndex + index) % feedbackExamples.length] : ""),
            instructor: currentInstructor.name,
        };
    }).sort((a, b) => b.event.date.getTime() - a.event.date.getTime() || b.event.startTime.localeCompare(a.event.startTime));
}

export function studentGradingHistory(student: Student, today: Date, context?: CalendarEvent) {
    const profile = getStudentProfile(student, today);
    const beltIndex = beltOrder.indexOf(student.beltGrade);
    const previous = [0, 1].filter((offset) => beltIndex - offset > 0).map((offset) => ({
        id: `${student.id}-grading-${offset}`,
        date: offset === 0 ? profile.rankAwardedOn : addDays(profile.rankAwardedOn, -120),
        fromGrade: beltOrder[beltIndex - offset - 1],
        toGrade: beltOrder[beltIndex - offset],
        status: "Passed",
        feedback: offset === 0 ? "A confident assessment with good control and clear progress in technique. Keep developing consistency in partner work." : "Demonstrated the required techniques and a positive attitude. Continue practising stance and kata transitions.",
        instructor: currentInstructor.name,
    }));
    const assessments = Array.from({ length: 56 }, (_, daysAgo) => eventsForDate(addDays(today, -daysAgo)))
        .flat().filter((event) => event.type === "grading" && event.studentIds.includes(student.id));
    if (context?.type === "grading" && context.date <= today && context.studentIds.includes(student.id) && !assessments.some((event) => event.id === context.id)) assessments.push(context);
    const completed = assessments.flatMap((event) => {
        const saved = getSavedStudentSession(event.id, student.id);
        return saved?.assessmentStatus === "completed" ? [{
            id: event.id, date: event.date, fromGrade: student.beltGrade, toGrade: student.targetGrade,
            status: "Completed", feedback: saved.assessmentNotes || "No assessment feedback recorded.", instructor: currentInstructor.name,
        }] : [];
    });
    return [...completed, ...previous].sort((a, b) => b.date.getTime() - a.date.getTime());
}
