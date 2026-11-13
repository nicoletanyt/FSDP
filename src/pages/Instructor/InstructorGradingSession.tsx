import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Link,
    Navigate,
    useLocation,
    useParams,
    useSearchParams,
} from "react-router";
import {
    BadgeCheck,
    CalendarDays,
    Clock3,
    MapPin,
    UserX,
    Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import DatabaseGradeBadge from "@/components/instructor/DatabaseGradeBadge";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import GradingSignatureDialog from "@/components/instructor/GradingSignatureDialog";
import GradingChecklistTable from "@/components/grading/GradingChecklistTable";
import {
    GradingBackLink,
    GradingNote,
    GradingPageHeader,
} from "@/components/grading/GradingParts";
import {
    ExaminerChecklist,
    ExaminerPicker,
    examinersOf,
} from "@/components/grading/SessionChecklistsView";
import { useCalendarReturn } from "@/hooks/use-calendar-return";
import {
    candidateCount,
    gradingDate,
    gradingStamp,
    gradingTimeLabel,
} from "@/lib/grading/format";
import { useInstructorApi } from "@/lib/instructor/data-context";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { useInstructorGradingBatch } from "@/hooks/use-instructor-grading-batch";
import { parseEntityId } from "@/lib/instructor/adapters";
import {
    instructorQueryKeys as keys,
    instructorQueryTimes as times,
} from "@/lib/instructor/query-keys";
import {
    gradingTitle,
    sessionCandidates,
    sessionLabel,
} from "@/lib/instructor/grading-panels";
import type { GradingDay } from "@/lib/instructor/grading-panels";
import { cn } from "@/lib/utils";
import type {
    CalendarEntry,
    GradingMark,
    InstructorReferenceData,
    InstructorIdentity,
    RosterEntry,
    GradingBatch,
} from "@/lib/instructor/types";

function GradingTable({
    session,
    entries,
    reference,
    identity,
    day,
    sessionId,
}: {
    session: CalendarEntry;
    entries: RosterEntry[];
    reference: InstructorReferenceData;
    identity: InstructorIdentity;
    day: GradingDay;
    sessionId: string;
}) {
    const gradingSession =
        day.sessions.find((item) => item.id === sessionId) ?? null;
    const track = day.track ?? session.grading?.track ?? null;
    // Each candidate is graded on their own target grade's techniques.
    const candidateGrades = useMemo(
        () =>
            new Map(
                gradingSession?.grades.flatMap((group) =>
                    group.candidates.map(
                        (candidate) => [candidate.studentId, group.grade.id] as const,
                    ),
                ) ?? [],
            ),
        [gradingSession],
    );
    const gradeOrder = new Map(
        gradingSession?.grades.map((group, index) => [group.grade.id, index]) ?? [],
    );
    const techniques = reference.syllabusItems
        .filter((item) => item.track === track && gradeOrder.has(item.grade_id))
        .sort(
            (a, b) =>
                gradeOrder.get(a.grade_id)! - gradeOrder.get(b.grade_id)! ||
                a.category.localeCompare(b.category) ||
                a.sort_order - b.sort_order ||
                a.id.localeCompare(b.id),
        );
    const [signatureOpen, setSignatureOpen] = useState(false);
    // Endorsements are informational: a failed read leaves the checklist usable.
    const api = useInstructorApi();
    const loadEndorsements = useCallback(
        (signal: AbortSignal) => api.getEventEndorsements(session.event.id, signal),
        [api, session.event.id],
    );
    const endorsementQuery = useInstructorQuery(
        (userId) => keys.eventEndorsements(userId, session.event.id),
        loadEndorsements,
        times.roster,
    );
    const endorsements = new Map(
        (endorsementQuery.data ?? []).map((item) => [
            `${item.studentId}:${item.targetGradeId}`,
            item,
        ]),
    );
    const batch = useInstructorGradingBatch({
        session,
        entries,
        identity,
        sessionId,
        candidateGrades,
        techniques,
    });
    // Marking opens when the session's time slot starts; the checklist is viewable before then.
    const beforeStart = useBeforeStart(gradingSession?.startsAt ?? null);
    const locked = batch.locked || beforeStart;
    // The chief examiner can also read every other examiner's submitted checklist.
    const [search, setSearch] = useSearchParams();
    const viewing = day.isChief ? search.get("examiner") : null;
    const othersQuery = useQuery({
        queryKey: keys.sessionChecklists(
            identity.userId,
            session.event.id,
            sessionId,
        ),
        queryFn: () => api.getSessionChecklists(session.event.id, sessionId),
        enabled: day.isChief && Boolean(gradingSession),
        staleTime: 30_000,
        retry: false,
    });
    const examiners = day.isChief
        ? examinersOf(day, othersQuery.data?.batches ?? [])
        : [];
    const other =
        viewing && viewing !== identity.instructorId
            ? (examiners.find((item) => item.instructorId === viewing) ?? null)
            : null;
    const ownProgress = !batch.saved
        ? "Not started"
        : batch.saved.status === "submitted"
            ? "Submitted"
            : "Draft saved";
    const pick = (id: string) =>
        setSearch(
            (current) => {
                const params = new URLSearchParams(current);
                if (id === identity.instructorId) params.delete("examiner");
                else params.set("examiner", id);
                return params;
            },
            { replace: true },
        );
    const canSave = Boolean(
        gradingSession &&
        !beforeStart &&
        batch.ready &&
        batch.students.length &&
        batch.items.length &&
        !batch.pending &&
        !batch.readOnly &&
        !batch.needsReload,
    );
    const facts = [
        {
            key: "date",
            icon: CalendarDays,
            label: gradingDate(day.gradingDate, "long"),
        },
        {
            key: "time",
            icon: Clock3,
            label: gradingSession
                ? gradingTimeLabel(gradingSession.startsAt, gradingSession.endsAt)
                : gradingTimeLabel(day.startsAt, day.endsAt, day.reportingTime),
        },
        { key: "centre", icon: MapPin, label: day.centre.name },
        ...(gradingSession
            ? [
                {
                    key: "candidates",
                    icon: Users,
                    label: candidateCount(sessionCandidates(gradingSession)),
                },
            ]
            : []),
    ];
    const savedAt = batch.saved
        ? batch.saved.status === "submitted"
            ? batch.saved.submitted_at!
            : batch.saved.updated_at
        : null;
    // One checklist per grade in the session; a grade is only named above its
    // table when the session mixes grades (the header already names a lone grade).
    const mixed = (gradingSession?.grades.length ?? 0) > 1;
    // Candidates marked absent are hidden by default; their saved ticks and
    // comments stay in the batch untouched.
    const absent = new Set(
        entries
            .filter((entry) => entry.record.attendance_status === "absent")
            .map((entry) => entry.record.student_id),
    );
    const absentCount = batch.students.filter((student) =>
        absent.has(student.student_id),
    ).length;
    const [showAbsent, setShowAbsent] = useState(false);
    const groups = (gradingSession?.grades ?? [])
        .map((group) => ({
            grade: group.grade,
            students: batch.students.filter(
                (student) =>
                    student.target_grade_id === group.grade.id &&
                    (showAbsent || !absent.has(student.student_id)),
            ),
            items: batch.items.filter((item) => item.grade_id === group.grade.id),
        }))
        .filter((group) => group.students.length);

    return (
        <div className="space-y-8">
            <GradingPageHeader
                title={gradingTitle(day)}
                badges={
                    gradingSession && (
                        <div
                            className="flex flex-wrap items-center gap-2"
                            data-grading-group
                        >
                            <Badge variant="secondary" data-session-label>
                                {sessionLabel(gradingSession.position)}
                            </Badge>
                            {gradingSession.grades.map((group) => (
                                <DatabaseGradeBadge
                                    key={group.grade.id}
                                    grade={group.grade}
                                    showBeltLabel
                                />
                            ))}
                        </div>
                    )
                }
                facts={facts}
                actions={
                    other || beforeStart ? undefined : (
                        <>
                            {/* Only offered once there is something new to save (or a failed save to retry). */}
                            {(batch.dirty || batch.retryMode === "draft") && (
                                <Button
                                    variant="outline"
                                    disabled={!canSave || batch.retryMode === "submit"}
                                    onClick={() => void batch.save(false)}
                                >
                                    {batch.pending && batch.retryMode !== "submit"
                                        ? "Saving…"
                                        : batch.retryMode === "draft"
                                            ? "Retry draft save"
                                            : "Save draft"}
                                </Button>
                            )}
                            <Button
                                disabled={
                                    !canSave || !batch.complete || batch.retryMode === "draft"
                                }
                                onClick={() => setSignatureOpen(true)}
                                className="bg-success text-success-foreground hover:bg-success/85"
                                data-submit-grading
                            >
                                {batch.retryMode === "submit"
                                    ? "Retry submission"
                                    : "Submit grading"}
                            </Button>
                        </>
                    )
                }
            />
            <GradingSignatureDialog
                open={signatureOpen}
                onOpenChange={setSignatureOpen}
                name={identity.name}
                pending={batch.pending}
                error={batch.error}
                retrying={batch.retryMode === "submit"}
                onSubmit={(signature) => batch.save(true, signature)}
            />
            {day.isChief && gradingSession && examiners.length > 1 && (
                <ExaminerPicker
                    examiners={examiners}
                    selected={other?.instructorId ?? identity.instructorId}
                    onSelect={pick}
                    scope="submitted"
                    viewerId={identity.instructorId}
                    progress={(examiner) =>
                        examiner.instructorId === identity.instructorId
                            ? ownProgress
                            : undefined
                    }
                />
            )}
            {other && gradingSession ? (
                <section className="space-y-4" aria-label={`${other.name}'s checklist`}>
                    {othersQuery.isError ? (
                        <p role="alert" className="text-sm text-destructive">
                            Unable to load {other.name}’s checklist. Please try again.
                        </p>
                    ) : (
                        <ExaminerChecklist
                            examiner={other}
                            session={gradingSession}
                            scope="submitted"
                        />
                    )}
                </section>
            ) : (
                <section className="space-y-8" aria-label="Grading assessment">
                    {gradingSession && beforeStart && gradingSession.startsAt && (
                        <p
                            role="status"
                            className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm"
                            data-marking-opens
                        >
                            Marking opens when this session starts, at{" "}
                            <time dateTime={gradingSession.startsAt}>
                                {gradingStamp(gradingSession.startsAt)}
                            </time>{" "}
                            (Singapore time).
                        </p>
                    )}
                    {!gradingSession ? (
                        <GradingNote>
                            Choose a session from the{" "}
                            <Link
                                to={`/instructor/gradings/${session.event.id}`}
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                grading day
                            </Link>{" "}
                            to view its checklist.
                        </GradingNote>
                    ) : !track ? (
                        <GradingNote>
                            This grading has no track recorded, so its checklist cannot be
                            shown.
                        </GradingNote>
                    ) : batch.query.status !== "success" || !batch.ready ? (
                        <InstructorDataStatus
                            loading={batch.query.status !== "error"}
                            error={batch.query.error}
                            onRetry={batch.query.retry}
                            variant="roster"
                        />
                    ) : !batch.students.length ? (
                        <GradingNote>No candidates are in this session.</GradingNote>
                    ) : !batch.items.length ? (
                        <GradingNote>
                            No techniques are recorded for this session’s grades.
                        </GradingNote>
                    ) : (
                        <>
                            {absentCount > 0 && (
                                <label
                                    className="flex w-fit min-h-11 cursor-pointer items-center gap-2.5 text-sm"
                                    data-show-absent
                                >
                                    <Switch
                                        checked={showAbsent}
                                        onCheckedChange={setShowAbsent}
                                    />
                                    Show absent ({absentCount})
                                </label>
                            )}
                            {!groups.length ? (
                                <GradingNote>
                                    All candidates in this session are marked absent.
                                </GradingNote>
                            ) : (
                                groups.map((group) => (
                                    <div key={group.grade.id} className="space-y-3">
                                        {mixed && (
                                            <h2 className="flex flex-wrap items-center gap-2 text-base font-medium">
                                                <DatabaseGradeBadge grade={group.grade} showBeltLabel className="text-sm" />
                                                <span className="text-sm font-normal text-muted-foreground">
                                                    {candidateCount(group.students.length)}
                                                </span>
                                            </h2>
                                        )}
                                        <GradingChecklistTable
                                            label={
                                                mixed
                                                    ? `Grading checklist: ${group.grade.label}`
                                                    : undefined
                                            }
                                            students={group.students}
                                            items={group.items}
                                            cell={(student, item) => (
                                                <MarkPicker
                                                    label={`${student.name}: ${item.label}`}
                                                    value={batch.mark(
                                                        student.student_id,
                                                        item.syllabus_item_id,
                                                    )}
                                                    disabled={locked || absent.has(student.student_id)}
                                                    onChange={(grade) =>
                                                        batch.change(
                                                            student.student_id,
                                                            item.syllabus_item_id,
                                                            grade,
                                                        )
                                                    }
                                                />
                                            )}
                                            comment={(student) => (
                                                <textarea
                                                    aria-label={`${student.name}: Comments`}
                                                    value={batch.comment(student.student_id)}
                                                    onChange={(event) =>
                                                        batch.changeComment(
                                                            student.student_id,
                                                            event.target.value,
                                                        )
                                                    }
                                                    disabled={locked || absent.has(student.student_id)}
                                                    maxLength={2000}
                                                    rows={3}
                                                    className="w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 sm:min-w-52"
                                                />
                                            )}
                                            columnDisabled={(student) =>
                                                absent.has(student.student_id)
                                            }
                                            nameAdornment={(student) => {
                                                const endorsement = endorsements.get(
                                                    `${student.student_id}:${student.target_grade_id}`,
                                                );
                                                if (!endorsement) return null;
                                                const by =
                                                    endorsement.endorsedBy ?? "Instructor not recorded";
                                                return (
                                                    <Popover>
                                                        <PopoverTrigger
                                                            data-endorsed
                                                            aria-label={`Endorsed: ${student.name}. Show who endorsed and when`}
                                                            className="inline-flex size-6 items-center justify-center rounded-md text-emerald-700 outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400 dark:hover:bg-emerald-950"
                                                        >
                                                            <BadgeCheck
                                                                aria-hidden="true"
                                                                className="size-4"
                                                            />
                                                        </PopoverTrigger>
                                                        <PopoverContent
                                                            align="center"
                                                            className="w-64 gap-2 text-left font-normal"
                                                            data-endorsement-details
                                                        >
                                                            <PopoverTitle className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                                                                <BadgeCheck
                                                                    aria-hidden="true"
                                                                    className="size-4"
                                                                />
                                                                Endorsed
                                                            </PopoverTitle>
                                                            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                                                                <dt className="text-muted-foreground">By</dt>
                                                                <dd className="font-medium" data-endorsed-by>
                                                                    {by}
                                                                </dd>
                                                                <dt className="text-muted-foreground">On</dt>
                                                                <dd>
                                                                    <time
                                                                        dateTime={endorsement.endorsedAt}
                                                                        data-endorsed-at
                                                                    >
                                                                        {gradingStamp(endorsement.endorsedAt)}
                                                                    </time>
                                                                </dd>
                                                            </dl>
                                                        </PopoverContent>
                                                    </Popover>
                                                );
                                            }}
                                            headerBadge={(student) =>
                                                absent.has(student.student_id) && (
                                                    <span
                                                        className="mb-1 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-2xs font-medium text-destructive"
                                                        data-absent
                                                    >
                                                        <UserX aria-hidden="true" className="size-3" />
                                                        Absent
                                                    </span>
                                                )
                                            }
                                        />
                                    </div>
                                ))
                            )}
                        </>
                    )}
                    {gradingSession && batch.ready && batch.error && !signatureOpen && (
                        <p role="alert" className="text-sm text-destructive">
                            {batch.error}
                        </p>
                    )}
                    {gradingSession && batch.ready && batch.saved && savedAt && (
                        <p
                            role="status"
                            className="text-sm text-muted-foreground"
                            data-grading-timestamp
                        >
                            {batch.saved.status === "submitted"
                                ? "Last submitted: "
                                : "Last saved: "}
                            <time dateTime={savedAt}>{gradingStamp(savedAt)}</time>
                        </p>
                    )}
                </section>
            )}
        </div>
    );
}

const marks: GradingMark[] = ["A", "B", "C"];

// One technique for one candidate: A, B or C. Choosing the selected letter again clears it.
function MarkPicker({
    label,
    value,
    disabled,
    onChange,
}: {
    label: string;
    value: GradingMark | null;
    disabled: boolean;
    onChange: (grade: GradingMark | null) => void;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="inline-flex overflow-hidden rounded-md border border-input"
            data-mark={value ?? ""}
        >
            {marks.map((mark) => (
                <button
                    key={mark}
                    type="button"
                    aria-pressed={value === mark}
                    disabled={disabled}
                    onClick={() => onChange(value === mark ? null : mark)}
                    className={cn(
                        "h-11 w-9 border-l border-input text-sm font-semibold first:border-l-0 focus-visible:relative focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
                        value === mark
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                >
                    {mark}
                </button>
            ))}
        </div>
    );
}

// True until the given start time, re-rendering when it passes so marking opens without a reload.
function useBeforeStart(startsAt: string | null) {
    const start = startsAt ? Date.parse(startsAt) : Number.NaN;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!Number.isFinite(start) || start <= now) return;
        const timer = setTimeout(
            () => setNow(Date.now()),
            Math.min(start - now + 50, 2_147_483_647),
        );
        return () => clearTimeout(timer);
    }, [start, now]);
    return Number.isFinite(start) && now < start;
}

// Roster, syllabus, identity, latest batch and grading day for one grading.
function useGradingSessionData(eventId: string | undefined) {
    const api = useInstructorApi();
    const client = useQueryClient();
    const load = useCallback(
        async (signal: AbortSignal) => {
            const roster = await api.getAttendanceRoster(
                parseEntityId(eventId, "event"),
                signal,
            );
            if (roster.session.event.event_type !== "grading")
                return {
                    ...roster,
                    day: null,
                    reference: null,
                    identity: null,
                    initialBatch: null,
                };
            // The grading day also checks panel membership: non-examiners get an error here.
            const [reference, identity, initialBatch, day] = await Promise.all([
                api.getReferenceData(signal),
                api.getCurrentInstructor(signal),
                api.getLatestGradingBatch(roster.session.event.id, signal),
                api.getGradingDay(roster.session.event.id, signal),
            ]);
            signal.throwIfAborted();
            if (initialBatch)
                client.setQueryData<GradingBatch>(
                    keys.gradingBatch(
                        identity.userId,
                        roster.session.event.id,
                        initialBatch.session_id,
                    ),
                    (current) =>
                        !current || current.version <= initialBatch.version
                            ? initialBatch
                            : current,
                );
            return { ...roster, reference, identity, initialBatch, day };
        },
        [api, eventId, client],
    );
    return useInstructorQuery(
        (userId) => keys.gradingSession(userId, eventId ?? ""),
        load,
        times.roster,
    );
}

// "Back to calendar" when opened from the calendar's View Grading, else the grading day.
function BackLink({ eventId }: { eventId: string | undefined }) {
    const calendarReturn = useCalendarReturn();
    return calendarReturn ? (
        <GradingBackLink to={calendarReturn}>Back to calendar</GradingBackLink>
    ) : (
        <GradingBackLink
            to={eventId ? `/instructor/gradings/${eventId}` : "/instructor/gradings"}
        >
            Back to grading sessions
        </GradingBackLink>
    );
}

type GradingQuery = ReturnType<typeof useGradingSessionData>;

function GradingSessionBody({
    eventId,
    query,
    sessionId,
}: {
    eventId: string | undefined;
    query: GradingQuery;
    sessionId: string;
}) {
    return query.status !== "success" ? (
        <InstructorDataStatus
            loading={query.status === "loading"}
            error={query.error}
            onRetry={query.retry}
            variant="grading"
        />
    ) : query.data.session.event.event_type !== "grading" ||
        !query.data.day ||
        !query.data.reference ||
        !query.data.identity ? (
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Grading session not found</h1>
    ) : (
        <GradingTable
            key={`${eventId}:${sessionId}`}
            session={query.data.session}
            entries={query.data.entries}
            reference={query.data.reference}
            identity={query.data.identity}
            day={query.data.day}
            sessionId={sessionId}
        />
    );
}

function Shell({
    eventId,
    children,
}: {
    eventId: string | undefined;
    children: ReactNode;
}) {
    return (
        <section className="w-full space-y-4">
            <BackLink eventId={eventId} />
            {children}
        </section>
    );
}

// /instructor/grading/session/:sessionId: one session's checklist. Examiners mark
// their own; the chief can also read the other examiners' submitted checklists.
export function InstructorGradingSessionPage() {
    const { sessionId = "" } = useParams();
    const api = useInstructorApi();
    const owner = useQuery({
        queryKey: ["grading-session-event", sessionId],
        queryFn: ({ signal }) => api.getGradingSessionEvent(sessionId, signal),
        enabled: Boolean(sessionId),
        staleTime: 10 * 60_000,
        retry: false,
    });
    const eventId = owner.data ?? undefined;
    const query = useGradingSessionData(eventId);
    if (owner.isPending)
        return (
            <Shell eventId={undefined}>
                <InstructorDataStatus
                    loading
                    onRetry={() => void owner.refetch()}
                    variant="grading"
                />
            </Shell>
        );
    if (owner.isError)
        return (
            <Shell eventId={undefined}>
                <InstructorDataStatus
                    error={owner.error.message}
                    onRetry={() => void owner.refetch()}
                    variant="grading"
                />
            </Shell>
        );
    if (!eventId)
        return (
            <Shell eventId={undefined}>
                <GradingNote>
                    This grading session isn’t available. It may not be published yet, or
                    you may not be on its panel.
                </GradingNote>
            </Shell>
        );
    return (
        <Shell eventId={eventId}>
            <GradingSessionBody
                eventId={eventId}
                query={query}
                sessionId={sessionId}
            />
        </Shell>
    );
}

// /instructor/grading/:eventId[?session=]: the older URL. Resolves the session (the
// requested one, else the one last worked on, else the day's only session) and
// moves to /instructor/grading/session/:sessionId, keeping any other parameters.
export default function InstructorGradingSession() {
    const { eventId } = useParams();
    const location = useLocation();
    const [search] = useSearchParams();
    const query = useGradingSessionData(eventId);
    if (query.status === "success" && query.data.day) {
        const day = query.data.day;
        const known = (id: string | null | undefined) =>
            id && day.sessions.some((item) => item.id === id) ? id : null;
        const sessionId =
            known(search.get("session")) ??
            known(query.data.initialBatch?.session_id) ??
            (day.sessions.length === 1 ? day.sessions[0].id : null);
        if (sessionId) {
            const params = new URLSearchParams(search);
            params.delete("session");
            const rest = params.toString();
            return (
                <Navigate
                    replace
                    state={location.state}
                    to={`/instructor/grading/session/${encodeURIComponent(sessionId)}${rest ? `?${rest}` : ""}`}
                />
            );
        }
    }
    return (
        <Shell eventId={eventId}>
            <GradingSessionBody eventId={eventId} query={query} sessionId="" />
        </Shell>
    );
}

// /instructor/gradings/:eventId/sessions/:sessionId: the former read-only checklists URL.
export function LegacySessionChecklistsRedirect() {
    const { sessionId = "" } = useParams();
    const location = useLocation();
    return (
        <Navigate
            replace
            state={location.state}
            to={`/instructor/grading/session/${encodeURIComponent(sessionId)}${location.search}`}
        />
    );
}
