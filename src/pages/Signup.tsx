import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import AccountFields from '@/components/auth/AccountFields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useEmptyAuthForm } from '@/hooks/use-empty-auth-form'

export default function Signup() {
  const formRef = useEmptyAuthForm()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: String(form.get('email')).trim(),
        password: String(form.get('password')),
        options: {
          data: {
            first_name: String(form.get('first_name')).trim(),
            last_name: String(form.get('last_name')).trim(),
          },
        },
      })
      if (authError) throw authError
      if (!data.session) {
        throw new Error('Your account was created, but automatic sign-in is unavailable. Please try signing in.')
      }
      // The authenticated session lets GuestRoute redirect to /dashboard.
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create your account. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create a student account</CardTitle>
        <CardDescription>Enter your details to get started.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} autoComplete="off" onSubmit={handleSubmit} className="space-y-5" aria-busy={pending}>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <AccountFields />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        <p>Already have an account? <Link to="/login" className="font-medium text-foreground underline">Sign in</Link></p>
      </CardFooter>
    </Card>
  )
}
