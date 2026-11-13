import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, MapPin, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import type { AdminDateRange } from '@/lib/admin/admin-filters'
import { loadCalendarCentres } from '@/lib/admin/live-class-calendar'
import { useAuth } from '@/hooks/use-auth'
import CentreCombobox from './CentreCombobox'
import { NativeSelect } from './form-controls'

export default function AdminFilterBar() {
  const { centres } = useAdminData()
  const { pathname } = useLocation()
  const { session } = useAuth()
  const isLiveStudents = pathname === '/admin/students'
  const isLive = pathname === '/admin' || isLiveStudents
  const liveCentres = useQuery({
    queryKey: ['admin', 'overview', 'centres', session?.user.id],
    queryFn: ({ signal }) => loadCalendarCentres(signal),
    enabled: isLive && !!session,
  })
  const { centreId, setCentreId, dateRange, setDateRange } = useAdminFilters()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const activeCentres = useMemo(
    () => (isLive ? liveCentres.data ?? [] : centres).filter((centre) => centre.status === 'active'),
    [centres, isLive, liveCentres.data],
  )

  useEffect(() => {
    if (centreId === 'all') return
    if (isLive && !liveCentres.isSuccess) return
    if (!activeCentres.some((centre) => centre.id === centreId)) setCentreId('all')
  }, [centreId, activeCentres, setCentreId, isLive, liveCentres.isSuccess])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    navigate(
      trimmed
        ? `/admin/students?q=${encodeURIComponent(trimmed)}`
        : '/admin/students',
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isLive && <form onSubmit={handleSearch} className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search students…"
          aria-label="Search students"
          className="h-10 w-full rounded-lg border border-input bg-background pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </form>}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <CentreCombobox
            centres={activeCentres}
            value={centreId}
            onChange={setCentreId}
          />
        </div>

        {!isLive && <div className="flex items-center gap-1.5">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="w-44 shrink-0">
            <NativeSelect
              className="h-10"
              value={dateRange}
              onChange={(event) => setDateRange(Number(event.target.value) as AdminDateRange)}
              aria-label="Date range"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </NativeSelect>
          </div>
        </div>}
      </div>
    </div>
  )
}
