import { matchPath, useLocation } from 'react-router'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CardListSkeleton, DetailSkeleton, FormSkeleton, PageSkeleton, TableSkeleton } from '@/components/shared/skeletons'
import { cn } from '@/lib/utils'

/**
 * Route-shaped loading states for the student portal (as InstructorSkeleton
 * does for instructors). Each mirrors its page's real layout and height, so the
 * whole first-load chain (account → route → membership → data) shows one
 * stable shape and the page doesn't jump when the content arrives.
 */
export type StudentSkeletonVariant = 'dashboard' | 'schedule' | 'classes' | 'payments' | 'credits' | 'profile' | 'form' | 'page'

const routes: [string, StudentSkeletonVariant][] = [
  ['/dashboard', 'dashboard'],
  ['/timetable', 'schedule'],
  ['/classes', 'classes'],
  ['/classes/choose', 'classes'],
  ['/payments', 'payments'],
  ['/student/credits', 'credits'],
  ['/profile', 'profile'],
  ['/grading', 'form'],
  ['/grading/*', 'form'],
  ['/apply-membership', 'form'],
]

export function studentSkeletonFor(pathname: string): StudentSkeletonVariant | null {
  return routes.find(([path]) => matchPath(path, pathname))?.[1] ?? null
}

function Bar({ className }: { className: string }) {
  return <Skeleton className={className} />
}

/** Matches PageHeader's h1 (text-2xl, md:text-3xl). */
function Title({ className = 'w-48' }: { className?: string }) {
  return <Bar className={cn('h-8 max-w-full md:h-9', className)} />
}

function Dashboard() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Title className="w-64" />

      {/* Carousel: one "next class" card, then the dots and arrows. */}
      <div className="grid gap-3">
        <Card className="min-h-72 w-full gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Bar className="size-7 rounded-lg" />
            <Bar className="h-3 w-28" />
          </div>
          <div className="grid gap-2">
            <Bar className="h-4 w-40" />
            <Bar className="h-8 w-32 sm:h-9" />
            <Bar className="h-6 w-52 max-w-full" />
          </div>
          <div className="grid gap-2">
            <Bar className="h-4 w-44 max-w-full" />
            <Bar className="h-4 w-36" />
          </div>
          <Bar className="mt-auto h-11 w-full" />
        </Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center">
            {['w-6', 'w-2', 'w-2'].map((width, index) => (
              <span key={index} className="grid size-11 place-items-center">
                <Bar className={cn('h-2 rounded-full', width)} />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Bar className="size-11 rounded-full" />
            <Bar className="size-11 rounded-full" />
          </div>
        </div>
      </div>

      {/* Quick actions: 2×2 tiles, stacked on phones and rows from sm. */}
      <div className="grid gap-3">
        <Bar className="h-6 w-32" />
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex min-w-0 flex-col items-start gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:min-h-18 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
              <Bar className="size-10 shrink-0 rounded-lg" />
              <div className="grid w-full min-w-0 flex-1 gap-1.5">
                <Bar className="h-4 w-3/4" />
                <Bar className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity. */}
      <Card className="gap-3 p-4">
        <Bar className="h-6 w-36" />
        <div className="-mx-4 divide-y">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3">
              <Bar className="size-9 shrink-0 rounded-lg" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Bar className="h-4 w-2/3" />
                <Bar className="h-3 w-1/3" />
              </div>
              <Bar className="h-4 w-14 shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/** The timetable switches to its phone layout below 785px, like the page itself. */
function Schedule() {
  return (
    <div className="space-y-4">
      <Title className="w-44" />

      {/* Wide: toolbar, then a week of day columns filling the screen. */}
      <div className="hidden space-y-3 min-[785px]:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bar className="h-10 w-20" />
            <Bar className="size-10" />
            <Bar className="size-10" />
            <Bar className="ml-2 h-6 w-44" />
          </div>
          <div className="flex items-center gap-2">
            <Bar className="h-10 w-28" />
            <Bar className="h-10 w-40" />
          </div>
        </div>
        <div className="grid h-[calc(100dvh-18rem)] min-h-96 grid-cols-4 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 xl:grid-cols-7">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="space-y-3 bg-card p-3 max-xl:[&:nth-child(n+5)]:hidden">
              <Bar className="h-4 w-16" />
              {index % 3 !== 2 && <Bar className="h-20 w-full" />}
              {index % 2 === 0 && <Bar className="h-14 w-full" />}
            </div>
          ))}
        </div>
      </div>

      {/* Phone: week strip, then the day's classes. */}
      <div className="space-y-4 min-[785px]:hidden">
        <div className="flex items-center justify-between gap-3">
          <Bar className="h-6 w-36" />
          <div className="flex gap-2">
            <Bar className="size-11 rounded-full" />
            <Bar className="size-11 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, index) => <Bar key={index} className="h-14 w-full rounded-lg" />)}
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} size="sm" className="gap-2 px-4">
            <Bar className="h-4 w-24" />
            <Bar className="h-5 w-2/3" />
            <Bar className="h-3 w-1/2" />
          </Card>
        ))}
      </div>
    </div>
  )
}

function Classes() {
  return (
    <div className="space-y-6">
      <Title className="w-36" />
      <div className="flex flex-wrap gap-2">
        <Bar className="h-10 w-full max-w-sm" />
        <Bar className="h-10 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="gap-3 px-4">
            <Bar className="h-5 w-1/2" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
            <Bar className="mt-2 h-10 w-32" />
          </Card>
        ))}
      </div>
    </div>
  )
}

function Credits() {
  return (
    <div className="space-y-6">
      <Title className="w-32" />
      <Card className="gap-3 px-4 sm:px-5">
        <Bar className="h-3 w-28" />
        <Bar className="h-10 w-24" />
        <Bar className="h-4 w-40" />
      </Card>
      <Bar className="h-6 w-28" />
      <CardListSkeleton count={2} label="Loading your passes…" />
    </div>
  )
}

function Profile() {
  return (
    <div className="space-y-6">
      <Title className="w-40" />
      {/* Membership card. */}
      <Bar className="aspect-[1.586] w-full max-w-md rounded-2xl" />
      <DetailSkeleton sections={1} label="Loading your membership…" />
    </div>
  )
}

function Body({ variant }: { variant: StudentSkeletonVariant }) {
  switch (variant) {
    case 'dashboard': return <Dashboard />
    case 'schedule': return <Schedule />
    case 'classes': return <Classes />
    case 'credits': return <Credits />
    case 'profile': return <Profile />
    case 'payments': return <div className="space-y-6"><Title className="w-36" /><TableSkeleton rows={5} cols={5} label="Loading payments…" /></div>
    case 'form': return <div className="space-y-6"><Title className="w-56" /><Card className="px-4 sm:px-6"><FormSkeleton fields={4} /></Card></div>
    default: return <PageSkeleton />
  }
}

export function StudentSkeleton({ variant, label = 'Loading…' }: { variant: StudentSkeletonVariant; label?: string }) {
  if (variant === 'page') return <PageSkeleton label={label} />
  return (
    <div role="status" aria-busy="true" className="w-full" data-student-skeleton={variant}>
      <span className="sr-only">{label}</span>
      {/* Inner status regions are nested; hide them so one message is announced. */}
      <div aria-hidden="true"><Body variant={variant} /></div>
    </div>
  )
}

/** The skeleton for the current route, or the generic one off the student routes. */
export function StudentRouteSkeleton({ label }: { label?: string }) {
  const { pathname } = useLocation()
  return <StudentSkeleton variant={studentSkeletonFor(pathname) ?? 'page'} label={label} />
}
