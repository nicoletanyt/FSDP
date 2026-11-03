import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen } from 'lucide-react'
import { NativeSelect } from '@/components/admin/form-controls'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { syllabusParts } from '@/lib/admin/syllabus'
import type {
  GradeSyllabus,
  SyllabusCell,
  SyllabusColumn,
  SyllabusPart,
  SyllabusPartId,
} from '@/lib/admin/syllabus'
import type { Grade } from '@/lib/admin/types'
import { cn } from 'cn'

function countItems(part: SyllabusPart): number {
  return part.rows.reduce(
    (total, row) =>
      total + row.cells.reduce((rowTotal, cell) => rowTotal + cell.items.length, 0),
    0,
  )
}

function countRowItems(row: GradeSyllabus): number {
  return row.cells.reduce((total, cell) => total + cell.items.length, 0)
}

export default function Syllabus() {
  const [partId, setPartId] = useState<SyllabusPartId>('children-1')
  const part = syllabusParts.find((entry) => entry.id === partId) ?? syllabusParts[0]
  const [selectedGrade, setSelectedGrade] = useState<Grade>(part.rows[0].grade)

  const columnOrder = useMemo(
    () => new Map(part.columns.map((column, index) => [column.id, index])),
    [part],
  )
  const cellsByColumn = useMemo(
    () =>
      new Map<string, Map<SyllabusColumn['id'], SyllabusCell>>(
        part.rows.map((row) => [
          row.grade,
          new Map(row.cells.map((cell) => [cell.column, cell])),
        ]),
      ),
    [part],
  )

  const selectedRow =
    part.rows.find((row) => row.grade === selectedGrade) ?? part.rows[0]

  function selectPart(nextId: SyllabusPartId) {
    const nextPart = syllabusParts.find((entry) => entry.id === nextId)
    if (!nextPart) return
    setPartId(nextId)
    setSelectedGrade(nextPart.rows[0].grade)
  }

  function rowCells(row: GradeSyllabus): ReactNode[] {
    const cells =
      cellsByColumn.get(row.grade) ??
      new Map<SyllabusColumn['id'], SyllabusCell>()
    const rendered: ReactNode[] = []
    for (let index = 0; index < part.columns.length; index++) {
      const column = part.columns[index]
      const cell = cells.get(column.id)
      if (cell) {
        rendered.push(
          <TableCell
            key={cell.column}
            colSpan={cell.span}
            className="min-w-36 align-top"
          >
            <ul className="space-y-1">
              {cell.items.map((item) => (
                <li key={item.id} className="text-xs leading-snug">
                  <span>{item.label}</span>
                  {item.note && (
                    <span className="text-muted-foreground"> · {item.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </TableCell>,
        )
        if (cell.span) index += cell.span - 1
      } else {
        rendered.push(
          <TableCell key={column.id} className="align-top">
            <span className="text-xs text-muted-foreground/40">—</span>
          </TableCell>,
        )
      }
    }
    return rendered
  }

  function columnLabel(columnId: SyllabusColumn['id']): string {
    return (
      part.columns.find((column) => column.id === columnId)?.label ?? columnId
    )
  }

  return (
    <div className="space-y-6">
      <nav
        aria-label="Syllabus parts"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {syllabusParts.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => selectPart(entry.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-left text-sm font-medium transition-colors',
              entry.id === part.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.title}
            <span className="block text-xs font-normal text-muted-foreground">
              {entry.subtitle} · {countItems(entry)} items
            </span>
          </button>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            {part.title}
          </CardTitle>
          <CardDescription>
            {part.rows.length} grades · {part.columns.length} columns ·{' '}
            {countItems(part)} printed sub-items
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            {part.notes.map((note) => (
              <li key={note} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {note}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <Table className="min-w-max">
            <TableCaption className="sr-only">
              {part.title} — technique columns by grade
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 bg-card">Grade</TableHead>
                {part.columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className="min-w-36 whitespace-nowrap align-bottom text-xs"
                  >
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {part.rows.map((row) => (
                <TableRow
                  key={row.grade}
                  data-state={row.grade === selectedRow.grade ? 'selected' : undefined}
                  className={cn(
                    'cursor-pointer',
                    row.grade === selectedRow.grade && 'bg-primary/5',
                  )}
                  onClick={() => setSelectedGrade(row.grade)}
                >
                  <TableCell className="sticky left-0 z-10 bg-card align-top">
                    <button
                      type="button"
                      className="text-left font-medium hover:text-primary"
                      onClick={() => setSelectedGrade(row.grade)}
                    >
                      {row.grade}
                    </button>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {countRowItems(row)} items
                    </span>
                  </TableCell>
                  {rowCells(row)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{selectedRow.grade}</CardTitle>
              <CardDescription>
                {selectedRow.track === 'children' ? "Children's" : 'Adult'}{' '}
                syllabus · {countRowItems(selectedRow)} items in{' '}
                {selectedRow.cells.length} cells
              </CardDescription>
            </div>
            <div className="w-56">
              <NativeSelect
                value={selectedRow.grade}
                onChange={(event) =>
                  setSelectedGrade(event.target.value as Grade)
                }
                aria-label="Choose a grade to inspect"
              >
                {part.rows.map((row) => (
                  <option key={row.grade} value={row.grade}>
                    {row.grade}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...selectedRow.cells]
              .sort(
                (left, right) =>
                  (columnOrder.get(left.column) ?? 99) -
                  (columnOrder.get(right.column) ?? 99),
              )
              .map((cell) => (
                <div
                  key={cell.column}
                  className="rounded-lg border border-border/70 bg-background/60 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {columnLabel(cell.column)}
                    </p>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {cell.items.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    “{cell.source}”
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {cell.items.map((item) => (
                      <li key={item.id}>
                        <span className="font-medium">{item.label}</span>
                        {item.note && (
                          <span className="text-muted-foreground"> · {item.note}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
