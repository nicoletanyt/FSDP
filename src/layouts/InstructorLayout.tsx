import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router'
import InstructorNavigation from '@/components/instructor/InstructorNavigation'
import { calendarHref, findCalendarEvent } from '@/lib/instructor-calendar'
import { cn } from '@/lib/utils'

export type InstructorOutletContext = {
  isKiosk: boolean
  setIsKiosk: (value: boolean) => void
}

export default function InstructorLayout() {
  const { pathname, search } = useLocation()
  const [params] = useSearchParams()
  const isCalendar = pathname === '/instructor/calendar' || pathname === '/instructor/dashboard'
  const isCheckIn = pathname === '/instructor/check-in'
  const isStudentDetails = /^\/instructor\/students\/[^/]+\/?$/.test(pathname)
  const [stationKiosk, setIsKiosk] = useState(false)
  const isKiosk = isCheckIn && stationKiosk
  const stationWidth = 'w-[calc(100%-2rem)] max-w-[1440px] lg:w-[94%]'
  const calendarWidth = 'w-[calc(100%-2rem)] max-w-[1600px] lg:w-[94%]'
  const studentDetailsNavigationWidth = 'w-full max-w-[1248px] lg:w-[calc(92%+3rem)]'
  const contentWidthClassName = isCheckIn ? 'w-full max-w-[1440px] lg:w-[94%]' : isCalendar ? 'w-full max-w-[1600px] lg:w-[94%]' : isStudentDetails ? 'w-full max-w-[1200px] lg:w-[92%]' : 'w-full lg:w-[70%]'
  const [calendarSearch, setCalendarSearch] = useState('')
  const context = findCalendarEvent(params.get('session') ?? params.get('class') ?? undefined)

  useEffect(() => {
    if (isCalendar) setCalendarSearch(search)
  }, [isCalendar, search])

  const calendarTo = isCalendar
    ? `/instructor/calendar${search}`
    : context ? calendarHref(context) : `/instructor/calendar${calendarSearch}`

  return (
    <div className={cn('flex flex-col bg-muted/30 text-foreground', isCalendar ? 'min-h-dvh lg:h-dvh lg:overflow-hidden' : isCheckIn ? 'min-h-dvh md:h-dvh md:overflow-hidden' : 'min-h-dvh', isKiosk && 'h-dvh min-h-0 overflow-hidden')}>
      {!isKiosk && <InstructorNavigation calendarTo={calendarTo} contentWidthClassName={isCheckIn ? stationWidth : isCalendar ? calendarWidth : isStudentDetails ? studentDetailsNavigationWidth : undefined} />}
      <main className={cn('mx-auto p-6 lg:px-0 lg:py-6', contentWidthClassName, isCalendar ? 'flex flex-col lg:min-h-0 lg:flex-1' : isCheckIn ? 'flex min-h-0 flex-1 flex-col lg:py-3' : 'lg:py-8', isKiosk && 'w-full max-w-none p-0 lg:p-0')}>
        <Suspense fallback={<p role="status" className="py-12 text-muted-foreground">Loading…</p>}>
          <Outlet context={{ isKiosk, setIsKiosk } satisfies InstructorOutletContext} />
        </Suspense>
      </main>
      {!isKiosk && <div aria-hidden="true" className={cn('h-24 shrink-0 lg:hidden', isCheckIn && 'md:hidden')} />}
    </div>
  )
}
