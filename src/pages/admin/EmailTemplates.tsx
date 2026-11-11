import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Mail } from 'lucide-react'
import PageHeader from '@/components/admin/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

type TemplateId = 'grading_invitation' | 'attendance_notice'
type EmailTemplate = { id: TemplateId; subject: string; body: string; updated_at: string }

const templates: { id: TemplateId; title: string; description: string; placeholders: string[] }[] = [
  { id: 'grading_invitation', title: 'Grading invitation', description: 'Sent to students eligible for an open official grading.',
    placeholders: ['{{children_grading_date}}', '{{children_application_close_date}}', '{{adult_grading_date}}', '{{adult_application_close_date}}'] },
  { id: 'attendance_notice', title: 'Attendance notice', description: 'A supportive check-in for students who need attendance follow-up.',
    placeholders: ['{{student_name}}'] },
]
const gradingLink = 'https://fsdp-kappa.vercel.app/grading'

function validate(id: TemplateId, subject: string, body: string): string | null {
  if (!subject.trim() || subject.length > 150 || /[\r\n]/.test(subject)) return 'Use a one-line subject of up to 150 characters.'
  if (!body.trim() || body.length > 5000) return 'Use a message of up to 5,000 characters.'
  const allowed = templates.find(item => item.id === id)!.placeholders
  if (allowed.some(token => !body.includes(token))) return `Keep these placeholders: ${allowed.join(', ')}.`
  const unknown = body.match(/\{\{[^}]*\}\}/g)?.find(token => !allowed.includes(token))
  if (unknown) return `Unsupported placeholder: ${unknown}.`
  if (id === 'grading_invitation' && body.split(gradingLink).length !== 2) return `Keep exactly one ${gradingLink} link.`
  return null
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const changed = !!editing && (subject !== editing.subject || body !== editing.body)
  const selected = templates.find(item => item.id === editing?.id)

  function open(template: EmailTemplate) {
    setEditing(template)
    setSubject(template.subject)
    setBody(template.body)
    setError('')
    setNotice('')
  }

  function changeOpen(next: boolean) {
    if (next || saving) return
    if (changed && !window.confirm('Discard unsaved template changes?')) return
    setEditing(null)
    setError('')
  }

  async function save() {
    if (!editing || !changed || saving) return
    const validationError = validate(editing.id, subject, body)
    if (validationError) { setError(validationError); return }
    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase.from('admin_email_templates')
      .update({ subject: subject.trim(), body }).eq('id', editing.id).eq('updated_at', editing.updated_at)
      .select('id,subject,body,updated_at').maybeSingle()
    if (updateError || !data) {
      setError(updateError ? 'Unable to save the template. Check administrator access and try again.' : 'This template changed elsewhere. Close and reopen it to review the latest version.')
    } else {
      setEditing(data as EmailTemplate)
      setSubject(data.subject)
      setNotice('Template saved. No email was sent.')
      void directory.refetch()
    }
    setSaving(false)
  }

  return <div className="space-y-6">
    <PageHeader title="Email templates" description="Edit the saved wording used when administrators send grading invitations or attendance notices. Saving a template does not send email." />
    {directory.isPending && <p role="status" className="text-sm text-muted-foreground">Loading email templates…</p>}
    {directory.isError && <Alert variant="destructive" role="alert"><AlertDescription className="flex items-center gap-3">
      Unable to load email templates. <Button variant="outline" size="sm" onClick={() => void directory.refetch()}>Retry</Button>
    </AlertDescription></Alert>}
    {directory.isSuccess && <div className="grid gap-3">
      {templates.map(item => {
        const template = directory.data.find(row => row.id === item.id)
        return <Card key={item.id} className="py-0"><CardContent className="p-0">
          <button type="button" disabled={!template} onClick={() => template && open(template)}
            className="flex w-full cursor-pointer items-center gap-4 rounded-xl p-5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Mail className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{item.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{template ? item.description : 'Template unavailable'}</span></span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </CardContent></Card>
      })}
    </div>}
    <Dialog open={!!editing} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader><DialogTitle>{selected?.title}</DialogTitle>
          <DialogDescription className="sr-only">Edit the saved subject and message for future emails.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto px-1">
          {notice && <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>}
          {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2"><Label htmlFor="template-subject">Subject</Label>
            <Input id="template-subject" value={subject} maxLength={150} disabled={saving}
              onChange={event => { setSubject(event.target.value); setError(''); setNotice('') }} /></div>
          <div className="text-xs text-muted-foreground">Required placeholders: {selected?.placeholders.join(', ')}.
            {editing?.id === 'grading_invitation' && <span className="block">Keep exactly one {gradingLink} link.</span>}
          </div>
          <div className="space-y-2"><Label htmlFor="template-body">Message</Label>
            <Textarea id="template-body" value={body} rows={10} maxLength={5000} disabled={saving}
              onChange={event => { setBody(event.target.value); setError(''); setNotice('') }} /></div>
        </div>
        <DialogFooter className="items-center border-t border-border bg-popover">
          {changed && <span className="text-xs text-muted-foreground sm:mr-auto">Unsaved changes</span>}
          <Button variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Close</Button>
          <Button disabled={!changed || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save template'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
