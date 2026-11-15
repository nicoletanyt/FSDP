import { cn } from "@/lib/utils";
import { getGradeMeta, grades, UNRANKED } from "@/lib/admin/types";
import type { Grade, GradeTrack, RankedGrade } from "@/lib/admin/types";
import type { GradeRow } from "@/lib/instructor/types";
import {
    belts,
    formatRank,
    getGrade,
    gradingSystems,
} from "@/lib/student-grades";
import type { GradingSystemId, RankId } from "@/lib/student-grades";

/*
 * Every grade badge in the app, by what the caller has:
 * - GradeBadge (default): a rank id and grading system (student pages).
 * - DatabaseGradeBadge: a grades table row, or gradeFromId() for a bare id.
 * - AdminGradeBadge / GradeLabelBadge: an admin grade label like "Red (12th Kyu)".
 * All three draw the same badge.
 */

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
            className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-2xs text-foreground",
                showBeltLabel && "flex-wrap",
                className,
            )}
        >
            <span className="font-semibold whitespace-nowrap">{label}</span>
            {belt && (
                <>
                    <span
                        aria-hidden="true"
                        className={cn("order-first size-3 shrink-0 rounded-xs border", belt.indicator)}
                    />
                    <span
                        className={
                            showBeltLabel ? "text-xs font-normal opacity-75" : "sr-only"
                        }
                    >
                        {showBeltLabel ? "" : " · "}
                        {belt.label}
                    </span>
                </>
            )}
        </span>
    );
}

/* ---- From a database grade row ---- */

// The belt swatch for a database grade, from its colour. Null when unknown.
export function beltFor(grade: Pick<GradeRow, 'colour'> | null) {
  const colour = grade?.colour?.toLowerCase()
  return colour && Object.hasOwn(belts, colour) ? belts[colour as keyof typeof belts] : null
}

type BadgeGrade = Pick<GradeRow, 'id' | 'label' | 'colour'>

const capitalise = (word: string) => word ? word[0].toUpperCase() + word.slice(1) : word

/** A grade from its database id (e.g. "blue-gold-5th-kyu" → "Blue-Gold (5th Kyu)"). */
export function gradeFromId(id: string | null | undefined): BadgeGrade | null {
  if (!id || id === 'unranked') return id ? { id, label: 'Unranked', colour: null } : null
  const kyu = id.match(/^(.*)-(\d+(?:st|nd|rd|th))-kyu$/)
  if (kyu) {
    const colour = kyu[1].split('-').map(capitalise).join('-')
    return { id, label: `${colour} (${kyu[2]} Kyu)`, colour }
  }
  return { id, label: id.split('-').map(capitalise).join(' '), colour: 'Black' }
}

export function DatabaseGradeBadge({ grade, showBeltLabel = false, className }: {
  grade: BadgeGrade | null
  showBeltLabel?: boolean
  className?: string
}) {
  const belt = beltFor(grade)
  const label = grade?.label ?? 'Grade not recorded'
  const rank = belt ? label.match(/\(([^()]*(?:Kyu|Dan)[^()]*)\)$/i)?.[1] ?? label : label
  return <span data-slot="grade-badge" data-grade-id={grade?.id} title={`${label}${grade?.colour ? ` · ${grade.colour}` : ''}`}
    className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-2xs text-foreground', showBeltLabel && 'flex-wrap', className)}>
    <span className="font-semibold whitespace-nowrap">{rank}</span>
    {grade?.colour && <>
      {belt && <span aria-hidden="true" className={cn('order-first size-3 shrink-0 rounded-xs border', belt.indicator)} />}
      <span className={showBeltLabel ? 'text-xs font-normal opacity-75' : 'sr-only'}>{showBeltLabel ? '' : ' · '}{grade.colour}</span>
    </>}
  </span>
}

/* ---- From an admin grade label ---- */

const ranks = {
  'Red (12th Kyu)': '12-kyu',
  'Red-Gold (11th Kyu)': '11-kyu',
  'Yellow (10th Kyu)': '10-kyu',
  'Orange (9th Kyu)': '9-kyu',
  'Green (8th Kyu)': '8-kyu',
  'Purple (7th Kyu)': '7-kyu',
  'Blue (6th Kyu)': '6-kyu',
  'Blue-Silver (6th Kyu)': '6-kyu-silver',
  'Blue-Gold (5th Kyu)': '5-kyu',
  'Brown (4th Kyu)': '4-kyu',
  'Brown-Silver (4th Kyu)': '4-kyu-silver',
  'Brown-Gold (3rd Kyu)': '3-kyu',
  'Black (2nd Kyu)': '2-kyu',
  'Black-Silver (2nd Kyu)': '2-kyu-silver',
  'Black-Gold (1st Kyu)': '1-kyu',
  'Junior Dan': 'junior-dan',
  '1st Dan': '1-dan',
  '2nd Dan': '2-dan',
  '3rd Dan': '3-dan',
  '4th Dan': '4-dan',
} satisfies Record<RankedGrade, RankId>

export function AdminGradeBadge({ grade, track }: { grade: Grade; track: GradeTrack }) {
  if (grade === 'Unranked') {
    return <span className="inline-flex rounded-md border bg-background px-2 py-0.5 text-2xs font-semibold">Unranked</span>
  }

  return <GradeBadge rank={ranks[grade]} system={track === 'adult' ? 'adults' : 'children'} />
}

/** A grade from its stored label (e.g. "Red (12th Kyu)"); unknown labels keep the badge frame. */
export function GradeLabelBadge({ label, track }: { label: string | null | undefined; track?: GradeTrack }) {
  if (!label) return <GradeBadge rank={null} system={track === 'adult' ? 'adults' : 'children'} />
  if (label !== UNRANKED && !grades.includes(label as (typeof grades)[number])) {
    return <span className="inline-flex rounded-md border bg-background px-2 py-0.5 text-2xs font-semibold">{label}</span>
  }
  const grade = label as Grade
  return <AdminGradeBadge grade={grade} track={track ?? (getGradeMeta(grade)?.tracks.includes('adult') ? 'adult' : 'children')} />
}
