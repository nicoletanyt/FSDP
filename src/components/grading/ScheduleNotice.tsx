import { CircleCheck, FilePen, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { gradingStamp } from '@/lib/grading/format'
import type { GradingDay } from '@/lib/instructor/grading-panels'

// Whether the day's schedule is a draft or published, and (for the people who
// can see a draft) what needs checking before it goes out.
export default function ScheduleNotice({ day, viewer }: { day: GradingDay; viewer: 'admin' | 'chief' }) {
  if (!day.sessions.length) return null
  const published = day.publishedAt !== null
  return (
    <div className="space-y-3" data-schedule-notice>
      <Alert>
        {published ? <CircleCheck aria-hidden="true" /> : <FilePen aria-hidden="true" />}
        <AlertTitle>{published ? 'Schedule published' : 'Draft schedule'}</AlertTitle>
        <AlertDescription>
          {published
            ? `Published ${gradingStamp(day.publishedAt!)}. Every examiner on the panel can see the sessions, and the reporting time is released.`
            : viewer === 'admin'
              ? 'Only you and the chief examiner can see these sessions. Check anything flagged below, adjust if needed, then publish.'
              : 'The administrator may still change these sessions. The rest of the panel sees them once the schedule is published.'}
        </AlertDescription>
      </Alert>
      {day.warnings.length > 0 && (
        <Alert className="border-warning bg-warning/15">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{day.warnings.length === 1 ? '1 thing to check' : `${day.warnings.length} things to check`}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {day.warnings.map(warning => <li key={`${warning.code}-${warning.sessionIds.join()}`}>{warning.message}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// The same two facts as the notice, as header pills: draft/published, and a
// "things to check" pill that opens the list.
export function ScheduleStatusPills({ day }: { day: GradingDay }) {
  if (!day.sessions.length) return null
  const published = day.publishedAt !== null
  const count = day.warnings.length
  return (
    <>
      <Badge className={published ? 'gap-1 bg-success text-success-foreground' : 'gap-1'} variant={published ? 'default' : 'outline'} title={published ? `Published ${gradingStamp(day.publishedAt!)}` : 'Only you and the chief examiner can see these sessions'}>
        {published ? <CircleCheck aria-hidden="true" /> : <FilePen aria-hidden="true" />}
        {published ? 'Schedule published' : 'Draft schedule'}
      </Badge>
      {count > 0 && (
        <Popover>
          <PopoverTrigger render={<button type="button" className="rounded-4xl focus-visible:outline-2 focus-visible:outline-ring" />}>
            <Badge className="gap-1 bg-warning text-warning-foreground">
              <TriangleAlert aria-hidden="true" />
              {count === 1 ? '1 thing to check' : `${count} things to check`}
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <PopoverTitle>{count === 1 ? '1 thing to check' : `${count} things to check`}</PopoverTitle>
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {day.warnings.map(warning => <li key={`${warning.code}-${warning.sessionIds.join()}`}>{warning.message}</li>)}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </>
  )
}
