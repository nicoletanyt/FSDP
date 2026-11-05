import { useContext, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { InstructorLoadingContext } from '@/lib/instructor/loading-context'

export default function InstructorDataStatus({ loading, error, onRetry }: {
  loading?: boolean
  error?: string | null
  onRetry: () => void
}) {
  const registerLoading = useContext(InstructorLoadingContext)
  const id = useId()
  useEffect(() => {
    if (loading && registerLoading) return registerLoading(id)
  }, [loading, registerLoading, id])

  if (loading && registerLoading) return null
  return <div className="space-y-2 p-4">
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      : <><p role="alert" className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={onRetry}>Try again</Button></>}
  </div>
}
