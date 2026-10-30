import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { useEmptyAuthForm } from '@/hooks/use-empty-auth-form'
import { supabase } from '@/lib/supabase'

export default function Login({ staff = false }: { staff?: boolean }) {
  const formRef = useEmptyAuthForm()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw authError
      // GuestRoute redirects using the database profile once it is loaded.
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{staff ? 'Staff sign in' : 'Student sign in'}</CardTitle>
        <CardDescription>
          {staff ? 'Administrator and instructor access.' : 'Sign in to your student account.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          autoComplete="off"
          onReset={() => { setEmail(''); setPassword('') }}
          onSubmit={handleSubmit}
          className="space-y-5"
          aria-busy={pending}
        >
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required maxLength={254} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
        {!staff && <p>New here? <Link to="/signup" className="font-medium text-foreground underline">Create an account</Link></p>}
        <Link to={staff ? '/login' : '/staff/login'} className="underline">
          {staff ? 'Student sign in' : 'Administrator or instructor?'}
        </Link>
      </CardFooter>
    </Card>
  )
}
