import { useState } from 'react'
import type { SubmitEvent } from 'react'
import AccountFields from './AccountFields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { createInstructor } from '@/lib/instructors'
import type { InstructorAccount } from '@/lib/instructors'
import { useEmptyAuthForm } from '@/hooks/use-empty-auth-form'

export default function CreateInstructorForm({ onCreated }: { onCreated?: (account: InstructorAccount) => void } = {}) {
  const formRef = useEmptyAuthForm()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [createdAccount, setCreatedAccount] = useState<InstructorAccount | null>(null)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    setPending(true)
    setError('')
    setCreatedAccount(null)
    try {
      const account = await createInstructor({
        first_name: String(form.get('first_name')).trim(),
        last_name: String(form.get('last_name')).trim(),
        email: String(form.get('email')).trim(),
      })
      element.reset()
      if (onCreated) onCreated(account)
      else setCreatedAccount(account)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create the instructor.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      {createdAccount && (
        <Alert role="status" className="border-success/30 bg-success/10">
          <AlertDescription className="space-y-3 text-foreground">
            <p>Instructor account created for {createdAccount.email}.</p>
            <div>
              <p className="mb-1 font-medium">Generated password</p>
              <code className="block select-all break-all rounded-md bg-background p-3 text-foreground">
                {createdAccount.password}
              </code>
            </div>
            <p>Save and share this password securely. It is only shown after creation.
              The instructor can sign in at /staff/login.</p>
          </AlertDescription>
        </Alert>
      )}
      <form ref={formRef} autoComplete="off" onSubmit={handleSubmit} className="space-y-5" aria-busy={pending}>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <AccountFields instructor />
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating instructor…' : 'Create instructor'}
        </Button>
      </form>
    </div>
  )
}
