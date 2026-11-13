import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { AdminGradeBadge } from "@/components/shared/grade/GradeBadge";
import FilterCombobox from "@/components/shared/filters/FilterCombobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    formatMonths,
    getGradeRequirement,
} from "@/lib/admin/grading-eligibility";
import { syllabusParts } from "@/lib/admin/syllabus";
import type {
    GradeSyllabus,
    SyllabusCell,
    SyllabusColumn,
    SyllabusGroup,
} from "@/lib/admin/syllabus";
import type { GradeTrack } from "@/lib/admin/types";
import { cn } from "cn";

const tracks: { value: GradeTrack; label: string }[] = [
    { value: "children", label: "Children" },
    { value: "adult", label: "Adults" },
];

const trackNotes: Record<GradeTrack, string> = {
    children:
        "Children start at Red from age 5. Numbers in brackets, like “8 different throws”, are the minimum to show.",
    adult:
        "Adults start at Blue (6th Kyu). From 2nd Dan, candidates aged 50 and over take 20 ukemis instead of 30.",
};

const groupOrder: { group: SyllabusGroup | "requirements"; label: string }[] = [
    { group: "requirements", label: "Requirements" },
    { group: "body", label: "Body and movement" },
    { group: "technique", label: "Techniques" },
    { group: "free", label: "Free practice" },
    { group: "weapon", label: "Weapons" },
];

type Step = { row: GradeSyllabus; columns: Map<string, SyllabusColumn> };

// One belt ladder per track. The children's sheets are printed in two parts;
// here they read as one continuous ladder.
function ladderFor(track: GradeTrack): Step[] {
    return syllabusParts
        .filter((part) => part.track === track)
        .flatMap((part) =>
            part.rows.map((row) => ({
                row,
                columns: new Map(part.columns.map((column) => [column.id, column])),
            })),
        );
}

export default function BeltRequirements() {
    const [track, setTrack] = useState<GradeTrack>("children");
    const ladder = useMemo(() => ladderFor(track), [track]);
    const [index, setIndex] = useState(0);
    const step = ladder[Math.min(index, ladder.length - 1)];

    // A technique is "new" when no lower belt on this ladder includes it.
    const seenBefore = useMemo(
        () =>
            new Set(
                ladder
                    .slice(0, index)
                    .flatMap((earlier) => earlier.row.cells.map((cell) => cell.column)),
            ),
        [ladder, index],
    );

    // One list for the grade, in the printed order: requirements, body, techniques, free, weapons.
    const rows = groupOrder.flatMap(({ group }) =>
        step.row.cells.filter(
            (cell) =>
                (cell.span ? "requirements" : step.columns.get(cell.column)?.group) ===
                group,
        ),
    );

    const requirement = getGradeRequirement(step.row.grade, step.row.track);
    const techniqueCount = step.row.cells.reduce(
        (total, cell) => total + cell.items.length,
        0,
    );
    const facts = requirement
        ? [
              ...(requirement.minAge !== undefined
                  ? [{ label: "Minimum age", value: String(requirement.minAge) }]
                  : []),
              ...(requirement.maxAge !== undefined
                  ? [{ label: "Maximum age", value: String(requirement.maxAge) }]
                  : []),
              ...(requirement.minMonths > 0
                  ? [{ label: "Time at current belt", value: formatMonths(requirement.minMonths, requirement.maxMonths) }]
                  : []),
              ...(requirement.sessions !== undefined
                  ? [{ label: "Training sessions", value: `${requirement.sessions} since last grading` }]
                  : []),
          ]
        : [];

    // ← / → step through belts, unless typing or a menu/dialog is open.
    const latest = useRef({ index, last: ladder.length - 1 });
    useEffect(() => {
        latest.current = { index, last: ladder.length - 1 };
    });
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey
            )
                return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            const target = event.target;
            if (
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    target.closest(
                        'input, textarea, select, [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"], [role="tablist"]',
                    ))
            )
                return;
            const { index: current, last } = latest.current;
            const next = event.key === "ArrowLeft" ? current - 1 : current + 1;
            if (next < 0 || next > last) return;
            event.preventDefault();
            setIndex(next);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    function chooseTrack(next: GradeTrack) {
        setTrack(next);
        setIndex(0);
    }

    function cellLabel(cell: SyllabusCell) {
        return cell.span
            ? "Requirements"
            : (step.columns.get(cell.column)?.label ?? cell.column);
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Phones: two rows, the belt row sticky. Desktop: one row (switch · belt · info). */}
            <div className="flex flex-col gap-4 max-lg:contents lg:flex-row lg:items-center lg:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 lg:contents">
                    <div
                        role="group"
                        aria-label="Grading track"
                        className="inline-flex rounded-lg border bg-muted/40 p-1 lg:order-1"
                    >
                        {tracks.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                aria-pressed={track === item.value}
                                onClick={() => chooseTrack(item.value)}
                                className={cn(
                                    "h-9 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                                    track === item.value
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <Popover>
                        <PopoverTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-touch"
                                    className="ml-auto lg:order-3"
                                    aria-label="About belt requirements"
                                />
                            }
                        >
                            <Info
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                            />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 text-sm">
                            {trackNotes[track]}
                        </PopoverContent>
                    </Popover>
                </div>

                {/* The belt row stays in view under the top bar on phones and tablets. */}
                <div className="flex items-center gap-2 lg:order-2 max-lg:sticky max-lg:top-[var(--mobile-site-nav-height)] max-lg:z-20 max-lg:-mx-4 max-lg:bg-background/95 max-lg:px-4 max-lg:py-2 max-lg:backdrop-blur sm:max-lg:-mx-6 sm:max-lg:px-6">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-touch"
                        disabled={index === 0}
                        aria-label={
                            index > 0
                                ? `Previous belt: ${ladder[index - 1].row.grade}`
                                : "Previous belt"
                        }
                        title="Previous belt (←)"
                        aria-keyshortcuts="ArrowLeft"
                        onClick={() => setIndex(index - 1)}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </Button>
                    <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
                        <FilterCombobox
                            value={String(index)}
                            onChange={(value) => setIndex(Number(value))}
                            ariaLabel="Belt"
                            searchable={false}
                            className="h-11 lg:h-10"
                            options={ladder.map(({ row }, position) => ({
                                value: String(position),
                                label: row.grade,
                            }))}
                            renderOption={(option) => {
                                const row = ladder[Number(option.value)]?.row;
                                return row ? (
                                    <AdminGradeBadge grade={row.grade} track={row.track} />
                                ) : (
                                    option.label
                                );
                            }}
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-touch"
                        disabled={index >= ladder.length - 1}
                        aria-label={
                            index < ladder.length - 1
                                ? `Next belt: ${ladder[index + 1].row.grade}`
                                : "Next belt"
                        }
                        title="Next belt (→)"
                        aria-keyshortcuts="ArrowRight"
                        onClick={() => setIndex(index + 1)}
                    >
                        <ChevronRight aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {/* Card 1: the entry rules for this belt. Card 2: the techniques to show. */}
            {facts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle id="belt-requirements">Grading requirements</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl
                            aria-labelledby="belt-requirements"
                            className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4"
                        >
                            {facts.map(({ label, value }) => (
                                <div key={label} className="space-y-1">
                                    <dt className="text-sm text-muted-foreground">{label}</dt>
                                    <dd className="text-base font-medium">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle id="belt-techniques">Techniques to show</CardTitle>
                    {techniqueCount > 0 && (
                        <CardDescription>
                            All {techniqueCount} must be signed off before grading.
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent>
                    <dl
                        aria-labelledby="belt-techniques"
                        className="lg:columns-2 lg:gap-12 [&>div:last-child]:border-b-0"
                    >
                        {rows.map((cell) => (
                            <div
                                key={cell.column}
                                className="grid break-inside-avoid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-b border-border/50 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6"
                            >
                                <dt className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 self-start text-sm text-muted-foreground [overflow-wrap:anywhere]">
                                    {cellLabel(cell)}
                                    {!cell.span && !seenBefore.has(cell.column) && index > 0 && (
                                        <span className="rounded-full bg-primary/10 px-1.5 text-2xs leading-4 font-medium text-primary">
                                            New
                                        </span>
                                    )}
                                </dt>
                                <dd className="text-sm">
                                    <ul className="space-y-1">
                                        {cell.items.map((item) => (
                                            <li key={item.id}>
                                                {item.label}
                                                {item.note && (
                                                    <span className="text-muted-foreground">
                                                        {" "}
                                                        ({item.note})
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </CardContent>
            </Card>
        </div>
    );
}
