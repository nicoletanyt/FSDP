import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CalendarDays, ChevronRight, Clock3, History, MapPin, Users } from 'lucide-react'
import EmptyState from '@/components/shared/layout/EmptyState'
import GradingPanelDialog from '@/components/admin/GradingPanelDialog'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import {
  ExaminerPanel, GradingFacts, GradingStatusPill, GradingWarnings, Segmented, gradingActionClass,
} from '@/components/grading/GradingParts'
import { useExaminerPhotos } from '@/hooks/use-examiner-photos'
import { loadInstructorPhotos } from '@/lib/instructor/api'
import { Card } from '@/components/ui/card'
import { candidateCount, daysUntil, endsAfter, gradingDate, gradingStage, gradingTimeLabel, singaporeToday } from '@/lib/grading/format'
import { gradingTitle } from '@/lib/instructor/grading-panels'
import { supabase } from '@/lib/supabase'
import { useFeedback } from '@/hooks/use-feedback'
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
  grading_applications: { status: string }[]
  grading_sessions: { id: string; ends_at: string | null }[]
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

const scheduleSelect = `event_id,track,grading_date,application_opens_on,application_deadline,reporting_release_on,reporting_time,
  events!inner(name,starts_at,ends_at,centres(name,address)),${panelSelect},grading_applications(status),grading_sessions(id,ends_at)`
// Candidates are active (non-withdrawn) applications, counted the same way on the instructor side.
const candidates = (item: Schedule) => item.grading_applications.filter(row => row.status !== 'withdrawn').length

// The footer's one action, named for what the admin will do on the grading day.
const nextAction = {
  'not-open': { label: 'View grading day', list: null },
  open: { label: 'View candidates', list: 'students' },
  unsorted: { label: 'Sort into sessions', list: 'sessions' },
  sorted: { label: 'Review sessions', list: 'sessions' },
  started: { label: 'View progress', list: 'sessions' },
  done: { label: 'View results', list: 'sessions' },
} as const

// What needs an administrator's attention on this grading, most urgent first.
function warningsFor(item: Schedule, event: ScheduleEvent | undefined, stageKey: keyof typeof nextAction, now: string) {
  const panel = toPanel(item.grading_panel_members)
  const underReview = item.grading_applications.filter(row => row.status === 'under_review').length
  const ends = [event?.ends_at, ...item.grading_sessions.map(session => session.ends_at)].filter((end): end is string => Boolean(end))
  const until = daysUntil(item.grading_date, now)
  return [
    ...(!panel.length ? ['No examiners assigned'] : !panel.some(member => member.isChief) ? ['No chief examiner'] : []),
    ...(stageKey === 'unsorted' && until <= 3 ? [`Not sorted, grading ${until === 0 ? 'today' : until === 1 ? 'tomorrow' : `in ${until} days`}`] : []),
    ...(underReview ? [`${underReview} application${underReview === 1 ? '' : 's'} under review`] : []),
    ...(stageKey !== 'not-open' && stageKey !== 'open' && !candidates(item) ? ['No candidates'] : []),
    ...(ends.some(end => endsAfter(end, '21:00')) ? ['Runs past 9:00 pm'] : []),
  ]
}

// Three rows: title and status; date, time, place and applicants; examiners,
// anything needing attention, and the next action.
function ScheduleCard({ item, next, now, photos, onPanelSaved }: {
  item: Schedule; next: boolean; now: string; photos: Record<string, string>; onPanelSaved: () => void
}) {
  const event = related(item.events)
  const venue = related(event?.centres)
  const panel = toPanel(item.grading_panel_members)
  const title = gradingTitle({ name: event?.name ?? 'Grading', track: item.track })
  const dayHref = `/admin/grading/days/${item.event_id}`
  const stage = gradingStage({ opensOn: item.application_opens_on, closesOn: item.application_deadline,
    gradingDate: item.grading_date, sessions: item.grading_sessions.length, started: false, today: now })
  const until = daysUntil(item.grading_date, now)
  const action = nextAction[stage.key]
  const actionHref = action.list ? `${dayHref}?list=${action.list}` : dayHref
  return (
    <Card className="gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-base font-medium">
          <Link to={dayHref} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">{title}</Link>
        </h3>
        <GradingStatusPill opensOn={item.application_opens_on} closesOn={item.application_deadline} gradingDate={item.grading_date} today={now} />
        {next && <span className="text-sm text-muted-foreground">{until === 0 ? 'Next grading, today' : until === 1 ? 'Next grading, tomorrow' : `Next grading, in ${until} days`}</span>}
      </div>
      <GradingFacts items={[
        { key: 'date', icon: CalendarDays, label: gradingDate(item.grading_date) },
        { key: 'time', icon: Clock3, label: gradingTimeLabel(event?.starts_at ?? null, event?.ends_at ?? null, item.reporting_time) },
        { key: 'centre', icon: MapPin, label: venue?.name ?? 'Aikido Shinju-Kai Headquarters' },
        { key: 'candidates', icon: Users, label: candidateCount(candidates(item)) },
      ]} />
      <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <ExaminerPanel panel={panel} photos={photos} label={`Examiners for ${title}, ${gradingDate(item.grading_date)}`} />
          <GradingPanelDialog eventId={item.event_id} gradingLabel={gradingDate(item.grading_date)} panel={panel} onSaved={onPanelSaved} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <GradingWarnings warnings={warningsFor(item, event, stage.key, now)} quiet />
          <Link to={actionHref} className={gradingActionClass} data-grading-stage={stage.key}>
            {action.label}
            <span className="sr-only">: {title}, {gradingDate(item.grading_date)}</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Card>
  )
}

// Past gradings stay reachable so their results can be reviewed.
function PastGradings({ items }: { items: Schedule[] }) {
  return (
    <section aria-label="Past gradings">
      <Card className="py-0">
        <ul className="divide-y">
          {items.map(item => {
            const title = gradingTitle({ name: related(item.events)?.name ?? 'Grading', track: item.track })
            const sessions = item.grading_sessions.length
            return (
              <li key={item.event_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground">
                    {gradingDate(item.grading_date)}, {candidateCount(candidates(item))}, {sessions === 1 ? '1 session' : `${sessions} sessions`}
                  </p>
                </div>
                <Link to={`/admin/grading/days/${item.event_id}`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                  View results<span className="sr-only">: {title}, {gradingDate(item.grading_date)}</span>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}

export default function GradingOpportunities() {
  const [upcoming, setUpcoming] = useState<Schedule[]>([])
  const [past, setPast] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const { notify, feedbackDialog } = useFeedback()
  const [error, setError] = useState('')
  const [search, setSearch] = useSearchParams()
  const when = search.get('when') === 'past' ? 'past' : 'upcoming'
  const now = singaporeToday()
  const photos = useExaminerPhotos([...upcoming, ...past].flatMap(item => (item.grading_panel_members ?? []).map(member => member.instructor_id)),
    ids => loadInstructorPhotos(supabase, ids))

  const reload = useCallback(async () => {
    const official = () => supabase.from('gradings').select(scheduleSelect).eq('official_schedule', true)
    const [next, previous] = await Promise.all([
      official().gte('grading_date', singaporeToday()).order('grading_date'),
      official().lt('grading_date', singaporeToday()).order('grading_date', { ascending: false }).limit(20),
    ])
    if (next.error || previous.error) setError('Unable to load the official grading schedule.')
    else {
      setUpcoming((next.data ?? []) as Schedule[])
      setPast((previous.data ?? []) as Schedule[])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const showWhen = (value: 'upcoming' | 'past') => setSearch(current => {
    const params = new URLSearchParams(current)
    if (value === 'past') params.set('when', 'past')
    else params.delete('when')
    return params
  }, { replace: true })

  return (
    <div className="space-y-5">
      <Segmented label="Gradings to show" value={when} onChange={showWhen} options={[
        { value: 'upcoming', text: upcoming.length ? `Upcoming (${upcoming.length})` : 'Upcoming' },
        { value: 'past', text: 'Past' },
      ]} />
      {loading ? <p className="text-sm text-muted-foreground">Loading schedule…</p>
        : error ? <RetryAlert message={error} onRetry={() => void reload()} />
        : when === 'upcoming' ? (
          upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No upcoming gradings" description="Future grading dates will appear here when scheduled." />
          ) : (
            <section className="grid gap-4" aria-label="Upcoming gradings">
              {upcoming.map((item, index) => (
                <ScheduleCard key={item.event_id} item={item} next={index === 0} now={now} photos={photos} onPanelSaved={() => { void reload(); notify({ title: 'Grading panel saved', description: 'The examiners for this grading have been updated.' }) }} />
              ))}
            </section>
          )
        ) : past.length ? <PastGradings items={past} /> : (
          <EmptyState icon={History} title="No past gradings yet" description="Finished gradings appear here so their results can be reviewed." />
        )}
      {feedbackDialog}
    </div>
  )
}
