import { CardListSkeleton } from "@/components/shared/skeletons";
import { useFeedback } from "@/hooks/use-feedback";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useMemo, useState } from "react";
import {
    Link,
    useLocation,
    useOutletContext,
    useSearchParams,
} from "react-router";
import { CalendarDays, CalendarX, Coins, IdCard, MapPin } from "lucide-react";
import BackLink from "@/components/shared/layout/BackLink";
import EmptyState from "@/components/shared/layout/EmptyState";
import PageHeader from "@/components/shared/layout/PageHeader";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { StatusBadge } from "@/components/shared/status/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentContext } from "@/layouts/StudentLayout";
import { supabase } from "@/lib/supabase";
import { dateKey } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";
import {
    conflict,
    dateTime,
    formatTime,
    prettyDate,
} from "@/lib/student-schedule";
import type { ClassOffering } from "@/lib/student-schedule";
import FilterPopover, { FilterField } from "@/components/shared/filters/FilterPopover";
import SearchInput from "@/components/shared/filters/SearchInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMembershipStatus } from "@/hooks/use-membership-status";

type Action =
    | { kind: "enroll"; sessions: ClassOffering[] }
    | { kind: "waitlist" | "leave"; session: ClassOffering };

type ClassType = { id: string; label: string; description: string };

const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const seatColours = {
    full: "bg-rose-50 text-rose-950 dark:bg-rose-950/45 dark:text-rose-100",
    low: "bg-amber-50 text-amber-950 dark:bg-amber-950/45 dark:text-amber-100",
    normal: "bg-background text-foreground",
};

function sessionAvailability(session: ClassOffering) {
    if (!session.bookable)
        return { tone: "normal", label: "Booking unavailable" } as const;

    const spaces = session.capacity - session.occupied;
    if (spaces <= 0) return { tone: "full", label: "Full · waitlist" } as const;
    if (spaces <= 5)
        return {
            tone: "low",
            label: `${spaces} ${spaces === 1 ? "spot" : "spots"} left`,
        } as const;
    return { tone: "normal", label: "" } as const;
}

function sessionTime(session: ClassOffering) {
    return `${formatTime(session.startTime)} – ${formatTime(session.endTime)}`;
}

function ClassSessionPicker({
    sessions,
    date,
    selectedIds,
    conflictingIds,
    schedule,
    busy,
    onDateChange,
    onToggle,
    onWaitlist,
}: {
    sessions: ClassOffering[];
    date: Date;
    selectedIds: string[];
    conflictingIds: ReadonlySet<string>;
    schedule: StudentContext["schedule"];
    busy: boolean;
    onDateChange: (date: Date) => void;
    onToggle: (session: ClassOffering) => void;
    onWaitlist: (session: ClassOffering, kind: "waitlist" | "leave") => void;
}) {
    const sessionsByDay = new Map<string, ClassOffering[]>();
    for (const session of sessions) {
        const key = dateKey(session.date);
        const entries = sessionsByDay.get(key) ?? [];
        entries.push(session);
        sessionsByDay.set(key, entries);
    }
    const daySessions = sessionsByDay.get(dateKey(date)) ?? [];

    return (
        <div className="grid min-w-0 gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="rounded-lg border bg-card p-3">
                <Calendar
                    aria-label="Class dates"
                    mode="single"
                    required
                    selected={date}
                    defaultMonth={date}
                    startMonth={sessions[0]?.date}
                    endMonth={sessions.at(-1)?.date}
                    showOutsideDays={false}
                    className="mx-auto [--booking-day:clamp(1.75rem,9vw,2.75rem)] lg:[--booking-day:3rem] [&_.rdp-weekday]:w-(--booking-day) [&_.rdp-day]:size-(--booking-day) [&_.rdp-day_button]:size-(--booking-day) [&_.rdp-day_button]:text-base [&_.rdp-caption_label]:text-base [&_.rdp-caption_label]:font-semibold"
                    disabled={(day) => busy || !sessionsByDay.has(dateKey(day))}
                    onSelect={onDateChange}
                />
            </div>
            <div className="min-w-0 space-y-3">
                <h2 className="font-semibold" aria-live="polite">
                    {prettyDate(date)}
                </h2>
                <div
                    role="group"
                    aria-label="Session times"
                    className="grid max-h-80 gap-2 overflow-y-auto p-1"
                >
                    {daySessions.map((session) => {
                        const { tone, label } = sessionAvailability(session);
                        const selected = selectedIds.includes(session.id);
                        const booked = schedule.isBooked(session.id);
                        const full = schedule.isFull(session);
                        const waiting = schedule.isWaitlisted(session.id);
                        const canLeave = waiting && full && session.bookable && !booked;
                        const overlapsBooking = !full && conflictingIds.has(session.id);
                        const disabled =
                            busy ||
                            booked ||
                            overlapsBooking ||
                            !session.bookable ||
                            (!schedule.active && !canLeave);
                        return (
                            <Button
                                key={session.id}
                                variant="outline"
                                aria-pressed={
                                    full || booked || overlapsBooking || !session.bookable
                                        ? undefined
                                        : selected
                                }
                                disabled={disabled}
                                className={cn(
                                    "h-auto min-h-11 w-full flex-wrap justify-between gap-2 py-2 text-left whitespace-normal",
                                    seatColours[tone],
                                    selected && "border-primary ring-1 ring-primary",
                                )}
                                onClick={() => {
                                    if (full) onWaitlist(session, waiting ? "leave" : "waitlist");
                                    else onToggle(session);
                                }}
                            >
                                <span className="min-w-0">
                                    <span className="block font-semibold">
                                        {sessionTime(session)}
                                    </span>
                                    <span className="flex items-center gap-1 text-sm">
                                        <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                                        {session.centre}
                                    </span>
                                    <span className="block text-xs opacity-80">
                                        {session.instructor}
                                    </span>
                                </span>
                                <span className="text-xs font-medium">
                                    {booked
                                        ? "Already enrolled"
                                        : overlapsBooking
                                            ? "Overlaps a booking"
                                            : canLeave
                                                ? "Leave waitlist"
                                                : label ||
                                                `${session.capacity - session.occupied} spots left`}
                                </span>
                            </Button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

const periods = [
    { value: "morning", label: "Morning (before 12 pm)" },
    { value: "afternoon", label: "Afternoon (12 – 5 pm)" },
    { value: "evening", label: "Evening (after 5 pm)" },
];
const FILTER_KEYS = [
    "q",
    "class",
    "centre",
    "day",
    "period",
    "instructor",
] as const;

function classTypeOf(session: ClassOffering) {
    return session.classType ?? session.title;
}

/** Applies the URL filters. `q` matches the dojo or class name. */
function filterSessions(sessions: ClassOffering[], params: URLSearchParams) {
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const type = params.get("class");
    const centre = params.get("centre");
    const day = params.get("day");
    const instructor = params.get("instructor");
    const period = params.get("period");
    return sessions.filter((session) => {
        const hour = Number(session.startTime.slice(0, 2));
        return (
            (!query ||
                session.centre.toLowerCase().includes(query) ||
                classTypeOf(session).toLowerCase().includes(query)) &&
            (!type || classTypeOf(session) === type) &&
            (!centre || session.centre === centre) &&
            (!day || session.date.getDay() === Number(day)) &&
            (!instructor || session.instructor === instructor) &&
            (!period ||
                (period === "morning" && hour < 12) ||
                (period === "afternoon" && hour >= 12 && hour < 17) ||
                (period === "evening" && hour >= 17))
        );
    });
}

const sorted = (values: Iterable<string>) =>
    [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * Filter fields for the class list and the booking page. Options come from the
 * real upcoming sessions, so a filter can never offer a dojo with no classes.
 */
function SessionFilterFields({
    sessions,
    params,
    onChange,
    showType,
    disabled = false,
}: {
    sessions: ClassOffering[];
    params: URLSearchParams;
    onChange: (name: string, value: string) => void;
    showType: boolean;
    disabled?: boolean;
}) {
    return (
        <>
            {showType && (
                <FilterField
                    label="Class type"
                    value={params.get("class") ?? "all"}
                    onChange={(value) => onChange("class", value)}
                    disabled={disabled}
                    ariaLabel="Class type filter"
                    options={[
                        { value: "all", label: "All class types" },
                        ...sorted(sessions.map(classTypeOf)).map((t) => ({
                            value: t,
                            label: t,
                        })),
                    ]}
                />
            )}
            <FilterField
                label="Dojo"
                value={params.get("centre") ?? "all"}
                onChange={(value) => onChange("centre", value)}
                disabled={disabled}
                ariaLabel="Dojo filter"
                options={[
                    { value: "all", label: "All dojos" },
                    ...sorted(sessions.map((s) => s.centre)).map((c) => ({
                        value: c,
                        label: c,
                    })),
                ]}
            />
            <FilterField
                label="Day"
                value={params.get("day") ?? "all"}
                onChange={(value) => onChange("day", value)}
                disabled={disabled}
                ariaLabel="Day filter"
                options={[
                    { value: "all", label: "Any day" },
                    ...days.map((d, i) => ({ value: String(i), label: d })),
                ]}
            />
            <FilterField
                label="Time of day"
                value={params.get("period") ?? "all"}
                onChange={(value) => onChange("period", value)}
                disabled={disabled}
                ariaLabel="Time of day filter"
                options={[{ value: "all", label: "Any time" }, ...periods]}
            />
            <FilterField
                label="Instructor"
                value={params.get("instructor") ?? "all"}
                onChange={(value) => onChange("instructor", value)}
                disabled={disabled}
                ariaLabel="Instructor filter"
                options={[
                    { value: "all", label: "All instructors" },
                    ...sorted(sessions.map((s) => s.instructor)).map((i) => ({
                        value: i,
                        label: i,
                    })),
                ]}
            />
        </>
    );
}

function withFilter(params: URLSearchParams, name: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(name);
    else next.set(name, value);
    return next;
}

function withoutFilters(params: URLSearchParams, keys: readonly string[]) {
    const next = new URLSearchParams(params);
    for (const key of keys) next.delete(key);
    return next;
}

const plural = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;

function isRecommendedForGrade(type: string, grade: string | null | undefined) {
    if (!grade) return false;
    if (type === "Mixed/Family") return true;

    const kyu = grade.match(/\b(\d+)(?:st|nd|rd|th)?\s+kyu\b/i);
    const isDan = /\b(?:\d+(?:st|nd|rd|th)?|junior)\s+dan\b/i.test(grade);
    const minimumKyu =
        type === "Advanced" ? 1 : type === "Intermediate" ? 4 : undefined;

    // Age-restricted classes cannot be recommended from grade alone.
    return (
        minimumKyu !== undefined &&
        (isDan || (kyu !== null && Number(kyu[1]) <= minimumKyu))
    );
}

/** Shown only when the student can't book, with the next step. */
function BookingEligibility({ linked }: { linked: boolean }) {
    const { status } = useMembershipStatus();
    if (!linked) {
        return (
            <Alert>
                <AlertDescription>
                    You can browse classes, but your account isn’t linked to a student
                    record yet. Please contact your dojo before booking.
                </AlertDescription>
            </Alert>
        );
    }
    return (
        <Alert>
            <IdCard aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3 [&_a]:no-underline">
                <span>
                    {status === "pending"
                        ? "You can browse classes now. Booking opens once your membership payment is confirmed."
                        : status === "expired"
                            ? "Your membership has expired. You can browse classes, but booking needs an active membership."
                            : "You can browse classes, but booking needs an active membership."}
                </span>
                {status !== "pending" && (
                    <Link
                        to="/apply-membership"
                        className={buttonVariants({ size: "sm" })}
                    >
                        {status === "expired" ? "Renew membership" : "Apply for membership"}
                    </Link>
                )}
            </AlertDescription>
        </Alert>
    );
}

function ClassCard({
    type,
    sessions,
    recommended,
    href,
    schedule,
}: {
    type: string;
    sessions: ClassOffering[];
    recommended: boolean;
    href: string;
    schedule: StudentContext["schedule"];
}) {
    const ordered = [...sessions].sort(
        (a, b) => dateTime(a).getTime() - dateTime(b).getTime(),
    );
    // The earliest session the student could actually book right now.
    const open = ordered.find(
        (session) =>
            session.bookable &&
            !schedule.isFull(session) &&
            !schedule.isBooked(session.id),
    );
    const dojoCount = new Set(sessions.map((session) => session.centre)).size;
    const level =
        sessions[0]?.level && sessions[0].level !== type ? sessions[0].level : "";

    return (
        <Card className="h-full gap-4">
            <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{type}</CardTitle>
                    {recommended && (
                        <StatusBadge tone="info" dot={false}>
                            Recommended for your grade
                        </StatusBadge>
                    )}
                </div>
                {level && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{level}</p>
                )}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                            Next available
                        </dt>
                        <dd className="mt-0.5 font-medium">
                            {open ? (
                                <>
                                    {prettyDate(open.date)}
                                    <span className="block font-normal text-muted-foreground">
                                        {sessionTime(open)} · {open.centre}
                                    </span>
                                </>
                            ) : (
                                <span className="text-muted-foreground">
                                    No open spots · waitlist only
                                </span>
                            )}
                        </dd>
                    </div>
                    <div>
                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin aria-hidden="true" className="size-4 shrink-0" />
                            Dojos
                        </dt>
                        <dd className="mt-0.5 font-medium">{plural(dojoCount, "dojo")}</dd>
                    </div>
                </dl>
                <Link
                    to={href}
                    className={buttonVariants({
                        size: "touch",
                        className: "mt-auto w-full",
                    })}
                >
                    View sessions<span className="sr-only">: {type}</span>
                </Link>
            </CardContent>
        </Card>
    );
}

export default function StudentClasses() {
    const { classes, schedule } = useOutletContext<StudentContext>();

    const { pathname } = useLocation();
    const [params, setParams] = useSearchParams();
    const [catalog, setCatalog] = useState<ClassType[] | null>(null);
    const [catalogError, setCatalogError] = useState(false);
    const [catalogRevision, setCatalogRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        async function loadCatalog() {
            try {
                const { data, error } = await supabase
                    .from("class_types")
                    .select("id, label, description")
                    .order("label")
                    .abortSignal(controller.signal);
                if (error) throw error;
                if (!controller.signal.aborted) setCatalog(data);
            } catch {
                if (!controller.signal.aborted) setCatalogError(true);
            }
        }
        void loadCatalog();
        return () => controller.abort();
    }, [catalogRevision]);

    const upcoming = useMemo(() => {
        const now = new Date();
        return classes.filter(
            (session) => session.scheduled && dateTime(session) > now,
        );
    }, [classes]);
    const scheduledTypes = new Set(upcoming.map(classTypeOf));
    const unscheduled = catalog?.filter(
        (type) => !scheduledTypes.has(type.label),
    );

    const matching = useMemo(
        () => filterSessions(upcoming, params),
        [upcoming, params],
    );

    const groups = useMemo(() => {
        const grouped = new Map<string, ClassOffering[]>();

        for (const session of matching) {
            const type = classTypeOf(session);
            const sessions = grouped.get(type) ?? [];
            sessions.push(session);
            grouped.set(type, sessions);
        }

        const recommended = (type: string) =>
            Number(isRecommendedForGrade(type, schedule.grade));
        return [...grouped].sort(
            ([left], [right]) =>
                recommended(right) - recommended(left) || left.localeCompare(right),
        );
    }, [matching, schedule.grade]);

    const update = (next: URLSearchParams) => setParams(next, { replace: true });
    const sheetKeys = ["class", "centre", "day", "period", "instructor"];
    const activeCount = sheetKeys.filter((key) => params.has(key)).length;
    const filtering = activeCount > 0 || Boolean(params.get("q"));

    return (
        <div className="space-y-6">
            <PageHeader
                title="Find a class"
            />

            {!schedule.active && <BookingEligibility linked={schedule.linked} />}

            <div className="space-y-2">
                <div role="search" className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <SearchInput
                        value={params.get("q") ?? ""}
                        onChange={(event) =>
                            update(withFilter(params, "q", event.target.value))
                        }
                        placeholder="Search by dojo or class"
                        aria-label="Search classes by dojo or class name"
                        wrapperClassName="min-w-0 basis-32"
                    />
                    <FilterPopover
                        title="Filter classes"
                        activeCount={activeCount}
                        onReset={() => update(withoutFilters(params, sheetKeys))}
                    >
                        <SessionFilterFields
                            sessions={upcoming}
                            params={params}
                            showType
                            onChange={(name, value) =>
                                update(withFilter(params, name, value))
                            }
                        />
                    </FilterPopover>
                </div>
                {filtering && (
                    <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => update(withoutFilters(params, FILTER_KEYS))}
                    >
                        Clear search and filters
                    </Button>
                )}
            </div>

            {groups.length === 0 ? (
                <EmptyState
                    icon={CalendarX}
                    title={
                        upcoming.length
                            ? "No classes match your search"
                            : "No upcoming sessions are scheduled"
                    }
                    description={
                        upcoming.length
                            ? "Try another dojo, day or time, or clear your filters."
                            : undefined
                    }
                />
            ) : (
                <section
                    aria-label="Classes"
                    className="grid gap-4 md:auto-rows-fr md:grid-cols-2"
                >
                    {groups.map(([type, sessions]) => {
                        const bookingParams = withoutFilters(params, ["class"]);
                        bookingParams.set("type", type);
                        if (pathname === "/timetable")
                            bookingParams.set("from", "timetable");
                        return (
                            <ClassCard
                                key={type}
                                type={type}
                                sessions={sessions}
                                recommended={isRecommendedForGrade(type, schedule.grade)}
                                href={`/classes/choose?${bookingParams}`}
                                schedule={schedule}
                            />
                        );
                    })}
                </section>
            )}

            {catalogError ? (
                <RetryAlert
                    message="Could not load the full class list."
                    onRetry={() => {
                        setCatalogError(false);
                        setCatalogRevision((revision) => revision + 1);
                    }}
                />
            ) : !catalog ? (
                <CardListSkeleton count={2} label="Loading the full class list…" />
            ) : (
                !filtering &&
                unscheduled &&
                unscheduled.length > 0 && (
                    <section aria-labelledby="other-class-types" className="space-y-3">
                        <h2 id="other-class-types" className="text-lg font-semibold">
                            Other class types
                        </h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            {unscheduled.map((type) => (
                                <Card key={type.id} className="gap-2">
                                    <CardHeader>
                                        <CardTitle className="text-lg">{type.label}</CardTitle>
                                        {type.description && (
                                            <p className="text-sm text-muted-foreground">
                                                {type.description}
                                            </p>
                                        )}
                                    </CardHeader>
                                    <CardContent className="text-sm text-muted-foreground">
                                        No upcoming sessions
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </section>
                )
            )}
        </div>
    );
}

export function StudentClassBooking() {
    const [params] = useSearchParams();
    const type = params.get("type") ?? "";
    const backParams = new URLSearchParams(params);
    backParams.delete("type");
    backParams.delete("from");
    backParams.delete("class");
    const backPath =
        params.get("from") === "timetable" ? "/timetable" : "/classes";
    const backTo = backParams.size ? `${backPath}?${backParams}` : backPath;

    return (
        <div className="space-y-5">
            <BackLink to={backTo}>
                {backPath === "/timetable" ? "Back to my schedule" : "Back to classes"}
            </BackLink>
            <ClassBooking
                key={params.toString()}
                type={type}
                initialParams={backParams}
            />
        </div>
    );
}

function ClassBooking({
    type,
    initialParams,
}: {
    type: string;
    initialParams: URLSearchParams;
}) {
    const { classes, schedule } = useOutletContext<StudentContext>();
    const { credits, creditAccount, creditError, refreshCredits } =
        useOutletContext<StudentContext>();
    const [params, setParams] = useState(initialParams);
    const [day, setDay] = useState("");
    const [pendingChange, setPendingChange] = useState<
        { date: Date } | { params: URLSearchParams } | null
    >(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [action, setAction] = useState<Action | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const { notify, feedbackDialog } = useFeedback();
    const [selectionError, setSelectionError] = useState("");
    const [actionError, setActionError] = useState("");

    const now = new Date();
    const classSessions = classes.filter(
        (session) =>
            (session.classType ?? session.title) === type &&
            session.scheduled &&
            dateTime(session) > now,
    );
    const sessions = filterSessions(classSessions, params);
    const current =
        sessions.find((session) => dateKey(session.date) === day) ??
        sessions.find((session) => session.bookable && !schedule.isFull(session)) ??
        sessions[0];

    const busy = submitting || schedule.saving;
    const enrolmentCount = action?.kind === "enroll" ? action.sessions.length : 0;
    const insufficientCredits = Boolean(
        !creditAccount.loading &&
        !creditError &&
        !creditAccount.unlimited &&
        creditAccount.credits < enrolmentCount,
    );
    const bookings = classes.filter(
        (session) => session.scheduled && schedule.isBooked(session.id),
    );
    const conflictingIds = new Set(
        sessions
            .filter((session) =>
                bookings.some(
                    (booking) => booking.id !== session.id && conflict(session, booking),
                ),
            )
            .map((session) => session.id),
    );
    const selected = sessions.filter(
        (session) =>
            current &&
            dateKey(session.date) === dateKey(current.date) &&
            selectedIds.includes(session.id) &&
            session.bookable &&
            !schedule.isFull(session) &&
            !schedule.isBooked(session.id) &&
            !conflictingIds.has(session.id),
    );

    function applyDay(date: Date) {
        setDay(dateKey(date));
        setPendingChange(null);
        setSelectedIds([]);
        setSelectionError("");
    }

    function changeDay(date: Date) {
        if (!current || dateKey(date) === dateKey(current.date)) return;
        if (selected.length) setPendingChange({ date });
        else applyDay(date);
    }

    function changeFilters(next: URLSearchParams) {
        const nextSessions = filterSessions(selected, next);
        if (nextSessions.length !== selected.length) {
            setPendingChange({ params: next });
            return;
        }
        setParams(next);
        setSelectionError("");
    }

    function confirmChange() {
        if (!pendingChange) return;
        if ("date" in pendingChange) {
            applyDay(pendingChange.date);
        } else {
            setParams(pendingChange.params);
            setSelectedIds([]);
            setPendingChange(null);
            setSelectionError("");
        }
    }

    function toggleSession(session: ClassOffering) {
        setSelectionError("");
        if (selectedIds.includes(session.id)) {
            setSelectedIds((ids) => ids.filter((id) => id !== session.id));
            return;
        }

        if (conflictingIds.has(session.id)) {
            setSelectionError("This time overlaps a class you already booked.");
            return;
        }

        if (selected.some((other) => conflict(session, other))) {
            setSelectionError(
                "These classes overlap. Choose times that do not overlap.",
            );
            return;
        }

        setDay(dateKey(session.date));
        setSelectedIds((ids) => [...ids, session.id]);
    }

    function closeAction() {
        setAction(null);
        setActionError("");
    }

    async function confirm() {
        if (!action || busy) return;
        setSubmitting(true);
        setActionError("");
        try {
            if (action.kind === "enroll") {
                if (
                    !creditAccount.loading &&
                    !creditError &&
                    !creditAccount.unlimited &&
                    credits < action.sessions.length
                ) {
                    setActionError(
                        "Top up your credits before enrolling in these classes.",
                    );
                    return;
                }
                const completed: string[] = [];
                const failed: ClassOffering[] = [];
                const errors: string[] = [];
                for (const session of action.sessions) {
                    const error = await schedule.enroll(session);
                    if (error) {
                        failed.push(session);
                        errors.push(
                            `${sessionTime(session)} at ${session.centre}: ${error}`,
                        );
                    } else {
                        // The booking RPC already charged the earliest-expiring batch.
                        completed.push(session.id);
                    }
                }
                await refreshCredits();
                setSelectedIds((ids) => ids.filter((id) => !completed.includes(id)));
                if (completed.length) {
                    const count = completed.length;
                    notify({
                        title: "Enrolment confirmed",
                        description: `Enrolled in ${count} ${count === 1 ? "class" : "classes"} on ${prettyDate(action.sessions[0].date)}.`,
                    });
                }
                if (failed.length) {
                    setAction({ kind: "enroll", sessions: failed });
                    setActionError(
                        [
                            ...(completed.length
                                ? [
                                    `${completed.length} ${completed.length === 1 ? "class was" : "classes were"} booked.`,
                                ]
                                : []),
                            ...errors,
                        ].join("\n"),
                    );
                    return;
                }
            } else {
                const error =
                    action.kind === "waitlist"
                        ? await schedule.joinWaitlist(action.session)
                        : await schedule.leaveWaitlist(action.session.id);
                if (error) {
                    setActionError(error);
                    return;
                }
                notify(
                    action.kind === "waitlist"
                        ? {
                            title: "Joined waitlist",
                            description:
                                "You joined the waitlist. This does not reserve a spot.",
                        }
                        : {
                            title: "Left waitlist",
                            description: "You have left the waitlist.",
                        },
                );
            }
            closeAction();
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="space-y-4" aria-labelledby="booking-class-title">
            <div id="booking-class-title">
                <PageHeader
                    title={type || "Choose a class"}
                    actions={(
                        <FilterPopover
                                    title="Filter sessions"
                                    activeCount={
                                        ["q", "centre", "day", "period", "instructor"].filter((key) =>
                                            params.has(key),
                                        ).length
                                    }
                                    onReset={() =>
                                        changeFilters(
                                            withoutFilters(params, [
                                                "q",
                                                "centre",
                                                "day",
                                                "period",
                                                "instructor",
                                            ]),
                                        )
                                    }
                                >
                                    <SessionFilterFields
                                        sessions={classSessions}
                                        params={params}
                                        showType={false}
                                        disabled={busy}
                                        onChange={(name, value) =>
                                            changeFilters(withFilter(params, name, value))
                                        }
                                    />
                                </FilterPopover>
                    )}
                />
            </div>
            {!schedule.active && <BookingEligibility linked={schedule.linked} />}
            {current ? (
                <div className="space-y-4">
                        <ClassSessionPicker
                            key={params.toString()}
                            sessions={sessions}
                            date={current.date}
                            selectedIds={selected.map((session) => session.id)}
                            conflictingIds={conflictingIds}
                            schedule={schedule}
                            busy={busy}
                            onDateChange={changeDay}
                            onToggle={toggleSession}
                            onWaitlist={(session, kind) => {
                                setAction({ kind, session });
                            }}
                        />
                        {selectionError && (
                            <p role="alert" className="text-sm text-destructive">
                                {selectionError}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <div className="min-w-0 space-y-0.5">
                                <p role="status" className="font-medium">
                                    {selected.length
                                        ? `${plural(selected.length, "class", "classes")} selected`
                                        : "No times selected yet"}
                                </p>
                                <Link
                                    to="/student/credits"
                                    className="text-sm text-primary underline-offset-4 hover:underline"
                                >
                                    {creditError
                                        ? "Credit balance unavailable"
                                        : creditAccount.loading
                                            ? "Loading credits…"
                                            : creditAccount.unlimited
                                                ? "Unlimited pass"
                                                : `${plural(creditAccount.credits, "credit")} available`}
                                </Link>
                            </div>
                            {/* Phones use the bar pinned to the bottom of the screen instead. */}
                            <Button
                                size="lg"
                                className="hidden min-w-48 lg:inline-flex"
                                disabled={!selected.length || !schedule.active || busy}
                                onClick={() =>
                                    setAction({ kind: "enroll", sessions: selected })
                                }
                            >
                                {selected.length
                                    ? `Enrol in ${plural(selected.length, "class", "classes")}`
                                    : "Enrol"}
                            </Button>
                        </div>
                </div>
            ) : (
                <EmptyState
                    icon={CalendarX}
                    title={
                        classSessions.length
                            ? "No sessions match these filters"
                            : "No upcoming sessions for this class"
                    }
                />
            )}

            {/* Phones: keep the action in reach while the times list scrolls. Leaves room for the help button. */}
            {selected.length > 0 && schedule.active && (
                <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background/95 px-4 pt-3 pr-20 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
                    <Button
                        size="touch"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => setAction({ kind: "enroll", sessions: selected })}
                    >
                        Enrol in {plural(selected.length, "class", "classes")}
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={pendingChange !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingChange(null);
                }}
                title={
                    pendingChange && "params" in pendingChange
                        ? "Change filters?"
                        : "Change date?"
                }
                description="Your selected slots will be cleared. Confirm to continue."
                cancelLabel="Keep selection"
                confirmLabel={
                    pendingChange && "params" in pendingChange
                        ? "Apply filters"
                        : "Change date"
                }
                onConfirm={confirmChange}
            />

            <AlertDialog
                open={action !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) closeAction();
                }}
            >
                {action && (
                    <AlertDialogContent size="compact">
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {action.kind === "enroll"
                                    ? "Confirm enrolment?"
                                    : action.kind === "waitlist"
                                        ? "Join the waitlist?"
                                        : "Leave the waitlist?"}
                            </AlertDialogTitle>
                            {action.kind === "enroll" ? (
                                <>
                                    <AlertDialogDescription>
                                        {type} · {prettyDate(action.sessions[0].date)}
                                    </AlertDialogDescription>
                                    <ul className="max-h-48 space-y-1 overflow-y-auto text-left text-sm">
                                        {action.sessions.map((session) => (
                                            <li key={session.id}>
                                                {sessionTime(session)} · {session.centre}
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
                                        <span>Enrolment fee</span>
                                        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                                            <Coins aria-hidden="true" className="size-4" />
                                            {creditAccount.unlimited
                                                ? "Included in your pass"
                                                : enrolmentCount +
                                                (enrolmentCount === 1 ? " credit" : " credits")}
                                        </span>
                                    </div>
                                    {insufficientCredits && (
                                        <p className="text-sm text-destructive">
                                            {creditAccount.credits} credits available.{" "}
                                            <Link
                                                to="/student/credits"
                                                className="font-medium underline"
                                            >
                                                Top up credits
                                            </Link>
                                        </p>
                                    )}
                                </>
                            ) : (
                                <AlertDialogDescription>
                                    {action.session.title} · {prettyDate(action.session.date)} ·{" "}
                                    {sessionTime(action.session)} · {action.session.centre}
                                </AlertDialogDescription>
                            )}
                        </AlertDialogHeader>
                        {action.kind === "waitlist" && (
                            <p className="text-sm text-muted-foreground">
                                Joining the waitlist does not reserve a spot.
                            </p>
                        )}
                        {actionError && (
                            <p
                                role="alert"
                                className="whitespace-pre-line rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                            >
                                {actionError}
                            </p>
                        )}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={busy} onClick={closeAction}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirm}
                                disabled={
                                    busy || (action.kind === "enroll" && insufficientCredits)
                                }
                            >
                                {busy
                                    ? "Saving…"
                                    : action.kind === "enroll"
                                        ? "Enrol"
                                        : action.kind === "waitlist"
                                            ? "Join waitlist"
                                            : "Leave waitlist"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                )}
            </AlertDialog>
            {feedbackDialog}
        </section>
    );
}
