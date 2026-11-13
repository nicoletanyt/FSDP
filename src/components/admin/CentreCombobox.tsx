import { useMemo } from 'react'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import type { Centre } from '@/lib/admin/types'
import { cn } from 'cn'

const ALL_CENTRES = 'all'

export default function CentreCombobox({
  centres,
  value,
  onChange,
  id,
  className,
  placeholder = 'Search dojos…',
  ariaLabel = 'Filter by centre',
  includeAll = true,
}: {
  centres: Centre[]
  value: string
  onChange: (centreId: string) => void
  id?: string
  className?: string
  placeholder?: string
  ariaLabel?: string
  includeAll?: boolean
}) {
  const items = useMemo(
    () =>
      includeAll
        ? [ALL_CENTRES, ...centres.map((centre) => centre.id)]
        : centres.map((centre) => centre.id),
    [centres, includeAll],
  )

  const labels = useMemo(() => {
    const map = new Map<string, string>()
    if (includeAll) map.set(ALL_CENTRES, 'All centres')
    for (const centre of centres) map.set(centre.id, centre.name)
    return map
  }, [centres, includeAll])

  const fallback = includeAll ? ALL_CENTRES : (centres[0]?.id ?? '')
  const selected = labels.has(value) ? value : fallback

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next) => onChange(next ?? fallback)}
      itemToStringLabel={(centreId) => labels.get(centreId) ?? ''}
      isItemEqualToValue={(itemValue, currentValue) => itemValue === currentValue}
    >
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn('h-10 w-64 cursor-pointer', className)}
      />
      <ComboboxContent className="w-72">
        <ComboboxEmpty>No dojo found.</ComboboxEmpty>
        <ComboboxList className="max-h-[7.5rem] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          {(centreId: string) => (
            <ComboboxItem key={centreId} value={centreId} className="cursor-pointer">
              {labels.get(centreId) ?? centreId}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
