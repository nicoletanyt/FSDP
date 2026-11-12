import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Mail, Plus, Search, X } from 'lucide-react'
import CreateInstructorForm from '@/components/auth/CreateInstructorForm'
import PageHeader from '@/components/admin/PageHeader'
import EmptyState from '@/components/admin/EmptyState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { UserProfile } from '@/lib/auth'
import { fullName, initials } from '@/lib/admin/format'
import { instructorEmailMessage } from '@/lib/instructors'
import type { InstructorAccount } from '@/lib/instructors'
import { supabase } from '@/lib/supabase'
import GradeBadge from '@/components/instructor/DatabaseGradeBadge'
import type { GradeRow } from '@/lib/instructor/types'
import { setExaminer } from '@/lib/admin/grading-panels'

type InstructorProfile = Pick<UserProfile, 'id' | 'first_name' | 'last_name' | 'email'> & {
  instructors: { id: string; is_examiner: boolean; grade: GradeRow | null } | null
}

function ExaminerToggle({ instructorId, name, initial }: { instructorId: string; name: string; initial: boolean }) {
  const [checked, setChecked] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setChecked(initial) }, [initial])

  async function change(next: boolean) {
    setPending(true)
    setError('')
    try { setChecked(await setExaminer(supabase, instructorId, next)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update the examiner status. Try again.') }
    finally { setPending(false) }
  }

  return <div className="flex shrink-0 flex-col items-end gap-1">
    <label className="flex min-h-11 items-center gap-2 text-sm has-disabled:opacity-50">
      <input type="checkbox" className="size-4 accent-primary" checked={checked} disabled={pending}
        aria-label={`${name} can examine gradings`} onChange={event => void change(event.target.checked)} />
      Examiner
    </label>
    {error && <p role="alert" className="max-w-56 text-right text-xs text-destructive">{error}</p>}
  </div>
}

export default function Instructors() {
  const [instructors, setInstructors] = useState<InstructorProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createdAccount, setCreatedAccount] = useState<InstructorAccount | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('users')
      .select('id, first_name, last_name, email, instructors(id, is_examiner, grade:grades(id, label, colour, is_ranked, sort_order))')
      .eq('role', 'instructor')
      .order('first_name')
      .order('last_name')

    if (queryError) setError('Unable to load instructor accounts. Try again.')
    else {
      setInstructors((data ?? []) as unknown as InstructorProfile[])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const search = query.trim().toLowerCase()
  const filtered = instructors.filter((instructor) =>
    [instructor.first_name, instructor.last_name,
      `${instructor.first_name} ${instructor.last_name}`, instructor.email]
      .some((value) => value.toLowerCase().includes(search)),
  )

  function handleCreated(account: InstructorAccount) {
    setCreatedAccount(account)
    setCreateOpen(false)
    void reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Instructors" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            aria-label="Search instructors by name or email"
            className="pl-9"
          />
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button type="button" />}>
            <Plus className="size-4" aria-hidden="true" />
            Create instructor
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create instructor</DialogTitle>
              <DialogDescription>
                A password will be generated and emailed with the instructor’s login details. It will also be shown once after creation.
              </DialogDescription>
            </DialogHeader>
            {createOpen && <CreateInstructorForm onCreated={handleCreated} />}
          </DialogContent>
        </Dialog>
      </div>

      {createdAccount && (
        <Alert role="status" className={createdAccount.email_status === 'accepted' ? 'border-success/30 bg-success/10 p-4' : 'border-warning/30 bg-warning/10 p-4'}>
          {createdAccount.email_status === 'accepted'
            ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            : <AlertTriangle className="size-5 text-warning-foreground dark:text-warning" aria-hidden="true" />}
          <AlertDescription className="min-w-0 space-y-3 text-foreground">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">Instructor account created for {createdAccount.email}.</p>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="-m-2 shrink-0"
                aria-label="Dismiss generated password"
                onClick={() => setCreatedAccount(null)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <p>{instructorEmailMessage(createdAccount.email_status)}</p>
            <div>
              <p className="mb-1 font-medium">Generated password</p>
              <code className="block select-all break-all rounded-md bg-background p-3 text-foreground">
                {createdAccount.password}
              </code>
            </div>
            <p>Save this password now; it won’t be shown again after you dismiss this alert or leave the page. The instructor can sign in at /staff/login.</p>
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Instructor accounts" className="space-y-3">
        {!loading && !error && (
          <p className="text-sm text-muted-foreground">
            {search ? `${filtered.length} of ${instructors.length} instructors` : `${instructors.length} instructors`}
          </p>
        )}

        <div aria-busy={loading}>
          {loading && <p className="py-4 text-sm text-muted-foreground">Loading instructor accounts…</p>}
          {!loading && error && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center gap-2">
                {error}
                <Button type="button" variant="outline" size="xs" onClick={() => void reload()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              title={search ? 'No instructors found' : 'No instructor accounts yet'}
              description={search ? 'Try another name or email address.' : 'Create an instructor account to see it here.'}
            />
          )}
          {!loading && !error && filtered.length > 0 && (
            <ul className="divide-y divide-border border-y border-border">
              {filtered.map((instructor) => (
                <li key={instructor.id} className="flex items-center gap-3 py-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(instructor.first_name, instructor.last_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {fullName({ firstName: instructor.first_name, lastName: instructor.last_name }) ||
                        instructor.email}
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Mail className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{instructor.email}</span>
                    </p>
                    <div className="mt-1"><GradeBadge grade={instructor.instructors?.grade ?? null} /></div>
                  </div>
                  {instructor.instructors && <ExaminerToggle instructorId={instructor.instructors.id}
                    name={fullName({ firstName: instructor.first_name, lastName: instructor.last_name }) || instructor.email}
                    initial={instructor.instructors.is_examiner} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

    </div>
  )
}
