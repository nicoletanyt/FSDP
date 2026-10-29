import { Suspense, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import InstructorNavigation from '@/components/instructor/InstructorNavigation'
import { calendarHref, findCalendarEvent } from '@/lib/instructor-calendar'
import { cn } from '@/lib/utils'

export type InstructorOutletContext = {
  isKiosk: boolean
  setIsKiosk: (value: boolean) => void
}

export function InstructorIndexRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/instructor/calendar${search}`} replace />
}

export default function InstructorLayout() {
  const { pathname, search } = useLocation()
  const [params] = useSearchParams()
  const isCalendar = pathname === '/instructor/calendar'
  const isCheckIn = pathname === '/instructor/check-in'
  const [stationKiosk, setIsKiosk] = useState(false)
  const isKiosk = isCheckIn && stationKiosk
  const stationWidth = 'w-[calc(100%-2rem)] max-w-[1440px] sm:w-[94%]'
  const contentWidthClassName = isCheckIn ? stationWidth : isCalendar ? 'w-[80%]' : 'w-[70%]'
  const [calendarSearch, setCalendarSearch] = useState('')
  const context = findCalendarEvent(params.get('session') ?? params.get('class') ?? undefined)

  useEffect(() => {
    if (isCalendar) setCalendarSearch(search)
  }, [isCalendar, search])

  const calendarTo = isCalendar
    ? `/instructor/calendar${search}`
    : context ? calendarHref(context) : `/instructor/calendar${calendarSearch}`

  return (
    <div className={cn('flex flex-col bg-muted/30 text-foreground', isCalendar ? 'h-dvh overflow-hidden' : isCheckIn ? 'min-h-dvh md:h-dvh md:overflow-hidden' : 'min-h-dvh', isKiosk && 'h-dvh min-h-0 overflow-hidden')}>
      {!isKiosk && <InstructorNavigation calendarTo={calendarTo} contentWidthClassName={isCheckIn ? stationWidth : undefined} />}
      <main className={cn('mx-auto py-6', contentWidthClassName, isCalendar ? 'flex min-h-0 flex-1 flex-col py-4 sm:py-6' : isCheckIn ? 'flex min-h-0 flex-1 flex-col py-3' : 'sm:py-8', isKiosk && 'w-full max-w-none py-0 sm:w-full')}>
        <Suspense fallback={<p role="status" className="py-12 text-muted-foreground">Loading…</p>}>
          <Outlet context={{ isKiosk, setIsKiosk } satisfies InstructorOutletContext} />
        </Suspense>
      </main>
    </div>
  )
}
