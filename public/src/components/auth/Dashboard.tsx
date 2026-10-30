import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'

export default function Dashboard({ title, children }: { title: string; children?: ReactNode }) {
  const { profile } = useAuth()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">Welcome back, {profile?.first_name || 'there'}.</p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Your account</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1 break-all font-medium">{profile?.email}</dd></div>
            <div><dt className="text-muted-foreground">Role</dt><dd className="mt-1 font-medium capitalize">{profile?.role}</dd></div>
          </dl>
        </CardContent>
      </Card>
      {children}
    </section>
  )
}
