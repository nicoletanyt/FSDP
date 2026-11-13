import { Fragment } from 'react'
import type { ReactNode } from 'react'

export interface ChecklistStudent {
  student_id: string
  candidate_number: number
  name: string
}

export interface ChecklistItem {
  syllabus_item_id: string
  category: string
  label: string
}

// Category rows use an opaque half-tint so the sticky first cell hides what
// scrolls beneath it while staying lighter than the header.
// Students across, techniques down. Each category is named once above its
// techniques, and comments are the last row. The technique column stays put
// while the table scrolls sideways.
export default function GradingChecklistTable<S extends ChecklistStudent, I extends ChecklistItem>({ students, items, cell, comment, headerBadge, nameAdornment, columnDisabled, label = 'Grading checklist table' }: {
  label?: string
  students: S[]
  items: I[]
  cell: (student: S, item: I) => ReactNode
  comment: (student: S) => ReactNode
  /** Optional pill above a student's candidate number (e.g. Absent). */
  headerBadge?: (student: S) => ReactNode
  /** Optional icon after a student's name in the header (e.g. Endorsed). */
  nameAdornment?: (student: S) => ReactNode
  /** Greys out a student's whole column; the cell renderers disable its inputs. */
  columnDisabled?: (student: S) => boolean
}) {
  const muted = (student: S) => columnDisabled?.(student) ? 'bg-muted/40 text-muted-foreground' : ''
  return (
    <div className="overflow-x-auto rounded-lg border" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            <th scope="col" className="sticky left-0 z-10 min-w-36 border-b bg-muted px-4 py-3 text-left align-bottom font-semibold sm:min-w-44">
              Technique
            </th>
            {students.map(student => (
              <th scope="col" key={student.student_id} data-disabled={columnDisabled?.(student) || undefined}
                className={`min-w-36 border-b border-l px-3 py-3 text-center align-bottom font-medium ${muted(student)}`}>
                {headerBadge?.(student)}
                <span className="block text-xs tabular-nums text-muted-foreground" data-candidate-number>{student.candidate_number}</span>
                <span className="inline-flex items-center justify-center gap-1">{student.name}{nameAdornment?.(student)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <Fragment key={item.syllabus_item_id}>
              {item.category !== items[index - 1]?.category && (
                <tr className="border-b bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]" data-category-row>
                  <th scope="rowgroup" className="sticky left-0 z-10 bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                    {item.category}
                  </th>
                  <td colSpan={students.length} />
                </tr>
              )}
              <tr className="border-b">
                <th scope="row" className="sticky left-0 z-10 bg-background px-4 py-3 text-left font-medium">{item.label}</th>
                {students.map(student => (
                  <td key={student.student_id} className={`border-l text-center ${muted(student)}`}>{cell(student, item)}</td>
                ))}
              </tr>
            </Fragment>
          ))}
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-background px-4 py-3 text-left align-top font-medium">Comments</th>
            {students.map(student => (
              <td key={student.student_id} className={`border-l px-3 py-2 align-top ${muted(student)}`}>{comment(student)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
