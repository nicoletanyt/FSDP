import { useRef, useState } from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown, Plus, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import InstructorDataStatus from "./InstructorDataStatus";
import { GradeTransition, MissingGradingData, statusDot } from "./StudentGradingRead";
import {
    studentGrading,
    TECHNIQUE_STATUSES,
    techniqueStatus,
    techniqueStatusLabels,
} from "@/lib/instructor/grading";
import type { StudentGradingReads } from "@/lib/instructor/grading";
import { singaporeToday } from "@/lib/instructor/directory";
import { historyDate, instructorName } from "@/lib/instructor/student-detail";
import type {
    StudentDetail,
    SyllabusItemRow,
    TechniqueProgressEntry,
    TechniqueStatus,
} from "@/lib/instructor/types";
import type { QueryState } from "@/hooks/use-instructor-data";
import { useTechniqueProgress } from "@/hooks/use-technique-progress";
import type { ProgressSaveState } from "@/hooks/use-technique-progress";

const success = "text-emerald-700 dark:text-emerald-400";

function StatusSelect({
    label,
    value,
    onChange,
}: {
    label: string;
    value: TechniqueStatus;
    onChange: (value: TechniqueStatus) => void;
}) {
    return (
        <Select
            value={value}
            onValueChange={(next) => {
                if (next && TECHNIQUE_STATUSES.includes(next as TechniqueStatus))
                    onChange(next as TechniqueStatus);
            }}
        >
            <SelectTrigger
                aria-label={label}
                className="min-h-11 w-full text-[1rem] leading-6 sm:w-40 lg:min-h-9"
            >
                <SelectValue>
                    {(current: TechniqueStatus) => (
                        <>
                            <span
                                aria-hidden="true"
                                className={cn("size-2 shrink-0 rounded-full", statusDot[current])}
                            />
                            {techniqueStatusLabels[current]}
                        </>
                    )}
                </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
                {TECHNIQUE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className="min-h-11 text-[1rem] leading-6 lg:min-h-8">
                        <span className="flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className={cn("size-2 shrink-0 rounded-full", statusDot[status])}
                            />
                            {techniqueStatusLabels[status]}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function SaveMeta({
    entry,
    state,
    className,
}: {
    entry: TechniqueProgressEntry | undefined;
    state: ProgressSaveState | undefined;
    className?: string;
}) {
    if (state?.status === "error")
        return (
            <p role="alert" className={cn("detail-meta text-sm text-destructive", className)}>
                {state.message}
            </p>
        );
    return (
        <p role="status" className={cn("detail-meta text-sm text-muted-foreground", className)}>
            {state?.status === "saving"
                ? "Saving…"
                : entry?.progress.id
                    ? `Updated ${historyDate(entry.progress.updated_at)} · ${instructorName(entry.instructor)}`
                    : "Not assessed yet"}
            {state?.status === "saved" && <span className={cn("ml-2", success)}>Saved</span>}
        </p>
    );
}

function TechniqueRow({
    item,
    category,
    entry,
    state,
    onSave,
}: {
    item: SyllabusItemRow;
    category: string;
    entry: TechniqueProgressEntry | undefined;
    state: ProgressSaveState | undefined;
    onSave: (status: TechniqueStatus, note: string | null) => void;
}) {
    const status = techniqueStatus(entry);
    const note = entry?.progress.note ?? null;
    const [noteOpen, setNoteOpen] = useState(false);
    return (
        <li data-syllabus-id={item.id} data-status={status} className="py-3 not-first:border-t not-first:border-border/60">
            {/* Phone: label, note, control, meta. From 640px the control sits to the right. */}
            <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div className="detail-body min-w-0 break-words">
                    <p className="font-medium">{item.label}</p>
                    {item.note && <p className="mt-1 text-muted-foreground">{item.note}</p>}
                </div>
                <div className="mt-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0">
                    <StatusSelect
                        label={`Progress for ${category}: ${item.label}`}
                        value={status}
                        onChange={(next) => onSave(next, note)}
                    />
                </div>
                <SaveMeta entry={entry} state={state} className="mt-2 sm:col-start-1 sm:mt-1" />
            </div>
            {note !== null || noteOpen ? (
                <Textarea
                    key={note ?? ""}
                    defaultValue={note ?? ""}
                    autoFocus={noteOpen && note === null}
                    maxLength={1000}
                    rows={2}
                    aria-label={`Note for ${item.label} (optional)`}
                    placeholder="Optional note"
                    className="mt-2 text-[1rem] leading-6 md:text-[1rem]"
                    onBlur={(event) => {
                        const value = event.currentTarget.value.trim() || null;
                        if (value !== note) onSave(status, value);
                        if (!value) setNoteOpen(false);
                    }}
                />
            ) : (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 min-h-11 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground lg:min-h-8"
                    onClick={() => setNoteOpen(true)}
                >
                    <Plus aria-hidden="true" />
                    Add note
                </Button>
            )}
        </li>
    );
}

/**
 * Full progress checklist editor for the student's current belt. Every change
 * saves straight away; nothing here is required.
 */
export default function ProgressChecklistEditor({
    detail,
    reads,
    onRetry,
}: {
    detail: StudentDetail;
    reads: QueryState<StudentGradingReads>;
    onRetry: () => void;
}) {
    const { update, states } = useTechniqueProgress(detail.student.id);
    if (reads.status !== "success")
        return (
            <InstructorDataStatus
                loading={reads.status === "loading"}
                error={reads.error}
                onRetry={onRetry}
            />
        );
    const view = studentGrading(detail, reads.data, singaporeToday());
    const progress = new Map(view.progress.map((entry) => [entry.progress.syllabus_item_id, entry]));
    const categories = [...new Set(view.syllabus.map((item) => item.category))];
    const firstOpen = categories.find((category) =>
        view.syllabus.some(
            (item) => item.category === category && techniqueStatus(progress.get(item.id)) !== "consistent",
        ),
    );
    return (
        <section aria-label="Progress checklist editor" className="space-y-4">
            <div className="space-y-2">
                <GradeTransition view={view} />
                <MissingGradingData view={view} />
                <p className="detail-body text-sm text-muted-foreground">
                    Optional. Changes save automatically and don’t affect grading eligibility.
                </p>
            </div>
            {categories.length ? (
                <AccordionPrimitive.Root
                    multiple
                    defaultValue={[firstOpen ?? categories[0]]}
                    aria-label="Technique categories"
                    className="flex w-full flex-col"
                >
                    {categories.map((category) => {
                        const items = view.syllabus.filter((item) => item.category === category);
                        const count = items.filter(
                            (item) => techniqueStatus(progress.get(item.id)) === "consistent",
                        ).length;
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
                                        <span className="min-w-0 flex-1 break-words">{category}</span>
                                        <span
                                            className={cn(
                                                "detail-meta shrink-0 text-sm font-normal tabular-nums",
                                                count === items.length ? success : "text-muted-foreground",
                                            )}
                                        >
                                            <span className="sr-only">Consistent: </span>
                                            {count}/{items.length}
                                        </span>
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/accordion-trigger:rotate-180 motion-reduce:transition-none"
                                        />
                                    </AccordionPrimitive.Trigger>
                                </AccordionPrimitive.Header>
                                <AccordionPrimitive.Panel className="h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
                                    <ul>
                                        {items.map((item) => (
                                            <TechniqueRow
                                                key={item.id}
                                                item={item}
                                                category={category}
                                                entry={progress.get(item.id)}
                                                state={states[item.id]}
                                                onSave={(status, note) => update(item.id, status, note)}
                                            />
                                        ))}
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
        </section>
    );
}

/** The full editor in a dialog, opened from the read-only summary. */
export function ProgressChecklistDialog({
    open,
    onOpenChange,
    studentName,
    detail,
    reads,
    onRetry,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studentName: string;
    detail: StudentDetail;
    reads: QueryState<StudentGradingReads>;
    onRetry: () => void;
}) {
    const body = useRef<HTMLDivElement>(null);
    const summary = reads.status === "success"
        ? studentGrading(detail, reads.data, singaporeToday()).progressSummary
        : null;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                initialFocus={body}
                data-progress-checklist-dialog=""
                className="student-detail-view flex h-auto max-h-[85dvh] w-[calc(100vw-2rem)] max-w-[40rem] flex-col gap-0 overflow-hidden p-0 lg:gap-0 lg:p-0"
            >
                <DialogHeader className="shrink-0 gap-2 border-b p-4 lg:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <DialogTitle className="min-w-0 break-words text-[1.125rem] leading-7 font-semibold">Progress checklist</DialogTitle>
                        <DialogClose
                            render={<Button variant="ghost" size="icon-touch" className="-my-2 -mr-2 shrink-0" />}
                        >
                            <X aria-hidden="true" />
                            <span className="sr-only">Close progress checklist</span>
                        </DialogClose>
                    </div>
                    <DialogDescription className="detail-meta text-sm">
                        {studentName}
                        {summary && summary.total > 0 && ` · ${summary.counts.consistent} of ${summary.total} consistent`}
                    </DialogDescription>
                </DialogHeader>
                <div ref={body} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 outline-none lg:p-6">
                    <ProgressChecklistEditor detail={detail} reads={reads} onRetry={onRetry} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
