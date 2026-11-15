import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'

// Two or more mutually exclusive views (pressed buttons in one outlined group).
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; text: string; icon?: LucideIcon }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border bg-background p-0.5">
      {options.map(({ value: option, text, icon: Icon }) => (
        <Button key={option} type="button" size="sm" variant={value === option ? 'secondary' : 'ghost'}
          aria-pressed={value === option} onClick={() => onChange(option)} className="h-9 gap-1.5 px-3">
          {Icon && <Icon className="size-4" aria-hidden="true" />}
          <span className={cn(Icon && 'max-sm:sr-only')}>{text}</span>
        </Button>
      ))}
    </div>
  )
}
