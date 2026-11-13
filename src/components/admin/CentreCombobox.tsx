import { useMemo } from 'react'
import FilterCombobox from '@/components/FilterCombobox'
import type { Centre } from '@/lib/admin/types'
import { cn } from 'cn'

const ALL_CENTRES = 'all'

export default function CentreCombobox({
  centres,
  value,
  onChange,
  id,
  className,
  ariaLabel = 'Filter by centre',
  includeAll = true,
}: {
  centres: Centre[]
  value: string
  onChange: (centreId: string) => void
  id?: string
  className?: string
  ariaLabel?: string
  includeAll?: boolean
}) {
  const options = useMemo(
    () => [
      ...(includeAll ? [{ value: ALL_CENTRES, label: 'All centres' }] : []),
      ...centres.map((centre) => ({ value: centre.id, label: centre.name })),
    ],
    [centres, includeAll],
  )

  return (
    <FilterCombobox
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      emptyText="No dojo found."
      className={cn('w-64', className)}
      contentClassName="w-72"
    />
  )
}
