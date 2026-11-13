import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Eye, Mail, PencilLine, Plus, Undo2 } from 'lucide-react'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

type TemplateId = 'grading_invitation' | 'attendance_notice' | 'instructor_account'
type EmailTemplate = { id: TemplateId; subject: string; body: string; updated_at: string }

/** A detail filled in automatically when the email is sent. */
type Detail = { token: string; label: string; sample: string; once?: boolean }

const gradingLink = 'https://fsdp-kappa.vercel.app/grading'

const templates: { id: TemplateId; title: string; description: string; details: Detail[] }[] = [
  {
    id: 'grading_invitation', title: 'Grading invitation', description: 'To students who can grade',
    details: [
      { token: '{{children_grading_date}}', label: "Children's grading date", sample: 'Saturday 14 March 2026' },
      { token: '{{children_application_close_date}}', label: "Children's apply-by date", sample: '28 February 2026' },
      { token: '{{adult_grading_date}}', label: 'Adult grading date', sample: 'Sunday 15 March 2026' },
      { token: '{{adult_application_close_date}}', label: 'Adult apply-by date', sample: '1 March 2026' },
      { token: gradingLink, label: 'Link to apply', sample: gradingLink, once: true },
    ],
  },
  {
    id: 'attendance_notice', title: 'Attendance check-in', description: 'To students missing classes',
    details: [{ token: '{{student_name}}', label: 'Student name', sample: 'Alex Tan' }],
  },
  {
    id: 'instructor_account', title: 'New instructor welcome', description: 'To newly added instructors',
    details: [
      { token: '{{first_name}}', label: 'First name', sample: 'Jamie' },
      { token: '{{login_url}}', label: 'Sign-in link', sample: 'https://fsdp-kappa.vercel.app/staff/login' },
      { token: '{{email}}', label: 'Email address', sample: 'jamie@example.com' },
      { token: '{{password}}', label: 'Temporary password', sample: 'k7-Hq2-pL9' },
    ],
  },
]

function problem(details: Detail[], subject: string, body: string): string | null {
  if (!subject.trim()) return 'Add a subject.'
  if (/[\r\n]/.test(subject)) return 'Keep the subject on one line.'
  if (subject.length > 150) return 'Shorten the subject to 150 characters or fewer.'
  if (!body.trim()) return 'Add a message.'
  if (body.length > 5000) return 'Shorten the message to 5,000 characters or fewer.'
  const missing = details.find(detail => !body.includes(detail.token))
  if (missing) return `Add “${missing.label}” back into the message.`
  const repeated = details.find(detail => detail.once && body.split(detail.token).length > 2)
  if (repeated) return `Use “${repeated.label}” only once.`
  const unknown = body.match(/\{\{[^}]*\}\}/g)?.find(token => !details.some(detail => detail.token === token))
  if (unknown) return `Remove “${unknown}” — it can't be filled in automatically.`
  return null
}

function preview(details: Detail[], text: string) {
  return details.reduce((result, detail) => result.split(detail.token).join(detail.sample), text)
}

export default function EmailTemplates() {
  const { session } = useAuth()
  const directory = useQuery({
    queryKey: ['admin', 'email-templates', session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<EmailTemplate[]> => {
      const { data, error } = await supabase.from('admin_email_templates').select('id,subject,body,updated_at')
      if (error) throw error
      return data as EmailTemplate[]
    },
    refetchOnWindowFocus: true,
  })
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const changed = !!editing && (subject !== editing.subject || body !== editing.body)
  const selected = templates.find(item => item.id === editing?.id)

  // Earlier versions for Undo. Typing is grouped into one step per pause;
  // inserting a detail or discarding is always its own step.
  const [history, setHistory] = useState<{ subject: string; body: string }[]>([])
  const lastStep = useRef(0)

  function edit(nextSubject: string, nextBody: string, newStep = false) {
    if (nextSubject === subject && nextBody === body) return
    const now = Date.now()
    if (newStep || now - lastStep.current > 1000) setHistory(previous => [...previous, { subject, body }].slice(-50))
    lastStep.current = newStep ? 0 : now
    setSubject(nextSubject)
    setBody(nextBody)
    setError('')
    setSaved(false)
  }

  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    setHistory(history.slice(0, -1))
    lastStep.current = 0
    setSubject(previous.subject)
    setBody(previous.body)
    setError('')
    setSaved(false)
  }

  function open(template: EmailTemplate) {
    setEditing(template)
    setSubject(template.subject)
    setBody(template.body)
    setHistory([])
    setError('')
    setSaved(false)
    setPreviewing(false)
  }

  function changeOpen(next: boolean) {
    if (next || saving) return
    if (changed && !window.confirm('Close without saving your changes?')) return
    setEditing(null)
  }

  // Insert a detail where the cursor is, then put the cursor after it.
  function insert(detail: Detail) {
    const field = bodyRef.current
    const start = field?.selectionStart ?? body.length
    const end = field?.selectionEnd ?? body.length
    edit(subject, `${body.slice(0, start)}${detail.token}${body.slice(end)}`, true)
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + detail.token.length, start + detail.token.length)
    })
  }

  async function save() {
    if (!editing || !selected || !changed || saving) return
    const issue = problem(selected.details, subject, body)
    if (issue) { setError(issue); return }
    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase.from('admin_email_templates')
      .update({ subject: subject.trim(), body }).eq('id', editing.id).eq('updated_at', editing.updated_at)
      .select('id,subject,body,updated_at').maybeSingle()
    if (updateError || !data) {
      setError(updateError
        ? 'Your changes could not be saved. Check your connection and try again.'
        : 'Someone else changed this email. Close it and open it again to see their version.')
    } else {
      setEditing(data as EmailTemplate)
      setSubject(data.subject)
      setSaved(true)
      void directory.refetch()
    }
    setSaving(false)
  }

  return <div className="space-y-4">
    {directory.isPending && <p role="status" className="text-sm text-muted-foreground">Loading emails…</p>}
    {directory.isError && <RetryAlert message="Emails could not be loaded." onRetry={() => void directory.refetch()} />}
    {directory.isSuccess && <div className="grid gap-3">
      {templates.map(item => {
        const template = directory.data.find(row => row.id === item.id)
        return <Card key={item.id} className="py-0"><CardContent className="p-0">
          <button type="button" disabled={!template} onClick={() => template && open(template)}
            className="flex w-full cursor-pointer items-center gap-4 rounded-xl p-5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Mail className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{template ? item.description : 'Not set up yet'}</span></span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </CardContent></Card>
      })}
    </div>}

    <Dialog open={!!editing} onOpenChange={changeOpen}>
      {/* Full screen on phones (the one exception to the 80% dialog size), so there is room to write. */}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:pt-[max(1rem,env(safe-area-inset-top))] max-sm:ring-0 max-sm:[&>[data-slot=dialog-footer]]:pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle>{selected?.title}</DialogTitle>
          <DialogDescription>{selected?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
          {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
          {previewing && selected ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium">{preview(selected.details, subject)}</p>
              <p className="whitespace-pre-wrap">{preview(selected.details, body)}</p>
            </div>
          ) : (
            // Desktop: message 80%, details 20%. Phones and tablets: subject, then the
            // detail buttons, then a message box that fills the rest of the height,
            // so the buttons stay in view above the keyboard.
            <div className="flex min-h-full flex-1 flex-col gap-4 lg:grid lg:h-full lg:grid-cols-[4fr_1fr] lg:gap-5">
              <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-5">
                <div className="space-y-2"><Label htmlFor="template-subject">Subject</Label>
                  <Input id="template-subject" value={subject} maxLength={150} disabled={saving}
                    onChange={event => edit(event.target.value, body)} /></div>
                <div className="order-last flex min-h-48 flex-1 flex-col gap-2 lg:order-none lg:min-h-0"><Label htmlFor="template-body">Message</Label>
                  <Textarea ref={bodyRef} id="template-body" value={body} maxLength={5000} disabled={saving}
                    className="min-h-40 flex-1 resize-none lg:min-h-0"
                    onChange={event => edit(subject, event.target.value)} aria-describedby="template-details" /></div>
              </div>
              <div id="template-details" className="min-w-0 space-y-2 lg:space-y-3 lg:border-l lg:pl-5">
                <p className="text-sm text-muted-foreground">
                  <span className="lg:hidden">Add a detail where your cursor is:</span>
                  <span className="hidden lg:inline">Filled in automatically when sent. Click to add where your cursor is.</span>
                </p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:items-stretch lg:overflow-visible lg:px-0 lg:pb-0">
                  {selected?.details.map(detail => (
                    <Button key={detail.token} type="button" variant="outline" size="sm" disabled={saving}
                      className="h-11 shrink-0 lg:h-auto lg:min-h-8 lg:shrink lg:justify-start lg:py-1.5 lg:whitespace-normal lg:text-left"
                      onClick={() => insert(detail)}>
                      <Plus aria-hidden="true" />{detail.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {/* One row at every size: Preview and Undo shrink to icons on phones. */}
        <DialogFooter className="flex-row flex-wrap items-center justify-end bg-popover">
          <Button type="button" variant="ghost" className="mr-auto" aria-label={previewing ? 'Edit' : 'Preview'}
            onClick={() => setPreviewing(value => !value)}>
            {previewing ? <PencilLine aria-hidden="true" /> : <Eye aria-hidden="true" />}
            <span className="hidden sm:inline">{previewing ? 'Edit' : 'Preview'}</span>
          </Button>
          <Button type="button" variant="ghost" aria-label="Undo" disabled={!history.length || saving} onClick={undo}>
            <Undo2 aria-hidden="true" /><span className="hidden sm:inline">Undo</span>
          </Button>
          {saved && !changed && <span role="status" className="text-sm text-muted-foreground">Saved</span>}
          {changed && <Button variant="ghost" disabled={saving} onClick={() => editing && edit(editing.subject, editing.body, true)}>
            <span className="sm:hidden">Discard</span><span className="hidden sm:inline">Discard changes</span>
          </Button>}
          <Button disabled={!changed || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
