import { useState } from "react";
import { CalendarDays, Check, CircleCheck, CircleX, Pencil } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { currentInstructor, formatTime, saveStudentFeedback } from "@/lib/instructor-calendar";
import type { Attendance, Student } from "@/lib/instructor-calendar";
import { sessionPhase } from "@/lib/instructor-student-details";
import type { StudentHistorySession } from "@/lib/instructor-student-details";
import { cn } from "@/lib/utils";

const sessionDateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function AttendanceBadge({ value }: { value: Attendance }) {
    return (
        <span className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
            value === "present" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : value === "absent" ? "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                    : "bg-muted text-muted-foreground",
        )}>
            {value === "present" && <CircleCheck aria-hidden="true" className="size-3" />}
            {value === "absent" && <CircleX aria-hidden="true" className="size-3" />}
            {value}
        </span>
    );
}

function SessionReport({ session, student, selected, now, onSaved }: {
    session: StudentHistorySession;
    student: Student;
    selected: boolean;
    now: Date;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(session.feedback);
    const toast = useToast();
    const { profile } = useAuth();
    const phase = sessionPhase(session.event, now);
    const report = session.feedback.trim();
    const currentAuthor = profile ? {
        id: profile.id,
        name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email,
    } : currentInstructor;
    const authorName = session.reportAuthor?.name ?? session.instructor;
    const initials = authorName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

    return (
        <Card
            size="sm"
            data-session-id={session.event.id}
            data-selected={selected || undefined}
            data-phase={phase}
            className={cn(
                "gap-1.5 border border-transparent py-3",
                phase === "past" && !report ? "bg-rose-50/80 dark:bg-rose-950/30" : "bg-muted/50",
                selected && "border-primary/30 ring-0",
            )}
        >
            <CardHeader className="gap-1">
                <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0 font-semibold"><h3>{session.event.name}</h3></CardTitle>
                    <AttendanceBadge value={session.attendance} />
                </div>
                <p className="flex flex-wrap gap-x-1 text-[11px] leading-4 text-muted-foreground">
                    <span>{sessionDateFormat.format(session.event.date)}</span><span aria-hidden="true">·</span>
                    <span>{formatTime(session.event.startTime)} – {formatTime(session.event.endTime)}</span><span aria-hidden="true">·</span>
                    <span>{session.event.dojo}</span>
                </p>
            </CardHeader>
            <CardContent>
                <div className="mb-2 border-t" aria-hidden="true" />
                <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-muted-foreground">Instructor report</p>
                    {!editing && (
                        <Button variant="ghost" size="sm" className="-mr-1 h-6" onClick={() => { setDraft(session.feedback); setEditing(true); }}>
                            <Pencil aria-hidden="true" />{report ? "Edit report" : "Add report"}
                        </Button>
                    )}
                </div>
                {report && (
                    <div className="mb-2 flex items-center gap-2">
                        <Avatar className="size-7" aria-hidden="true"><AvatarFallback>{initials}</AvatarFallback></Avatar>
                        <span data-slot="report-author" className="text-sm font-medium">{authorName}</span>
                    </div>
                )}
                {editing ? (
                    <form className="space-y-2" onSubmit={(submit) => {
                        submit.preventDefault();
                        saveStudentFeedback(session.event, student.id, draft.trim(), session.attendance, session.reportAuthor ?? currentAuthor);
                        setEditing(false);
                        onSaved();
                        toast.add({ title: "Report saved", type: "success" });
                    }}>
                        <Label htmlFor={`report-${session.event.id}`} className="sr-only">Instructor report</Label>
                        <Textarea
                            id={`report-${session.event.id}`}
                            value={draft}
                            onChange={(change) => setDraft(change.target.value)}
                            rows={2}
                            className="min-h-16 bg-background text-sm leading-5"
                            placeholder="What went well? What should they work on next?"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                            <Button type="submit" size="sm"><Check aria-hidden="true" />Save</Button>
                        </div>
                    </form>
                ) : (
                    <p className={cn("whitespace-pre-wrap text-sm leading-5 wrap-break-word", report ? "text-foreground" : "text-muted-foreground")}>
                        {report || "No instructor report yet"}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

export default function StudentSessionHistory({ sessions, student, contextId, now, onSaved }: {
    sessions: StudentHistorySession[];
    student: Student;
    contextId?: string;
    now: Date;
    onSaved: () => void;
}) {
    const [attendance, setAttendance] = useState<Attendance | "all">("all");
    const [sort, setSort] = useState("newest");
    const visibleSessions = sessions.filter((session) => attendance === "all" || session.attendance === attendance)
        .sort((a, b) => (a.event.date.getTime() - b.event.date.getTime() || a.event.startTime.localeCompare(b.event.startTime)) * (sort === "oldest" ? 1 : -1));
    const selectClassName = "h-8 min-w-0 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

    return (
        <section aria-label="Session history" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-semibold"><CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />Session history</h2>
                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="attendance-filter" className="text-[11px] text-muted-foreground">Attendance</Label>
                        <select id="attendance-filter" value={attendance} onChange={(event) => setAttendance(event.target.value as Attendance | "all")} className={selectClassName}>
                            <option value="all">All</option><option value="present">Present</option><option value="absent">Absent</option><option value="unmarked">Unmarked</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="session-sort" className="text-[11px] text-muted-foreground">Date order</Label>
                        <select id="session-sort" value={sort} onChange={(event) => setSort(event.target.value)} className={selectClassName}>
                            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
                        </select>
                    </div>
                </div>
            </div>
            {visibleSessions.length ? visibleSessions.map((session) => (
                <SessionReport key={session.event.id} session={session} student={student} selected={session.event.id === contextId} now={now} onSaved={onSaved} />
            )) : (
                <Card size="sm"><CardContent className="py-3 text-sm text-muted-foreground">
                    {sessions.length ? "No sessions match this attendance filter." : "No training sessions recorded."}
                </CardContent></Card>
            )}
        </section>
    );
}
