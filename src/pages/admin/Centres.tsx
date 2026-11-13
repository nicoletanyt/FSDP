import { useMemo } from 'react'
import { Building2, CircleCheck, CircleX, Construction, MapPin } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router'
import EmptyState from '@/components/admin/EmptyState'
import PageHeader from '@/components/admin/PageHeader'
import StatCard from '@/components/admin/StatCard'
import { CentreStatusBadge } from '@/components/admin/StatusBadge'
import FilterPopover, { FilterField } from '@/components/FilterPopover'
import { useAdminData } from '@/lib/admin/admin-data-context'
import type { Centre } from '@/lib/admin/types'
import SearchInput from '@/components/SearchInput'

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
            <StatCard label="Dojos" value={`${centres.length}`} icon={Building2} />
            <StatCard label="Active" value={`${activeCount}`} icon={CircleCheck} tone="success" />
            <StatCard label="Closed" value={`${closedCount}`} icon={CircleX} tone="danger" />
            <StatCard label="Under renovation" value={`${renovationCount}`} icon={Construction} tone="warning" />
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <SearchInput
                value={dojoQuery}
                onChange={(event) => updateParam('dojoQ', event.target.value)}
                placeholder="Search by dojo or address"
                aria-label="Search dojos"
              />
              <FilterPopover title="Filter dojos" activeCount={dojoStatus !== 'all' ? 1 : 0}
                onReset={() => updateParam('dojoStatus', 'all')}>
                <FilterField
                  label="Status"
                  value={dojoStatus}
                  onChange={(value) => updateParam('dojoStatus', value)}
                  ariaLabel="Status filter"
                  options={dojoStatusOptions}
                  renderOption={(option) => option.value === 'all' ? option.label : <CentreStatusBadge status={option.value as Centre['status']} />}
                />
              </FilterPopover>
          </div>

          <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Showing {filteredDojos.length} of {centres.length} dojos
          </p>

          {filteredDojos.length === 0 ? (
            <EmptyState
              title="No dojos match these filters"
              description="Try another name, address, or operating status."
            />
          ) : (
            <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredDojos.map((centre) => (
                <DojoCard key={centre.id} centre={centre} />
              ))}
            </div>
          )}
          </div>
        </div>
    </div>
  )
}

function DojoCard({ centre }: { centre: Centre }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{centre.name}</h3>
          <p className="text-xs text-muted-foreground">{centre.shortName}</p>
        </div>
        <CentreStatusBadge status={centre.status} />
      </div>
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{centre.address}</span>
      </p>
    </div>
  )
}
