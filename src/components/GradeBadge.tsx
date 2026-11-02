import { belts, formatRank, getGrade, gradingSystems } from "@/lib/student-grades";
import type { GradingSystemId, RankId } from "@/lib/student-grades";
import { cn } from "@/lib/utils";

export default function GradeBadge({
    rank,
    system,
    showBeltLabel = false,
    className,
}: {
    rank: RankId | null | undefined;
    system: GradingSystemId;
    showBeltLabel?: boolean;
    className?: string;
}) {
    const grade = getGrade(system, rank);
    const label = grade ? formatRank(grade.rank) : "Rank not recorded";
    const belt = grade ? belts[grade.belt] : null;

    return (
        <span
            data-slot="grade-badge"
            data-rank={grade?.rank}
            data-grading-system={system}
            title={`${label}${belt ? ` · ${belt.label}` : ""} · ${gradingSystems[system].label}`}
            className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-2xs text-foreground", showBeltLabel && "flex-wrap", className)}
        >
            <span className="font-semibold whitespace-nowrap">{label}</span>
            {belt && <>
                <span aria-hidden="true" className={cn("h-2 w-4 shrink-0 rounded-xs border", belt.indicator)} />
                <span className={showBeltLabel ? "text-xs font-normal opacity-75" : "sr-only"}>
                    {showBeltLabel ? "" : " · "}{belt.label}
                </span>
            </>}
        </span>
    );
}
