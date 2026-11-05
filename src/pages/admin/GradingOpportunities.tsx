import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3, MapPin } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

interface Schedule {
  event_id: string
  track: 'adult' | 'children'
  grading_date: string
  application_opens_on: string
  application_deadline: string
  reporting_release_on: string
  reporting_time: string | null
  events: { name: string; centres: { name: string; address: string } | { name: string; address: string }[] } |
    { name: string; centres: { name: string; address: string } | { name: string; address: string }[] }[]
}

function related<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', dateStyle: 'short' }).format(new Date())
const showDate = (value: string) => new Date(`${value}T00:00:00+08:00`)
  .toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
const showTime = (value: string) => new Date(`2026-01-01T${value.slice(0, 5)}:00+08:00`)
  .toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })

function stateOf(item: Schedule, now: string) {
  if (item.grading_date < now) return 'Completed'
  if (now < item.application_opens_on) return 'Upcoming'
  if (now <= item.application_deadline) return 'Applications open'
  return 'Applications closed'
}

export default function GradingOpportunities() {
  const [schedule, setSchedule] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = today()

  const reload = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('gradings')
      .select('event_id,track,grading_date,application_opens_on,application_deadline,reporting_release_on,reporting_time,events!inner(name,centres(name,address))')
      .eq('official_schedule', true).order('grading_date')
    if (queryError) setError('Unable to load the official grading schedule.')
    else {
      setSchedule((data ?? []) as Schedule[])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const next = schedule.filter((item) => item.grading_date >= now)

  return <div className="space-y-7">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <p className="text-sm text-muted-foreground">Loading schedule…</p> : error ? null : <>
      {next.length > 0 && <section className="space-y-3" aria-label="Upcoming gradings">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Coming up</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {next.map((item) => <Card key={item.event_id} className="gap-3 border-primary/20 bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{item.track === 'adult' ? 'Adult' : 'Children’s'} grading</span>
              <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-primary">{stateOf(item, now)}</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{showDate(item.grading_date)}</p>
            <p className="text-sm text-muted-foreground">Applications {showDate(item.application_opens_on)} – {showDate(item.application_deadline)}</p>
          </Card>)}
        </div>
      </section>}
      {(['adult', 'children'] as const).map((track) => <section key={track} className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">{track === 'adult' ? 'Adult grading' : 'Children’s grading'}</h2>
          <span className="text-xs text-muted-foreground">{schedule.filter((item) => item.track === track).length} dates</span>
        </div>
        <div className="grid gap-3">
          {schedule.filter((item) => item.track === track).map((item) => {
            const past = item.grading_date < now
            const venue = related(related(item.events)?.centres)
            return <Card key={item.event_id} className={past ? 'gap-0 overflow-hidden opacity-70' : 'gap-0 overflow-hidden'}>
              <CardHeader className="gap-2 border-b bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="size-4 text-primary" />{showDate(item.grading_date)}</CardTitle>
                  <CardDescription className="mt-1">{stateOf(item, now)}</CardDescription>
                </div>
                <span className="text-xs font-medium text-muted-foreground">{track === 'adult' ? 'ADULT' : 'CHILDREN'}</span>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-muted-foreground">Grading date</dt><dd className="mt-1 font-semibold">{showDate(item.grading_date)}</dd></div>
                  <div><dt className="text-muted-foreground">Applications open</dt><dd className="mt-1 font-semibold">{showDate(item.application_opens_on)}</dd></div>
                  <div><dt className="text-muted-foreground">Closing date</dt><dd className="mt-1 font-semibold">{showDate(item.application_deadline)}</dd></div>
                  <div><dt className="text-muted-foreground">Reporting time released</dt><dd className="mt-1 font-semibold">{showDate(item.reporting_release_on)}</dd></div>
                </dl>
                <div className="flex flex-wrap items-start gap-4 border-t pt-4 text-sm">
                  <p className="flex flex-1 items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" />{venue ? `${venue.name} · ${venue.address}` : 'Aikido Shinju-Kai Headquarters'}</p>
                  <p className="flex items-center gap-2"><Clock3 className="size-4 text-primary" />Reporting time: <strong>{item.reporting_time ? showTime(item.reporting_time) : 'To be confirmed'}</strong></p>
                </div>
              </CardContent>
            </Card>
          })}
        </div>
      </section>)}
    </>}
  </div>
}
