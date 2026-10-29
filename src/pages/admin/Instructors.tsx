import { Mail, Plus } from 'lucide-react'
import CreateInstructorForm from '@/components/auth/CreateInstructorForm'
import PageHeader from '@/components/admin/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { fullName, initials } from '@/lib/admin/format'

export default function Instructors() {
  const { centres, instructors } = useAdminData()
  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Manage"
        title="Instructors"
        description="See who leads each centre and create staff accounts for new instructors."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="overflow-hidden py-0">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Teaching team</CardTitle>
            <CardDescription>
              {instructors.length} instructors across {centres.length} centres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {instructors.map((instructor) => (
              <div
                key={instructor.id}
                className="flex items-start gap-3 rounded-lg border border-border/70 p-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(instructor.firstName, instructor.lastName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{fullName(instructor)}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Mail className="size-3" aria-hidden="true" />
                    {instructor.email}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {instructor.centreIds
                      .map((centreId) => centreNames.get(centreId) ?? centreId)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Plus className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>
              New instructor accounts are created through the secure staff provisioning
              function. The generated password is shown once after creation.
            </p>
          </div>
          <CreateInstructorForm />
        </div>
      </div>
    </div>
  )
}
