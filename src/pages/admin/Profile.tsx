import { useState } from 'react'
import { CalendarDays, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { formatDate, initials } from '@/lib/admin/format'

export default function Profile() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  const name = profile ? `${profile.first_name} ${profile.last_name}` : 'Administrator'
  const avatar = profile ? initials(profile.first_name, profile.last_name) : 'AD'
  const joined = profile?.created_at ? formatDate(profile.created_at.slice(0, 10)) : '—'

  async function handleSignOut() {
    setSigningOut(true)
    setError('')

    try {
      await signOut()
      navigate('/staff/login', { replace: true })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign out.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Account"
        title="Administrator profile"
        description="Review your account details and end your administrator session."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>
              Your profile is managed by Supabase Auth. Contact another administrator if
              these details need to change.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                {avatar}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {profile?.email ?? 'No email on file'}
                </p>
                <Badge variant="secondary" className="mt-2">
                  Administrator
                </Badge>
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  Full name
                </dt>
                <dd className="mt-1 truncate text-sm font-medium">{name}</dd>
              </div>

              <div className="rounded-lg border border-border p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="size-3.5" aria-hidden="true" />
                  Email
                </dt>
                <dd className="mt-1 truncate text-sm font-medium">
                  {profile?.email ?? '—'}
                </dd>
              </div>

              <div className="rounded-lg border border-border p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  Role
                </dt>
                <dd className="mt-1 text-sm font-medium">Administrator</dd>
              </div>

              <div className="rounded-lg border border-border p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  Member since
                </dt>
                <dd className="mt-1 text-sm font-medium">{joined}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign out</CardTitle>
            <CardDescription>
              End this administrator session on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              variant="destructive"
              className="w-full"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>

            <p className="text-xs text-muted-foreground">
              You will be returned to the staff sign-in page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
