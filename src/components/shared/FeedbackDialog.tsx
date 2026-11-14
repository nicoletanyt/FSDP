import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type FeedbackVariant = 'success' | 'error' | 'info'

export type FeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant?: FeedbackVariant
  title: string
  description?: string
  actionLabel?: string
}

const ICONS = {
  success: { Icon: CircleCheck, className: 'bg-success/10 text-success' },
  error: { Icon: CircleAlert, className: 'bg-destructive/10 text-destructive' },
  info: { Icon: Info, className: 'bg-muted text-muted-foreground' },
} as const

export function FeedbackDialog({
  open,
  onOpenChange,
  variant = 'success',
  title,
  description,
  actionLabel = 'Done',
}: FeedbackDialogProps) {
  const { Icon, className } = ICONS[variant]
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="compact">
        <AlertDialogHeader>
          <AlertDialogMedia className={className}>
            <Icon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="whitespace-pre-line">{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
