import { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import {
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    HeartPulse,
    Info,
    Mail,
    MapPin,
    PenLine,
    Phone,
    Plus,
    TriangleAlert,
    Trash2,
    Undo2,
    X,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StudentSessionHistory from "@/components/instructor/StudentSessionHistory";
import GradeBadge from "@/components/GradeBadge";
import { InstructorAvatar } from "@/components/ui/avatar";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import {
    assessmentHref,
    calendarHref,
    currentInstructor,
    findCalendarEvent,
    fullDate,
    studentDetailsHref,
    students,
} from "@/lib/instructor-calendar";
import type {
    CalendarEvent,
    ReportAuthor,
    Student,
} from "@/lib/instructor-calendar";
import {
    getStudentProfile,
    getGradingRequirements,
    getExaminerSignature,
    getTechniqueSignOffs,
    gradingEligibility,
    saveTechniqueSignOffs,
    saveExaminerSignature,
    studentAttendanceSummary,
    studentGradingHistory,
    studentSessionHistory,
} from "@/lib/instructor-student-details";
import type {
    GradingRequirement,
    ExaminerSignature,
    SignaturePoint,
    TechniqueSignOff,
} from "@/lib/instructor-student-details";
import { getGradingSyllabus, gradingSystems } from "@/lib/student-grades";
import type {
    GradingSyllabus,
    GradingSystemId,
    RankId,
} from "@/lib/student-grades";
import { cn } from "@/lib/utils";

type Profile = ReturnType<typeof getStudentProfile>;
type DetailTab = "overview" | "sessions" | "grading";
type ReviewSaveState = "idle" | "saved" | "error";

const success = "text-emerald-700 dark:text-emerald-400";
const signedDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

function TechniqueProgress({
    syllabus,
    signOffs,
}: {
    syllabus: GradingSyllabus;
    signOffs: TechniqueSignOff[];
}) {
    const signedIds = new Set(signOffs.map((item) => item.itemId));
    const items = syllabus.categories.flatMap((category) => category.items);
    const signedCount = items.filter((item) => signedIds.has(item.id)).length;
    const percent = items.length ? Math.round((signedCount / items.length) * 100) : 0;
    const complete = items.length > 0 && signedCount === items.length;

    return (
        <div className="space-y-2">
            <p
                role="status"
                aria-atomic="true"
                className={cn(
                    "detail-meta flex items-center justify-between gap-3 text-sm tabular-nums",
                    complete ? success : "text-muted-foreground",
                )}
            >
                <span>{signedCount} of {items.length} techniques completed</span>
                <span className="font-medium">{percent}%</span>
            </p>
            <progress
                aria-label={`${syllabus.grade} technique completion`}
                value={signedCount}
                max={items.length || 1}
                className={cn(
                    "block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
                    complete
                        ? "[&::-webkit-progress-value]:bg-emerald-600 [&::-moz-progress-bar]:bg-emerald-600"
                        : "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
                )}
            />
        </div>
    );
}

function TechniqueChecklist({
    syllabus,
    system,
    targetRank,
    signOffs,
    onToggle,
}: {
    syllabus: GradingSyllabus;
    system: GradingSystemId;
    targetRank: RankId | null;
    signOffs: TechniqueSignOff[];
    onToggle: (itemId: string) => boolean;
}) {
    const checklistId = useId();
    const signOffByItem = new Map(signOffs.map((item) => [item.itemId, item]));
    const firstIncompleteCategory = syllabus.categories.find((category) =>
        category.items.some((item) => !signOffByItem.has(item.id)),
    );

    return (
        <Card className="gap-4 rounded-none bg-transparent py-0 ring-0">
            <CardHeader className="gap-3 px-0">
                <div className="detail-section-header">
                    <div className="min-w-0 space-y-1">
                        <CardTitle className="text-sm font-semibold">
                            <h2>Technique checklist</h2>
                        </CardTitle>
                    </div>
                    <Popover>
                        <PopoverTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-touch"
                                    aria-label="About technique sign-offs"
                                    className="-mr-1 text-muted-foreground"
                                />
                            }
                        >
                            <Info aria-hidden="true" className="size-4" />
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className="student-detail-view w-80 gap-3 text-left"
                        >
                            <PopoverTitle>About technique sign-offs</PopoverTitle>
                            <p className="detail-body text-sm">
                                Only techniques for {syllabus.grade} are required. Earlier
                                grades are treated as completed history.
                            </p>
                            <p className="detail-body text-sm">
                                {system === "children"
                                    ? "Children’s syllabus · revised October 2014."
                                    : "Adult syllabus · revised January 2021."}{" "}
                                Sign-offs are saved in this browser.
                            </p>
                            {system === "adults" &&
                                ["2-dan", "3-dan", "4-dan"].includes(targetRank ?? "") && (
                                    <p className="detail-body text-sm">
                                        Candidates aged 50 and above (by calendar year) take 20
                                        ukemis instead of 30 from 2nd Dan.
                                    </p>
                                )}
                        </PopoverContent>
                    </Popover>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                <AccordionPrimitive.Root
                    multiple
                    defaultValue={firstIncompleteCategory ? [firstIncompleteCategory.id] : []}
                    aria-label="Technique categories"
                    className="flex w-full flex-col"
                >
                    {syllabus.categories.map((category) => {
                        const count = category.items.filter((item) =>
                            signOffByItem.has(item.id),
                        ).length;
                        return (
                            <AccordionPrimitive.Item
                                key={category.id}
                                value={category.id}
                                className="border-border/60 not-first:mt-4 not-first:border-t not-first:pt-4"
                            >
                                <AccordionPrimitive.Header className="mb-2 flex">
                                    <AccordionPrimitive.Trigger
                                        data-slot="accordion-trigger"
                                        className="grading-category-heading group/accordion-trigger flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md py-2 text-left text-base font-semibold transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                                    >
                                        <span className="min-w-0 flex-1 break-words">
                                            {category.label}
                                        </span>
                                        <span
                                            className={cn(
                                                "detail-meta shrink-0 text-sm font-normal tabular-nums",
                                                count === category.items.length
                                                    ? success
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {count}/{category.items.length}
                                            <span className="sr-only"> completed</span>
                                        </span>
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/accordion-trigger:rotate-180 motion-reduce:transition-none"
                                        />
                                    </AccordionPrimitive.Trigger>
                                </AccordionPrimitive.Header>
                                <AccordionPrimitive.Panel className="h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
                                    <ul className="space-y-1">
                                        {category.items.map((item) => {
                                            const signOff = signOffByItem.get(item.id);
                                            const checkboxId = `${checklistId}-${item.id}`;
                                            return (
                                                <li key={item.id}>
                                                    <CheckboxPrimitive.Root
                                                        id={checkboxId}
                                                        data-slot="checkbox"
                                                        checked={Boolean(signOff)}
                                                        onCheckedChange={() => {
                                                            onToggle(item.id);
                                                        }}
                                                        aria-label={`${category.label}: ${item.label}${item.note ? ` · ${item.note}` : ""}`}
                                                        className={cn(
                                                            "detail-body flex min-h-12 w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                                                            signOff
                                                                ? "bg-emerald-50/60 hover:bg-emerald-50 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40"
                                                                : "hover:bg-muted/50",
                                                        )}
                                                    >
                                                        <span
                                                            aria-hidden="true"
                                                            className={cn(
                                                                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-input",
                                                                signOff && "border-emerald-600 bg-emerald-600 text-white",
                                                            )}
                                                        >
                                                            <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
                                                                <Check
                                                                    aria-hidden="true"
                                                                    className="size-3.5"
                                                                />
                                                            </CheckboxPrimitive.Indicator>
                                                        </span>
                                                        <span className="min-w-0 flex-1 break-words">
                                                            {item.label}
                                                            {item.note && (
                                                                <span className="mt-1 block text-muted-foreground">
                                                                    {item.note}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </CheckboxPrimitive.Root>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </AccordionPrimitive.Panel>
                            </AccordionPrimitive.Item>
                        );
                    })}
                </AccordionPrimitive.Root>
            </CardContent>
        </Card>
    );
}

function ExaminerSignaturePad({
    studentId,
    system,
    targetRank,
    examiner,
    onSaveStatusChange,
}: {
    studentId: string;
    system: GradingSystemId;
    targetRank: RankId;
    examiner: ReportAuthor;
    onSaveStatusChange: (saved: boolean) => void;
}) {
    const [signature, setSignature] = useState(() =>
        getExaminerSignature(studentId, system, targetRank),
    );
    const [isDrawing, setIsDrawing] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const [padOpen, setPadOpen] = useState(false);
    const signatureRef = useRef<ExaminerSignature | null>(signature);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeStrokeRef = useRef<SignaturePoint[]>([]);
    const drawingAspectRef = useRef(1);
    const activePointerRef = useRef<number | null>(null);
    const headingId = useId();
    const helpId = useId();
    const padId = useId();
    const padTriggerRef = useRef<HTMLButtonElement>(null);
    const toast = useToast();

    function inkBounds(width: number, height: number, aspectRatio: number) {
        const inkWidth = Math.min(width, height * aspectRatio);
        const inkHeight = inkWidth / aspectRatio;
        return {
            width: inkWidth,
            height: inkHeight,
            left: (width - inkWidth) / 2,
            top: (height - inkHeight) / 2,
        };
    }

    function redraw() {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const { width, height } = canvas.getBoundingClientRect();
        if (!width || !height) return;
        context.setTransform(
            canvas.width / width,
            0,
            0,
            canvas.height / height,
            0,
            0,
        );
        context.clearRect(0, 0, width, height);
        context.strokeStyle = "#0f172a";
        context.fillStyle = "#0f172a";
        context.lineWidth = 2.5;
        context.lineCap = "round";
        context.lineJoin = "round";
        const bounds = inkBounds(
            width,
            height,
            signatureRef.current?.aspectRatio ?? drawingAspectRef.current,
        );
        const strokes = [
            ...(signatureRef.current?.strokes ?? []),
            activeStrokeRef.current,
        ];
        for (const stroke of strokes) {
            if (!stroke.length) continue;
            context.beginPath();
            context.arc(
                bounds.left + stroke[0].x * bounds.width,
                bounds.top + stroke[0].y * bounds.height,
                1.25,
                0,
                Math.PI * 2,
            );
            context.fill();
            context.beginPath();
            context.moveTo(
                bounds.left + stroke[0].x * bounds.width,
                bounds.top + stroke[0].y * bounds.height,
            );
            for (const point of stroke.slice(1))
                context.lineTo(
                    bounds.left + point.x * bounds.width,
                    bounds.top + point.y * bounds.height,
                );
            context.stroke();
        }
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            const { width, height } = canvas.getBoundingClientRect();
            const ratio = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(width * ratio));
            canvas.height = Math.max(1, Math.round(height * ratio));
            redraw();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        window.addEventListener("resize", resize);
        resize();
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", resize);
        };
    }, [padOpen]);

    function updateSignature(next: ExaminerSignature | null) {
        signatureRef.current = next;
        setSignature(next);
        redraw();
        try {
            saveExaminerSignature(studentId, system, targetRank, next);
            setSaveError(false);
            onSaveStatusChange(true);
        } catch {
            setSaveError(true);
            onSaveStatusChange(false);
            toast.add({
                title: "Could not save the examiner signature. Please retry.",
            });
        }
    }

    function pointFromEvent(event: {
        clientX: number;
        clientY: number;
    }): SignaturePoint {
        const bounds = canvasRef.current!.getBoundingClientRect();
        const ink = inkBounds(
            bounds.width,
            bounds.height,
            signatureRef.current?.aspectRatio ?? drawingAspectRef.current,
        );
        return {
            x: Math.max(
                0,
                Math.min(1, (event.clientX - bounds.left - ink.left) / ink.width),
            ),
            y: Math.max(
                0,
                Math.min(1, (event.clientY - bounds.top - ink.top) / ink.height),
            ),
        };
    }

    function beginStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
        if (
            !event.isPrimary ||
            event.button !== 0 ||
            activePointerRef.current !== null
        )
            return;
        event.preventDefault();
        const { width, height } = event.currentTarget.getBoundingClientRect();
        drawingAspectRef.current = width / height;
        const previous = signatureRef.current;
        // Rebase before new input so resizing preserves the signature's shape
        // while leaving the entire current pad available for new strokes.
        if (previous && previous.aspectRatio !== drawingAspectRef.current) {
            const ink = inkBounds(width, height, previous.aspectRatio);
            signatureRef.current = {
                ...previous,
                aspectRatio: drawingAspectRef.current,
                strokes: previous.strokes.map((stroke) =>
                    stroke.map((point) => ({
                        x: (ink.left + point.x * ink.width) / width,
                        y: (ink.top + point.y * ink.height) / height,
                    })),
                ),
            };
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointerRef.current = event.pointerId;
        activeStrokeRef.current = [pointFromEvent(event)];
        setIsDrawing(true);
        redraw();
    }

    function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
        if (event.pointerId !== activePointerRef.current) return;
        event.preventDefault();
        const samples = event.nativeEvent.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [event.nativeEvent]) {
            activeStrokeRef.current.push(pointFromEvent(sample));
        }
        redraw();
    }

    function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
        if (event.pointerId !== activePointerRef.current) return;
        if (event.type === "pointerup")
            activeStrokeRef.current.push(pointFromEvent(event));
        const stroke = activeStrokeRef.current;
        activeStrokeRef.current = [];
        activePointerRef.current = null;
        setIsDrawing(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        if (stroke.length)
            updateSignature({
                strokes: [...(signatureRef.current?.strokes ?? []), stroke],
                aspectRatio:
                    signatureRef.current?.aspectRatio ?? drawingAspectRef.current,
                signedAt: new Date().toISOString(),
                signedBy: examiner,
            });
    }

    function undoStroke() {
        const strokes = signatureRef.current?.strokes.slice(0, -1) ?? [];
        updateSignature(
            strokes.length
                ? {
                    strokes,
                    aspectRatio: signatureRef.current!.aspectRatio,
                    signedAt: new Date().toISOString(),
                    signedBy: examiner,
                }
                : null,
        );
    }

    return (
        <Card className="detail-card mt-8 gap-4" role="region" aria-labelledby={headingId}>
            <CardHeader className="gap-3">
                <div className="detail-section-header">
                    <h2 id={headingId}>Examiner signature</h2>
                    <Button
                        ref={padTriggerRef}
                        variant="outline"
                        size="touch"
                        aria-expanded={padOpen}
                        aria-controls={padId}
                        disabled={isDrawing}
                        onClick={() => setPadOpen((open) => !open)}
                    >
                        <PenLine aria-hidden="true" className="size-4" />
                        {padOpen ? "Hide pad" : signature ? "Edit signature" : "Add signature"}
                    </Button>
                </div>
                <InstructorAvatar
                    profile={{
                        ...(padOpen ? examiner : signature?.signedBy ?? examiner),
                        role: "Instructor",
                    }}
                    interactive={false}
                />
                <p
                    role="status"
                    className={cn(
                        "detail-meta text-sm",
                        saveError ? "text-destructive" : signature ? success : "text-muted-foreground",
                    )}
                >
                    {isDrawing
                        ? "Signing…"
                        : saveError
                            ? "Signature changes could not be saved. Retry to save them."
                            : signature
                                ? `Signature saved · ${signedDate.format(new Date(signature.signedAt))}`
                                : "No signature recorded."}
                </p>
                {saveError && !padOpen && (
                    <Button variant="outline" size="touch" onClick={() => updateSignature(signatureRef.current)}>
                        Retry save
                    </Button>
                )}
            </CardHeader>
            {padOpen && (
                <CardContent id={padId} className="space-y-4">
                    <p id={helpId} className="detail-body text-sm text-muted-foreground">
                        Sign inside the box with a finger, stylus, or mouse. Scroll using the space outside the box.
                    </p>
                    <div className="relative isolate overflow-hidden rounded-lg border bg-white">
                        <canvas
                            ref={canvasRef}
                            role="img"
                            aria-label="Examiner signature pad"
                            aria-describedby={helpId}
                            className="block h-52 w-full touch-none cursor-crosshair select-none sm:h-60"
                            onPointerDown={beginStroke}
                            onPointerMove={continueStroke}
                            onPointerUp={finishStroke}
                            onPointerCancel={finishStroke}
                            onLostPointerCapture={finishStroke}
                        />
                        {!signature && !isDrawing && (
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pb-6 text-center text-sm text-slate-400">
                                Sign here
                            </span>
                        )}
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-slate-300"
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {saveError && (
                                <Button
                                    variant="outline"
                                    size="touch"
                                    onClick={() => updateSignature(signatureRef.current)}
                                    disabled={isDrawing}
                                >
                                    Retry save
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="touch"
                                onClick={undoStroke}
                                disabled={!signature || isDrawing}
                            >
                                <Undo2 aria-hidden="true" />
                                Undo
                            </Button>
                            <Button
                                variant="destructive"
                                size="touch"
                                onClick={() => updateSignature(null)}
                                disabled={!signature || isDrawing}
                            >
                                <Trash2 aria-hidden="true" />
                                Clear
                            </Button>
                        </div>
                        <Button
                            size="touch"
                            disabled={isDrawing || saveError}
                            onClick={() => {
                                setPadOpen(false);
                                padTriggerRef.current?.focus();
                            }}
                        >
                            Done signing
                        </Button>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

function StudentGrading({
    profile,
    syllabus,
    requirements,
    signOffs,
    onSignOffsChange,
}: {
    profile: Profile;
    syllabus: GradingSyllabus | null;
    requirements: GradingRequirement[];
    signOffs: TechniqueSignOff[];
    onSignOffsChange: (signOffs: TechniqueSignOff[]) => void;
}) {
    const [gradingOpen, setGradingOpen] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [techniqueSaveState, setTechniqueSaveState] = useState<ReviewSaveState>("idle");
    const [signatureSaveState, setSignatureSaveState] = useState<ReviewSaveState>("idle");
    const gradingTriggerRef = useRef<HTMLButtonElement>(null);
    const keepEditingRef = useRef<HTMLButtonElement>(null);
    const closeTriggerRef = useRef<HTMLElement | null>(null);
    const { profile: instructorProfile } = useAuth();
    const toast = useToast();
    const eligibility = gradingEligibility(requirements);
    const saveError = techniqueSaveState === "error" || signatureSaveState === "error";
    const reviewSaveMessage = saveError
        ? "Some changes were not saved. Retry before closing."
        : techniqueSaveState === "saved" || signatureSaveState === "saved"
            ? "Saved in this browser."
            : "Autosaves in this browser.";
    const examiner = instructorProfile
        ? {
            id: instructorProfile.id,
            name:
                [instructorProfile.first_name, instructorProfile.last_name]
                    .filter(Boolean)
                    .join(" ") || instructorProfile.email,
        }
        : currentInstructor;
    function toggleTechnique(itemId: string) {
        const next = signOffs.some((item) => item.itemId === itemId)
            ? signOffs.filter((item) => item.itemId !== itemId)
            : [
                ...signOffs,
                {
                    itemId,
                    signedOffAt: new Date().toISOString(),
                    signedOffBy: examiner,
                },
            ];
        try {
            saveTechniqueSignOffs(profile.id, next);
            onSignOffsChange(next);
            setTechniqueSaveState("saved");
            return true;
        } catch {
            setTechniqueSaveState("error");
            toast.add({
                title: "Could not save the technique sign-off. Please try again.",
            });
            return false;
        }
    }

    return (
        <>
            <Dialog
                open={gradingOpen}
                onOpenChange={(open, details) => {
                    if (open) {
                        setTechniqueSaveState("idle");
                        setSignatureSaveState("idle");
                        setGradingOpen(true);
                        return;
                    }
                    details.cancel();
                    const closeControl =
                        details.event.target instanceof Element
                            ? details.event.target.closest<HTMLElement>(
                                '[data-slot="dialog-close"]',
                            )
                            : null;
                    closeTriggerRef.current =
                        closeControl ??
                        (document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null);
                    setConfirmClose(true);
                }}
            >
                <div className="detail-section-header">
                    <h2>Grading eligibility</h2>
                    <DialogTrigger
                        render={
                            <Button
                                ref={gradingTriggerRef}
                                disabled={!syllabus}
                                className="h-11 px-4 lg:h-10"
                            />
                        }
                    >
                        <Plus aria-hidden="true" />
                        Review grading
                    </DialogTrigger>
                </div>
                {syllabus && (
                    <DialogContent
                        finalFocus={gradingTriggerRef}
                        showCloseButton={false}
                        className="student-detail-view grading-review-dialog flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
                    >
                        <DialogHeader className="grading-review-header shrink-0 gap-3 border-b border-border/60 p-4 lg:px-8 lg:py-5">
                            <div className="flex min-h-11 items-center justify-between gap-4">
                                <DialogTitle className="text-xl font-semibold tracking-tight">
                                    Grading review
                                </DialogTitle>
                                <DialogClose render={<Button variant="ghost" size="icon-touch" className="-mr-2" />}>
                                    <X aria-hidden="true" />
                                    <span className="sr-only">Close grading review</span>
                                </DialogClose>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <DialogDescription className="detail-body min-w-0 break-words text-sm font-medium text-foreground">
                                    {profile.name}
                                </DialogDescription>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="sr-only">Current grade:</span>
                                    <GradeBadge rank={profile.rank} system={profile.gradingSystem} />
                                    {profile.nextRank && (
                                        <>
                                            <span aria-hidden="true" className="text-muted-foreground">→</span>
                                            <span className="sr-only">Target grade:</span>
                                            <GradeBadge rank={profile.nextRank} system={profile.gradingSystem} />
                                        </>
                                    )}
                                </div>
                            </div>
                        </DialogHeader>
                        <div className="shrink-0 border-b border-border/60 bg-background px-4 py-3 lg:px-8">
                            <TechniqueProgress syllabus={syllabus} signOffs={signOffs} />
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:px-8 lg:pt-5 lg:pb-8 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70">
                            <TechniqueChecklist
                                key={`${profile.id}:${profile.gradingSystem}:${profile.nextRank}`}
                                syllabus={syllabus}
                                system={profile.gradingSystem}
                                targetRank={profile.nextRank}
                                signOffs={signOffs}
                                onToggle={toggleTechnique}
                            />
                            {profile.nextRank && (
                                <ExaminerSignaturePad
                                    key={`signature:${profile.id}:${profile.gradingSystem}:${profile.nextRank}`}
                                    studentId={profile.id}
                                    system={profile.gradingSystem}
                                    targetRank={profile.nextRank}
                                    examiner={examiner}
                                    onSaveStatusChange={(saved) => setSignatureSaveState(saved ? "saved" : "error")}
                                />
                            )}
                        </div>
                        <DialogFooter className="grading-review-footer m-0 shrink-0 flex-row items-center justify-between gap-3 border-t border-border/60 p-4 lg:px-8 lg:py-4">
                            <p role="status" className={cn("detail-meta min-w-0 flex-1 text-sm", saveError ? "text-destructive" : "text-muted-foreground")}>
                                {reviewSaveMessage}
                            </p>
                            <DialogClose render={<Button size="touch" />}>
                                Finish review
                            </DialogClose>
                        </DialogFooter>
                        <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
                            <DialogContent
                                initialFocus={keepEditingRef}
                                finalFocus={gradingOpen ? closeTriggerRef : gradingTriggerRef}
                                showCloseButton={false}
                                className="student-detail-view"
                            >
                                <DialogHeader>
                                    <DialogTitle>Finish grading review?</DialogTitle>
                                    <DialogDescription>
                                        {saveError
                                            ? "Some changes could not be saved. Keep reviewing to retry, or close without saving those changes."
                                            : "Saved sign-offs and signatures remain in this browser. Finishing closes the review; it does not award a grade."}
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <DialogClose
                                        render={<Button ref={keepEditingRef} variant="outline" />}
                                    >
                                        Keep reviewing
                                    </DialogClose>
                                    <Button
                                        onClick={() => {
                                            setConfirmClose(false);
                                            setGradingOpen(false);
                                        }}
                                    >
                                        {saveError ? "Close without saving" : "Close review"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </DialogContent>
                )}
            </Dialog>
            <Card className="detail-card">
                {!syllabus && (
                    <CardHeader>
                        <CardDescription>
                            {profile.nextRank
                                ? "No published syllabus is recorded for the next configured rank."
                                : "No further grading level is configured for this grading system."}
                        </CardDescription>
                    </CardHeader>
                )}
                <CardContent className="space-y-4">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <GradeBadge rank={profile.rank} system={profile.gradingSystem} />
                            {profile.nextRank && (
                                <>
                                    <span aria-hidden="true" className="text-muted-foreground">
                                        →
                                    </span>
                                    <GradeBadge
                                        rank={profile.nextRank}
                                        system={profile.gradingSystem}
                                    />
                                </>
                            )}
                        </div>
                        {syllabus && (
                            <span
                                role="status"
                                className={cn(
                                    "detail-status shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
                                    eligibility.label === "Ready"
                                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                        : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
                                )}
                            >
                                {eligibility.label}
                            </span>
                        )}
                    </div>
                    {syllabus && (
                        <div className="space-y-2">
                            <p
                                role="status"
                                aria-atomic="true"
                                className={cn(
                                    "detail-meta text-xs tabular-nums",
                                    eligibility.label === "Ready"
                                        ? `font-medium ${success}`
                                        : "text-muted-foreground",
                                )}
                            >
                                {eligibility.metCount}/{requirements.length} requirements met
                            </p>
                            <progress
                                aria-label="Grading eligibility requirements met"
                                value={eligibility.metCount}
                                max={requirements.length}
                                className={cn(
                                    "block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
                                    eligibility.label === "Ready"
                                        ? "[&::-webkit-progress-value]:bg-emerald-600 [&::-moz-progress-bar]:bg-emerald-600"
                                        : "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
                                )}
                            />
                        </div>
                    )}
                    {syllabus && (
                        <>
                            <ul className="space-y-2">
                                {requirements.map((requirement) => {
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
                                    const unverified = requirement.met === null;
                                    const missingRecord =
                                        unverified && requirement.key !== "sessions";
                                    return (
                                        <li
                                            key={requirement.key}
                                            className="flex items-start justify-between gap-x-4 py-1"
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
                                                            : unverified
                                                                ? "Unverified: "
                                                                : "Not met: "}
                                                    </span>
                                                    {requirement.label}
                                                    {unverified && (
                                                        <span className="detail-meta mt-1 block text-sm text-muted-foreground">
                                                            {missingRecord
                                                                ? `Required: ${requirement.required}`
                                                                : "History incomplete"}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            {requirement.key !== "membership" && (
                                                <span className="detail-meta w-[30%] shrink-0 text-right text-xs tabular-nums">
                                                    <span className={cn("font-medium", tone)}>
                                                        {missingRecord
                                                            ? "Not recorded"
                                                            : requirement.actual}
                                                    </span>
                                                    {!missingRecord && (
                                                        <span className="text-muted-foreground">
                                                            {requirement.key === "techniques" ? "/" : " / "}
                                                            {requirement.required}
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </CardContent>
            </Card>
        </>
    );
}

function MedicalAlertDetails({ alerts }: { alerts: string[] }) {
    return alerts.length ? (
        <div className="space-y-2">
            {alerts.map((alert) => (
                <p
                    key={alert}
                    className="detail-body rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    {alert}
                </p>
            ))}
        </div>
    ) : (
        <p className="detail-body text-sm text-muted-foreground">
            No medical alerts noted.
        </p>
    );
}

function StudentContactDetails({ profile }: { profile: Profile }) {
    return (
        <section className="space-y-3 lg:space-y-2" aria-label="Contact information">
            <h3>Contact</h3>
            <a
                href={`mailto:${profile.email}`}
                className="detail-body flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-0 lg:py-1"
            >
                <Mail aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="break-all">{profile.email}</span>
            </a>
            <a
                href={`tel:${profile.phone.replaceAll(" ", "")}`}
                className="detail-body flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-0 lg:py-1"
            >
                <Phone aria-hidden="true" className="size-3.5" />
                {profile.phone}
            </a>
            <div className="space-y-3 border-t pt-4 lg:space-y-2 lg:pt-3" aria-label="Emergency contact">
                <h3>Emergency contact</h3>
                <p className="detail-body text-sm">
                    <span className="font-medium">{profile.emergencyContact.name}</span>
                    <span className="text-muted-foreground">
                        {" "}
                        · {profile.emergencyContact.relationship}
                    </span>
                </p>
                <a
                    href={`tel:${profile.emergencyContact.phone.replaceAll(" ", "")}`}
                    className="detail-body inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline lg:min-h-0 lg:py-1"
                >
                    {profile.emergencyContact.phone}
                </a>
            </div>
        </section>
    );
}

function StudentInformationCards({ profile }: { profile: Profile }) {
    return (
        <div className="space-y-3" aria-label="Student information">
            <Card size="sm" className="detail-card">
                <CardContent className="space-y-2">
                    <h3 className="detail-label text-xs text-muted-foreground">Grading</h3>
                    <div className="flex items-center justify-between gap-3">
                        <GradeBadge
                            rank={profile.rank}
                            system={profile.gradingSystem}
                            showBeltLabel
                            className="min-w-0 px-3 py-1.5"
                        />
                        <p className="detail-meta min-w-0 text-right text-sm text-muted-foreground">
                            {gradingSystems[profile.gradingSystem].label}
                        </p>
                    </div>
                </CardContent>
            </Card>
            <Card size="sm" className="detail-card">
                <CardContent className="space-y-2">
                    <h3 className="detail-label text-xs text-muted-foreground">Principal Dojo</h3>
                    <p className="detail-body flex items-center gap-1.5 text-sm">
                        <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                        {profile.principalDojo}
                    </p>
                </CardContent>
            </Card>
            <Card size="sm" className="detail-card">
                <CardContent className="space-y-2">
                    <h3 className="detail-label text-xs text-muted-foreground">Membership status</h3>
                    <p
                        className={cn(
                            "detail-status inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                            profile.membershipStatus === "Active"
                                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                : "bg-muted text-muted-foreground",
                        )}
                    >
                        <CreditCard aria-hidden="true" className="size-3.5" />
                        {profile.membershipStatus}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

function StudentInformationActions({ profile }: { profile: Profile }) {
    return (
        <div className="grid grid-cols-2 gap-2" aria-label="Contact and medical actions">
            <Dialog>
                <DialogTrigger
                    render={
                        <Button
                            variant="outline"
                            size="touch"
                            className="h-auto min-w-0 gap-2 px-3 py-2 whitespace-normal"
                        />
                    }
                >
                    <Phone aria-hidden="true" className="size-4 shrink-0" />
                    Contact
                </DialogTrigger>
                <DialogContent showCloseButton={false} className="student-detail-view">
                    <DialogHeader className="flex-row items-center justify-between gap-4">
                        <DialogTitle>Contact details</DialogTitle>
                        <DialogClose
                            render={
                                <Button variant="ghost" size="icon-touch" className="-my-2 -mr-2" />
                            }
                        >
                            <X aria-hidden="true" />
                            <span className="sr-only">Close</span>
                        </DialogClose>
                    </DialogHeader>
                    <StudentContactDetails profile={profile} />
                </DialogContent>
            </Dialog>
            <Dialog>
                <DialogTrigger
                    render={
                        <Button
                            variant="outline"
                            size="touch"
                            className="h-auto min-w-0 gap-2 px-3 py-2 whitespace-normal"
                        />
                    }
                >
                    <HeartPulse aria-hidden="true" className="size-4 shrink-0" />
                    <span className="min-w-0">Medical alerts</span>
                    {profile.medicalAlerts.length > 0 && (
                        <span className="detail-status shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
                            {profile.medicalAlerts.length}
                        </span>
                    )}
                </DialogTrigger>
                <DialogContent showCloseButton={false} className="student-detail-view">
                    <DialogHeader className="flex-row items-center justify-between gap-4">
                        <DialogTitle>Medical alerts</DialogTitle>
                        <DialogClose
                            render={
                                <Button variant="ghost" size="icon-touch" className="-my-2 -mr-2" />
                            }
                        >
                            <X aria-hidden="true" />
                            <span className="sr-only">Close</span>
                        </DialogClose>
                    </DialogHeader>
                    <MedicalAlertDetails alerts={profile.medicalAlerts} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

function MobileStudentInformation({ profile }: { profile: Profile }) {
    return (
        <section aria-label="Student details" className="detail-section md:hidden">
            <div className="detail-section-header">
                <h2>Details</h2>
            </div>
            <StudentInformationCards profile={profile} />
            <StudentInformationActions profile={profile} />
        </section>
    );
}

function StudentInformation({ profile }: { profile: Profile }) {
    return (
        <section aria-label="Student details" className="hidden space-y-4 md:block">
            <div>
                <h1 className="text-xl font-semibold">{profile.name}</h1>
                <p className="detail-meta mt-1 text-sm text-muted-foreground">{profile.studentNumber}</p>
            </div>
            <StudentInformationCards profile={profile} />
            <StudentInformationActions profile={profile} />
        </section>
    );
}

function NextGradingSummary({
    profile,
    assessmentRecorded,
    requirements,
    onViewGrading,
}: {
    profile: Profile;
    assessmentRecorded: boolean;
    requirements: GradingRequirement[];
    onViewGrading: () => void;
}) {
    const { metCount } = gradingEligibility(requirements);
    const complete = requirements.length > 0 && metCount === requirements.length;

    return (
        <section className="detail-section">
            <div className="detail-section-header">
                <h2>Next grading</h2>
                <Button
                    variant="ghost"
                    size="touch"
                    onClick={onViewGrading}
                    className="ml-auto"
                >
                    View grading
                    <ChevronRight aria-hidden="true" />
                </Button>
            </div>
            <Card size="sm" className="detail-card">
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="sr-only">Current grade:</span>
                        <GradeBadge rank={profile.rank} system={profile.gradingSystem} />
                        <span aria-hidden="true" className="text-muted-foreground">
                            →
                        </span>
                        <span className="sr-only">Next grade:</span>
                        {profile.nextRank ? (
                            <GradeBadge
                                rank={profile.nextRank}
                                system={profile.gradingSystem}
                            />
                        ) : (
                            <span className="detail-meta text-sm text-muted-foreground">
                                Not configured
                            </span>
                        )}
                    </div>
                    {requirements.length > 0 && (
                        <div className="space-y-2">
                            <p
                                role="status"
                                aria-atomic="true"
                                className={cn(
                                    "detail-meta text-sm tabular-nums",
                                    complete ? `font-medium ${success}` : "text-muted-foreground",
                                )}
                            >
                                {metCount}/{requirements.length} requirements met
                            </p>
                            <progress
                                aria-label="Grading requirements met"
                                value={metCount}
                                max={requirements.length}
                                className={cn(
                                    "block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
                                    complete
                                        ? "[&::-webkit-progress-value]:bg-emerald-600 [&::-moz-progress-bar]:bg-emerald-600"
                                        : "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
                                )}
                            />
                        </div>
                    )}
                    <dl className="detail-body text-sm">
                        <div>
                            <dt className="detail-label text-xs text-muted-foreground">
                                Technical assessment
                            </dt>
                            <dd className="mt-1 font-medium">
                                {assessmentRecorded ? "Recorded" : "Not yet verified"}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
        </section>
    );
}

function StudentDetailContent({
    student,
    context,
    today,
    now,
}: {
    student: Student;
    context: CalendarEvent | undefined;
    today: Date;
    now: Date;
}) {
    const [params, setParams] = useSearchParams();
    const tabParam = params.get("tab");
    const activeTab: DetailTab =
        tabParam === "sessions" || tabParam === "grading" ? tabParam : "overview";
    const [sessions, setSessions] = useState(() =>
        studentSessionHistory(student, now, context),
    );
    const [signOffs, setSignOffs] = useState(() =>
        getTechniqueSignOffs(student.id),
    );
    const sidebarRef = useRef<HTMLElement>(null);
    const [sidebarFits, setSidebarFits] = useState(false);
    useEffect(() => {
        const sidebar = sidebarRef.current;
        if (!sidebar) return;
        const update = () =>
            setSidebarFits(
                sidebar.getBoundingClientRect().height <= window.innerHeight - 32,
            );
        const observer = new ResizeObserver(update);
        observer.observe(sidebar);
        window.addEventListener("resize", update);
        update();
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", update);
        };
    }, []);
    const profile = getStudentProfile(student, today);
    const gradingHistory = studentGradingHistory(student, today, context);
    const roster = context
        ? context.studentIds
            .map((id) => students.find((item) => item.id === id))
            .filter((item): item is Student => !!item)
        : [];
    const position = roster.findIndex((item) => item.id === student.id);
    const previous = roster[position - 1];
    const next = roster[position + 1];
    const {
        pastSessions,
        markedSessions,
        attended,
        attendanceRate,
        lastAttended,
        periodStart,
        periodEnd,
        consecutiveAbsences,
    } = studentAttendanceSummary(sessions, now);
    const reportingPeriod =
        periodStart && periodEnd
            ? `${fullDate(periodStart)} – ${fullDate(periodEnd)}`
            : "No completed sessions recorded";
    const recentFeedback = pastSessions
        .filter((item) => item.feedback.trim())
        .slice(0, 2);
    const assessmentRecorded = gradingHistory.some(
        (assessment) =>
            assessment.status === "Completed" &&
            assessment.fromRank === profile.rank &&
            assessment.toRank === profile.nextRank,
    );
    const syllabus = getGradingSyllabus(profile.gradingSystem, profile.nextRank);
    const requirements = syllabus
        ? getGradingRequirements({
            syllabus,
            membershipStatus: profile.membershipStatus,
            rankAwardedOn: profile.rankAwardedOn,
            sessions,
            signOffs,
            now,
        })
        : [];
    function selectTab(value: DetailTab) {
        setParams(
            (current) => {
                const nextParams = new URLSearchParams(current);
                nextParams.set("tab", value);
                return nextParams;
            },
            { replace: true },
        );
    }

    return (
        <section className="student-detail-view space-y-2 md:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 max-w-full items-center justify-between gap-2 max-md:w-full">
                    <Button
                        render={
                            <Link
                                to={context ? calendarHref(context) : "/instructor/students"}
                            />
                        }
                        nativeButton={false}
                        variant="ghost"
                        className="-ml-5 max-w-full min-w-0 max-md:h-auto max-md:min-h-11 max-md:shrink max-md:py-2"
                    >
                        <ChevronLeft aria-hidden="true" />
                        <h1 className="min-w-0 text-left whitespace-normal md:hidden">
                            {profile.name}
                        </h1>
                        <span className="hidden md:inline">
                            {context ? "Back to calendar" : "Back to students"}
                        </span>
                    </Button>
                </div>
                {roster.length > 1 && (
                    <div
                        className="flex flex-wrap items-center gap-2 sm:gap-3"
                        role="group"
                        aria-label="Students in this class"
                    >
                        <Button
                            render={
                                previous ? (
                                    <Link
                                        to={studentDetailsHref(previous.id, context, activeTab)}
                                    />
                                ) : undefined
                            }
                            nativeButton={!previous}
                            variant="outline"
                            size="sm"
                            disabled={!previous}
                            className="disabled:bg-muted disabled:text-muted-foreground"
                            aria-label={
                                previous
                                    ? `Previous student: ${previous.name}`
                                    : "Previous student"
                            }
                        >
                            <ChevronLeft aria-hidden="true" />
                            Previous
                        </Button>
                        <span className="text-xs text-muted-foreground tabular-nums">
                            Student {position + 1} of {roster.length}
                        </span>
                        <Button
                            render={
                                next ? (
                                    <Link to={studentDetailsHref(next.id, context, activeTab)} />
                                ) : undefined
                            }
                            nativeButton={!next}
                            variant="outline"
                            size="sm"
                            disabled={!next}
                            className="disabled:bg-muted disabled:text-muted-foreground"
                            aria-label={next ? `Next student: ${next.name}` : "Next student"}
                        >
                            Next
                            <ChevronRight aria-hidden="true" />
                        </Button>
                    </div>
                )}
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
                <aside
                    ref={sidebarRef}
                    className={cn(
                        "order-2 min-w-0 max-md:hidden lg:order-1",
                        sidebarFits && "lg:sticky lg:top-4",
                    )}
                >
                    <StudentInformation profile={profile} />
                </aside>
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => {
                        if (
                            value === "overview" ||
                            value === "sessions" ||
                            value === "grading"
                        )
                            selectTab(value);
                    }}
                    className="order-1 min-w-0 gap-6 md:gap-4 max-md:order-1 lg:order-2"
                >
                    <TabsList
                        aria-label="Student training details"
                        className="w-full"
                        touch
                    >
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="sessions">Sessions</TabsTrigger>
                        <TabsTrigger value="grading">Grading</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="space-y-6">
                        <MobileStudentInformation profile={profile} />
                        <section className="detail-section">
                            <div className="detail-section-header">
                                <h2>Attendance</h2>
                                <Popover>
                                    <PopoverTrigger
                                        render={
                                            <Button
                                                variant="ghost"
                                                size="icon-touch"
                                                aria-label="Attendance reporting period"
                                                className="text-muted-foreground md:hidden"
                                            />
                                        }
                                    >
                                        <Info aria-hidden="true" className="size-4" />
                                    </PopoverTrigger>
                                    <PopoverContent
                                        align="start"
                                        className="student-detail-view gap-2"
                                    >
                                        <PopoverTitle>Reporting period</PopoverTitle>
                                        <p className="detail-meta">{reportingPeriod}</p>
                                    </PopoverContent>
                                </Popover>
                                <p className="ml-auto hidden text-right text-2xs text-muted-foreground md:block">
                                    {periodStart && periodEnd
                                        ? `Reporting period: ${reportingPeriod}`
                                        : reportingPeriod}
                                </p>
                            </div>
                            <Card size="sm" className="detail-card">
                                <CardContent>
                                    <dl className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <dt className="detail-label text-xs text-muted-foreground">
                                                Attendance rate
                                            </dt>
                                            <dd className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
                                                <span className="text-2xl font-semibold">
                                                    {attendanceRate === null ? "—" : `${attendanceRate}%`}
                                                </span>
                                                <span className="detail-meta text-sm text-muted-foreground">
                                                    {attended}/{markedSessions.length} sessions
                                                </span>
                                            </dd>
                                        </div>
                                        <div className="border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                                            <dt className="detail-label text-xs text-muted-foreground">
                                                Last attended
                                            </dt>
                                            <dd>
                                                <p className="mt-2 text-lg font-semibold tabular-nums">
                                                    {lastAttended
                                                        ? fullDate(lastAttended.event.date)
                                                        : "Not recorded"}
                                                </p>
                                                <p className="detail-meta mt-1 text-sm text-muted-foreground">
                                                    {lastAttended
                                                        ? `${lastAttended.event.name} · ${lastAttended.event.dojo}`
                                                        : "No attended sessions in this history"}
                                                </p>
                                            </dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>
                            {consecutiveAbsences >= 2 && (
                                <p
                                    role="status"
                                    className="detail-body flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                                >
                                    <TriangleAlert
                                        aria-hidden="true"
                                        className="mt-0.5 size-3.5 shrink-0"
                                    />
                                    {consecutiveAbsences} consecutive absences in the most recent
                                    recorded sessions. Review attendance in the Sessions tab.
                                </p>
                            )}
                        </section>
                        <section className="detail-section">
                            <div className="detail-section-header">
                                <h2>Recent feedback</h2>
                                <Button
                                    variant="ghost"
                                    size="touch"
                                    onClick={() => selectTab("sessions")}
                                    className="ml-auto"
                                >
                                    View sessions
                                    <ChevronRight aria-hidden="true" />
                                </Button>
                            </div>
                            <Card size="sm" className="detail-card">
                                <CardContent className="space-y-4">
                                    {recentFeedback.length ? (
                                        recentFeedback.map((session) => (
                                            <article
                                                key={session.event.id}
                                                className="space-y-2 not-first:border-t not-first:pt-4"
                                            >
                                                <h3 className="text-base font-semibold">
                                                    {session.event.name}
                                                </h3>
                                                <p className="detail-meta text-sm text-muted-foreground">
                                                    {fullDate(session.event.date)} ·{" "}
                                                    {session.reportAuthor?.name ?? session.instructor}
                                                </p>
                                                <p className="detail-body max-w-prose whitespace-pre-wrap text-sm">
                                                    {session.feedback}
                                                </p>
                                            </article>
                                        ))
                                    ) : (
                                        <p className="detail-body text-sm text-muted-foreground">
                                            No feedback recorded yet. Add notes from the Sessions tab.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </section>
                        <NextGradingSummary
                            profile={profile}
                            assessmentRecorded={assessmentRecorded}
                            requirements={requirements}
                            onViewGrading={() => selectTab("grading")}
                        />
                    </TabsContent>

                    <TabsContent value="sessions">
                        <StudentSessionHistory
                            sessions={sessions}
                            student={student}
                            contextId={context?.id}
                            now={now}
                            onSaved={() =>
                                setSessions(studentSessionHistory(student, now, context))
                            }
                        />
                    </TabsContent>

                    <TabsContent value="grading" className="space-y-6">
                        {context?.type === "grading" && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Selected grading session</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">
                                        {context.name} · {fullDate(context.date)}
                                    </p>
                                    <Button
                                        render={<Link to={assessmentHref(context, student.id)} />}
                                        nativeButton={false}
                                    >
                                        Open assessment
                                        <ChevronRight aria-hidden="true" />
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                        <section
                            aria-label="Grading eligibility"
                            className="detail-section"
                        >
                            <StudentGrading
                                profile={profile}
                                syllabus={syllabus}
                                requirements={requirements}
                                signOffs={signOffs}
                                onSignOffsChange={setSignOffs}
                            />
                        </section>
                        <section aria-label="Grading history" className="detail-section">
                            <div className="detail-section-header">
                                <h2>Grading history</h2>
                            </div>
                            <Card size="sm" className="detail-card">
                                <CardContent className="space-y-4">
                                    {gradingHistory.length ? (
                                        gradingHistory.map((assessment) => (
                                            <article
                                                key={assessment.id}
                                                className="not-first:border-t not-first:pt-4"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <GradeBadge
                                                                rank={assessment.fromRank}
                                                                system={student.gradingSystem}
                                                            />
                                                            <span aria-hidden="true">→</span>
                                                            <GradeBadge
                                                                rank={assessment.toRank}
                                                                system={student.gradingSystem}
                                                            />
                                                        </div>
                                                        <p className="detail-meta mt-2 text-sm text-muted-foreground">
                                                            {fullDate(assessment.date)} ·{" "}
                                                            {assessment.instructor}
                                                        </p>
                                                    </div>
                                                    <span className="detail-status rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                                        {assessment.status}
                                                    </span>
                                                </div>
                                                <p className="detail-body mt-3 max-w-prose text-sm">
                                                    {assessment.feedback}
                                                </p>
                                            </article>
                                        ))
                                    ) : (
                                        <p className="detail-body text-sm text-muted-foreground">
                                            No previous grading assessments. The first assessment will
                                            appear here.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </section>
                    </TabsContent>
                </Tabs>
            </div>
        </section>
    );
}

export default function InstructorStudentDetails() {
    const { studentId } = useParams();
    const [params] = useSearchParams();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const student = students.find((item) => item.id === studentId);
    const requestedContext = findCalendarEvent(
        params.get("session") ?? params.get("class") ?? undefined,
    );
    if (!student)
        return (
            <section className="space-y-4">
                <Button
                    render={
                        <Link
                            to={
                                requestedContext
                                    ? calendarHref(requestedContext)
                                    : "/instructor/students"
                            }
                        />
                    }
                    nativeButton={false}
                    variant="outline"
                >
                    <ChevronLeft aria-hidden="true" />
                    {requestedContext ? "Back to calendar" : "Back to students"}
                </Button>
                <h1 className="text-2xl font-semibold">Student not found</h1>
            </section>
        );
    const context = requestedContext?.studentIds.includes(student.id)
        ? requestedContext
        : undefined;
    return (
        <ToastProvider>
            <StudentDetailContent
                key={`${student.id}-${context?.id ?? "direct"}`}
                student={student}
                context={context}
                today={today}
                now={now}
            />
        </ToastProvider>
    );
}
