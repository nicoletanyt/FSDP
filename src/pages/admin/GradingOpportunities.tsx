import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CardListSkeleton } from '@/components/shared/skeletons'
import { Link, useSearchParams } from 'react-router'
import { CalendarDays, ChevronRight, Clock3, History, MapPin, TriangleAlert, Users } from 'lucide-react'
import EmptyState from '@/components/shared/layout/EmptyState'
import GradingPanelDialog from '@/components/admin/GradingPanelDialog'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import {
  ExaminerPanel, detailTermClass, GradingDetail, GradingDetails, GradingStatusPill, GradingWarnings, Segmented, gradingActionClass,
} from '@/components/grading/GradingParts'
import { useExaminerPhotos } from '@/hooks/use-examiner-photos'
import { loadInstructorPhotos } from '@/lib/instructor/api'
import { Card } from '@/components/ui/card'
import { candidateCount, daysUntil, endsAfter, gradingDate, gradingStage, gradingTimeLabel, singaporeToday } from '@/lib/grading/format'
import { gradingTitle } from '@/lib/instructor/grading-panels'
import { supabase } from '@/lib/supabase'
import { useFeedback } from '@/hooks/use-feedback'
import { useAuth } from '@/hooks/use-auth'
import { toPanel } from '@/lib/admin/grading-panels'
import { gradingScheduleAccountKey, gradingScheduleKey, loadGradingSchedule } from '@/lib/admin/grading-schedule'
import { adminGradingKeys } from '@/lib/admin/grading-results'
import type { Schedule, ScheduleEvent } from '@/lib/admin/grading-schedule'

function related<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

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
    ...(stageKey === 'unsorted' && until <= 3 ? [`Students not arranged into sessions yet. Grading ${until === 0 ? 'is today' : until === 1 ? 'is tomorrow' : `is in ${until} days`}`] : []),
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
  const warnings = warningsFor(item, event, stage.key, now)
  return (
    <Card className="gap-5 px-5 py-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-lg font-semibold">
            <Link to={dayHref} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">{title}</Link>
          </h3>
          <GradingStatusPill opensOn={item.application_opens_on} closesOn={item.application_deadline} gradingDate={item.grading_date} today={now} />
        </div>
        {next && <p className="text-sm text-muted-foreground">{until === 0 ? 'Next grading, today' : until === 1 ? 'Next grading, tomorrow' : `Next grading, in ${until} days`}</p>}
      </div>

      <GradingDetails>
        <GradingDetail icon={CalendarDays} term="Date">{gradingDate(item.grading_date)}</GradingDetail>
        <GradingDetail icon={Clock3} term="Time">{gradingTimeLabel(event?.starts_at ?? null, event?.ends_at ?? null, item.reporting_time)}</GradingDetail>
        <GradingDetail icon={MapPin} term="Place">{venue?.name ?? 'Aikido Shinju-Kai Headquarters'}</GradingDetail>
        <GradingDetail icon={Users} term="Students">{candidateCount(candidates(item))}</GradingDetail>
      </GradingDetails>

      <div className="space-y-3">
        <ExaminerPanel panel={panel} photos={photos} label={`Examiners for ${title}, ${gradingDate(item.grading_date)}`} />
        <GradingPanelDialog eventId={item.event_id} gradingLabel={gradingDate(item.grading_date)} panel={panel} onSaved={onPanelSaved} />
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          <p className={detailTermClass}><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />Needs your attention</p>
          <GradingWarnings warnings={warnings} quiet />
        </div>
      )}

      <div className="flex justify-end">
        <Link to={actionHref} className={gradingActionClass} data-grading-stage={stage.key}>
          {action.label}
          <span className="sr-only">: {title}, {gradingDate(item.grading_date)}</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
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
  const { session } = useAuth()
  const client = useQueryClient()
  const { notify, feedbackDialog } = useFeedback()
  const [search, setSearch] = useSearchParams()
  const when = search.get('when') === 'past' ? 'past' : 'upcoming'
  const [now, setNow] = useState(singaporeToday)
  useEffect(() => {
    const timer = setInterval(() => setNow(singaporeToday()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const schedule = useQuery({
    queryKey: gradingScheduleKey(session?.user.id, now),
    queryFn: () => loadGradingSchedule(now),
    enabled: Boolean(session),
  })
  const upcoming = schedule.data?.upcoming ?? []
  const past = schedule.data?.past ?? []
  const photos = useExaminerPhotos([...upcoming, ...past].flatMap(item => (item.grading_panel_members ?? []).map(member => member.instructor_id)),
    ids => loadInstructorPhotos(supabase, ids))

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
      {schedule.isPending ? <CardListSkeleton label="Loading schedule…" />
        : schedule.isError ? <RetryAlert message={schedule.error.message} onRetry={() => void schedule.refetch()} />
        : when === 'upcoming' ? (
          upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No upcoming gradings" description="Future grading dates will appear here when scheduled." />
          ) : (
            <section className="grid gap-4" aria-label="Upcoming gradings">
              {upcoming.map((item, index) => (
                <ScheduleCard key={item.event_id} item={item} next={index === 0} now={now} photos={photos} onPanelSaved={() => { void client.invalidateQueries({ queryKey: gradingScheduleAccountKey(session?.user.id) }); void client.invalidateQueries({ queryKey: adminGradingKeys.day(item.event_id) }); notify({ title: 'Grading panel saved', description: 'The examiners for this grading have been updated.' }) }} />
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
