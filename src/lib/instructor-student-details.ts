import { addDays, classTemplates, currentInstructor, dateKey, eventsForDate, getSavedStudentSession, instructors, students } from "@/lib/instructor-calendar";
import type { Attendance, CalendarEvent, ReportAuthor, Student } from "@/lib/instructor-calendar";
import { getNextGrade, gradingSystems } from "@/lib/student-grades";
import type { GradingSyllabus, GradingSystemId, RankId } from "@/lib/student-grades";

export type StudentHistorySession = {
    event: CalendarEvent;
    attendance: Attendance;
    feedback: string;
    instructor: string;
    reportAuthor?: ReportAuthor;
};

const feedbackExamples = [
    "Good progress with stance and balance. Keep practising the turning sequence before the next lesson.",
    "More confident with combinations today. Focus on a consistent guard and controlled finishes.",
    "Strong effort throughout the lesson. Footwork is improving; continue working on timing with a partner.",
    "Kata sequence is coming together well. Slow the transitions down and maintain a steady posture.",
];

export function getStudentProfile(student: Student, today: Date) {
    const index = students.findIndex((item) => item.id === student.id);
    const surname = student.name.split(" ").at(-1);
    return {
        ...student,
        nextRank: getNextGrade(student.gradingSystem, student.rank)?.rank ?? null,
        studentNumber: `STU-${String(index + 1).padStart(4, "0")}`,
        principalDojo: index % 3 === 1 ? "Northside Dojo" : "Central Dojo",
        membershipStatus: index === 10 ? "Paused" : "Active",
        email: `${student.name.toLowerCase().replaceAll(" ", ".")}@example.com`,
        phone: `+44 7700 900${String(index + 101).padStart(3, "0")}`,
        emergencyContact: { name: `Sam ${surname}`, relationship: index % 2 ? "Partner" : "Parent / guardian", phone: `+44 7700 900${String(index + 201).padStart(3, "0")}` },
        medicalAlerts: index === 0 ? ["Mild asthma. Carries an inhaler to training."] : index === 4 ? ["Previous left ankle injury. Avoid high-impact drills if uncomfortable."] : [],
        rankAwardedOn: new Date(today.getFullYear(), today.getMonth() - 3 - index % 4, 12),
    };
}

export function defaultStudentClass(student: Student, today: Date) {
    const template = classTemplates.find((item) => item.instructorId === currentInstructor.id && item.type === "training" && item.studentIds.includes(student.id));
    if (!template) return undefined;
    const date = addDays(today, -((today.getDay() - template.weekday + 7) % 7));
    return eventsForDate(date).find((event) => event.id === `${template.id}-${dateKey(date)}`);
}

export function sessionPhase(event: CalendarEvent, now: Date): "upcoming" | "in-progress" | "past" {
    const atTime = (time: string) => {
        const [hours, minutes] = time.split(":").map(Number);
        return new Date(event.date.getFullYear(), event.date.getMonth(), event.date.getDate(), hours, minutes);
    };
    if (now < atTime(event.startTime)) return "upcoming";
    return now < atTime(event.endTime) ? "in-progress" : "past";
}

export function studentSessionHistory(student: Student, now: Date, context?: CalendarEvent): StudentHistorySession[] {
    const index = students.findIndex((item) => item.id === student.id);
    const tomorrow = addDays(now, 1);
    const belongsToStudent = (event: CalendarEvent) => event.type === "training" && event.studentIds.includes(student.id);
    // A student's record spans every enrolled dojo and instructor, not just the portal calendar.
    const events: CalendarEvent[] = Array.from({ length: 56 }, (_, daysAgo) => {
        const date = addDays(now, -daysAgo);
        return classTemplates
            .filter((template) => template.type === "training" && template.weekday === date.getDay() && template.studentIds.includes(student.id))
            .map((template) => ({ ...template, id: `${template.id}-${dateKey(date)}`, date }));
    })
        .flat().filter((event) => belongsToStudent(event) && event.date < tomorrow)
        .sort((a, b) => b.date.getTime() - a.date.getTime() || b.startTime.localeCompare(a.startTime))
        .slice(0, 12);
    if (context?.type === "training" && context.date < tomorrow && context.studentIds.includes(student.id) && !events.some((event) => event.id === context.id)) events.push(context);

    return events.map((event) => {
        const saved = getSavedStudentSession(event.id, student.id);
        const phase = sessionPhase(event, now);
        // Stable per-session examples, independent of filtering and sorting.
        const day = Math.floor(Date.UTC(event.date.getFullYear(), event.date.getMonth(), event.date.getDate()) / 86_400_000);
        const seed = day + Math.floor(day / 7) + index
            + classTemplates.findIndex((template) => event.id.startsWith(`${template.id}-`));
        const attendance: Attendance = phase === "upcoming" ? "unmarked"
            : saved?.attendance ?? (phase === "past" ? (seed % 11 === 0 ? "unmarked" : seed % 5 === 2 ? "absent" : "present") : "unmarked");
        const instructor = instructors.find((item) => item.id === event.instructorId) ?? currentInstructor;
        const feedback = saved?.comment
            ?? (phase === "past" && attendance === "present" && seed % 5 !== 0 ? feedbackExamples[seed % feedbackExamples.length] : "");
        return {
            event,
            attendance,
            feedback,
            instructor: instructor.name,
            reportAuthor: feedback.trim() ? saved?.reportAuthor ?? instructor : undefined,
        };
    }).sort((a, b) => b.event.date.getTime() - a.event.date.getTime() || b.event.startTime.localeCompare(a.event.startTime));
}

export function studentAttendanceSummary(sessions: StudentHistorySession[], now: Date) {
    const pastSessions = sessions
        .filter((session) => sessionPhase(session.event, now) === "past")
        .sort((a, b) => b.event.date.getTime() - a.event.date.getTime() || b.event.startTime.localeCompare(a.event.startTime));
    const markedSessions = pastSessions.filter((session) => session.attendance !== "unmarked");
    const presentSessions = markedSessions.filter((session) => session.attendance === "present");
    // An unmarked session breaks the streak: missing attendance is not evidence of absence.
    const firstNonAbsence = pastSessions.findIndex((session) => session.attendance !== "absent");
    return {
        pastSessions,
        markedSessions,
        attended: presentSessions.length,
        attendanceRate: markedSessions.length ? Math.round(presentSessions.length / markedSessions.length * 100) : null,
        lastAttended: presentSessions[0],
        periodStart: pastSessions.at(-1)?.event.date,
        periodEnd: pastSessions[0]?.event.date,
        consecutiveAbsences: firstNonAbsence === -1 ? pastSessions.length : firstNonAbsence,
    };
}

export function studentGradingHistory(student: Student, today: Date, context?: CalendarEvent) {
    const profile = getStudentProfile(student, today);
    const levels = gradingSystems[student.gradingSystem].levels;
    const rankIndex = levels.findIndex((level) => level.rank === student.rank);
    const previous = [0, 1].filter((offset) => rankIndex - offset > 0).map((offset) => ({
        id: `${student.id}-grading-${offset}`,
        date: offset === 0 ? profile.rankAwardedOn : addDays(profile.rankAwardedOn, -120),
        fromRank: levels[rankIndex - offset - 1].rank,
        toRank: levels[rankIndex - offset].rank,
        status: "Passed",
        feedback: offset === 0 ? "A confident assessment with good control and clear progress in technique. Keep developing consistency in partner work." : "Demonstrated the required techniques and a positive attitude. Continue practising stance and kata transitions.",
        instructor: currentInstructor.name,
    }));
    const assessments = Array.from({ length: 56 }, (_, daysAgo) => eventsForDate(addDays(today, -daysAgo)))
        .flat().filter((event) => event.type === "grading" && event.studentIds.includes(student.id));
    if (context?.type === "grading" && context.date <= today && context.studentIds.includes(student.id) && !assessments.some((event) => event.id === context.id)) assessments.push(context);
    const completed = assessments.flatMap((event) => {
        const saved = getSavedStudentSession(event.id, student.id);
        return saved?.assessmentStatus === "completed" && profile.nextRank ? [{
            id: event.id, date: event.date, fromRank: student.rank, toRank: profile.nextRank,
            status: "Completed", feedback: saved.assessmentNotes || "No assessment feedback recorded.", instructor: currentInstructor.name,
        }] : [];
    });
    return [...completed, ...previous].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type TechniqueSignOff = { itemId: string; signedOffAt: string; signedOffBy: ReportAuthor };
export type GradingRequirement = { key: string; label: string; actual: string; required: string; met: boolean | null };

const techniqueStorageKey = (studentId: string) => `instructor-technique-sign-offs-v1:${studentId}`;

export function getTechniqueSignOffs(studentId: string): TechniqueSignOff[] {
    try {
        const saved: unknown = JSON.parse(localStorage.getItem(techniqueStorageKey(studentId)) ?? "[]");
        return Array.isArray(saved) ? saved.filter((item): item is TechniqueSignOff =>
            typeof item?.itemId === "string" && typeof item?.signedOffAt === "string" &&
            Number.isFinite(Date.parse(item.signedOffAt)) && typeof item?.signedOffBy?.id === "string" &&
            typeof item?.signedOffBy?.name === "string",
        ) : [];
    } catch {
        return [];
    }
}

export function saveTechniqueSignOffs(studentId: string, signOffs: TechniqueSignOff[]) {
    localStorage.setItem(techniqueStorageKey(studentId), JSON.stringify(signOffs));
}

export type SignaturePoint = { x: number; y: number };
export type ExaminerSignature = {
    strokes: SignaturePoint[][];
    aspectRatio: number;
    signedAt: string;
    signedBy: ReportAuthor;
};

const signatureStorageKey = (studentId: string, system: GradingSystemId, rank: RankId) =>
    `instructor-examiner-signature-v1:${studentId}:${system}:${rank}`;

export function getExaminerSignature(studentId: string, system: GradingSystemId, rank: RankId): ExaminerSignature | null {
    try {
        const saved = JSON.parse(localStorage.getItem(signatureStorageKey(studentId, system, rank)) ?? "null") as ExaminerSignature | null;
        if (!saved || !Number.isFinite(saved.aspectRatio) || saved.aspectRatio <= 0
            || typeof saved.signedAt !== "string" || !Number.isFinite(Date.parse(saved.signedAt))
            || typeof saved.signedBy?.id !== "string" || typeof saved.signedBy?.name !== "string"
            || !Array.isArray(saved.strokes) || saved.strokes.length === 0) return null;
        const valid = saved.strokes.every(stroke => Array.isArray(stroke) && stroke.length > 0
            && stroke.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)
                && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
        return valid ? saved : null;
    } catch {
        return null;
    }
}

export function saveExaminerSignature(studentId: string, system: GradingSystemId, rank: RankId, signature: ExaminerSignature | null) {
    const key = signatureStorageKey(studentId, system, rank);
    if (signature) localStorage.setItem(key, JSON.stringify(signature));
    else localStorage.removeItem(key);
}

export function monthsSince(start: Date, today: Date) {
    return Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth()
        - (today.getDate() < start.getDate() ? 1 : 0));
}

export function getGradingRequirements({ syllabus, membershipStatus, rankAwardedOn, sessions, signOffs, now }: {
    syllabus: GradingSyllabus;
    membershipStatus: string;
    rankAwardedOn: Date;
    sessions: StudentHistorySession[];
    signOffs: TechniqueSignOff[];
    now: Date;
}): GradingRequirement[] {
    const months = monthsSince(rankAwardedOn, now);
    const signed = new Set(signOffs.map((item) => item.itemId));
    const items = syllabus.categories.flatMap((category) => category.items);
    const signedCount = items.filter((item) => signed.has(item.id)).length;
    const attended = sessions.filter((session) => session.attendance === "present"
        && session.event.date >= rankAwardedOn && sessionPhase(session.event, now) === "past").length;
    const requirements: GradingRequirement[] = [
        { key: "membership", label: "Active membership", actual: membershipStatus, required: "Active", met: membershipStatus === "Active" },
        { key: "membership-length", label: "Time as a member", actual: "Not recorded", required: "3 months", met: null },
    ];
    // Missing joining dates, dates of birth and fee records remain unverified.
    if (syllabus.minAge !== undefined) requirements.push({
        key: "age", label: "Minimum age (by calendar year)", actual: "Not recorded", required: `${syllabus.minAge} years`, met: null,
    });
    if (syllabus.minMonths > 0) requirements.push({
        key: "time", label: "Time in current grade", actual: `${months} ${months === 1 ? "month" : "months"}`,
        required: syllabus.maxMonths ? `${syllabus.minMonths}–${syllabus.maxMonths} months` : `${syllabus.minMonths} months`,
        met: months >= syllabus.minMonths,
    });
    if (syllabus.sessions !== undefined) requirements.push({
        key: "sessions", label: "Training sessions since last grading", actual: `${attended} recorded`, required: `${syllabus.sessions}`,
        // History is a limited reporting window, not a complete lifetime record.
        met: attended >= syllabus.sessions ? true : null,
    });
    requirements.push(
        { key: "techniques", label: "Target-grade techniques signed off", actual: `${signedCount}`, required: `${items.length}`, met: signedCount === items.length },
        { key: "fees", label: "Fees up to date", actual: "Not recorded", required: "Clear", met: null },
    );
    return requirements;
}

export function gradingEligibility(requirements: GradingRequirement[]) {
    const metCount = requirements.filter((item) => item.met === true).length;
    return {
        metCount,
        label: requirements.some((item) => item.met === false) ? "Not yet eligible"
            : requirements.some((item) => item.met === null) ? "Not yet verified" : "Eligible",
    };
}
