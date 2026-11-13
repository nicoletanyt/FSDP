import { useEffect, useState } from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import {
    BadgeCheck,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Info,
    XCircle,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import GradeBadge from "./DatabaseGradeBadge";
import InstructorDataStatus from "./InstructorDataStatus";
import { gradingEventDate } from "@/lib/instructor/adapters";
import { singaporeToday } from "@/lib/instructor/directory";
import {
    readinessRequirementText,
    studentGrading,
} from "@/lib/instructor/grading";
import type { StudentGradingReads } from "@/lib/instructor/grading";
import { historyDate, instructorName } from "@/lib/instructor/student-detail";
import type {
    StudentDetail,
    StudentHistoryEntry,
} from "@/lib/instructor/types";
import type { QueryState } from "@/hooks/use-instructor-data";
import { useGradingEndorsement } from "@/hooks/use-grading-endorsement";

type GradingView = ReturnType<typeof studentGrading>;
type Section =
    | "Next grading"
    | "Grading eligibility"
    | "Grading history"
    | "Technique checklist";
const success = "text-emerald-700 dark:text-emerald-400";

function GradeTransition({ view }: { view: GradingView }) {
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="sr-only">Current grade:</span>
            <GradeBadge grade={view.current} />
            {view.target && (
                <>
                    <span aria-hidden="true" className="text-muted-foreground">
                        →
                    </span>
                    <span className="sr-only">Next grade:</span>
                    <GradeBadge grade={view.target} />
                </>
            )}
        </div>
    );
}

function ReadinessProgress({ view }: { view: GradingView }) {
    const count = view.requirements.filter((item) => item.met === true).length;
    if (!view.requirements.length) return null;
    return (
        <div className="space-y-2">
            <p
                role="status"
                aria-atomic="true"
                className={cn(
                    "detail-meta text-sm tabular-nums",
                    view.ready ? `font-medium ${success}` : "text-muted-foreground",
                )}
            >
                {count}/{view.requirements.length} requirements met
            </p>
            <progress
                aria-label="Grading eligibility requirements met"
                value={count}
                max={view.requirements.length}
                className={cn(
                    "block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
                    view.ready
                        ? "[&::-webkit-progress-value]:bg-emerald-600 [&::-moz-progress-bar]:bg-emerald-600"
                        : "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
                )}
            />
        </div>
    );
}

function ReadinessStatus({ view }: { view: GradingView }) {
    return (
        <span
            role="status"
            className={cn(
                "detail-status max-w-full rounded-md px-2 py-1 text-xs font-medium",
                view.ready
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
            )}
        >
            {view.status}
        </span>
    );
}

// Shown once the server confirms every grading requirement is met; after
// endorsing it records who endorsed the student and when.
function Endorsement({ detail, view }: { detail: StudentDetail; view: GradingView }) {
    const { status, endorse, pending, error, clearError } = useGradingEndorsement(detail.student.id);
    const [open, setOpen] = useState(false);
    if (status.status !== "success") return null;
    const { endorsement, eligible, targetGradeId } = status.data;
    if (!targetGradeId) return null;
    if (endorsement) {
        return (
            <p role="status" data-endorsement className={cn("detail-meta flex items-center gap-2 text-sm font-medium", success)}>
                <BadgeCheck aria-hidden="true" className="size-4 shrink-0" />
                Endorsed{endorsement.endorsedBy ? ` by ${endorsement.endorsedBy}` : ""} · {historyDate(endorsement.endorsedAt)}
            </p>
        );
    }
    if (!eligible) return null;
    const name = [detail.student.first_name, detail.student.last_name].filter(Boolean).join(" ") || "this student";
    const grade = view.target?.id === targetGradeId ? view.target.label : "their next grade";
    return (
        <AlertDialog open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); clearError(); } }}>
            <AlertDialogTrigger render={<Button size="touch" className="w-full gap-2" data-endorse />}>
                <BadgeCheck aria-hidden="true" />
                Endorse
            </AlertDialogTrigger>
            <AlertDialogContent data-endorse-dialog>
                <AlertDialogHeader>
                    <AlertDialogMedia className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <BadgeCheck aria-hidden="true" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>Endorse {name} for {grade}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Your name and today’s date are recorded with the endorsement and shown on the grading checklist. It can’t be undone here.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <AlertDialogFooter>
                    <AlertDialogCancel className="min-h-11" disabled={pending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={pending} className="min-h-11"
                        onClick={() => void endorse().then((saved) => { if (saved) setOpen(false); })}>
                        {pending ? "Endorsing…" : "Confirm endorsement"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function MissingGradingData({ view }: { view: GradingView }) {
    const message = !view.current
        ? "Current grade not recorded."
        : !view.track
            ? "Grading track unverified."
            : !view.target
                ? "No further grade is configured on this track."
                : !view.spec
                    ? "Requirements not recorded for this grade and track."
                    : null;
    return message ? (
        <p className="detail-body text-sm text-muted-foreground">{message}</p>
    ) : null;
}

function RequirementRows({ view }: { view: GradingView }) {
    return (
        <ul aria-label="Grading readiness requirements" className="space-y-2">
            {view.requirements.map((requirement) => {
                const text = readinessRequirementText(
                    requirement,
                    view.current?.is_ranked === false,
                );
                const Icon =
                    requirement.met === true
                        ? CheckCircle2
                        : requirement.met === null
                            ? Info
                            : XCircle;
                const tone =
                    requirement.met === true
                        ? success
                        : requirement.met === null
                            ? "text-muted-foreground"
                            : "text-destructive";
                return (
                    <li
                        key={requirement.key}
                        className="flex items-start justify-between gap-x-4 py-1"
                        data-requirement={requirement.key}
                    >
                        <span className="detail-body flex min-w-0 flex-1 items-start gap-2 text-sm">
                            <Icon
                                aria-hidden="true"
                                className={cn("mt-0.5 size-4 shrink-0", tone)}
                            />
                            <span className="min-w-0">
                                <span className="sr-only">
                                    {requirement.met === true
                                        ? "Met: "
                                        : requirement.met === null
                                            ? "Unverified: "
                                            : "Not met: "}
                                </span>
                                {text.label}
                            </span>
                        </span>
                        <span className="detail-meta w-[35%] shrink-0 text-right text-xs tabular-nums">
                            <span className={cn("font-medium", tone)}>{text.actual}</span>
                            <span className="text-muted-foreground"> / {text.required}</span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function TechniqueChecklist({ view }: { view: GradingView }) {
    const categories = [...new Set(view.syllabus.map((item) => item.category))];
    const signed = new Map(
        view.signOffs.map((item) => [item.signOff.syllabus_item_id, item]),
    );
    const firstIncomplete = categories.find((category) =>
        view.syllabus.some(
            (item) => item.category === category && !signed.has(item.id),
        ),
    );
    return (
        <>
            <div className="space-y-2">
                <p
                    role="status"
                    className="detail-meta flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
                >
                    <span>
                        {signed.size} of {view.syllabus.length} techniques completed
                    </span>
                    <span className="font-medium">
                        {view.syllabus.length
                            ? Math.round((signed.size / view.syllabus.length) * 100)
                            : 0}
                        %
                    </span>
                </p>
                <progress
                    aria-label="Target-grade technique completion"
                    value={signed.size}
                    max={view.syllabus.length || 1}
                    className="block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
                />
            </div>
            <p className="detail-body text-sm text-muted-foreground">
                Techniques are assessed during assessment and do not determine
                readiness. Recorded sign-offs are read-only.
            </p>
            {categories.length ? (
                <AccordionPrimitive.Root
                    multiple
                    defaultValue={[firstIncomplete ?? categories[0]]}
                    aria-label="Technique categories"
                    className="flex w-full flex-col"
                >
                    {categories.map((category) => {
                        const items = view.syllabus.filter(
                            (item) => item.category === category,
                        );
                        const count = items.filter((item) => signed.has(item.id)).length;
                        return (
                            <AccordionPrimitive.Item
                                key={category}
                                value={category}
                                className="border-border/60 not-first:mt-4 not-first:border-t not-first:pt-4"
                            >
                                <AccordionPrimitive.Header className="mb-2 flex">
                                    <AccordionPrimitive.Trigger
                                        data-slot="accordion-trigger"
                                        className="grading-category-heading group/accordion-trigger flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md py-2 text-left text-base font-semibold outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                                    >
                                        <span className="min-w-0 flex-1 break-words">
                                            {category}
                                        </span>
                                        <span
                                            className={cn(
                                                "detail-meta shrink-0 text-sm font-normal tabular-nums",
                                                count === items.length
                                                    ? success
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {count}/{items.length}
                                        </span>
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/accordion-trigger:rotate-180 motion-reduce:transition-none"
                                        />
                                    </AccordionPrimitive.Trigger>
                                </AccordionPrimitive.Header>
                                <AccordionPrimitive.Panel className="h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
                                    <ul className="space-y-1">
                                        {items.map((item) => {
                                            const entry = signed.get(item.id);
                                            return (
                                                <li
                                                    key={item.id}
                                                    data-syllabus-id={item.id}
                                                    className={cn(
                                                        "rounded-lg px-3 py-3",
                                                        entry && "bg-emerald-50/60 dark:bg-emerald-950/25",
                                                    )}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <CheckboxPrimitive.Root
                                                            checked={Boolean(entry)}
                                                            disabled
                                                            aria-label={`${category}: ${item.label}`}
                                                            className={cn(
                                                                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-input",
                                                                entry &&
                                                                "border-emerald-600 bg-emerald-600 text-white",
                                                            )}
                                                        >
                                                            <CheckboxPrimitive.Indicator>
                                                                <Check
                                                                    aria-hidden="true"
                                                                    className="size-3.5"
                                                                />
                                                            </CheckboxPrimitive.Indicator>
                                                        </CheckboxPrimitive.Root>
                                                        <div className="detail-body min-w-0 flex-1 break-words text-sm">
                                                            <p>{item.label}</p>
                                                            {item.note && (
                                                                <p className="mt-1 text-muted-foreground">
                                                                    {item.note}
                                                                </p>
                                                            )}
                                                            <p
                                                                className={cn(
                                                                    "detail-meta mt-2 text-sm",
                                                                    entry ? success : "text-muted-foreground",
                                                                )}
                                                            >
                                                                {entry
                                                                    ? `Signed off ${historyDate(entry.signOff.signed_off_at)} · ${instructorName(entry.instructor)}`
                                                                    : "Not signed off"}
                                                            </p>
                                                            {entry?.signOff.note && (
                                                                <p className="mt-1 text-muted-foreground">
                                                                    {entry.signOff.note}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </AccordionPrimitive.Panel>
                            </AccordionPrimitive.Item>
                        );
                    })}
                </AccordionPrimitive.Root>
            ) : (
                <p className="detail-body text-sm text-muted-foreground">
                    No syllabus items recorded for this grade and track.
                </p>
            )}
        </>
    );
}

function AssessmentHistory({
    assessments,
}: {
    assessments: StudentHistoryEntry[];
}) {
    return (
        <Card size="sm" className="detail-card">
            <CardContent className="space-y-4">
                {assessments.length ? (
                    assessments.map((assessment) => {
                        const date = gradingEventDate(assessment.event, assessment.grading);
                        const completed =
                            assessment.record.assessment_status === "completed";
                        return (
                            <article
                                key={`${assessment.record.event_id}:${assessment.record.student_id}`}
                                data-assessment-id={assessment.event.id}
                                className="space-y-3 not-first:border-t not-first:pt-4"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-2">
                                        <h3 className="text-base font-medium">
                                            {assessment.event.name}
                                        </h3>
                                        {assessment.targetGrade ? (
                                            <>
                                                <span className="sr-only">Target grade:</span>
                                                <GradeBadge grade={assessment.targetGrade} />
                                            </>
                                        ) : (
                                            <p className="detail-meta text-sm text-muted-foreground">
                                                Target grade: Not recorded
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={cn(
                                            "detail-status rounded-md px-2 py-0.5 text-xs font-medium",
                                            completed
                                                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                                : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
                                        )}
                                    >
                                        <span className="sr-only">Assessment: </span>
                                        {completed ? "Completed" : "Pending"}
                                    </span>
                                </div>
                                <p className="detail-meta text-sm text-muted-foreground">
                                    {date
                                        ? historyDate(`${date}T00:00:00+08:00`)
                                        : "Date not recorded"}{" "}
                                    · {instructorName(assessment.instructor)} ·{" "}
                                    {assessment.centre?.name ?? "Dojo not recorded"}
                                </p>
                                {assessment.event.status === "cancelled" && (
                                    <p className="detail-meta text-sm text-muted-foreground">
                                        Event cancelled
                                    </p>
                                )}
                                <p className="detail-body max-w-prose whitespace-pre-wrap text-sm wrap-break-word">
                                    {assessment.record.assessment_notes?.trim() ||
                                        "No assessment notes recorded."}
                                </p>
                            </article>
                        );
                    })
                ) : (
                    <p className="detail-body text-sm text-muted-foreground">
                        No recorded grading assessments.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

export default function StudentGradingRead({
    title,
    detail,
    reads,
    onRetry,
    onViewGrading,
}: {
    title: Section;
    detail: StudentDetail;
    reads: QueryState<StudentGradingReads>;
    onRetry: () => void;
    onViewGrading?: () => void;
}) {
    const [today, setToday] = useState(singaporeToday);
    useEffect(() => {
        const timer = window.setInterval(() => setToday(singaporeToday()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const view =
        reads.status === "success"
            ? studentGrading(detail, reads.data, today)
            : null;
    return (
        <section className="detail-section" aria-label={title}>
            <div className="detail-section-header">
                <h2>{title}</h2>
                {title === "Next grading" && (
                    <Button
                        variant="ghost"
                        size="touch"
                        onClick={onViewGrading}
                        className="ml-auto"
                    >
                        View grading
                        <ChevronRight aria-hidden="true" />
                    </Button>
                )}
            </div>
            {reads.status !== "success" || !view ? (
                <InstructorDataStatus
                    loading={reads.status === "loading"}
                    error={reads.error}
                    onRetry={onRetry}
                />
            ) : title === "Technique checklist" ? (
                <Card size="sm" className="detail-card">
                    <CardContent className="space-y-4">
                        <GradeTransition view={view} />
                        <MissingGradingData view={view} />
                        <TechniqueChecklist view={view} />
                    </CardContent>
                </Card>
            ) : title === "Grading history" ? (
                <AssessmentHistory assessments={reads.data.assessments} />
            ) : (
                <Card size="sm" className="detail-card">
                    <CardContent className="space-y-4">
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                            <GradeTransition view={view} />
                            <ReadinessStatus view={view} />
                        </div>
                        <ReadinessProgress view={view} />
                        <MissingGradingData view={view} />
                        <Endorsement detail={detail} view={view} />
                        {title === "Grading eligibility" ? (
                            <>
                                <RequirementRows view={view} />
                                <p className="detail-meta text-sm text-muted-foreground">
                                    Techniques are assessed during assessment and do not determine
                                    readiness.
                                </p>
                            </>
                        ) : (
                            <dl className="detail-body text-sm">
                                <dt className="detail-label text-xs text-muted-foreground">
                                    Recorded assessments
                                </dt>
                                <dd className="mt-1 font-medium">
                                    {reads.data.assessments.length
                                        ? `${reads.data.assessments.length} recorded`
                                        : "None recorded"}
                                </dd>
                            </dl>
                        )}
                    </CardContent>
                </Card>
            )}
        </section>
    );
}
