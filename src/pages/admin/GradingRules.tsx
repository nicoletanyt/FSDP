import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import RetryAlert from '@/components/admin/RetryAlert'
import { Field, NativeSelect } from '@/components/admin/form-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  deleteSessionDuration, gradingRulesKeys, loadGradingRules, rulesProblem, saveGradingRules, saveSessionDuration,
} from '@/lib/admin/grading-rules'
import type { GradeTrack, RuleGrade, ScheduleRules, SessionDuration } from '@/lib/admin/grading-rules'

const trackTitle: Record<GradeTrack, string> = { adult: 'Adult grading', children: "Children's grading" }

const numberFields = [
  { key: 'minSessionSize', label: 'Minimum session size', hint: 'Smaller groups may share a session with a neighbouring grade.' },
  { key: 'defaultSessionMinutes', label: 'Default session length (minutes)', hint: 'Used for any transition without its own length below.' },
  { key: 'changeoverMinutes', label: 'Changeover (minutes)', hint: 'Gap between one session and the next.' },
  { key: 'defaultCapacity', label: 'Fallback capacity', hint: 'Used only when the venue has no capacity set.' },
] as const

const timeFields = [
  { key: 'dayStart', label: 'Day starts' },
  { key: 'dayEnd', label: 'Latest finish' },
  { key: 'lunchStart', label: 'Lunch starts' },
  { key: 'lunchEnd', label: 'Lunch ends' },
] as const

function RulesForm({ rules }: { rules: ScheduleRules }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState(rules)
  const save = useMutation({
    mutationFn: () => saveGradingRules(draft),
    onSuccess: () => void client.invalidateQueries({ queryKey: gradingRulesKeys.all }),
  })
  const problem = rulesProblem(draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(rules)
  const id = (key: string) => `${rules.track}-${key}`
  return (
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {numberFields.map(field => (
          <Field key={field.key} label={field.label} htmlFor={id(field.key)} hint={field.hint}>
            <Input id={id(field.key)} type="number" inputMode="numeric" min={0} value={Number.isNaN(draft[field.key]) ? '' : draft[field.key]}
              onChange={event => setDraft({ ...draft, [field.key]: event.target.valueAsNumber })} />
          </Field>
        ))}
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {timeFields.map(field => (
          <Field key={field.key} label={field.label} htmlFor={id(field.key)}>
            <Input id={id(field.key)} type="time" value={draft[field.key]}
              onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} />
          </Field>
        ))}
      </div>
      {changed && problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!changed || Boolean(problem) || save.isPending}>{save.isPending ? 'Saving…' : 'Save rules'}</Button>
        {changed && <Button type="button" variant="ghost" onClick={() => setDraft(rules)}>Discard changes</Button>}
        {save.isSuccess && !changed && <span role="status" className="text-sm text-muted-foreground">Saved</span>}
      </div>
    </form>
  )
}

function DurationRow({ duration, grades }: { duration: SessionDuration; grades: RuleGrade[] }) {
  const client = useQueryClient()
  const [minutes, setMinutes] = useState(duration.minutes)
  const refresh = () => void client.invalidateQueries({ queryKey: gradingRulesKeys.all })
  const save = useMutation({ mutationFn: () => saveSessionDuration({ ...duration, minutes }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: () => deleteSessionDuration(duration.id), onSuccess: refresh })
  const label = (id: string | null) => id === null ? 'Any grade' : grades.find(grade => grade.id === id)?.label ?? id
  const name = `${label(duration.fromGradeId)} to ${label(duration.toGradeId)}`
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2">{label(duration.fromGradeId)}</td>
      <td className="px-3 py-2">{label(duration.toGradeId)}</td>
      <td className="px-3 py-2">
        <Input type="number" min={5} max={600} className="w-24" aria-label={`Minutes for ${name}`}
          value={Number.isNaN(minutes) ? '' : minutes} onChange={event => setMinutes(event.target.valueAsNumber)} />
        {(save.error ?? remove.error) && <p role="alert" className="mt-1 text-xs text-destructive">{(save.error ?? remove.error)!.message}</p>}
      </td>
      <td className="px-3 py-2 pr-4 text-right whitespace-nowrap">
        {minutes !== duration.minutes && (
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        )}
        <Button type="button" variant="ghost" size="icon-touch" aria-label={`Remove the length for ${name}`}
          disabled={remove.isPending} onClick={() => remove.mutate()}>
          <Trash2 aria-hidden="true" />
        </Button>
      </td>
    </tr>
  )
}

function AddDuration({ track, grades }: { track: GradeTrack; grades: RuleGrade[] }) {
  const client = useQueryClient()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minutes, setMinutes] = useState(75)
  const add = useMutation({
    mutationFn: () => saveSessionDuration({ track, fromGradeId: from || null, toGradeId: to, minutes }),
    onSuccess: () => { setFrom(''); setTo(''); void client.invalidateQueries({ queryKey: gradingRulesKeys.all }) },
  })
  const id = (key: string) => `${track}-new-${key}`
  return (
    <form className="flex flex-wrap items-end gap-3 border-t px-4 pt-4" onSubmit={event => { event.preventDefault(); add.mutate() }}>
      <Field label="From" htmlFor={id('from')} className="min-w-40 flex-1">
        <NativeSelect id={id('from')} className="h-9" value={from} onChange={event => setFrom(event.target.value)}>
          <option value="">Any grade</option>
          {grades.map(grade => <option key={grade.id} value={grade.id}>{grade.label}</option>)}
        </NativeSelect>
      </Field>
      <Field label="To" htmlFor={id('to')} className="min-w-40 flex-1">
        <NativeSelect id={id('to')} className="h-9" value={to} onChange={event => setTo(event.target.value)}>
          <option value="" disabled>Choose a grade</option>
          {grades.filter(grade => grade.tracks.includes(track)).map(grade => <option key={grade.id} value={grade.id}>{grade.label}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Minutes" htmlFor={id('minutes')}>
        <Input id={id('minutes')} type="number" min={5} max={600} className="w-24" value={Number.isNaN(minutes) ? '' : minutes}
          onChange={event => setMinutes(event.target.valueAsNumber)} />
      </Field>
      <Button type="submit" variant="outline" disabled={!to || add.isPending}>{add.isPending ? 'Adding…' : 'Add length'}</Button>
      {add.error && <p role="alert" className="w-full text-sm text-destructive">{add.error.message}</p>}
    </form>
  )
}

function TrackRules({ rules, durations, grades }: { rules: ScheduleRules; durations: SessionDuration[]; grades: RuleGrade[] }) {
  const order = new Map(grades.map(grade => [grade.id, grade.sortOrder]))
  const rows = durations.filter(row => row.track === rules.track).sort((a, b) =>
    (order.get(a.toGradeId) ?? 0) - (order.get(b.toGradeId) ?? 0)
    || (a.fromGradeId === null ? -1 : order.get(a.fromGradeId) ?? 0) - (b.fromGradeId === null ? -1 : order.get(b.fromGradeId) ?? 0))
  return (
    <Card>
      <CardHeader>
        <CardTitle>{trackTitle[rules.track]}</CardTitle>
        <CardDescription>
          Every session runs in one room, back to back. No session overlaps lunch, and anything past the latest finish is flagged on the draft rather than moved to another day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-0">
        <div className="px-4"><RulesForm key={JSON.stringify(rules)} rules={rules} /></div>
        <section aria-label={`${trackTitle[rules.track]} session lengths`} className="space-y-2">
          <h3 className="px-4 text-sm font-medium">Session length by transition</h3>
          <p className="px-4 text-xs text-muted-foreground">
            An exact transition wins over “Any grade”; anything not listed uses the default length above.
          </p>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="px-4 pb-2 font-medium">From</th>
                    <th scope="col" className="px-3 pb-2 font-medium">To</th>
                    <th scope="col" className="px-3 pb-2 font-medium">Minutes</th>
                    <th scope="col" className="px-3 pr-4 pb-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => <DurationRow key={`${row.id}-${row.minutes}`} duration={row} grades={grades} />)}
                </tbody>
              </table>
            </div>
          ) : <p className="px-4 text-sm text-muted-foreground">No lengths set yet: every session uses the default.</p>}
          <AddDuration track={rules.track} grades={grades} />
        </section>
      </CardContent>
    </Card>
  )
}

export default function GradingRules() {
  const query = useQuery({ queryKey: gradingRulesKeys.all, queryFn: loadGradingRules, retry: false })
  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading scheduling rules…</p>
  if (query.isError) return <RetryAlert message={query.error.message} onRetry={() => void query.refetch()} />
  const { rules, durations, grades } = query.data
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        The scheduler uses these rules when it generates a grading day’s draft. Venue capacity comes from each centre. Changes apply the next time a draft is generated or edited.
      </p>
      {/* Adults first: their lengths are published; children's are still to be confirmed. */}
      {[...rules].sort((a, b) => (a.track === 'adult' ? -1 : 1) - (b.track === 'adult' ? -1 : 1)).map(row => (
        <TrackRules key={row.track} rules={row} durations={durations} grades={grades} />
      ))}
    </div>
  )
}
