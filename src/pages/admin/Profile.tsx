import ChangePasswordDialog from '@/components/profile/ChangePasswordDialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { initials } from '@/lib/admin/format'

export default function Profile() {
  const { profile } = useAuth()

  const name =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    profile?.email ||
    'Administrator'
  const avatar = profile ? initials(profile.first_name, profile.last_name) : 'AD'

  return (
    <section className="w-full space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Profile</h1>
      </header>
      <Card>
        <CardContent className="space-y-5">
          <Avatar className="size-24" role="img" aria-label={`${name}'s profile picture`}>
            <AvatarFallback className="text-3xl">{avatar}</AvatarFallback>
          </Avatar>
          <dl className="space-y-4 border-t pt-5 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="min-w-0 break-words font-medium sm:text-right">{name}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="min-w-0 break-all sm:text-right">{profile?.email || '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ChangePasswordDialog accountType="administrator" />
        </CardContent>
      </Card>
    </section>
  )
}
