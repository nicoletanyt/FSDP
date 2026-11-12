import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, ChevronRight, Clock3, MapPin } from 'lucide-react'
import EmptyState from '@/components/admin/EmptyState'
import GradingPanelDialog from '@/components/admin/GradingPanelDialog'
import RetryAlert from '@/components/admin/RetryAlert'
import { ExaminerPanel, GradingCardFooter, GradingFacts, gradingActionClass } from '@/components/grading/GradingParts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { gradingDate, gradingTimeLabel, singaporeToday } from '@/lib/grading/format'
import { gradingTitle } from '@/lib/instructor/grading-panels'
import { supabase } from '@/lib/supabase'
import { panelSelect, toPanel } from '@/lib/admin/grading-panels'

interface Schedule {
  event_id: string
  track: 'adult' | 'children'
  grading_date: string
  application_opens_on: string
  application_deadline: string
  reporting_release_on: string
  reporting_time: string | null
  events: ScheduleEvent | ScheduleEvent[]
  grading_panel_members: Parameters<typeof toPanel>[0]
}

interface ScheduleEvent {
  name: string
  starts_at: string | null
  ends_at: string | null
  centres: { name: string; address: string } | { name: string; address: string }[]
}

function related<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

const today = singaporeToday

function stateOf(item: Schedule, now: string) {
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
      .select(`event_id,track,grading_date,application_opens_on,application_deadline,reporting_release_on,reporting_time,events!inner(name,starts_at,ends_at,centres(name,address)),${panelSelect}`)
      .eq('official_schedule', true).gte('grading_date', today()).order('grading_date')
    if (queryError) setError('Unable to load the official grading schedule.')
    else {
      setSchedule((data ?? []) as Schedule[])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const upcoming = schedule
    .filter((item) => item.grading_date >= now)
    .sort((left, right) => left.grading_date.localeCompare(right.grading_date))

  return <div className="space-y-5">
    {error && <RetryAlert message={error} onRetry={() => void reload()} />}
    {loading ? <p className="text-sm text-muted-foreground">Loading schedule…</p> : error ? null : <>
      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming gradings"
          description="Future grading dates will appear here when scheduled."
        />
      ) : (
        <section className="space-y-4" aria-labelledby="upcoming-grading-dates">
          <h2 id="upcoming-grading-dates" className="text-xl font-semibold">Upcoming grading dates</h2>
          <div className="grid gap-4">
            {upcoming.map((item, index) => {
              const event = related(item.events)
              const venue = related(event?.centres)
              const panel = toPanel(item.grading_panel_members)
              const title = gradingTitle({ name: event?.name ?? 'Grading', track: item.track })
              const dayHref = `/admin/grading/days/${item.event_id}`
              return <Card key={item.event_id}>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CardTitle className="text-lg font-semibold">
                      <Link to={dayHref} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">{title}</Link>
                    </CardTitle>
                    {index === 0 && <Badge>Next grading</Badge>}
                  </div>
                  <GradingFacts items={[
                    { key: 'date', icon: CalendarDays, label: gradingDate(item.grading_date) },
                    { key: 'time', icon: Clock3, label: gradingTimeLabel(event?.starts_at ?? null, event?.ends_at ?? null, item.reporting_time) },
                    { key: 'centre', icon: MapPin, label: venue?.name ?? 'Aikido Shinju-Kai Headquarters' },
                  ]} />
                </CardHeader>
                <CardContent className="space-y-5">
                  <dl className="grid gap-4 text-sm sm:grid-cols-3">
                    <div><dt className="text-muted-foreground">Applications open</dt><dd className="mt-1 font-medium">{gradingDate(item.application_opens_on)}</dd></div>
                    <div><dt className="text-muted-foreground">Applications close</dt><dd className="mt-1 font-medium">{gradingDate(item.application_deadline)}</dd></div>
                    <div><dt className="text-muted-foreground">Reporting time released</dt><dd className="mt-1 font-medium">{gradingDate(item.reporting_release_on)}</dd></div>
                  </dl>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <ExaminerPanel panel={panel} label={`Examiners for ${title}, ${gradingDate(item.grading_date)}`} />
                    <GradingPanelDialog eventId={item.event_id} gradingLabel={gradingDate(item.grading_date)}
                      panel={panel} onSaved={() => void reload()} />
                  </div>
                </CardContent>
                <GradingCardFooter status={stateOf(item, now)}>
                  <Link to={dayHref} className={gradingActionClass}>
                    View grading day
                    <span className="sr-only">: {title}, {gradingDate(item.grading_date)}</span>
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Link>
                </GradingCardFooter>
              </Card>
            })}
          </div>
        </section>
      )}
    </>}
  </div>
}
