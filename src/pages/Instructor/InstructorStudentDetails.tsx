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
    CircleHelp,
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
    InstructorProfile,
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

const success = "text-emerald-700 dark:text-emerald-400";
const signedDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

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
    const items = syllabus.categories.flatMap((category) => category.items);
    const signedCount = items.filter((item) => signOffByItem.has(item.id)).length;
    const percent = items.length
        ? Math.round((signedCount / items.length) * 100)
        : 0;
    const complete = items.length > 0 && signedCount === items.length;

    return (
        <Card className="gap-4 rounded-none bg-transparent py-0 ring-0">
            <CardHeader className="gap-3 px-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <CardTitle className="text-sm font-semibold">
                            <h2>Technique Checklist</h2>
                        </CardTitle>
                    </div>
                    <Popover>
                        <PopoverTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="About technique sign-offs"
                                    className="-mr-1 text-muted-foreground"
                                />
                            }
                        >
                            <Info aria-hidden="true" className="size-4" />
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className="w-80 gap-2 text-left text-xs leading-relaxed"
                        >
                            <PopoverTitle>About technique sign-offs</PopoverTitle>
                            <p>
                                Only techniques for {syllabus.grade} are required. Earlier
                                grades are treated as completed history.
                            </p>
                            <p>
                                {system === "children"
                                    ? "Children’s syllabus · revised October 2014."
                                    : "Adult syllabus · revised January 2021."}{" "}
                                Sign-offs are saved in this browser.
                            </p>
                            {system === "adults" &&
                                ["2-dan", "3-dan", "4-dan"].includes(targetRank ?? "") && (
                                    <p>
                                        Candidates aged 50 and above (by calendar year) take 20
                                        ukemis instead of 30 from 2nd Dan.
                                    </p>
                                )}
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-2">
                    <p
                        role="status"
                        aria-atomic="true"
                        className={cn(
                            "flex items-center justify-between gap-3 text-xs tabular-nums",
                            complete ? `font-medium ${success}` : "text-muted-foreground",
                        )}
                    >
                        <span>
                            {signedCount} of {items.length} completed
                        </span>{" "}
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
            </CardHeader>
            <CardContent className="px-0">
                <AccordionPrimitive.Root
                    multiple
                    defaultValue={syllabus.categories.map((category) => category.id)}
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
                                className="border-border/60 not-first:mt-6 not-first:border-t not-first:pt-4"
                            >
                                <AccordionPrimitive.Header className="mb-3 flex">
                                    <AccordionPrimitive.Trigger
                                        data-slot="accordion-trigger"
                                        className="group/accordion-trigger flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md py-1 text-left text-sm font-semibold transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                                    >
                                        <span className="min-w-0 flex-1 break-words">
                                            {category.label}
                                        </span>
                                        <span
                                            className={cn(
                                                "shrink-0 text-xs font-normal tabular-nums",
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
                                                    <div
                                                        className={cn(
                                                            "flex min-h-12 items-start gap-3 rounded-lg px-4 py-3 text-sm leading-6 transition-colors",
                                                            signOff
                                                                ? "bg-emerald-50/60 hover:bg-emerald-50 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40"
                                                                : "hover:bg-muted/50",
                                                        )}
                                                    >
                                                        <CheckboxPrimitive.Root
                                                            id={checkboxId}
                                                            data-slot="checkbox"
                                                            checked={Boolean(signOff)}
                                                            onCheckedChange={() => {
                                                                onToggle(item.id);
                                                            }}
                                                            aria-label={`${category.label}: ${item.label}${item.note ? ` · ${item.note}` : ""}`}
                                                            className="mt-1 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 data-checked:border-emerald-600 data-checked:bg-emerald-600 data-checked:text-white dark:data-checked:bg-emerald-600"
                                                        >
                                                            <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
                                                                <Check
                                                                    aria-hidden="true"
                                                                    className="size-3.5"
                                                                />
                                                            </CheckboxPrimitive.Indicator>
                                                        </CheckboxPrimitive.Root>
                                                        <div className="min-w-0 flex-1">
                                                            <label
                                                                htmlFor={checkboxId}
                                                                className="block cursor-pointer break-words"
                                                            >
                                                                {item.label}
                                                                {item.note && (
                                                                    <span className="text-muted-foreground">
                                                                        {" "}
                                                                        · {item.note}
                                                                    </span>
                                                                )}
                                                            </label>
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
            </CardContent>
        </Card>
    );
}

function ExaminerSignaturePad({
    studentId,
    system,
    targetRank,
    examiner,
}: {
    studentId: string;
    system: GradingSystemId;
    targetRank: RankId;
    examiner: ReportAuthor;
}) {
    const [signature, setSignature] = useState(() =>
        getExaminerSignature(studentId, system, targetRank),
    );
    const [isDrawing, setIsDrawing] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const signatureRef = useRef<ExaminerSignature | null>(signature);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeStrokeRef = useRef<SignaturePoint[]>([]);
    const drawingAspectRef = useRef(1);
    const activePointerRef = useRef<number | null>(null);
    const headingId = useId();
    const helpId = useId();
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
    }, []);

    function updateSignature(next: ExaminerSignature | null) {
        signatureRef.current = next;
        setSignature(next);
        redraw();
        try {
            saveExaminerSignature(studentId, system, targetRank, next);
            setSaveError(false);
        } catch {
            setSaveError(true);
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
        <Card className="mt-8 gap-3" role="region" aria-labelledby={headingId}>
            <CardHeader className="gap-2">
                <CardTitle>
                    <h3 id={headingId} className="flex items-center gap-2">
                        <PenLine
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground"
                        />
                        Examiner Digital Stylus Signature
                    </h3>
                </CardTitle>
                <CardDescription id={helpId} className="text-xs">
                    Sign with a finger or mouse.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
                    <p
                        role="status"
                        className={cn(
                            "min-w-0 text-xs leading-relaxed",
                            saveError ? "text-destructive" : "text-muted-foreground",
                        )}
                    >
                        {isDrawing
                            ? "Signing…"
                            : saveError
                                ? "Signature not saved."
                                : signature
                                    ? `Signature saved · ${signedDate.format(new Date(signature.signedAt))}`
                                    : "No signature yet."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {saveError && (
                            <Button
                                variant="outline"
                                className="min-h-10"
                                onClick={() => updateSignature(signatureRef.current)}
                                disabled={isDrawing}
                            >
                                Retry save
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="min-h-10"
                            onClick={undoStroke}
                            disabled={!signature || isDrawing}
                        >
                            <Undo2 aria-hidden="true" />
                            Undo
                        </Button>
                        <Button
                            variant="destructive"
                            className="min-h-10"
                            onClick={() => updateSignature(null)}
                            disabled={!signature || isDrawing}
                        >
                            <Trash2 aria-hidden="true" />
                            Clear
                        </Button>
                    </div>
                </div>
            </CardContent>
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
    const gradingTriggerRef = useRef<HTMLButtonElement>(null);
    const keepEditingRef = useRef<HTMLButtonElement>(null);
    const closeTriggerRef = useRef<HTMLElement | null>(null);
    const { profile: instructorProfile } = useAuth();
    const toast = useToast();
    const eligibility = gradingEligibility(requirements);
    const examiner = instructorProfile
        ? {
            id: instructorProfile.id,
            name:
                [instructorProfile.first_name, instructorProfile.last_name]
                    .filter(Boolean)
                    .join(" ") || instructorProfile.email,
        }
        : currentInstructor;
    const examinerProfile: InstructorProfile = {
        ...examiner,
        role: "Instructor",
    };

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
            return true;
        } catch {
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
                <div className="flex justify-end">
                    <DialogTrigger
                        render={<Button ref={gradingTriggerRef} disabled={!syllabus} />}
                    >
                        <Plus aria-hidden="true" />
                        New Grading
                    </DialogTrigger>
                </div>
                {syllabus && (
                    <DialogContent
                        finalFocus={gradingTriggerRef}
                        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5"
                    >
                        <DialogHeader className="shrink-0 gap-0 border-b border-border/60 px-8 py-6">
                            <DialogTitle className="pr-6 text-xl font-semibold tracking-tight">
                                New Grading
                            </DialogTitle>
                            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pt-4">
                                <div className="min-w-0 space-y-2">
                                    <DialogDescription className="break-words text-base font-medium text-foreground">
                                        {profile.name}
                                    </DialogDescription>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <GradeBadge
                                            rank={profile.rank}
                                            system={profile.gradingSystem}
                                        />
                                        {profile.nextRank && (
                                            <>
                                                <span
                                                    aria-hidden="true"
                                                    className="text-muted-foreground"
                                                >
                                                    →
                                                </span>
                                                <GradeBadge
                                                    rank={profile.nextRank}
                                                    system={profile.gradingSystem}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 pt-1 sm:justify-end">
                                    <span className="text-xs text-muted-foreground">
                                        Instructor:
                                    </span>
                                    <InstructorAvatar profile={examinerProfile} interactive={false} />
                                </div>
                            </div>
                        </DialogHeader>
                        <div className="min-h-0 overflow-y-auto overscroll-contain px-8 pt-5 pb-8 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70">
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
                                />
                            )}
                        </div>
                        <DialogFooter className="m-0 shrink-0 flex-row justify-end border-t border-border/60 px-8 py-5">
                            <DialogClose render={<Button className="min-h-10 min-w-24" />}>
                                Done
                            </DialogClose>
                        </DialogFooter>
                        <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
                            <DialogContent
                                initialFocus={keepEditingRef}
                                finalFocus={gradingOpen ? closeTriggerRef : gradingTriggerRef}
                                showCloseButton={false}
                            >
                                <DialogHeader>
                                    <DialogTitle>Finish grading review?</DialogTitle>
                                    <DialogDescription>
                                        Technique sign-offs and signatures are saved automatically
                                        as you edit. Confirm to close this grading review, or keep
                                        editing.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <DialogClose
                                        render={<Button ref={keepEditingRef} variant="outline" />}
                                    >
                                        Keep editing
                                    </DialogClose>
                                    <Button
                                        onClick={() => {
                                            setConfirmClose(false);
                                            setGradingOpen(false);
                                        }}
                                    >
                                        Confirm and close
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </DialogContent>
                )}
            </Dialog>
            <Card>
                <CardHeader>
                    <CardTitle>Grading eligibility</CardTitle>
                    {!syllabus && (
                        <CardDescription>
                            {profile.nextRank
                                ? "No published syllabus is recorded for the next configured rank."
                                : "No further grading level is configured for this grading system."}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
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
                                    "rounded-md px-2 py-1 text-xs font-medium",
                                    eligibility.label === "Eligible"
                                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                        : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
                                )}
                            >
                                {eligibility.metCount}/{requirements.length} requirements met
                            </span>
                        )}
                    </div>
                    {syllabus && (
                        <>
                            <ul className="space-y-2">
                                {requirements.map((requirement) => {
                                    const Icon =
                                        requirement.met === true
                                            ? CheckCircle2
                                            : requirement.met === false
                                                ? XCircle
                                                : CircleHelp;
                                    const tone =
                                        requirement.met === true
                                            ? success
                                            : requirement.met === false
                                                ? "text-destructive"
                                                : "text-muted-foreground";
                                    return (
                                        <li
                                            key={requirement.key}
                                            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-lg border border-border/70 bg-background/60 px-3 py-2"
                                        >
                                            <span className="flex min-w-0 items-start gap-2 text-sm">
                                                <Icon
                                                    aria-hidden="true"
                                                    className={cn("mt-0.5 size-4 shrink-0", tone)}
                                                />
                                                <span className="sr-only">
                                                    {requirement.met === true
                                                        ? "Met: "
                                                        : requirement.met === false
                                                            ? "Not met: "
                                                            : "Unverified: "}
                                                </span>
                                                {requirement.label}
                                            </span>
                                            <span className="ml-auto text-right text-xs tabular-nums">
                                                <span className={cn("font-medium", tone)}>
                                                    {requirement.actual}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {" "}
                                                    / {requirement.required}
                                                </span>
                                            </span>
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

function StudentInformation({ profile }: { profile: Profile }) {
    return (
        <Card size="sm" className="gap-3">
            <CardHeader className="gap-1.5">
                <h2 className="text-xs font-semibold text-muted-foreground">Student</h2>
                <CardTitle className="text-xl font-semibold group-data-[size=sm]/card:text-xl">
                    <h1>{profile.name}</h1>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{profile.studentNumber}</p>
                <div className="mt-2 space-y-1.5">
                    <p className="text-2xs text-muted-foreground">Current rank</p>
                    <GradeBadge
                        rank={profile.rank}
                        system={profile.gradingSystem}
                        showBeltLabel
                        className="px-3 py-1.5 text-base"
                    />
                    <p className="text-2xs text-muted-foreground">
                        {gradingSystems[profile.gradingSystem].label}
                    </p>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-3 border-t pt-3">
                    <div>
                        <dt className="text-xs text-muted-foreground">Principal dojo</dt>
                        <dd className="mt-0.5 flex items-center gap-1.5 text-xs">
                            <MapPin
                                aria-hidden="true"
                                className="size-3.5 text-muted-foreground"
                            />
                            {profile.principalDojo}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Membership</dt>
                        <dd
                            className={cn(
                                "mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                                profile.membershipStatus === "Active"
                                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                    : "bg-muted text-muted-foreground",
                            )}
                        >
                            {profile.membershipStatus}
                        </dd>
                    </div>
                </dl>
                <section
                    className="space-y-1.5 border-t pt-3"
                    aria-label="Contact information"
                >
                    <h2 className="text-xs font-semibold">Contact</h2>
                    <a
                        href={`mailto:${profile.email}`}
                        className="flex items-start gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <Mail aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                        <span className="break-all">{profile.email}</span>
                    </a>
                    <a
                        href={`tel:${profile.phone.replaceAll(" ", "")}`}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <Phone aria-hidden="true" className="size-3.5" />
                        {profile.phone}
                    </a>
                    <div className="space-y-1 pt-2" aria-label="Emergency contact">
                        <h3 className="text-2xs font-medium text-muted-foreground">
                            Emergency contact
                        </h3>
                        <p className="text-xs">
                            <span className="font-medium">
                                {profile.emergencyContact.name}
                            </span>
                            <span className="text-muted-foreground">
                                {" "}
                                · {profile.emergencyContact.relationship}
                            </span>
                        </p>
                        <a
                            href={`tel:${profile.emergencyContact.phone.replaceAll(" ", "")}`}
                            className="inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                            {profile.emergencyContact.phone}
                        </a>
                    </div>
                </section>
                <section
                    className="space-y-2 border-t pt-3"
                    aria-label="Medical alerts"
                >
                    <h2 className="flex items-center gap-1.5 text-xs font-semibold">
                        <HeartPulse aria-hidden="true" className="size-3.5" />
                        Medical alerts
                    </h2>
                    {profile.medicalAlerts.length ? (
                        profile.medicalAlerts.map((alert) => (
                            <p
                                key={alert}
                                className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                                {alert}
                            </p>
                        ))
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            No medical alerts noted.
                        </p>
                    )}
                </section>
            </CardContent>
        </Card>
    );
}

function NextGradingSummary({
    profile,
    assessmentRecorded,
    eligibility,
    onViewGrading,
}: {
    profile: Profile;
    assessmentRecorded: boolean;
    eligibility: string;
    onViewGrading: () => void;
}) {
    return (
        <section className="space-y-3">
            <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold">Next grading</h2>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onViewGrading}
                    className="ml-auto"
                >
                    View grading
                    <ChevronRight aria-hidden="true" />
                </Button>
            </div>
            <Card size="sm">
                <CardContent className="space-y-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                            <dt className="text-muted-foreground">Current rank</dt>
                            <dd className="mt-1">
                                <GradeBadge
                                    rank={profile.rank}
                                    system={profile.gradingSystem}
                                />
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Next rank</dt>
                            <dd className="mt-1">
                                {profile.nextRank ? (
                                    <GradeBadge
                                        rank={profile.nextRank}
                                        system={profile.gradingSystem}
                                    />
                                ) : (
                                    "Not configured"
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Eligibility</dt>
                            <dd className="mt-1 font-medium">{eligibility}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Technical assessment</dt>
                            <dd className="mt-1 font-medium">
                                {assessmentRecorded ? "Recorded" : "Not yet verified"}
                            </dd>
                        </div>
                    </dl>
                    <p className="text-2xs text-muted-foreground">
                        Eligibility is separate from technical assessment.
                    </p>
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
    const eligibility = syllabus
        ? gradingEligibility(requirements).label
        : profile.nextRank
            ? "Syllabus unavailable"
            : "No further grade";

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
        <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                    render={
                        <Link
                            to={context ? calendarHref(context) : "/instructor/students"}
                        />
                    }
                    nativeButton={false}
                    variant="ghost"
                    className="-ml-2"
                >
                    <ChevronLeft aria-hidden="true" />
                    {context ? "Back to calendar" : "Back to students"}
                </Button>
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
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
                <aside
                    ref={sidebarRef}
                    className={cn(
                        "order-2 min-w-0 lg:order-1",
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
                    className="order-1 min-w-0 gap-4 lg:order-2"
                >
                    <TabsList aria-label="Student training details" className="w-full">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="sessions">Sessions</TabsTrigger>
                        <TabsTrigger value="grading">Grading</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-5">
                        <section className="space-y-3">
                            <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                                <h2 className="text-sm font-semibold">Attendance</h2>
                                <p className="ml-auto text-right text-2xs text-muted-foreground">
                                    {periodStart && periodEnd
                                        ? `Reporting period: ${fullDate(periodStart)} – ${fullDate(periodEnd)}`
                                        : "No completed sessions recorded"}
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Card size="sm">
                                    <CardContent>
                                        <p className="text-xs text-muted-foreground">
                                            Attendance rate
                                        </p>
                                        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
                                            <span className="text-2xl font-semibold">
                                                {attendanceRate === null ? "—" : `${attendanceRate}%`}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                · {attended}/{markedSessions.length} sessions
                                            </span>
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card size="sm">
                                    <CardContent>
                                        <p className="text-xs text-muted-foreground">
                                            Last attended
                                        </p>
                                        <p className="mt-2 text-lg font-semibold tabular-nums">
                                            {lastAttended
                                                ? fullDate(lastAttended.event.date)
                                                : "Not recorded"}
                                        </p>
                                        <p className="mt-1 text-2xs text-muted-foreground">
                                            {lastAttended
                                                ? `${lastAttended.event.name} · ${lastAttended.event.dojo}`
                                                : "No attended sessions in this history"}
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                            {consecutiveAbsences >= 2 && (
                                <p
                                    role="status"
                                    className="flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
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
                        <section className="space-y-3">
                            <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                                <h2 className="text-sm font-semibold">
                                    Recent lesson feedback
                                </h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => selectTab("sessions")}
                                    className="ml-auto"
                                >
                                    All sessions
                                    <ChevronRight aria-hidden="true" />
                                </Button>
                            </div>
                            <Card size="sm">
                                <CardContent className="space-y-4">
                                    {recentFeedback.length ? (
                                        recentFeedback.map((session) => (
                                            <article
                                                key={session.event.id}
                                                className="border-l-2 pl-3"
                                            >
                                                <p className="text-xs font-medium">
                                                    {session.event.name}{" "}
                                                    <span className="font-normal text-muted-foreground">
                                                        · {fullDate(session.event.date)} ·{" "}
                                                        {session.reportAuthor?.name ?? session.instructor}
                                                    </span>
                                                </p>
                                                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                                    {session.feedback}
                                                </p>
                                            </article>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            No feedback recorded yet. Add notes from the Sessions tab.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </section>
                        <NextGradingSummary
                            profile={profile}
                            assessmentRecorded={assessmentRecorded}
                            eligibility={eligibility}
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

                    <TabsContent value="grading" className="space-y-4">
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
                        <StudentGrading
                            profile={profile}
                            syllabus={syllabus}
                            requirements={requirements}
                            signOffs={signOffs}
                            onSignOffsChange={setSignOffs}
                        />
                        <Card>
                            <CardHeader>
                                <CardTitle>Previous grading assessments</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {gradingHistory.length ? (
                                    gradingHistory.map((assessment) => (
                                        <article key={assessment.id} className="border-l-2 pl-3">
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
                                                    <p className="mt-1 text-2xs text-muted-foreground">
                                                        {fullDate(assessment.date)} ·{" "}
                                                        {assessment.instructor}
                                                    </p>
                                                </div>
                                                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-2xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                                    {assessment.status}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                                {assessment.feedback}
                                            </p>
                                        </article>
                                    ))
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        No previous grading assessments. The first assessment will
                                        appear here.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
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
