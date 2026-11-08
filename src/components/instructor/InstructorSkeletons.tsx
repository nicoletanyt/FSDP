import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import GradeBadge from './DatabaseGradeBadge'
import type { StudentEntry } from '@/lib/instructor/types'

type Variant = 'inline' | 'card' | 'directory' | 'directory-page' | 'roster' | 'history' | 'calendar' | 'calendar-page' | 'reports' | 'assessment' | 'student-detail' | 'profile' | 'check-in'

function Bar({ className }: { className: string }) {
  return <Skeleton aria-hidden="true" className={`motion-reduce:animate-none ${className}`} />
}

function Rows({ count, roster = false }: { count: number; roster?: boolean }) {
  return <ul aria-hidden="true" className="divide-y">
    {Array.from({ length: count }, (_, index) => <li key={index} className={roster
      ? 'grid min-h-14 grid-cols-[minmax(0,1fr)_92px] items-center gap-3 px-3 py-2'
      : 'flex min-h-17 items-center gap-3 px-4 py-3'}>
      <div className="min-w-0 flex-1 space-y-2"><Bar className="h-4 w-36 max-w-full" /><Bar className="h-3 w-24 max-w-full" /></div>
      <Bar className={roster ? 'h-7 w-[92px]' : 'hidden h-3 w-24 sm:block'} />
    </li>)}
  </ul>
}

function DetailCard() {
  return <Card size="sm" className="detail-card"><CardContent className="space-y-3">
    <Bar className="h-3 w-24" /><Bar className="h-5 w-2/3" /><Bar className="h-3 w-1/2" />
  </CardContent></Card>
}

function CalendarBody() {
  return <div aria-hidden="true" className="grid min-h-64 grid-cols-2 gap-3 lg:min-h-96 lg:grid-cols-7">
    {Array.from({ length: 7 }, (_, index) => <div key={index} className="space-y-3 rounded-lg border p-3 max-lg:[&:nth-child(n+3)]:hidden">
      <Bar className="h-4 w-2/3" /><Bar className="h-20 w-full" /><Bar className="h-16 w-full" />
    </div>)}
  </div>
}

function StudentPreview({ entry }: { entry?: StudentEntry | null }) {
  const name = entry ? [entry.student.first_name.trim(), entry.student.last_name.trim()].filter(Boolean).join(' ') || entry.student.email : null
  return <section className="student-detail-view space-y-2 md:space-y-6">
    <div className="flex min-w-0 items-center gap-2">
      <Button render={<Link to="/instructor/students" />} nativeButton={false} variant="ghost"
        className="-ml-5 max-w-full min-w-0 max-md:h-auto max-md:min-h-11 max-md:py-2">
        <ChevronLeft aria-hidden="true" />
        {name ? <h1 className="min-w-0 text-left whitespace-normal md:hidden">{name}</h1> : <Bar className="h-5 w-36 md:hidden" />}
        <span className="hidden md:inline">Back to students</span>
      </Button>
    </div>
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="order-2 min-w-0 max-md:hidden lg:order-1">
        <div className="hidden space-y-4 md:block">
          {name ? <h1 className="text-xl font-semibold">{name}</h1> : <Bar className="h-6 w-40" />}
          <Bar className="h-3 w-24" />
          <PreviewCards entry={entry} />
          <SensitivePlaceholders />
        </div>
      </aside>
      <div className="order-1 min-w-0 space-y-6 md:space-y-4 max-md:order-1 lg:order-2">
        <div aria-hidden="true" className="grid grid-cols-3 gap-2"><Bar className="h-11 w-full" /><Bar className="h-11 w-full" /><Bar className="h-11 w-full" /></div>
        <div className="space-y-3 md:hidden"><Bar className="h-5 w-20" /><Bar className="h-3 w-24" /><PreviewCards entry={entry} /><SensitivePlaceholders /></div>
        <Bar className="h-5 w-28" /><DetailCard /><Bar className="h-5 w-36" /><DetailCard />
      </div>
    </div>
  </section>
}

function PreviewCards({ entry }: { entry?: StudentEntry | null }) {
  return <div className="space-y-3" aria-label="Student information loading">
    <Card size="sm" className="detail-card"><CardContent className="space-y-2">
      <h3 className="detail-label text-xs text-muted-foreground">Grading</h3>
      {entry?.grade ? <GradeBadge grade={entry.grade} className="min-w-0 px-3 py-1.5" /> : <Bar className="h-8 w-28" />}
      <Bar className="h-3 w-32" />
    </CardContent></Card>
    <DetailCard /><DetailCard />
  </div>
}

function SensitivePlaceholders() {
  return <div className="grid grid-cols-2 gap-2" aria-label="Emergency contacts and medical alerts loading">
    <Bar className="h-11 w-full" /><Bar className="h-11 w-full" />
  </div>
}

export function InstructorSkeleton({ variant = 'card', entry }: { variant?: Variant; entry?: StudentEntry | null }) {
  return <div role="status" aria-busy="true" aria-label="Loading instructor data" data-instructor-skeleton={variant}>
    <span className="sr-only">Loading instructor data…</span>
    {variant === 'student-detail' ? <StudentPreview entry={entry} />
      : variant === 'inline' ? <Bar className="h-4 w-40 max-w-full" />
      : variant === 'directory' ? <Rows count={5} />
      : variant === 'roster' ? <Rows count={5} roster />
      : variant === 'calendar' ? <CalendarBody />
      : variant === 'calendar-page' ? <div className="space-y-6"><Bar className="h-8 w-44" /><Bar className="h-11 w-full" /><CalendarBody /></div>
      : variant === 'directory-page' ? <div className="space-y-6"><Bar className="h-8 w-36" /><Bar className="h-11 w-full" /><Card className="gap-0 overflow-hidden py-0"><Rows count={5} /></Card></div>
      : variant === 'reports' ? <div className="space-y-6"><Bar className="h-8 w-48" /><Bar className="h-4 w-64 max-w-full" /><div className="grid gap-4 md:grid-cols-2"><DetailCard /><DetailCard /></div></div>
      : variant === 'assessment' ? <div className="space-y-6"><Bar className="h-8 w-48" /><Bar className="h-4 w-64 max-w-full" /><DetailCard /><DetailCard /></div>
      : variant === 'history' ? <div className="space-y-5 lg:space-y-3"><DetailCard /><DetailCard /></div>
      : variant === 'profile' || variant === 'check-in' ? <div className="space-y-6"><Bar className="h-8 w-44" /><DetailCard /><DetailCard /></div>
      : <DetailCard />}
  </div>
}
