import { useState } from 'react'
import type { SubmitEvent } from 'react'
import AccountFields from './AccountFields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createInstructor } from '@/lib/instructors'
import type { InstructorAccount } from '@/lib/instructors'
import { useEmptyAuthForm } from '@/hooks/use-empty-auth-form'

export default function CreateInstructorForm() {
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
      setCreatedAccount(account)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create the instructor.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Create an instructor account</CardTitle>
        <CardDescription>A secure password will be generated automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        {createdAccount && (
          <Alert role="status" className="mb-5">
            <AlertDescription className="space-y-3">
              <p>Instructor account created for {createdAccount.email}.</p>
              <div>
                <p className="mb-1 font-medium">Generated password</p>
                <code className="block select-all break-all rounded-md bg-muted p-3 text-foreground">
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
      </CardContent>
    </Card>
  )
}
