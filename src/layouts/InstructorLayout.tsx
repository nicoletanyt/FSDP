import { Suspense, useContext, useEffect, useState } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router'
import InstructorNavigation from '@/components/instructor/InstructorNavigation'
import { InstructorSkeleton } from '@/components/instructor/InstructorSkeletons'
import { createInstructorApi } from '@/lib/instructor/api'
import { InstructorApiContext } from '@/lib/instructor/data-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { pageWidth } from '@/lib/page-width'
import FloatingChatbot from '@/components/FloatingChatbot'

export type InstructorOutletContext = {
  isKiosk: boolean
  setIsKiosk: (value: boolean) => void
}

const instructorApi = createInstructorApi(supabase)

function withoutCoverParam(search: string) {
  const params = new URLSearchParams(search)
  params.delete('cover')
  return params.size ? `?${params}` : ''
}

export default function InstructorLayout() {
  const { pathname, search } = useLocation()
  const injectedApi = useContext(InstructorApiContext)
  const { session, profile } = useAuth()
  const [params] = useSearchParams()
  const isCalendar = pathname === '/instructor/calendar' || pathname === '/instructor/dashboard'
  const isCheckIn = pathname === '/instructor/check-in'
  const isStudentDirectory = /^\/instructor\/students\/?$/.test(pathname)
  const isStudentDetails = /^\/instructor\/students\/[^/]+\/?$/.test(pathname)
  const routeSkeleton = isCalendar ? 'calendar-page' : isStudentDirectory ? 'directory-page' : isStudentDetails ? 'student-detail'
    : pathname.startsWith('/instructor/grading/') ? 'grading-page'
    : pathname.startsWith('/instructor/gradings') ? 'directory-page'
    : pathname.startsWith('/instructor/assessments/') ? 'assessment'
      : isCheckIn ? 'check-in' : 'profile'
  const [stationKiosk, setIsKiosk] = useState(false)
  const isKiosk = isCheckIn && stationKiosk
  const [calendarSearch, setCalendarSearch] = useState('')
  const contextSession = params.get('session') ?? params.get('class')
  const contextParams = new URLSearchParams()
  if (contextSession) {
    contextParams.set('session', contextSession)
    if (params.get('date')) contextParams.set('date', params.get('date')!)
  }

  useEffect(() => {
    if (isCalendar) setCalendarSearch(withoutCoverParam(search))
  }, [isCalendar, search])

  const calendarTo = isCalendar
    ? `/instructor/calendar${withoutCoverParam(search)}`
    : contextSession ? `/instructor/calendar?${contextParams}` : `/instructor/calendar${calendarSearch}`

  return (
    <InstructorApiContext.Provider value={injectedApi ?? instructorApi}>
    <div className={cn('flex flex-col bg-muted/30 text-foreground', isCalendar ? 'min-h-dvh lg:h-dvh lg:overflow-hidden' : isCheckIn ? 'min-h-dvh md:h-dvh md:overflow-hidden' : 'min-h-dvh', isKiosk && 'h-dvh min-h-0 overflow-hidden')}>
      {!isKiosk && <InstructorNavigation calendarTo={calendarTo} />}
      <main className={cn('p-6 lg:py-6', pageWidth, isCalendar ? 'flex flex-col lg:min-h-0 lg:flex-1' : isCheckIn ? 'flex min-h-0 flex-1 flex-col lg:py-3' : 'lg:py-8', isKiosk && 'w-full max-w-none p-0 lg:p-0')}>
        <Suspense fallback={<InstructorSkeleton variant={routeSkeleton} />}>
          <Outlet key={session?.user.id} context={{ isKiosk, setIsKiosk } satisfies InstructorOutletContext} />
        </Suspense>
      </main>
      {!isKiosk && <div aria-hidden="true" className={cn('h-24 shrink-0 lg:hidden', isCheckIn && 'md:hidden')} />}
      {!isKiosk && session && profile?.id === session.user.id && profile.role === 'instructor' && <FloatingChatbot key={session.user.id} userId={session.user.id} />}
    </div>
    </InstructorApiContext.Provider>
  )
}
