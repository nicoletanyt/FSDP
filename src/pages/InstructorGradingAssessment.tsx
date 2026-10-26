import { useState } from "react";
import { Link, useParams } from "react-router";
import { Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { calendarHref, findCalendarEvent, fullDate, loadSession, saveSession, studentDetailsHref, students } from "@/lib/instructor-calendar";
import type { CalendarEvent, Student, StudentSession } from "@/lib/instructor-calendar";

function AssessmentForm({ event, student }: { event: CalendarEvent; student: Student }) {
    const [value, setValue] = useState(() => loadSession(event)[student.id]);
    const [notice, setNotice] = useState("");

    return (
        <section className="mx-auto max-w-2xl space-y-6">
            <Link to={calendarHref(event)} className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                <ChevronLeft aria-hidden="true" className="size-4" /> Back to assessment class
            </Link>
            <header>
                <p className="mb-2 text-xs text-muted-foreground">Placeholder assessment form · Dummy data only</p>
                <h1 className="text-3xl font-semibold tracking-tight">Assess {student.name}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{event.name} · {fullDate(event.date)} · {event.dojo}</p>
            </header>
            <Card>
                <CardHeader><CardTitle>Grading assessment</CardTitle></CardHeader>
                <CardContent>
                    <form className="space-y-5" onSubmit={(submit) => {
                        submit.preventDefault();
                        const record = loadSession(event);
                        saveSession(event.id, { ...record, [student.id]: { ...record[student.id], assessmentStatus: value.assessmentStatus, assessmentNotes: value.assessmentNotes } });
                        setNotice("Assessment saved locally. Return to the class to see the updated status.");
                    }}>
                        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4 text-sm">
                            <div><dt className="text-xs text-muted-foreground">Current grade</dt><dd className="mt-1 font-medium">{student.beltGrade}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Target grade</dt><dd className="mt-1 font-medium">{student.targetGrade}</dd></div>
                        </dl>
                        <fieldset className="space-y-2">
                            <legend className="mb-2 text-sm font-medium">Assessment status</legend>
                            <div className="flex gap-2">
                                {(["pending", "completed"] as const).map((status) => (
                                    <Button key={status} type="button" variant={value.assessmentStatus === status ? "default" : "outline"} aria-pressed={value.assessmentStatus === status} onClick={() => {
                                        setValue((current: StudentSession) => ({ ...current, assessmentStatus: status }));
                                        setNotice("");
                                    }} className="capitalize">{status === "completed" && <Check aria-hidden="true" />}{status}</Button>
                                ))}
                            </div>
                        </fieldset>
                        <div className="space-y-2">
                            <Label htmlFor="assessment-notes">Assessment notes</Label>
                            <Textarea id="assessment-notes" value={value.assessmentNotes} onChange={(change) => { setValue((current) => ({ ...current, assessmentNotes: change.target.value })); setNotice(""); }} placeholder="Record technique, progress, and areas to work on…" rows={5} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <Link to={studentDetailsHref(student.id, event, "grading")} className="text-sm underline underline-offset-4">View student profile</Link>
                            <Button type="submit">Save Assessment</Button>
                        </div>
                        <p role="status" className="min-h-5 text-xs text-muted-foreground">{notice || "Local demo · Saves reset when you refresh"}</p>
                    </form>
                </CardContent>
            </Card>
        </section>
    );
}

export default function InstructorGradingAssessment() {
    const { eventId, studentId } = useParams();
    const event = findCalendarEvent(eventId);
    const student = students.find((item) => item.id === studentId);
    if (!event || event.type !== "grading" || !student || !event.studentIds.includes(student.id)) {
        return <section className="space-y-4"><Link to="/instructor" className="text-sm underline">Back to calendar</Link><h1 className="text-2xl font-semibold">Assessment not found</h1></section>;
    }
    return <AssessmentForm key={`${event.id}-${student.id}`} event={event} student={student} />;
}
