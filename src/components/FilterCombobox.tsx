import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

export interface FilterOption {
  value: string
  label: string
}

/**
 * Single-choice filter used across the admin, instructor and student pages.
 * The field is a button showing the current choice; typing happens in the
 * "Search" box inside the list, so the field itself is never edited.
 */
export default function FilterCombobox({
  options,
  value,
  onChange,
  ariaLabel,
  id,
  emptyText = 'No matches.',
  disabled,
  className,
  contentClassName,
  renderOption,
  resetValue,
}: {
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  id?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
  /** Custom content for an option, e.g. a status pill, in the list and the field. */
  renderOption?: (option: FilterOption) => ReactNode
  /** Shows a "Reset filter" button under the list that restores this value. */
  resetValue?: string
}) {
  const items = useMemo(() => options.map((option) => option.value), [options])
  const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options])
  const selected = byValue.has(value) ? value : (options[0]?.value ?? '')
  const selectedLabel = byValue.get(selected)?.label ?? ''
  const [open, setOpen] = useState(false)

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next) => onChange(next ?? selected)}
      itemToStringLabel={(item) => byValue.get(item)?.label ?? ''}
      isItemEqualToValue={(item, current) => item === current}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
    >
      <ComboboxTrigger
        id={id}
        aria-label={ariaLabel ? `${ariaLabel}: ${selectedLabel}` : undefined}
        disabled={disabled}
        render={
          <Button
            variant="outline"
            className={cn('h-10 w-full min-w-0 cursor-pointer justify-between gap-2 px-4 font-normal', className)}
          />
        }
      >
        <span className="flex min-w-0 items-center truncate">
          {renderOption && byValue.has(selected) ? renderOption(byValue.get(selected)!) : selectedLabel}
        </span>
      </ComboboxTrigger>
      <ComboboxContent className={cn('min-w-56 p-1.5 *:data-[slot=input-group]:m-0 *:data-[slot=input-group]:mb-1.5 *:data-[slot=input-group]:h-10', contentClassName)}>
        <ComboboxInput showTrigger={false} placeholder="Search" aria-label="Search" className="[&_input]:px-2">
          <InputGroupAddon className="pl-3">
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxEmpty className="py-3">{emptyText}</ComboboxEmpty>
        <ComboboxList className="max-h-64 p-0 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          {(item: string) => {
            const option = byValue.get(item)
            return (
              <ComboboxItem key={item} value={item} aria-label={option?.label} className="cursor-pointer gap-2.5 py-2.5 pr-9 pl-3">
                {option && renderOption ? renderOption(option) : (option?.label ?? item)}
              </ComboboxItem>
            )
          }}
        </ComboboxList>
        {resetValue !== undefined && (
          <div className="mt-1.5 border-t pt-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start px-3 font-normal"
              disabled={selected === resetValue}
              onClick={() => {
                onChange(resetValue)
                setOpen(false)
              }}
            >
              <RotateCcw aria-hidden="true" />
              Reset filter
            </Button>
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
