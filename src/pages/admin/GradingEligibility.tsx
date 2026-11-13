import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
    gradingEligibilityKey,
    loadGradingEligibility,
} from "@/lib/admin/section-counts";
import {
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Mail,
    PencilLine,
    XCircle,
} from "lucide-react";
import { GradeLabelBadge } from "@/components/shared/grade/GradeBadge";
import FilterPopover, { FilterField } from "@/components/shared/filters/FilterPopover";
import EmptyState from "@/components/shared/layout/EmptyState";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import SearchInput from "@/components/shared/filters/SearchInput";
import EligibilityChecklist from "@/components/grading/EligibilityChecklist";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, initials } from "@/lib/admin/format";
import { formatMonths } from "@/lib/admin/grading-eligibility";
import type { EligibilityRequirement, GradeTrack } from "@/lib/admin/types";
import { UNRANKED } from "@/lib/admin/types";
import { supabase } from "@/lib/supabase";
import { cn } from "cn";

function related<T>(value: T | T[] | null | undefined): T | undefined {
    return Array.isArray(value) ? value[0] : (value ?? undefined);
}

interface InvitationPreview {
    eligible: number;
    bcc_count: number;
    bcc_emails: string[];
    email_subject: string;
    email_body: string;
    preview_token: string;
    over_limit: boolean;
    send_ready: boolean;
}

interface LiveEligibleStudent {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    centre_name: string;
    current_grade: string;
    target_grade: string;
    track: GradeTrack;
    joined_at: string;
    last_graded_at: string | null;
    age_years: number;
    membership_months: number;
    grade_months: number;
    min_months: number;
    max_months: number | null;
    min_age_years: number | null;
    min_sessions: number | null;
    sessions_attended: number;
    techniques: {
        id: string;
        label: string;
        category: string;
        signed: boolean;
    }[];
}

function studentName(student: LiveEligibleStudent) {
    return `${student.first_name} ${student.last_name}`.trim();
}

function LiveGrade({ label, track }: { label: string; track: GradeTrack }) {
    return <GradeLabelBadge label={label} track={track} />;
}

function liveRequirements(
    student: LiveEligibleStudent,
): EligibilityRequirement[] {
    const requirements: EligibilityRequirement[] = [
        {
            key: "membership",
            label: "Active membership",
            actual: "Active",
            required: "Active",
            met: true,
        },
        {
            key: "membership-length",
            label: "Time as a member",
            actual: formatMonths(student.membership_months),
            required: formatMonths(3),
            met: true,
        },
    ];
    if (student.min_age_years !== null)
        requirements.push({
            key: "age",
            label: "Minimum age",
            actual: `${student.age_years} years`,
            required: `${student.min_age_years} years`,
            met: true,
        });
    if (student.min_months > 0)
        requirements.push({
            key: "time",
            label:
                student.current_grade === UNRANKED
                    ? "Practice since joining"
                    : "Time in current grade",
            actual: formatMonths(student.grade_months),
            required: formatMonths(
                student.min_months,
                student.max_months ?? undefined,
            ),
            met: true,
        });
    if (student.min_sessions !== null)
        requirements.push({
            key: "sessions",
            label: "Training sessions since last grading",
            actual: String(student.sessions_attended),
            required: String(student.min_sessions),
            met: true,
        });
    if (student.techniques.length)
        requirements.push({
            key: "techniques",
            label: "Target-grade techniques signed off",
            actual: String(student.techniques.filter((item) => item.signed).length),
            required: String(student.techniques.length),
            met: true,
        });
    requirements.push({
        key: "fees",
        label: "Fees up to date",
        actual: "Clear",
        required: "Clear",
        met: true,
    });
    return requirements;
}

export default function GradingEligibility() {
    const { session } = useAuth();
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
        null,
    );
    const [notice, setNotice] = useState("");
    const [noticeError, setNoticeError] = useState(false);
    const [events, setEvents] = useState<
        { id: string; name: string; track: GradeTrack }[]
    >([]);
    const [eventId, setEventId] = useState("");
    const [preview, setPreview] = useState<InvitationPreview | null>(null);
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [showRules, setShowRules] = useState(false);
    const [pendingAction, setPendingAction] = useState<"preview" | "send" | null>(
        null,
    );

    useEffect(() => {
        const today = new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Singapore",
            dateStyle: "short",
        }).format(new Date());
        void supabase
            .from("events")
            .select(
                "id,name,gradings!inner(track,official_schedule,application_status,grading_date,application_opens_on,application_deadline)",
            )
            .eq("event_type", "grading")
            .eq("status", "scheduled")
            .eq("gradings.official_schedule", true)
            .eq("gradings.application_status", "open")
            .then(({ data, error }) => {
                if (error) {
                    setNoticeError(true);
                    setNotice(
                        "Open gradings could not be loaded. Refresh the page to try again.",
                    );
                } else
                    setEvents(
                        (data ?? [])
                            .filter((event) => {
                                const grading = related(event.gradings);
                                return (
                                    grading &&
                                    (grading.track === "adult" || grading.track === "children") &&
                                    grading.grading_date > today &&
                                    grading.application_opens_on <= today &&
                                    grading.application_deadline >= today
                                );
                            })
                            .map(({ id, name, gradings }) => ({
                                id,
                                name,
                                track: related(gradings)!.track as GradeTrack,
                            })),
                    );
            });
    }, []);

    // Opening "Email students" prepares a preview of the saved invitation straight away.
    useEffect(() => {
        if (notifyOpen) void notifyEligible(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notifyOpen]);

    const eligibility = useQuery({
        queryKey: gradingEligibilityKey(session?.user.id, eventId),
        enabled: !!session,
        queryFn: () => loadGradingEligibility<LiveEligibleStudent>(eventId),
        refetchOnWindowFocus: true,
    });
    const eligible = eligibility.data ?? [];
    const selectedStudent = eligible.find(
        (student) => student.id === selectedStudentId,
    );
    const selectedRequirements = selectedStudent
        ? liveRequirements(selectedStudent)
        : [];
    function selectEvent(value: string) {
        setEventId(value);
        setPreview(null);
        setSelectedStudentId(null);
    }

    function changeNotifyOpen(open: boolean) {
        if (!open) {
            if (pendingAction === "send") return;
            setPreview(null);
        }
        setNotifyOpen(open);
    }

    async function notifyEligible(confirm: boolean) {
        if (confirm && !preview) return;
        if (
            confirm &&
            !window.confirm(
                `Send this invitation to ${preview!.eligible} ${preview!.eligible === 1 ? "student" : "students"}? Each student gets it privately and can't see the others.`,
            )
        )
            return;
        setPendingAction(confirm ? "send" : "preview");
        setNotice("");
        setNoticeError(false);
        try {
            const { data, error } = await supabase.functions.invoke(
                "send-grading-invitation",
                {
                    body: {
                        event_id: eventId || null,
                        confirm,
                        ...(confirm ? { preview_token: preview?.preview_token } : {}),
                    },
                },
            );
            if (error) {
                const details = await error.context?.json?.().catch(() => null);
                throw new Error(details?.error ?? error.message);
            }
            if (confirm) {
                setNoticeError(false);
                setNotice(
                    `Invitation sent to ${data.bcc_count} ${data.bcc_count === 1 ? "student" : "students"}. You can check it in Settings › Sent emails.`,
                );
                setPreview(null);
                setNotifyOpen(false);
                void eligibility.refetch();
            } else {
                if (!data?.preview_token || !data?.email_subject || !data?.email_body) {
                    throw new Error(
                        "The invitation couldn't be prepared. Try again in a moment. No email was sent.",
                    );
                }
                setPreview(data);
            }
        } catch (failure) {
            setNoticeError(true);
            setNotice(
                failure instanceof Error
                    ? failure.message
                    : "The invitation couldn't be sent. Try again in a moment.",
            );
            if (confirm) setPreview(null);
        } finally {
            setPendingAction(null);
        }
    }

    const needle = search.trim().toLowerCase();
    const shown = needle
        ? eligible.filter((student) =>
            studentName(student).toLowerCase().includes(needle),
        )
        : eligible;
    const tableClass =
        "[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5";

    return (
        <div className="space-y-4">
            {notice && !notifyOpen && (
                <Alert variant={noticeError ? "destructive" : "default"}>
                    {!noticeError && (
                        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                    )}
                    <AlertDescription>{notice}</AlertDescription>
                </Alert>
            )}

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <SearchInput
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search students"
                    aria-label="Search eligible students"
                />
                <Button
                    variant="outline"
                    size="touch"
                    onClick={() => {
                        setPreview(null);
                        setNotice("");
                        setNotifyOpen(true);
                    }}
                    disabled={pendingAction !== null || !eligible.length}
                >
                    <Mail />
                    {eligible.length
                        ? `Email ${eligible.length} ${eligible.length === 1 ? "student" : "students"}`
                        : "Email students"}
                </Button>
                <FilterPopover
                    title="Filter students"
                    activeCount={eventId ? 1 : 0}
                    onReset={() => selectEvent("")}
                >
                    <FilterField
                        label="Grading"
                        value={eventId}
                        onChange={selectEvent}
                        ariaLabel="Grading filter"
                        options={[
                            { value: "", label: "All gradings" },
                            ...events.map((event) => ({
                                value: event.id,
                                label: event.name,
                            })),
                        ]}
                    />
                </FilterPopover>
            </div>

            {/* Preview and send only. The wording is edited in Settings › Emails. */}
            <Dialog open={notifyOpen} onOpenChange={changeNotifyOpen}>
                <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]">
                    <DialogHeader>
                        <DialogTitle>Email eligible students</DialogTitle>
                        {/* The loading message shows once, in the body. */}
                        <DialogDescription className={preview ? undefined : "sr-only"}>
                            {preview
                                ? `To ${preview.eligible} ${preview.eligible === 1 ? "student" : "students"}${eventId ? " for this grading" : ""}`
                                : "The grading invitation, ready to send."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 space-y-4 overflow-y-auto px-1">
                        {notice && (
                            <Alert variant={noticeError ? "destructive" : "default"}>
                                <AlertDescription>{notice}</AlertDescription>
                            </Alert>
                        )}
                        {pendingAction === "preview" && (
                            <p role="status" className="text-sm text-muted-foreground">
                                Preparing the invitation…
                            </p>
                        )}
                        {preview && (
                            <section aria-label="Email preview" className="space-y-3">
                                <div className="rounded-md border border-border bg-background p-4">
                                    <p className="font-medium">{preview.email_subject}</p>
                                    <p className="mt-3 whitespace-pre-wrap text-sm">
                                        {preview.email_body}
                                    </p>
                                </div>
                                {preview.over_limit && (
                                    <p className="text-sm text-destructive">
                                        That's too many students for one email. Use Filter to choose
                                        one grading, then try again.
                                    </p>
                                )}
                                {!preview.send_ready && (
                                    <p className="text-sm text-destructive">
                                        Email sending isn't set up yet, so this can't be sent.
                                        Contact whoever manages the system.
                                    </p>
                                )}
                            </section>
                        )}
                    </div>
                    <DialogFooter className="flex-row flex-wrap items-center justify-end bg-popover">
                        <Button
                            variant="ghost"
                            className="mr-auto"
                            nativeButton={false}
                            render={<Link to="/admin/settings/email-templates" />}
                        >
                            <PencilLine aria-hidden="true" />
                            Edit email
                        </Button>
                        <Button
                            type="button"
                            disabled={
                                !preview ||
                                pendingAction !== null ||
                                preview.eligible === 0 ||
                                preview.over_limit ||
                                !preview.send_ready
                            }
                            onClick={() => void notifyEligible(true)}
                        >
                            {pendingAction === "send" ? "Sending…" : "Send email"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(selectedStudent)}
                onOpenChange={(open) => {
                    if (!open) setSelectedStudentId(null);
                }}
            >
                <DialogContent className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
                    {selectedStudent && (
                        <>
                            <DialogHeader>
                                <DialogTitle>{studentName(selectedStudent)}</DialogTitle>
                                <DialogDescription className="flex flex-wrap items-center gap-2">
                                    <LiveGrade
                                        label={selectedStudent.current_grade}
                                        track={selectedStudent.track}
                                    />
                                    <ArrowRight
                                        className="size-4 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <LiveGrade
                                        label={selectedStudent.target_grade}
                                        track={selectedStudent.track}
                                    />
                                    <span>
                                        {selectedStudent.age_years} years old ·{" "}
                                        {selectedStudent.centre_name} · Last graded{" "}
                                        {selectedStudent.last_graded_at
                                            ? formatDate(selectedStudent.last_graded_at)
                                            : "never"}
                                    </span>
                                </DialogDescription>
                            </DialogHeader>
                            <div className="min-h-0 overflow-y-auto pr-1">
                                <EligibilityChecklist
                                    key={selectedStudent.id}
                                    requirements={selectedRequirements}
                                    compact
                                    techniqueDetails={
                                        selectedStudent.techniques.length ? (
                                            <ul className="space-y-2">
                                                {selectedStudent.techniques.map((item) => (
                                                    <li
                                                        key={item.id}
                                                        className="flex items-start gap-2 text-sm"
                                                    >
                                                        {item.signed ? (
                                                            <CheckCircle2
                                                                className="mt-0.5 size-4 shrink-0 text-success"
                                                                aria-hidden="true"
                                                            />
                                                        ) : (
                                                            <XCircle
                                                                className="mt-0.5 size-4 shrink-0 text-destructive"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                        <span>
                                                            {item.label}{" "}
                                                            <span className="text-xs text-muted-foreground">
                                                                ({item.category})
                                                            </span>
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : undefined
                                    }
                                />
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {eligibility.isPending && (
                <p role="status" className="text-sm text-muted-foreground">
                    Loading eligible students…
                </p>
            )}
            {eligibility.isError && (
                <RetryAlert
                    message="Eligible students could not be loaded."
                    onRetry={() => void eligibility.refetch()}
                />
            )}
            {eligibility.isSuccess &&
                (shown.length === 0 ? (
                    <EmptyState
                        title={
                            eligible.length
                                ? "No students match your search"
                                : "No students can grade yet"
                        }
                        description={
                            eligible.length
                                ? "Try a different name."
                                : eventId
                                    ? "No students meet every requirement for this grading yet."
                                    : "No students meet every requirement for an open grading yet."
                        }
                    />
                ) : (
                    <Card className="overflow-hidden py-0">
                        <CardContent className="px-0">
                            <Table className={tableClass}>
                                <TableCaption className="sr-only">
                                    Students who can grade
                                </TableCaption>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Next grade</TableHead>
                                        <TableHead className="hidden md:table-cell">
                                            Last graded
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <span className="sr-only">Details</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shown.map((student) => (
                                        <TableRow
                                            key={student.id}
                                            className="cursor-pointer"
                                            onClick={() => setSelectedStudentId(student.id)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                        {initials(student.first_name, student.last_name)}
                                                    </span>
                                                    <div>
                                                        <p className="font-medium">
                                                            {studentName(student)}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {student.age_years} years old
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <LiveGrade
                                                        label={student.current_grade}
                                                        track={student.track}
                                                    />
                                                    <ArrowRight
                                                        className="size-4 shrink-0 text-muted-foreground"
                                                        aria-hidden="true"
                                                    />
                                                    <LiveGrade
                                                        label={student.target_grade}
                                                        track={student.track}
                                                    />
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden text-muted-foreground md:table-cell">
                                                {student.last_graded_at
                                                    ? formatDate(student.last_graded_at)
                                                    : "Never"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={`View requirements for ${studentName(student)}`}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedStudentId(student.id);
                                                    }}
                                                >
                                                    <span className="hidden md:inline">View details</span>
                                                    <ChevronRight className="size-4" aria-hidden="true" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ))}

            <section className="pt-2">
                <button
                    type="button"
                    aria-expanded={showRules}
                    aria-controls="eligibility-rules"
                    onClick={() => setShowRules((value) => !value)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md py-2 text-left text-base font-medium focus-visible:outline-2 focus-visible:outline-ring"
                >
                    How eligibility works
                    <ChevronDown
                        aria-hidden="true"
                        className={cn(
                            "size-4 transition-transform",
                            showRules && "rotate-180",
                        )}
                    />
                </button>
                {showRules && (
                    <div id="eligibility-rules" className="space-y-3 pb-2 text-sm">
                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                            <li>Students need 3 months' membership and no fees owed.</li>
                            <li>Every technique for the next belt must be signed off.</li>
                            <li>Applications close 14 days before the grading.</li>
                            <li>
                                Ages count by calendar year. Children move to adult grading at
                                13.
                            </li>
                        </ul>
                        <p>
                            <Link
                                to="/admin/grading/belt-requirements"
                                className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                                See the requirements for each belt
                            </Link>
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
