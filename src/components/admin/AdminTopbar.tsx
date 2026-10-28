import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, Menu, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import type { AdminDateRange } from '@/lib/admin/admin-filters'
import { initials } from '@/lib/admin/format'
import { NativeSelect } from './form-controls'

export default function AdminTopbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { profile } = useAuth()
  const { centres, notifications } = useAdminData()
  const { centreId, setCentreId, dateRange, setDateRange } = useAdminFilters()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const unread = notifications.filter((notification) => notification.channel === 'in_app').length

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    navigate(trimmed ? `/admin/centres?q=${encodeURIComponent(trimmed)}` : '/admin/centres')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <form onSubmit={handleSearch} className="relative min-w-48 flex-1 sm:max-w-xs">
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
          className="h-8 w-full rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </form>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="w-40">
          <NativeSelect
            value={centreId}
            onChange={(event) => setCentreId(event.target.value)}
            aria-label="Filter by centre"
          >
            <option value="all">All centres</option>
            {centres.map((centre) => (
              <option key={centre.id} value={centre.id}>
                {centre.shortName}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="w-32">
          <NativeSelect
            value={dateRange}
            onChange={(event) => setDateRange(Number(event.target.value) as AdminDateRange)}
            aria-label="Date range"
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </NativeSelect>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          render={<Link to="/admin/notifications" />}
          className="relative"
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-brand-red" aria-hidden="true" />
          )}
        </Button>

        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {profile ? initials(profile.first_name, profile.last_name) : 'AD'}
        </span>
      </div>
    </div>
  )
}
