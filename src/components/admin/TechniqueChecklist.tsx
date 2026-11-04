import { CheckCircle2 } from 'lucide-react'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { formatDate } from '@/lib/admin/format'
import { studentAge, studentTrack } from '@/lib/admin/grading-eligibility'
import {
  getGradeSyllabus,
  getSyllabusPart,
} from '@/lib/admin/syllabus'
import { nextGrade } from '@/lib/admin/types'
import type { Student } from '@/lib/admin/types'
import { cn } from 'cn'

export default function TechniqueChecklist({ student }: { student: Student }) {
  const { techniqueSignOffs, signOffTechnique, clearTechniqueSignOff } =
    useAdminData()
  const track = studentTrack(student)
  const target = nextGrade(student.currentGrade, track, studentAge(student))

  if (!target) {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-4 text-sm">
        <p className="font-medium">No further grading on this ladder</p>
        <p className="mt-1 text-muted-foreground">
          {track === 'children'
            ? 'Children’s grading ends at 2nd Kyu (Black-Silver). The student moves to the adult syllabus at 13 (by year).'
            : 'This student has reached the highest published grade (4th Dan).'}
        </p>
      </div>
    )
  }

  const row = getGradeSyllabus(target, track)
  const items = row?.cells.flatMap((cell) => cell.items) ?? []
  if (!row || items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No syllabus items are recorded for {target}.
      </p>
    )
  }

  const signOffByItem = new Map(
    techniqueSignOffs
      .filter((signOff) => signOff.studentId === student.id)
      .map((signOff) => [signOff.itemId, signOff]),
  )
  const signedCount = items.filter((item) => signOffByItem.has(item.id)).length
  const complete = signedCount === items.length

  const columns = getSyllabusPart(row.part).columns
  const columnOrder = new Map(
    columns.map((column, index) => [column.id, index]),
  )
  const orderedCells = [...row.cells].sort(
    (left, right) =>
      (columnOrder.get(left.column) ?? 99) - (columnOrder.get(right.column) ?? 99),
  )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">
            {signedCount} of {items.length} {target} techniques signed off
          </span>
          {complete && (
            <span className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Complete
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              complete ? 'bg-success' : 'bg-primary',
            )}
            style={{ width: `${(signedCount / items.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Only the {target} row is required. Earlier grades are treated as
          completed history.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {orderedCells.map((cell) => {
          const column = columns.find((entry) => entry.id === cell.column)
          const cellSigned = cell.items.filter((item) =>
            signOffByItem.has(item.id),
          ).length
          return (
            <section
              key={cell.column}
              className="rounded-lg border border-border/70 bg-background/60 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {column?.label ?? cell.column}
                </h4>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {cellSigned}/{cell.items.length}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {cell.items.map((item) => {
                  const signOff = signOffByItem.get(item.id)
                  const checked = Boolean(signOff)
                  return (
                    <li key={item.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors',
                          checked
                            ? 'border-success/40 bg-success/5'
                            : 'border-border/70 hover:bg-muted/40',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
                          checked={checked}
                          onChange={() =>
                            checked
                              ? clearTechniqueSignOff(student.id, item.id)
                              : signOffTechnique(student.id, item.id)
                          }
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{item.label}</span>
                          {item.note && (
                            <span className="text-muted-foreground"> · {item.note}</span>
                          )}
                          {signOff && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {formatDate(signOff.signedOffAt.slice(0, 10))} ·{' '}
                              {signOff.signedOffBy}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
