import { Button } from '@/components/ui/button'
import { InstructorSkeleton } from './InstructorSkeletons'

export default function InstructorDataStatus({ loading, error, onRetry, variant }: {
  loading?: boolean
  error?: string | null
  onRetry: () => void
  variant?: 'inline' | 'card' | 'directory' | 'roster' | 'history' | 'calendar' | 'assessment' | 'grading'
}) {
  if (loading) return <InstructorSkeleton variant={variant} />
  return <div className="space-y-2 p-4">
    <p role="alert" className="text-sm text-destructive">{error}</p>
    <Button variant="outline" onClick={onRetry}>Try again</Button>
  </div>
}
