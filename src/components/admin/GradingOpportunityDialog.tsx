import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { daysAheadIso, todayIso } from '@/lib/admin/format'
import { countEligibleForOpportunity } from '@/lib/admin/grading-eligibility'
import { grades } from '@/lib/admin/types'
import type { Grade } from '@/lib/admin/types'
import { Field, NativeSelect } from './form-controls'

export default function GradingOpportunityDialog({
  open,
  onOpenChange,
  defaultCentreId = 'all',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCentreId?: string
}) {
  const {
    centres,
    instructors,
    students,
    attendance,
    sessions,
    createOpportunity,
    sendNotification,
  } = useAdminData()
  const firstCentre = centres[0]?.id ?? ''
  const [centreId, setCentreId] = useState(
    defaultCentreId === 'all' ? firstCentre : defaultCentreId,
  )
  const [instructorId, setInstructorId] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(daysAheadIso(21))
  const [deadline, setDeadline] = useState(daysAheadIso(10))
  const [targetGrades, setTargetGrades] = useState<Grade[]>(['5th Kyu'])
  const [notifyNow, setNotifyNow] = useState(true)

  const availableInstructors = useMemo(
    () => instructors.filter((instructor) => instructor.centreIds.includes(centreId)),
    [centreId, instructors],
  )

  useEffect(() => {
    if (!open) return
    const nextCentre = defaultCentreId === 'all' ? firstCentre : defaultCentreId
    setCentreId(nextCentre)
    setInstructorId(
      instructors.find((instructor) => instructor.centreIds.includes(nextCentre))?.id ??
        instructors[0]?.id ??
        '',
    )
    setTitle('')
    setDate(daysAheadIso(21))
    setDeadline(daysAheadIso(10))
    setTargetGrades(['5th Kyu'])
    setNotifyNow(true)
  }, [open, defaultCentreId, firstCentre, instructors])

  const eligibleCount = countEligibleForOpportunity(
    students,
    attendance,
    sessions,
    centreId,
    targetGrades,
  )

  function toggleGrade(grade: Grade) {
    setTargetGrades((current) =>
      current.includes(grade)
        ? current.filter((item) => item !== grade)
        : [...current, grade],
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const finalTitle = title.trim() || 'Grading opportunity'
    createOpportunity({
      title: finalTitle,
      centreId,
      instructorId,
      date,
      applicationDeadline: deadline,
      targetGrades,
    })
    if (notifyNow && eligibleCount > 0) {
      sendNotification({
        channel: 'email',
        template: 'Grading invitation',
        audience: `${finalTitle} — eligible students`,
        recipientCount: eligibleCount,
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="size-4 text-primary" aria-hidden="true" />
            New grading opportunity
          </DialogTitle>
          <DialogDescription>
            Create a grading event, assign the assessing instructor, and invite eligible
            students to apply.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title" htmlFor="opportunity-title">
            <Input
              id="opportunity-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Autumn grading — Bukit Timah"
              required
              maxLength={100}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Centre" htmlFor="opportunity-centre">
              <NativeSelect
                id="opportunity-centre"
                value={centreId}
                onChange={(event) => {
                  const next = event.target.value
                  setCentreId(next)
                  setInstructorId(
                    instructors.find((instructor) =>
                      instructor.centreIds.includes(next),
                    )?.id ??
                      instructors[0]?.id ??
                      '',
                  )
                }}
                required
              >
                {centres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Assessing instructor" htmlFor="opportunity-instructor">
              <NativeSelect
                id="opportunity-instructor"
                value={instructorId}
                onChange={(event) => setInstructorId(event.target.value)}
                required
              >
                {(availableInstructors.length ? availableInstructors : instructors).map(
                  (instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.firstName} {instructor.lastName}
                    </option>
                  ),
                )}
              </NativeSelect>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Grading date" htmlFor="opportunity-date">
              <Input
                id="opportunity-date"
                type="date"
                min={todayIso()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>
            <Field label="Application deadline" htmlFor="opportunity-deadline">
              <Input
                id="opportunity-deadline"
                type="date"
                min={todayIso()}
                max={date}
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                required
              />
            </Field>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Target grades</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {grades.map((grade) => (
                <label
                  key={grade}
                  className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-[var(--primary)]"
                    checked={targetGrades.includes(grade)}
                    onChange={() => toggleGrade(grade)}
                  />
                  {grade}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {eligibleCount} {eligibleCount === 1 ? 'student is' : 'students are'} eligible
              for the selected grades at this centre.
            </p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 rounded border-input accent-[var(--primary)]"
                checked={notifyNow}
                onChange={(event) => setNotifyNow(event.target.checked)}
              />
              Notify eligible students when this opportunity is created
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={targetGrades.length === 0}>
              Create opportunity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
