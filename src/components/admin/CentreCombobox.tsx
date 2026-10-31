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
}: {
  centres: Centre[]
  value: string
  onChange: (centreId: string) => void
  id?: string
  className?: string
  placeholder?: string
  ariaLabel?: string
}) {
  const items = useMemo(
    () => [ALL_CENTRES, ...centres.map((centre) => centre.id)],
    [centres],
  )

  const labels = useMemo(() => {
    const map = new Map<string, string>([[ALL_CENTRES, 'All centres']])
    for (const centre of centres) map.set(centre.id, centre.name)
    return map
  }, [centres])

  const selected = labels.has(value) ? value : ALL_CENTRES

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next) => onChange(next ?? ALL_CENTRES)}
      itemToStringLabel={(centreId) => labels.get(centreId) ?? ''}
      isItemEqualToValue={(itemValue, currentValue) => itemValue === currentValue}
    >
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn('w-64 cursor-pointer', className)}
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
