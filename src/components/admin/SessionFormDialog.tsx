import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarPlus, MapPin } from 'lucide-react'
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
import { todayIso } from '@/lib/admin/format'
import type { SessionType } from '@/lib/admin/types'
import { Field, NativeSelect } from './form-controls'

export default function SessionFormDialog({
  open,
  onOpenChange,
  defaultCentreId = 'all',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCentreId?: string
}) {
  const { centres, instructors, createSession } = useAdminData()
  const firstCentre = centres[0]?.id ?? ''
  const [centreId, setCentreId] = useState(
    defaultCentreId === 'all' ? firstCentre : defaultCentreId,
  )
  const [instructorId, setInstructorId] = useState('')
  const [title, setTitle] = useState('Evening practice')
  const [date, setDate] = useState(todayIso())
  const [startTime, setStartTime] = useState('18:30')
  const [durationMinutes, setDurationMinutes] = useState(75)
  const [type, setType] = useState<SessionType>('regular')
  const [isExternal, setIsExternal] = useState(false)
  const [externalLocation, setExternalLocation] = useState('')

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
    setTitle('Evening practice')
    setDate(todayIso())
    setStartTime('18:30')
    setDurationMinutes(75)
    setType('regular')
    setIsExternal(false)
    setExternalLocation('')
  }, [open, defaultCentreId, firstCentre, instructors])

  function handleCentreChange(nextCentre: string) {
    setCentreId(nextCentre)
    setInstructorId(
      instructors.find((instructor) => instructor.centreIds.includes(nextCentre))?.id ??
        instructors[0]?.id ??
        '',
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createSession({
      centreId,
      instructorId,
      title: title.trim(),
      date,
      startTime,
      durationMinutes,
      type,
      isExternal,
      externalLocation: isExternal ? externalLocation.trim() : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4 text-primary" aria-hidden="true" />
            Create a session
          </DialogTitle>
          <DialogDescription>
            Schedule a regular class or an external session and assign the instructor who
            will lead it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Centre" htmlFor="session-centre">
              <NativeSelect
                id="session-centre"
                value={centreId}
                onChange={(event) => handleCentreChange(event.target.value)}
                required
              >
                {centres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Instructor" htmlFor="session-instructor">
              <NativeSelect
                id="session-instructor"
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

          <Field label="Session title" htmlFor="session-title">
            <Input
              id="session-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={100}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="session-date">
              <Input
                id="session-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>
            <Field label="Start time" htmlFor="session-time">
              <Input
                id="session-time"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </Field>
            <Field label="Minutes" htmlFor="session-duration">
              <Input
                id="session-duration"
                type="number"
                min={15}
                max={480}
                step={15}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                required
              />
            </Field>
          </div>

          <Field label="Class type" htmlFor="session-type">
            <NativeSelect
              id="session-type"
              value={type}
              onChange={(event) => {
                const next = event.target.value as SessionType
                setType(next)
                setIsExternal(next === 'external')
              }}
            >
              <option value="regular">Regular class</option>
              <option value="weapons">Weapons class</option>
              <option value="kids">Kids class</option>
              <option value="seminar">Seminar</option>
              <option value="external">External session</option>
            </NativeSelect>
          </Field>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 rounded border-input accent-[var(--primary)]"
                checked={isExternal}
                onChange={(event) => {
                  setIsExternal(event.target.checked)
                  if (event.target.checked) {
                    if (type !== 'external') setType('external')
                  } else if (type === 'external') {
                    setType('regular')
                  }
                }}
              />
              <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
              This is an external session
            </label>
            {isExternal && (
              <div className="mt-3">
                <Field label="External location or organiser" htmlFor="session-location">
                  <Input
                    id="session-location"
                    value={externalLocation}
                    onChange={(event) => setExternalLocation(event.target.value)}
                    placeholder="e.g. Toa Payoh Sports Hall · joint seminar"
                    required
                  />
                </Field>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create session</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
