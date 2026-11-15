import { useCallback, useMemo, useRef, useState } from 'react'
import { FeedbackDialog, type FeedbackVariant } from '@/components/shared/FeedbackDialog'

type Notice = {
  variant?: FeedbackVariant
  title: string
  description?: string
  actionLabel?: string
  /** Runs after the dialog is dismissed (e.g. navigate away). */
  onClose?: () => void
}

/**
 * One-line success/error confirmations in an AlertDialog.
 * Call `notify(...)` and render `{feedbackDialog}` once in the page.
 */
export function useFeedback() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [open, setOpen] = useState(false)
  const onCloseRef = useRef<(() => void) | undefined>(undefined)

  const notify = useCallback((next: Notice) => {
    setNotice(next)
    onCloseRef.current = next.onClose
    setOpen(true)
  }, [])

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      const cb = onCloseRef.current
      onCloseRef.current = undefined
      cb?.()
    }
  }, [])

  const feedbackDialog = (
    <FeedbackDialog
      open={open}
      onOpenChange={handleOpenChange}
      variant={notice?.variant ?? 'success'}
      title={notice?.title ?? ''}
      description={notice?.description}
      actionLabel={notice?.actionLabel}
    />
  )

  return useMemo(() => ({ notify, feedbackDialog }), [notify, feedbackDialog])
}
