import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'

type Grading = {
  id: string
  name: string
  startsAt: string
  deadline: string
  centre: string
  target: string
  applied: boolean
}

export default function StudentGrading() {
  const [params] = useSearchParams()
  const [gradings, setGradings] = useState<Grading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: events, error: eventsError } = await supabase.rpc('my_grading_opportunities')
        if (eventsError) throw eventsError
        const mapped = (events ?? []).map((event: { id: string; name: string; starts_at: string; application_deadline: string; centre_name: string; target_grade: string; applied: boolean }) => ({
          id: event.id, name: event.name, startsAt: event.starts_at,
          deadline: event.application_deadline, centre: event.centre_name,
          target: event.target_grade, applied: event.applied,
        }))
        if (active) setGradings(mapped)
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load gradings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function apply(eventId: string) {
    setPending(eventId)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-grading-checkout', {
        body: { event_id: eventId },
      })
      if (invokeError) {
        const details = await invokeError.context?.json?.().catch(() => null)
        throw new Error(details?.error ?? invokeError.message)
      }
      if (!data?.url) throw new Error('Checkout URL unavailable.')
      window.location.assign(data.url)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to start checkout.')
      setPending(null)
    }
  }

  return <main className="mx-auto w-full max-w-2xl space-y-5">
    <h1 className="text-3xl font-bold">Grading applications</h1>
    {params.get('checkout') === 'success' && <Alert><AlertDescription>Payment is being verified. Your application will appear after confirmation. Refresh this page shortly.</AlertDescription></Alert>}
    {params.get('checkout') === 'cancel' && <Alert><AlertDescription>Checkout was canceled. No application was submitted.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <p>Loading grading opportunities…</p> : gradings.length === 0 ? <Card className="p-6"><p>No grading applications are open right now.</p><Link to="/dashboard" className="text-primary underline">Back to dashboard</Link></Card>
      : gradings.map((grading) => <Card key={grading.id} className="gap-3 p-6">
        <h2 className="text-xl font-semibold">{grading.name}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Date and time</dt><dd>{new Date(grading.startsAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'long', timeStyle: 'short' })}</dd></div>
          <div><dt className="text-muted-foreground">Location</dt><dd>{grading.centre}</dd></div>
          <div><dt className="text-muted-foreground">Apply by</dt><dd>{grading.deadline}</dd></div>
          <div><dt className="text-muted-foreground">Fee</dt><dd>SGD 60.00</dd></div>
          <div><dt className="text-muted-foreground">Target grade</dt><dd>{grading.target}</dd></div>
        </dl>
        {grading.applied ? <p className="font-medium text-primary">Application submitted after payment.</p> : <>
          <p className="text-sm text-muted-foreground">Your eligibility and target grade are checked again when you proceed. Your application is submitted only after payment is confirmed.</p>
          <Button disabled={pending !== null} onClick={() => void apply(grading.id)}>{pending === grading.id ? 'Opening checkout…' : 'Submit application — pay SGD 60.00'}</Button>
        </>}
      </Card>)}
  </main>
}
