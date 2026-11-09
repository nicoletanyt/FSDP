import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

type Invitation = {
  id: string; class_name: string; starts_at: string; ends_at: string
  centre_name: string; decision: 'pending' | 'accepted' | 'declined'
  state: 'open' | 'accepted' | 'declined' | 'not_sent' | 'covered' | 'closed'
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const date = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})
const time = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true,
})

const messages: Record<Invitation['state'], string> = {
  open: 'Confirm your response below. The class is assigned only after a successful acceptance.',
  accepted: 'You accepted this test class. It has been assigned to you.',
  declined: 'You declined this invitation. The cover request remains open.',
  not_sent: 'This invitation was not confirmed as sent. Contact the administrator if you need help.',
  covered: 'Another instructor has already been assigned to this class.',
  closed: 'This class is no longer open for cover.',
}

export default function CoverInvitationDialog({ invitationId, onClose }: { invitationId: string; onClose: () => void }) {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState('')
  const valid = Boolean(invitationId && uuid.test(invitationId))
  const key = ['instructor', 'cover-invitation', session?.user.id, invitationId]
  const invitation = useQuery({
    queryKey: key, enabled: valid,
    queryFn: async (): Promise<Invitation | null> => {
      const { data, error: fetchError } = await supabase.rpc('get_class_cover_test_invitation', { target_invitation: invitationId! })
      if (fetchError) throw fetchError
      return data as Invitation | null
    }, retry: false, staleTime: 0, refetchInterval: pending ? false : 5_000,
  })

  async function decide(response: 'accept' | 'decline') {
    if (!valid || pending || invitation.data?.state !== 'open') return
    setPending(true)
    setError('')
    setOutcome('')
    try {
      const { data, error: decisionError } = await supabase.rpc('decide_class_cover_test_invitation', {
        target_invitation: invitationId!, response,
      })
      if (decisionError) throw decisionError
      const result: string = data
      if (result === 'accepted' || result === 'declined') {
        setOutcome(messages[result])
        await queryClient.invalidateQueries({ queryKey: ['instructor'] })
      } else {
        setOutcome(result === 'ineligible'
          ? 'You are no longer eligible for this test class. Your response was not recorded; contact the administrator.'
          : result === 'covered' ? messages.covered : result === 'not_sent' ? messages.not_sent : messages.closed)
      }
      await invitation.refetch()
    } catch {
      setError('Could not confirm your response. Check this invitation again before retrying.')
    } finally {
      setPending(false)
    }
  }

  const covered = invitation.data?.state === 'covered' ||
    (invitation.data?.state === 'open' && outcome === messages.covered)

  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}>
    <DialogContent showCloseButton={!pending} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Class cover invitation</DialogTitle>
        <DialogDescription>{covered ? 'No response is needed.' : 'Review this test invitation before responding.'}</DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        {!valid && <Alert variant="destructive"><AlertDescription>This invitation link is invalid.</AlertDescription></Alert>}
        {valid && invitation.isPending && <p role="status">Loading invitation…</p>}
        {valid && invitation.isError && <Alert variant="destructive"><AlertTitle>Unable to load invitation</AlertTitle>
          <AlertDescription>Check your connection, then try again. <Button variant="outline" size="sm" onClick={() => void invitation.refetch()}>Retry</Button></AlertDescription>
        </Alert>}
        {valid && invitation.isSuccess && !invitation.data && <Alert><AlertTitle>Invitation unavailable</AlertTitle>
          <AlertDescription>Sign in as the invited instructor, or ask the administrator for help. This link does not grant access by itself.</AlertDescription>
        </Alert>}
        {invitation.data && <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Class:</dt><dd className="font-medium">{invitation.data.class_name}</dd>
            <dt className="text-muted-foreground">Date:</dt><dd>{date.format(new Date(invitation.data.starts_at))}</dd>
            <dt className="text-muted-foreground">Time:</dt><dd>{time.format(new Date(invitation.data.starts_at))} – {time.format(new Date(invitation.data.ends_at))} SGT</dd>
            <dt className="text-muted-foreground">Dojo:</dt><dd>{invitation.data.centre_name}</dd>
          </dl>
          {covered ? <Alert className="border-success/30 bg-success/10 text-foreground">
            <CircleCheck className="text-success" aria-hidden="true" />
            <AlertTitle>Already covered</AlertTitle>
            <AlertDescription className="text-foreground">
              <span className="block">Another instructor has taken this class.</span>
              <span className="block">Your invitation is closed.</span>
            </AlertDescription>
          </Alert> : <p role="status" className="text-sm">{messages[invitation.data.state]}</p>}
        </>}
        {outcome && !covered && outcome !== messages[invitation.data?.state ?? 'open'] && <p role="status" className="text-sm">{outcome}</p>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      </div>
      <DialogFooter>
        {invitation.data?.state === 'open' && !covered ? <>
          <Button variant="outline" disabled={pending} onClick={() => void decide('decline')}>Decline</Button>
          <Button disabled={pending} onClick={() => void decide('accept')}>{pending ? 'Confirming…' : 'Accept cover'}</Button>
        </> : <Button variant="outline" disabled={pending} onClick={onClose}>Close</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
