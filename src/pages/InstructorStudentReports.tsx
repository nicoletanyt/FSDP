import { Link, useParams } from "react-router";
import { ChevronLeft, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, calendarHref, eventsForDate, findCalendarEvent, fullDate, loadSession, studentDetailsHref, students } from "@/lib/instructor-calendar";

const exampleFeedback = [
    "Good progress with stance and balance. Keep practising the turning sequence.",
    "More confident with combinations. Focus on control and a consistent guard.",
    "Strong effort throughout the lesson. Continue working on timing and footwork.",
];

export default function InstructorStudentReports() {
    const { eventId } = useParams();
    const event = findCalendarEvent(eventId);
    if (!event || event.type !== "training") {
        return <section className="space-y-4"><Link to="/instructor/calendar" className="text-sm underline">Back to calendar</Link><h1 className="text-2xl font-semibold">Class report not found</h1></section>;
    }
    const record = loadSession(event);
    const roster = students.filter((student) => event.studentIds.includes(student.id));

    return (
        <section className="space-y-6">
            <Link to={calendarHref(event)} className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                <ChevronLeft aria-hidden="true" className="size-4" /> Back to class
            </Link>
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Student reports</h1>
                <p className="mt-2 text-sm text-muted-foreground">{event.name} · {fullDate(event.date)} · Demo reports and lesson feedback</p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
                {roster.map((student, index) => (
                    <Card key={student.id}>
                        <CardHeader>
                            <CardTitle><Link to={studentDetailsHref(student.id, event, "sessions")} className="underline-offset-4 hover:underline">{student.name}</Link></CardTitle>
                            <p className="text-xs text-muted-foreground">{student.beltGrade}</p>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="rounded-lg bg-muted/50 p-3">
                                <h2 className="text-xs font-medium">Current session · <span className="capitalize">{record[student.id].attendance}</span></h2>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{record[student.id].comment || "No session feedback saved yet."}</p>
                            </div>
                            <h2 className="flex items-center gap-1.5 text-xs font-semibold"><FileText aria-hidden="true" className="size-3.5" /> Previous lesson feedback</h2>
                            <ul className="space-y-4">
                                {[7, 14].map((daysAgo, offset) => {
                                    const previousDate = addDays(event.date, -daysAgo);
                                    const previousEvent = eventsForDate(previousDate).find((item) => item.name === event.name && item.type === "training");
                                    const savedComment = previousEvent ? loadSession(previousEvent)[student.id]?.comment : "";
                                    return (
                                        <li key={daysAgo} className="border-l-2 pl-3">
                                            <p className="text-xs font-medium">{fullDate(previousDate)} · {event.name}</p>
                                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{savedComment || exampleFeedback[(index + offset) % exampleFeedback.length]}</p>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}
