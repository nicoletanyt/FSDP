import { useEffect, useState } from 'react'
import { FormSkeleton } from '@/components/shared/skeletons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { GradeLabelBadge } from '@/components/shared/grade/GradeBadge'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import { Field } from '@/components/admin/form-controls'
import FilterCombobox from '@/components/shared/filters/FilterCombobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  deleteSessionDuration, gradingRulesKeys, loadGradingRules, rulesProblem, saveGradingRules, saveSessionDuration,
} from '@/lib/admin/grading-rules'
import type { GradeTrack, RuleGrade, ScheduleRules, SessionDuration } from '@/lib/admin/grading-rules'
import { cn } from '@/lib/utils'
import { useFeedback } from '@/hooks/use-feedback'

const tracks: { value: GradeTrack; label: string }[] = [
  { value: 'adult', label: 'Adults' },
  { value: 'children', label: 'Children' },
]

const dayFields = [
  { key: 'dayStart', label: 'Starts' },
  { key: 'dayEnd', label: 'Latest finish' },
  { key: 'lunchStart', label: 'Lunch starts' },
  { key: 'lunchEnd', label: 'Lunch ends' },
] as const

const sessionFields = [
  { key: 'defaultSessionMinutes', label: 'Usual length (minutes)', hint: undefined },
  { key: 'changeoverMinutes', label: 'Break between sessions (minutes)', hint: undefined },
  { key: 'minSessionSize', label: 'Smallest group', hint: 'Smaller groups join a nearby grade.' },
  { key: 'defaultCapacity', label: 'Room size', hint: "Used only if the dojo's room size isn't set." },
] as const

type NewLength = { key: number; gradeId: string; minutes: number }

function TrackForm({ rules, durations, grades }: { rules: ScheduleRules; durations: SessionDuration[]; grades: RuleGrade[] }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState(rules)
  const [minutes, setMinutes] = useState<Record<string, number>>({})
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<NewLength[]>([])
  const [showLengths, setShowLengths] = useState(false)
  // Fresh saved values (after a save or refetch) replace the draft.
  const savedSignature = JSON.stringify([rules, durations])
  useEffect(() => {
    setDraft(rules)
    setMinutes({})
    setRemoved(new Set())
    setAdded([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSignature])

  const order = new Map(grades.map(grade => [grade.id, grade.sortOrder]))
  const label = (id: string) => grades.find(grade => grade.id === id)?.label ?? id
  const trackGrades = grades.filter(grade => grade.tracks.includes(rules.track))
  const rows = durations.filter(row => row.track === rules.track && !removed.has(row.id))
    .sort((a, b) => (order.get(a.toGradeId) ?? 0) - (order.get(b.toGradeId) ?? 0))
  const minutesFor = (row: SessionDuration) => minutes[row.id] ?? row.minutes
  const editedRows = rows.filter(row => minutesFor(row) !== row.minutes)

  const rulesChanged = JSON.stringify(draft) !== JSON.stringify(rules)
  const changed = rulesChanged || editedRows.length > 0 || removed.size > 0 || added.length > 0
  const taken = new Set([...rows.filter(row => row.fromGradeId === null).map(row => row.toGradeId), ...added.map(row => row.gradeId)])
  const problem = (rulesChanged && rulesProblem(draft))
    || (added.some(row => !row.gradeId) ? 'Choose a grade for each new session length.' : null)
    || ([...editedRows.map(minutesFor), ...added.map(row => row.minutes)].some(value => !Number.isInteger(value) || value < 5 || value > 600)
      ? 'Session lengths must be 5–600 minutes.' : null)

  const { notify, feedbackDialog } = useFeedback()
  const save = useMutation({
    mutationFn: async () => {
      if (rulesChanged) await saveGradingRules(draft)
      for (const row of editedRows) await saveSessionDuration({ ...row, minutes: minutesFor(row) })
      for (const id of removed) await deleteSessionDuration(id)
      for (const row of added) await saveSessionDuration({ track: rules.track, fromGradeId: null, toGradeId: row.gradeId, minutes: row.minutes })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: gradingRulesKeys.all })
      notify({ title: 'Grading rules saved', description: 'Your changes have been saved.' })
    },
  })

  function discard() {
    setDraft(rules)
    setMinutes({})
    setRemoved(new Set())
    setAdded([])
    save.reset()
  }

  const id = (key: string) => `${rules.track}-${key}`
  return (
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!problem) save.mutate() }}>
      <Card>
        <CardContent className="space-y-6">
          <section aria-labelledby={id('day')} className="space-y-3">
            <h2 id={id('day')} className="text-base font-medium">Day</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {dayFields.map(field => (
                <Field key={field.key} label={field.label} htmlFor={id(field.key)}>
                  <Input id={id(field.key)} type="time" value={draft[field.key]}
                    onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} />
                </Field>
              ))}
            </div>
          </section>

          <section aria-labelledby={id('sessions')} className="space-y-3 border-t pt-6">
            <h2 id={id('sessions')} className="text-base font-medium">Sessions</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {sessionFields.map(field => (
                <Field key={field.key} label={field.label} htmlFor={id(field.key)} hint={field.hint}>
                  <Input id={id(field.key)} type="number" inputMode="numeric" min={0}
                    value={Number.isNaN(draft[field.key]) ? '' : draft[field.key]}
                    onChange={event => setDraft({ ...draft, [field.key]: event.target.valueAsNumber })} />
                </Field>
              ))}
            </div>
          </section>

          <section className="border-t pt-4">
            <button type="button" aria-expanded={showLengths} aria-controls={id('lengths')}
              onClick={() => setShowLengths(value => !value)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md py-2 text-left text-base font-medium focus-visible:outline-2 focus-visible:outline-ring">
              <span>Different lengths for specific grades
                {rows.length + added.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{rows.length + added.length} set</span>}
              </span>
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', showLengths && 'rotate-180')} />
            </button>
            {showLengths && (
              <div id={id('lengths')} className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">Every other grade uses the usual length.</p>
                {(rows.length > 0 || added.length > 0) && (
                  <ul className="divide-y rounded-lg border">
                    {rows.map(row => {
                      const name = row.fromGradeId ? `${label(row.fromGradeId)} to ${label(row.toGradeId)}` : label(row.toGradeId)
                      return (
                        <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
                            {row.fromGradeId && <><GradeLabelBadge label={label(row.fromGradeId)} track={rules.track} /> to </>}
                            <GradeLabelBadge label={label(row.toGradeId)} track={rules.track} />
                          </span>
                          <Input type="number" min={5} max={600} className="w-24" aria-label={`Minutes for ${name}`}
                            value={Number.isNaN(minutesFor(row)) ? '' : minutesFor(row)}
                            onChange={event => setMinutes({ ...minutes, [row.id]: event.target.valueAsNumber })} />
                          <span className="text-sm text-muted-foreground">min</span>
                          <Button type="button" variant="ghost" size="icon-touch" aria-label={`Remove the length for ${name}`}
                            onClick={() => setRemoved(new Set([...removed, row.id]))}>
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </li>
                      )
                    })}
                    {added.map(row => (
                      <li key={row.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <div className="min-w-48 flex-1">
                          <FilterCombobox value={row.gradeId} ariaLabel="Grade"
                            onChange={value => setAdded(added.map(item => item.key === row.key ? { ...item, gradeId: value } : item))}
                            options={[{ value: '', label: 'Choose a grade' },
                              ...trackGrades.filter(grade => grade.id === row.gradeId || !taken.has(grade.id))
                                .map(grade => ({ value: grade.id, label: grade.label }))]}
                            renderOption={option => option.value ? <GradeLabelBadge label={option.label} track={rules.track} /> : option.label} />
                        </div>
                        <Input type="number" min={5} max={600} className="w-24" aria-label="Minutes"
                          value={Number.isNaN(row.minutes) ? '' : row.minutes}
                          onChange={event => setAdded(added.map(item => item.key === row.key ? { ...item, minutes: event.target.valueAsNumber } : item))} />
                        <span className="text-sm text-muted-foreground">min</span>
                        <Button type="button" variant="ghost" size="icon-touch" aria-label="Remove this new length"
                          onClick={() => setAdded(added.filter(item => item.key !== row.key))}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setAdded([...added, { key: Date.now(), gradeId: '', minutes: draft.defaultSessionMinutes || 75 }])}>
                  <Plus aria-hidden="true" />Add a grade
                </Button>
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      {changed && problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!changed || Boolean(problem) || save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
        {changed && <Button type="button" variant="ghost" disabled={save.isPending} onClick={discard}>Discard changes</Button>}
       
      </div>
      {feedbackDialog}
    </form>
  )
}

export default function GradingRules() {
  const query = useQuery({ queryKey: gradingRulesKeys.all, queryFn: loadGradingRules, retry: false })
  const [track, setTrack] = useState<GradeTrack>('adult')
  if (query.isPending) return <FormSkeleton fields={5} label="Loading the grading schedule…" />
  if (query.isError) return <RetryAlert message={query.error.message} onRetry={() => void query.refetch()} />
  const { rules, durations, grades } = query.data
  const current = rules.find(row => row.track === track)
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">How grading days are timed. Changes apply to the next schedule you create.</p>
      <div role="group" aria-label="Grading" className="inline-flex rounded-lg border bg-muted/40 p-1">
        {tracks.map(item => (
          <button key={item.value} type="button" aria-pressed={track === item.value} onClick={() => setTrack(item.value)}
            className={cn('h-9 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              track === item.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {item.label}
          </button>
        ))}
      </div>
      {current
        ? <TrackForm key={track} rules={current} durations={durations} grades={grades} />
        : <p className="text-sm text-muted-foreground">No schedule is set up for this grading yet.</p>}
    </div>
  )
}
