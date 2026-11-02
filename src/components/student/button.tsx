import type { ComponentProps } from 'react'
import { Button as BaseButton, buttonVariants as baseButtonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ButtonOptions = NonNullable<Parameters<typeof baseButtonVariants>[0]>

function spacing(size: ButtonOptions['size']) {
  return size?.startsWith('icon')
    ? 'size-10 p-0'
    : 'h-auto min-h-10 gap-2 px-3 py-2'
}

function buttonVariants({ className, class: classProp, ...options }: ButtonOptions = {}) {
  return cn(baseButtonVariants(options), spacing(options.size), classProp, className)
}

function Button({ className, size, ...props }: ComponentProps<typeof BaseButton>) {
  return <BaseButton {...props} size={size} className={cn(spacing(size), className)} />
}

export { Button, buttonVariants }
