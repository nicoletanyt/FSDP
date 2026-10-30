import { UserRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'

export default function InstructorProfile() {
  const { profile } = useAuth()

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your instructor account details.</p>
      </header>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-4 text-muted-foreground" /> Instructor information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-5 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Name</dt><dd className="mt-1 font-medium">{profile ? `${profile.first_name} ${profile.last_name}` : 'Instructor'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 break-all">{profile?.email || '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Role</dt><dd className="mt-1">Instructor</dd></div>
          </dl>
          <p className="border-t pt-4 text-xs text-muted-foreground">Profile editing and additional instructor details are coming soon.</p>
        </CardContent>
      </Card>
    </section>
  )
}
