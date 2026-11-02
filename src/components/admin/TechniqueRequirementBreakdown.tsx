import { CheckCircle2, XCircle } from 'lucide-react'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { studentTrack } from '@/lib/admin/grading-eligibility'
import { getGradeSyllabus, getSyllabusPart } from '@/lib/admin/syllabus'
import type { Grade, Student } from '@/lib/admin/types'
import { cn } from 'cn'

/**
 * Read-only view of the target grade's technique row, grouped by syllabus
 * column. Used beside the eligibility checklist so staff can see which
 * categories still have unsigned items.
 */
export default function TechniqueRequirementBreakdown({
  student,
  targetGrade,
}: {
  student: Student
  targetGrade: Grade
}) {
  const { techniqueSignOffs } = useAdminData()
  const track = studentTrack(student)
  const row = getGradeSyllabus(targetGrade, track)
  const items = row?.cells.flatMap((cell) => cell.items) ?? []
  if (!row || items.length === 0) return null

  const signedIds = new Set(
    techniqueSignOffs
      .filter((signOff) => signOff.studentId === student.id)
      .map((signOff) => signOff.itemId),
  )
  const signedCount = items.filter((item) => signedIds.has(item.id)).length

  const columns = getSyllabusPart(row.part).columns
  const columnOrder = new Map(
    columns.map((column, index) => [column.id, index]),
  )
  const orderedCells = [...row.cells].sort(
    (left, right) =>
      (columnOrder.get(left.column) ?? 99) - (columnOrder.get(right.column) ?? 99),
  )

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Target-grade techniques
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {signedCount}/{items.length}
        </span>
      </div>
      <div className="grid gap-2">
        {orderedCells.map((cell) => {
          const column = columns.find((entry) => entry.id === cell.column)
          const cellSigned = cell.items.filter((item) =>
            signedIds.has(item.id),
          ).length
          return (
            <section
              key={cell.column}
              className="rounded-lg border border-border/70 bg-background/60 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {column?.label ?? cell.column}
                </h4>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {cellSigned}/{cell.items.length}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {cell.items.map((item) => {
                  const signed = signedIds.has(item.id)
                  return (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      {signed ? (
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
                      <span className={cn('min-w-0', !signed && 'font-medium')}>
                        {item.label}
                        {item.note && (
                          <span className="text-muted-foreground"> · {item.note}</span>
                        )}
                      </span>
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
