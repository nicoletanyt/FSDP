import { useMemo } from 'react'
import { MapPin, Search, X } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'
import EmptyState from '@/components/admin/EmptyState'
import PageHeader from '@/components/admin/PageHeader'
import { CentreStatusBadge } from '@/components/admin/StatusBadge'
import { NativeSelect } from '@/components/admin/form-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin/admin-data-context'
import type { Centre } from '@/lib/admin/types'
import { cn } from 'cn'

const dojoStatusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'under_renovation', label: 'Under renovation' },
]

export default function Centres() {
  const { centres } = useAdminData()
  const [searchParams, setSearchParams] = useSearchParams()

  const legacyStudentsTab = searchParams.get('tab') === 'students'
  const dojoQuery = searchParams.get('dojoQ') ?? ''
  const dojoStatus = searchParams.get('dojoStatus') ?? 'all'

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  function clearDojoFilters() {
    const next = new URLSearchParams(searchParams)
    next.delete('dojoQ')
    next.delete('dojoStatus')
    setSearchParams(next, { replace: true })
  }

  const dojoFiltersActive = [dojoQuery, dojoStatus].filter(
    (value) => value && value !== 'all',
  ).length

  const filteredDojos = useMemo(() => {
    const needle = dojoQuery.trim().toLowerCase()
    return centres.filter((centre) => {
      if (dojoStatus !== 'all' && centre.status !== dojoStatus) return false
      if (!needle) return true
      return [centre.name, centre.shortName, centre.address].some((value) =>
        value.toLowerCase().includes(needle),
      )
    })
  }, [centres, dojoQuery, dojoStatus])

  const activeCount = centres.filter((centre) => centre.status === 'active').length
  const closedCount = centres.filter((centre) => centre.status === 'closed').length
  const renovationCount = centres.filter(
    (centre) => centre.status === 'under_renovation',
  ).length

  // The student directory moved to its own section.
  if (legacyStudentsTab) {
    const next = new URLSearchParams(searchParams)
    next.delete('tab')
    const query = next.toString()
    return <Navigate to={`/admin/students${query ? `?${query}` : ''}`} replace />
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Centres" />
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile label="Dojos" value={`${centres.length}`} />
            <SummaryTile label="Active" value={`${activeCount}`} tone="text-success" />
            <SummaryTile label="Closed" value={`${closedCount}`} tone="text-destructive" />
            <SummaryTile
              label="Under renovation"
              value={`${renovationCount}`}
              tone="text-warning-foreground dark:text-warning"
            />
          </div>

          <Card>
            <CardContent className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-48 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={dojoQuery}
                  onChange={(event) => updateParam('dojoQ', event.target.value)}
                  placeholder="Search by dojo or address"
                  aria-label="Search dojos"
                  className="h-10 w-full rounded-lg border border-input bg-background pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </div>
              <div className="w-full sm:w-48">
                <NativeSelect
                  className="h-10"
                  value={dojoStatus}
                  onChange={(event) => updateParam('dojoStatus', event.target.value)}
                  aria-label="Filter by dojo status"
                >
                  {dojoStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {dojoFiltersActive > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={clearDojoFilters}
                >
                  <X />
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Showing {filteredDojos.length} of {centres.length} dojos
            {dojoFiltersActive > 0
              ? ` · ${dojoFiltersActive} filter${dojoFiltersActive === 1 ? '' : 's'} active`
              : ''}
          </p>

          {filteredDojos.length === 0 ? (
            <EmptyState
              title="No dojos match these filters"
              description="Try another name, address, or operating status."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredDojos.map((centre) => (
                <DojoCard key={centre.id} centre={centre} />
              ))}
            </div>
          )}
        </div>
    </div>
  )
}

function DojoCard({ centre }: { centre: Centre }) {
  const cardClass = cn(
    'flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10',
    centre.status === 'active' &&
      'cursor-pointer transition-colors hover:bg-accent/40 hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  )
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{centre.name}</h3>
          <p className="text-xs text-muted-foreground">{centre.shortName}</p>
        </div>
        <CentreStatusBadge status={centre.status} />
      </div>
      {centre.status === 'active' ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{centre.address}</span>
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className={cn(
            'text-sm font-medium',
            centre.status === 'closed'
              ? 'text-destructive'
              : 'text-amber-800 dark:text-warning',
          )}>
            {centre.status === 'closed' ? 'This dojo is closed' : 'This dojo is under renovation'}
          </p>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{centre.address}</span>
          </p>
        </div>
      )}
    </>
  )

  if (centre.status !== 'active') return <div className={cardClass}>{content}</div>

  return (
    <Link
      to={`/admin/calendar?centre=${encodeURIComponent(centre.id)}`}
      aria-label={`View ${centre.name} in calendar`}
      className={cardClass}
    >
      {content}
    </Link>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  )
}
