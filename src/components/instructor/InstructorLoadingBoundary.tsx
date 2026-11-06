import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { InstructorLoadingContext } from '@/lib/instructor/loading-context'

export default function InstructorLoadingBoundary({ children, title = 'Loading student details' }: { children: ReactNode; title?: string }) {
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const registerLoading = useCallback((id: string) => {
    setPending(current => new Set(current).add(id))
    return () => setPending(current => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  return <InstructorLoadingContext.Provider value={registerLoading}>
    {children}
    <Dialog open={pending.size > 0} onOpenChange={(open, details) => { if (!open) details.cancel() }}>
      <DialogContent showCloseButton={false} className="student-detail-view sm:max-w-xs">
        <DialogHeader className="items-center gap-3 py-4 text-center">
          <Spinner className="size-6 motion-reduce:animate-none" />
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Please wait while the student records load.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  </InstructorLoadingContext.Provider>
}
