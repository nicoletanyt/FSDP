import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function RetryAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        {message}
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
      </AlertDescription>
    </Alert>
  )
}
