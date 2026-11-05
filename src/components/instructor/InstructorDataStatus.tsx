import { Button } from '@/components/ui/button'

export default function InstructorDataStatus({ loading, error, onRetry }: {
  loading?: boolean
  error?: string | null
  onRetry: () => void
}) {
  return <div className="space-y-2 p-4">
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      : <><p role="alert" className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={onRetry}>Try again</Button></>}
  </div>
}
