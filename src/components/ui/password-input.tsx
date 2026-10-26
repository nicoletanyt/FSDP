import { useId, useState } from 'react'
import type { ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function PasswordInput({
  className,
  id,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id ?? generatedId
  const Icon = visible ? EyeOff : Eye

  return (
    <div className="relative">
      <Input
        {...props}
        id={inputId}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-20', className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="absolute inset-y-0 right-1 my-auto"
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={inputId}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {visible ? 'Hide' : 'Show'}
      </Button>
    </div>
  )
}
