import { CardListSkeleton } from "@/components/shared/skeletons";
import { useFeedback } from "@/hooks/use-feedback";
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
import { useMemo, useState } from "react";
import {
    Link,
    useLocation,
    useOutletContext,
    useSearchParams,
} from "react-router";
import {
    CalendarDays,
    CalendarX,
    Check,
    Coins,
    IdCard,
    MapPin,
    Users,
    X,
} from "lucide-react";
import { BackArrow, BackNav } from "@/components/shared/layout/BackLink";
import ClassDetailsOverlay from "@/components/shared/calendar/ClassDetailsOverlay";
import { useMediaQuery } from "@/hooks/use-media-query";
import EmptyState from "@/components/shared/layout/EmptyState";
import PageHeader from "@/components/shared/layout/PageHeader";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { StatusBadge } from "@/components/shared/status/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentContext } from "@/layouts/StudentLayout";
import { supabase } from "@/lib/supabase";
import { useStudentQuery } from "@/hooks/use-student-query";
import { studentQueryKeys as keys, studentQueryTimes as times } from "@/lib/student/query-keys";
import { classTypes, dateKey } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";
import {
    conflict,
    dateTime,
    formatTime,
    prettyDate,
} from "@/lib/student-schedule";
import type { ClassOffering } from "@/lib/student-schedule";
import FilterPopover, {
    FilterField,
} from "@/components/shared/filters/FilterPopover";
import SearchInput from "@/components/shared/filters/SearchInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMembershipStatus } from "@/hooks/use-membership-status";

type Action =
    | {
        kind: "enroll";
        sessions: ClassOffering[];
        repeat?: { month: string; skippedSessions: string[] };
    }
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

// Theme tokens, so light and dark mode follow the rest of the portal.
const seatColours = {
    full: "bg-destructive/10 text-foreground",
    low: "bg-warning/15 text-foreground",
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

/** Sessions grouped by day, in the order given. */
function groupByDay(sessions: ClassOffering[]) {
    const days = new Map<string, ClassOffering[]>();
    for (const session of sessions) {
        const key = dateKey(session.date);
        days.set(key, [...(days.get(key) ?? []), session]);
    }
    return [...days.values()];
}

function ClassSessionPicker({
    sessions,
    date,
    selectedIds,
    cartDates,
    conflictingIds,
    schedule,
    busy,
    error,
    onDateChange,
    onToggle,
    onWaitlist,
}: {
    sessions: ClassOffering[];
    date: Date;
    selectedIds: string[];
    /** Days holding a picked class, marked with a dot so picks on other days stay visible. */
    cartDates: Date[];
    conflictingIds: ReadonlySet<string>;
    schedule: StudentContext["schedule"];
    busy: boolean;
    /** Why the last pick was refused (overlaps), shown right under the times. */
    error: string;
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
    const phone = useMediaQuery("(max-width: 47.999rem)");
    const [sheetOpen, setSheetOpen] = useState(false);

    const times = (
        <>
            {/* Phones: the page scrolls once; wide screens cap the list beside the calendar. */}
            <div
                role="group"
                aria-label="Session times"
                className="grid gap-2 p-1 max-md:gap-4 lg:grid-cols-2"
            >
                {daySessions.map((session) => {
                    const { tone, label } = sessionAvailability(session);
                    const selected = selectedIds.includes(session.id);
                    const booked = schedule.isBooked(session.id);
                    const full = schedule.isFull(session);
                    const waiting = schedule.isWaitlisted(session.id);
                    const canLeave = waiting && full && session.bookable && !booked;
                    const overlapsBooking = !full && conflictingIds.has(session.id);
                    // Spots left now show as the count; only states that change what a tap does get words.
                    const status = booked
                        ? "Already enrolled"
                        : overlapsBooking
                            ? "Overlaps a booking"
                            : canLeave
                                ? "Leave waitlist"
                                : selected
                                    ? ""
                                    : tone === "full" || !session.bookable
                                        ? label
                                        : "";
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
                                // Phones (the bottom sheet): roomier cards for thumbs; desktop keeps the denser list.
                                "h-auto min-h-11 w-full items-center justify-between gap-2 py-2 text-left whitespace-normal max-md:gap-4 max-md:rounded-xl max-md:px-5 max-md:py-5",
                                seatColours[tone],
                                selected && "border-primary ring-1 ring-primary",
                            )}
                            onClick={() => {
                                if (full) onWaitlist(session, waiting ? "leave" : "waitlist");
                                else onToggle(session);
                            }}
                        >
                            <span className="min-w-0 max-md:space-y-1.5">
                                <span className="block font-semibold md:text-base">
                                    {sessionTime(session)}
                                </span>
                                <span className="flex items-center gap-1 text-sm max-md:gap-1.5">
                                    <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                                    {session.centre}
                                </span>
                                <span className="block text-xs opacity-80">
                                    {session.instructor}
                                </span>
                            </span>
                            {/* Right side: places taken out of capacity, then any status beneath it. */}
                            <span className="flex shrink-0 flex-col items-end gap-1 text-right text-xs font-medium">
                                {session.bookable && session.capacity > 0 && (
                                    <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                                        <Users aria-hidden="true" className="size-4 opacity-70" />
                                        <span aria-hidden="true">
                                            {session.occupied}/{session.capacity}
                                        </span>
                                        <span className="sr-only">
                                            {plural(
                                                Math.max(0, session.capacity - session.occupied),
                                                "spot",
                                            )}{" "}
                                            left of {session.capacity}
                                        </span>
                                    </span>
                                )}
                                {/* Picked: a check and "Added", not just the ring colour. */}
                                {(status || selected) && (
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1",
                                            selected && "text-primary",
                                        )}
                                    >
                                        {selected && (
                                            <Check aria-hidden="true" className="size-4" />
                                        )}
                                        {status || "Added"}
                                    </span>
                                )}
                            </span>
                        </Button>
                    );
                })}
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
        </>
    );

    // Two grid cells (calendar, times): ClassBooking owns the grid so the cart can sit beside them.
    return (
        <>
            {/* Phones: a container, so the days size to the 70% column rather than the screen. */}
            <div className="min-w-0 self-start rounded-lg border bg-card p-2 shadow-xs @container md:col-start-1 md:row-start-1 md:p-4">
                <Calendar
                    aria-label="Class dates"
                    mode="single"
                    required
                    selected={date}
                    defaultMonth={date}
                    startMonth={sessions[0]?.date}
                    endMonth={sessions.at(-1)?.date}
                    showOutsideDays={false}
                    className="mx-auto p-0 [--booking-day:min(2.75rem,calc(100cqw/7))] md:[--booking-day:min(3.5rem,calc(100cqw/7))] [&_.rdp-weekday]:w-(--booking-day) [&_.rdp-day]:size-(--booking-day) [&_.rdp-day_button]:size-(--booking-day) [&_.rdp-day_button]:text-cal-lg md:[&_.rdp-day_button]:text-sm [&_.rdp-caption_label]:text-base [&_.rdp-caption_label]:font-semibold"
                    disabled={(day) => busy || !sessionsByDay.has(dateKey(day))}
                    // Today: a ring around the number, readable even on a day without classes.
                    // A selected today keeps the selected fill.
                    classNames={{
                        today:
                            "rdp-today font-semibold !opacity-100 [&:not(.rdp-selected)>button]:text-primary [&:not(.rdp-selected)>button]:ring-1 [&:not(.rdp-selected)>button]:ring-inset [&:not(.rdp-selected)>button]:ring-primary/60",
                    }}
                    modifiers={{ inCart: cartDates }}
                    modifiersClassNames={{
                        inCart:
                            "relative after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-primary [&.rdp-selected]:after:bg-primary-foreground",
                    }}
                    onSelect={onDateChange}
                    // Phones: any tap on a date (including the current one) opens its times.
                    onDayClick={(_day, modifiers) => {
                        if (phone && !modifiers.disabled) setSheetOpen(true);
                    }}
                />
            </div>
            {phone ? (
                <ClassDetailsOverlay
                    open={sheetOpen}
                    onClose={() => setSheetOpen(false)}
                    title={prettyDate(date)}
                    description={plural(daySessions.length, "time")}
                >
                    <div className="space-y-3">{times}</div>
                </ClassDetailsOverlay>
            ) : (
                <div className="min-w-0 space-y-3 md:col-start-1 md:row-start-2">
                    <h2
                        className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold"
                        aria-live="polite"
                    >
                        {prettyDate(date)}
                        <span className="text-sm font-normal text-muted-foreground">
                            {plural(daySessions.length, "time")}
                        </span>
                    </h2>
                    {times}
                </div>
            )}
        </>
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
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                {/* When, then where: icon lines instead of labelled fields, so nothing wraps mid-phrase. */}
                <ul className="grid gap-2 text-sm">
                    <li className="flex min-w-0 items-start gap-2.5">
                        <CalendarDays
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                        {open ? (
                            <span className="min-w-0">
                                <span className="sr-only">Next available: </span>
                                <span className="font-medium">{prettyDate(open.date)}</span>
                                <span className="block text-muted-foreground tabular-nums">
                                    {sessionTime(open)}
                                </span>
                            </span>
                        ) : (
                            <span className="text-muted-foreground">
                                No open spots · waitlist only
                            </span>
                        )}
                    </li>
                    <li className="flex min-w-0 items-start gap-2.5">
                        <MapPin
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                            {open ? (
                                <>
                                    {open.centre}
                                    {dojoCount > 1 && (
                                        <span className="whitespace-nowrap text-muted-foreground">
                                            {" "}
                                            +{dojoCount - 1} more
                                        </span>
                                    )}
                                </>
                            ) : (
                                plural(dojoCount, "dojo")
                            )}
                        </span>
                    </li>
                </ul>
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
    const catalogQuery = useStudentQuery(
        keys.classTypes,
        async (_userId, signal) => {
            const { data, error } = await supabase
                .from("class_types")
                .select("id, label, description")
                .order("label")
                .abortSignal(signal);
            if (error) throw error;
            return data as ClassType[];
        },
        times.reference,
    );
    const catalog = catalogQuery.data ?? null;
    const catalogError =
        !catalog && catalogQuery.isError && !catalogQuery.isFetching;

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
            <PageHeader title="Find a class" />

            {!schedule.active && <BookingEligibility linked={schedule.linked} />}

            <div className="space-y-2">
                <div
                    role="search"
                    className="flex flex-wrap items-center gap-2 sm:gap-3"
                >
                    <SearchInput
                        value={params.get("q") ?? ""}
                        onChange={(event) =>
                            update(withFilter(params, "q", event.target.value))
                        }
                        placeholder="Class or dojo"
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
                        void catalogQuery.refetch();
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
                                // Muted: nothing to book yet, so it shouldn't compete with the classes above.
                                <Card
                                    key={type.id}
                                    className="gap-2 bg-muted/50 shadow-none ring-0"
                                >
                                    <CardHeader>
                                        <CardTitle className="text-lg">{type.label}</CardTitle>
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
            <BackNav
                to={backTo}
                label={
                    backPath === "/timetable" ? "Back to my schedule" : "Back to classes"
                }
            >
                <ClassBooking
                    key={params.toString()}
                    type={type}
                    initialParams={backParams}
                />
            </BackNav>
        </div>
    );
}

/** The class's colour code from the shared class key, matched by id or label; primary when unknown. */
function classPillStyle(type: string) {
    const style = Object.hasOwn(classTypes, type)
        ? classTypes[type as keyof typeof classTypes]
        : Object.values(classTypes).find(
            (entry) => entry.label.toLowerCase() === type.toLowerCase(),
        );
    return style?.badge ?? "border-primary/30 bg-primary/10 text-primary";
}

/** How the cart's cost compares with the student's credits; null while unknown. */
function cartCost(
    count: number,
    account: StudentContext["creditAccount"],
    creditError: boolean,
) {
    if (account.unlimited) return { label: "Included in your pass", shortBy: 0 };
    const label = plural(count, "credit");
    if (account.loading || creditError) return { label, shortBy: 0 };
    return { label, shortBy: Math.max(0, count - account.credits) };
}

// Top of the page: what you have to spend, before you pick anything.
function BalanceCard({
    creditAccount,
    creditError,
}: {
    creditAccount: StudentContext["creditAccount"];
    creditError: boolean;
}) {
    const value = creditAccount.unlimited
        ? "Unlimited pass"
        : creditError
            ? "Unavailable"
            : creditAccount.loading
                ? "Loading…"
                : plural(creditAccount.credits, "credit");
    return (
        <Link
            to="/student/credits"
            className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 shadow-xs transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring md:w-fit md:min-w-56"
        >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Coins aria-hidden="true" className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-semibold tabular-nums">{value}</span>
            </span>
            {!creditAccount.unlimited && (
                <span className="text-sm font-medium text-primary">Top up</span>
            )}
        </Link>
    );
}

// The cart: picks grouped by day, what they cost against the balance, and the Enrol button.
function BookingSummary({
    days,
    count,
    creditAccount,
    creditError,
    busy,
    canEnrol,
    canRepeat,
    onRemove,
    onEnrol,
    onRepeat,
}: {
    days: ClassOffering[][];
    count: number;
    creditAccount: StudentContext["creditAccount"];
    creditError: boolean;
    busy: boolean;
    canEnrol: boolean;
    canRepeat: boolean;
    onRemove: (id: string) => void;
    onEnrol: () => void;
    onRepeat: () => void;
}) {
    const cost = cartCost(count, creditAccount, creditError);
    return (
        <section
            aria-labelledby="booking-summary-title"
            className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs md:sticky md:top-4 lg:top-28 lg:p-5 md:col-start-2 md:row-span-2 md:row-start-1 md:self-start"
        >
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                    <h2 id="booking-summary-title" className="text-lg font-semibold">
                        Selected classes
                    </h2>
                    {count > 0 && (
                        <span
                            aria-hidden="true"
                            className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary tabular-nums"
                        >
                            {count}
                        </span>
                    )}
                </div>
                <p
                    role="status"
                    className={cn(
                        "text-sm text-muted-foreground",
                        count > 0 && "sr-only",
                    )}
                >
                    {count
                        ? `${plural(count, "class", "classes")} selected`
                        : "Pick a time to add it here. Each class costs 1 credit."}
                </p>
            </div>
            {days.length > 0 && (
                <ul className="flex flex-col gap-4">
                    {days.map((group) => (
                        <li key={dateKey(group[0].date)} className="min-w-0 space-y-2">
                            <p className="text-sm font-medium">{prettyDate(group[0].date)}</p>
                            <ul className="divide-y rounded-lg border bg-background">
                                {group.map((session) => (
                                    <li
                                        key={session.id}
                                        className="flex min-w-0 items-center justify-between gap-3 py-2.5 pr-1.5 pl-3.5"
                                    >
                                        <span className="min-w-0 space-y-0.5 text-sm [overflow-wrap:anywhere]">
                                            <span className="block font-medium whitespace-nowrap tabular-nums">
                                                {sessionTime(session)}
                                            </span>
                                            <span className="block text-muted-foreground">
                                                {session.centre}
                                            </span>
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-11 shrink-0 lg:size-9"
                                            disabled={busy}
                                            aria-label={`Remove ${sessionTime(session)} on ${prettyDate(session.date)}`}
                                            onClick={() => onRemove(session.id)}
                                        >
                                            <X aria-hidden="true" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
            {/* Cost and the action, set off from the list. Phones and tablets use the pinned bar to enrol. */}
            {count > 0 && (
                <div className="space-y-3 border-t pt-4">
                    <p className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">Cost</span>
                        <span className="inline-flex items-center gap-1 font-semibold">
                            <Coins
                                aria-hidden="true"
                                className="size-4 self-center text-primary"
                            />
                            {cost.label}
                        </span>
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={!canEnrol || !canRepeat || busy}
                        onClick={onRepeat}
                    >
                        Repeat weekly this month
                    </Button>
                    {!canRepeat && (
                        <p className="text-sm text-muted-foreground">
                            Select classes from one month to repeat weekly.
                        </p>
                    )}
                    <Button
                        size="lg"
                        className="hidden w-full lg:inline-flex"
                        disabled={!canEnrol || busy || cost.shortBy > 0}
                        onClick={onEnrol}
                    >
                        Enrol in {plural(count, "class", "classes")}
                    </Button>
                </div>
            )}
            {cost.shortBy > 0 && (
                <p className="text-sm text-destructive">
                    You need {plural(cost.shortBy, "more credit", "more credits")}.{" "}
                    <Link
                        to="/student/credits"
                        className="font-medium underline underline-offset-4"
                    >
                        Top up credits
                    </Link>
                </p>
            )}
        </section>
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
    // The cart: picked sessions on any date. Changing the date or filters keeps them.
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
    const phone = useMediaQuery("(max-width: 47.999rem)");
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
    // Over every session of this class (not just the filtered ones), so picks on other dates are checked too.
    const conflictingIds = new Set(
        classSessions
            .filter((session) =>
                bookings.some(
                    (booking) => booking.id !== session.id && conflict(session, booking),
                ),
            )
            .map((session) => session.id),
    );
    // Picks drop out on their own if a session fills up or gets booked elsewhere.
    const selected = classSessions
        .filter(
            (session) =>
                selectedIds.includes(session.id) &&
                session.bookable &&
                !schedule.isFull(session) &&
                !schedule.isBooked(session.id) &&
                !conflictingIds.has(session.id),
        )
        .sort((a, b) => dateTime(a).getTime() - dateTime(b).getTime());
    const cartDays = groupByDay(selected);
    const cost = cartCost(selected.length, creditAccount, creditError);
    const canRepeat = selected.every(
        (session) => session.dateId.slice(0, 7) === selected[0]?.dateId.slice(0, 7),
    );

    function reviewWeeklyBookings() {
        const anchor = selected[0];
        if (!anchor || !canRepeat) return;

        const month = anchor.dateId.slice(0, 7);
        const recurring = [...selected];
        const skippedSessions: string[] = [];

        for (const slot of selected) {
            const matchesByDate = new Map<string, ClassOffering[]>();
            for (const session of classSessions) {
                if (
                    session.dateId <= slot.dateId ||
                    session.dateId.slice(0, 7) !== month ||
                    session.date.getDay() !== slot.date.getDay() ||
                    session.centre !== slot.centre ||
                    session.startTime !== slot.startTime ||
                    session.endTime !== slot.endTime
                ) continue;

                const matches = matchesByDate.get(session.dateId) ?? [];
                matches.push(session);
                matchesByDate.set(session.dateId, matches);
            }

            for (const matches of matchesByDate.values()) {
                if (matches.some((session) => recurring.some((item) => item.id === session.id))) {
                    continue;
                }

                const eligible = matches.find((session) =>
                    session.bookable &&
                    !schedule.isFull(session) &&
                    !schedule.isBooked(session.id) &&
                    !bookings.some((booking) => conflict(session, booking)) &&
                    !recurring.some((booking) => conflict(session, booking))
                );

                if (eligible) {
                    recurring.push(eligible);
                } else {
                    const session = matches[0];
                    skippedSessions.push(
                        prettyDate(session.date) + " · " + sessionTime(session) + " · " + session.centre,
                    );
                }
            }
        }

        recurring.sort((left, right) => dateTime(left).getTime() - dateTime(right).getTime());
        setAction({
            kind: "enroll",
            sessions: recurring,
            repeat: {
                month: anchor.date.toLocaleDateString("en-SG", { month: "long", year: "numeric" }),
                skippedSessions,
            },
        });
    }

    function changeDay(date: Date) {
        setDay(dateKey(date));
        setSelectionError("");
    }

    function changeFilters(next: URLSearchParams) {
        setParams(next);
        setSelectionError("");
    }

    function removeFromCart(id: string) {
        setSelectionError("");
        setSelectedIds((ids) => ids.filter((other) => other !== id));
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
                            `${prettyDate(session.date)} · ${sessionTime(session)} at ${session.centre}: ${error}`,
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
                    const oneDay = groupByDay(action.sessions).length === 1;
                    notify({
                        title: "Enrolment confirmed",
                        description: action.repeat
                            ? `Enrolled in ${plural(count, "class", "classes")} in ${action.repeat.month}.`
                            : `Enrolled in ${plural(count, "class", "classes")}${oneDay ? ` on ${prettyDate(action.sessions[0].date)}` : ""}.`,
                    });
                }
                if (failed.length) {
                    setAction({ ...action, sessions: failed });
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

    const filter = (
        <FilterPopover
            title="Filter sessions"
            iconOnlyOnPhones
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
    );

    return (
        <section className="space-y-4" aria-labelledby="booking-class-title">
            {/* Same gap below as every PageHeader (16px, 24px from md), for the phone header too. */}
            <div className="mb-4 md:mb-6">
                {phone ? (
                    <header className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-1">
                                <BackArrow />
                                <h1 id="booking-class-title" className="text-2xl font-semibold tracking-tight">
                                    Book a class
                                </h1>
                            </div>
                            {filter}
                        </div>
                        <p
                            className={cn(
                                "inline-flex max-w-full rounded-full border px-3 py-1 text-sm font-medium [overflow-wrap:anywhere]",
                                classPillStyle(type),
                            )}
                        >
                            {type || "Choose a class"}
                        </p>
                    </header>
                ) : (
                    <PageHeader
                        titleId="booking-class-title"
                        title={type || "Choose a class"}
                        actions={filter}
                    />
                )}
            </div>
            <BalanceCard creditAccount={creditAccount} creditError={creditError} />
            {!schedule.active && <BookingEligibility linked={schedule.linked} />}
            {current ? (
                // Phones: calendar, then the selection at the bottom (times open in a sheet).
                // md and up: calendar over times, selection on the right.
                <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
                    <ClassSessionPicker
                        key={params.toString()}
                        sessions={sessions}
                        date={current.date}
                        selectedIds={selected.map((session) => session.id)}
                        cartDates={cartDays.map((group) => group[0].date)}
                        conflictingIds={conflictingIds}
                        schedule={schedule}
                        busy={busy}
                        error={selectionError}
                        onDateChange={changeDay}
                        onToggle={toggleSession}
                        onWaitlist={(session, kind) => {
                            setAction({ kind, session });
                        }}
                    />
                    <BookingSummary
                        days={cartDays}
                        count={selected.length}
                        creditAccount={creditAccount}
                        creditError={creditError}
                        busy={busy}
                        canEnrol={schedule.active}
                        canRepeat={canRepeat}
                        onRemove={removeFromCart}
                        onEnrol={() => setAction({ kind: "enroll", sessions: selected })}
                        onRepeat={reviewWeeklyBookings}
                    />
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

            {/* Phones: keep the action in reach while the times list scrolls. The chat button moves above this bar (index.css). */}
            {selected.length > 0 && schedule.active && (
                <div
                    data-enrol-bar
                    className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
                >
                    <Button
                        size="touch"
                        className="flex-1"
                        disabled={busy || cost.shortBy > 0}
                        onClick={() => setAction({ kind: "enroll", sessions: selected })}
                    >
                        Enrol in {plural(selected.length, "class", "classes")}
                    </Button>
                </div>
            )}

            <AlertDialog
                open={action !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) closeAction();
                }}
            >
                {action && (
                    // Roomier than the shared compact dialog: 20px padding, with the footer matched to it.
                    <AlertDialogContent
                        size="compact"
                        className="gap-5 p-5 lg:gap-6 lg:p-6"
                    >
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {action.kind === "enroll"
                                    ? action.repeat ? "Confirm weekly bookings?" : "Confirm enrolment?"
                                    : action.kind === "waitlist"
                                        ? "Join the waitlist?"
                                        : "Leave the waitlist?"}
                            </AlertDialogTitle>
                            {action.kind === "enroll" ? (
                                // The class as its colour-coded pill, same as the page header.
                                <AlertDialogDescription
                                    className={cn(
                                        "mt-1 inline-flex max-w-full rounded-full border px-3 py-1 text-sm font-medium",
                                        classPillStyle(type),
                                    )}
                                >
                                    {type}
                                </AlertDialogDescription>
                            ) : (
                                <AlertDialogDescription>
                                    {action.session.title} · {prettyDate(action.session.date)} ·{" "}
                                    {sessionTime(action.session)} · {action.session.centre}
                                </AlertDialogDescription>
                            )}
                        </AlertDialogHeader>
                        {action.kind === "enroll" && (
                            <div className="flex flex-col gap-4 text-left">
                                {action.repeat && (
                                    <p className="text-sm text-muted-foreground">
                                        Weekly bookings in {action.repeat.month}
                                    </p>
                                )}
                                {/* One card per class, grouped under its date. */}
                                <ul className="-mx-1 flex max-h-72 flex-col gap-4 overflow-y-auto px-1 text-sm">
                                    {groupByDay(action.sessions).map((group) => (
                                        <li key={dateKey(group[0].date)} className="space-y-2">
                                            <p className="font-medium">{prettyDate(group[0].date)}</p>
                                            <ul className="flex flex-col gap-2">
                                                {group.map((session) => (
                                                    <li
                                                        key={session.id}
                                                        className="space-y-1 rounded-lg border bg-muted/40 px-4 py-3"
                                                    >
                                                        <span className="block font-medium tabular-nums">
                                                            {sessionTime(session)}
                                                        </span>
                                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                                            <MapPin
                                                                aria-hidden="true"
                                                                className="size-3.5 shrink-0"
                                                            />
                                                            {session.centre}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
                                    <span className="text-muted-foreground">Cost</span>
                                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                                        <Coins aria-hidden="true" className="size-4" />
                                        {creditAccount.unlimited
                                            ? "Included in your pass"
                                            : plural(enrolmentCount, "credit")}
                                    </span>
                                </div>
                                {action.repeat && action.repeat.skippedSessions.length > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        Skipped because the session is unavailable, already booked, or clashes with a booking: {action.repeat.skippedSessions.join("; ")}.
                                    </p>
                                )}
                                {insufficientCredits && (
                                    <p className="text-sm text-destructive">
                                        {plural(creditAccount.credits, "credit")} available.{" "}
                                        <Link
                                            to="/student/credits"
                                            className="font-medium underline"
                                        >
                                            Top up credits
                                        </Link>
                                    </p>
                                )}
                            </div>
                        )}
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
                        <AlertDialogFooter className="-mx-5 -mb-5 flex-row px-5 pt-1 pb-5 lg:-mx-6 lg:-mb-6 lg:px-6 lg:pb-6">
                            {/* One row at every width: Cancel left, the action right, equal halves. */}
                            <AlertDialogCancel
                                variant="destructive"
                                className="flex-1"
                                disabled={busy}
                                onClick={closeAction}
                            >
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                className="flex-1"
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
