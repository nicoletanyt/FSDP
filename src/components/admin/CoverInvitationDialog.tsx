import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'
import { coverInvitationsKey, loadCoverInvitations } from '@/lib/admin/cover-invitations'

type Recipient = { instructor_id: string; instructor_name: string; distance_km: number }

async function sendInvitation(eventId: string, instructorId: string) {
  const { data, error } = await supabase.functions.invoke<{ invitation_id: string; status: string }>(
    'send-class-cover-test-invitation', { body: { action: 'send', event_id: eventId, instructor_id: instructorId } })
  if (error) {
    const response = 'context' in error && error.context instanceof Response ? error.context : null
    const details = await response?.json().catch(() => null)
    throw new Error(typeof details?.error === 'string' ? details.error : 'Unable to confirm invitation status. Check the recorded status before trying again.')
  }
  if (!data?.invitation_id) throw new Error('Unable to confirm invitation status. Check the recorded status before trying again.')
  return data
}

const classTime = (value: string) => new Date(value).toLocaleTimeString('en-SG', {
  timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true,
})

export default function CoverInvitationDialog({ eventId, className, startsAt, endsAt, studentCount, recipients }: {
  eventId: string; className: string; startsAt: string; endsAt: string; studentCount: number; recipients: Recipient[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(() => recipients.map(person => person.instructor_id))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const recordedInvitations = useQuery({
    queryKey: coverInvitationsKey(eventId),
    queryFn: () => loadCoverInvitations(eventId),
    staleTime: 10_000, retry: false,
  })
  const recorded = new Set(recordedInvitations.data?.map(item => item.instructor_id))
  const remaining = recipients.filter(person => !recorded.has(person.instructor_id))
  const current = selected.filter(id => remaining.some(person => person.instructor_id === id))

  async function send() {
    if (sending || !current.length || !recordedInvitations.isSuccess) return
    setSending(true)
    setError('')
    let completed = true
    try {
      for (const id of current) {
        const response = await sendInvitation(eventId, id)
        setSelected(previous => previous.filter(item => item !== id))
        if (response.status !== 'accepted') {
          setError(response.status === 'failed' ? 'EmailJS rejected the invitation. Do not resend it.' : 'The invitation status is uncertain. Do not resend it.')
          completed = false
          break
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to confirm invitation status. Do not resend without checking its recorded status.')
      completed = false
    } finally {
      await recordedInvitations.refetch()
      setSending(false)
      if (completed) setOpen(false)
    }
  }

  return <div className="space-y-3">
    <AlertDialog open={open} onOpenChange={value => { if (!sending) {
      if (value) {
        setSelected(remaining.map(person => person.instructor_id))
        void recordedInvitations.refetch()
      }
      setOpen(value)
      setError('')
    } }}>
      <AlertDialogTrigger render={<Button variant="outline" className="min-h-11 w-full" disabled={!remaining.length || recordedInvitations.isPending || recordedInvitations.isError} />}>
        Request an instructor
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Request cover · test invitations</AlertDialogTitle>
          <AlertDialogDescription>
            {className} · {classTime(startsAt)} – {classTime(endsAt)} SGT · {studentCount} {studentCount === 1 ? 'student' : 'students'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <fieldset className="space-y-2" disabled={sending}>
          <legend className="mb-2 font-medium">Recipients</legend>
          {remaining.map(person => <label key={person.instructor_id} className="flex min-h-11 items-center gap-3 rounded-md border border-foreground/10 p-2">
            <input type="checkbox" className="size-4 accent-primary" checked={selected.includes(person.instructor_id)}
              onChange={e => setSelected(previous => e.target.checked
                ? [...previous, person.instructor_id] : previous.filter(id => id !== person.instructor_id))} />
            <span className="min-w-0 flex-1">{person.instructor_name}</span>
            <span className="text-xs text-muted-foreground">{person.distance_km} km</span>
          </label>)}
        </fieldset>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={sending || !current.length || !recordedInvitations.isSuccess} onClick={() => void send()}>
            {sending ? 'Sending…' : `Send ${current.length} test ${current.length === 1 ? 'invitation' : 'invitations'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {recordedInvitations.isError && <div role="alert" className="flex items-center gap-2 text-destructive">Unable to check previous invitations. <Button size="sm" variant="outline" onClick={() => void recordedInvitations.refetch()}>Retry</Button></div>}
  </div>
}
