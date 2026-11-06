import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'

type Grading = {
  id: string
  name: string
  gradingDate: string
  deadline: string
  reportingRelease: string | null
  reportingTime: string | null
  centre: string
  venueAddress: string
  target: string
  targetLabel: string
  fee: number | null // SGD; null if no fee is configured for this grade
  applied: boolean
}

const sgd = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })

/** Grade labels and SOP fees for each opportunity's target grade and track. */
async function loadFees(eventIds: string[], gradeIds: string[]) {
  if (eventIds.length === 0) return { tracks: new Map<string, string>(), fees: new Map<string, number>(), labels: new Map<string, string>() }
  const [gradings, requirements, grades] = await Promise.all([
    supabase.from('gradings').select('event_id, track').in('event_id', eventIds),
    supabase.from('grade_requirements').select('grade_id, track, fee_cents').in('grade_id', gradeIds),
    supabase.from('grades').select('id, label').in('id', gradeIds),
  ])
  for (const result of [gradings, requirements, grades]) if (result.error) throw result.error
  return {
    tracks: new Map((gradings.data ?? []).map((g) => [g.event_id as string, g.track as string])),
    fees: new Map((requirements.data ?? []).filter((r) => r.fee_cents).map((r) => [`${r.grade_id}:${r.track}`, r.fee_cents / 100])),
    labels: new Map((grades.data ?? []).map((g) => [g.id as string, g.label as string])),
  }
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
        type Row = { id: string; name: string; grading_date: string; application_deadline: string; reporting_release_on: string | null; reporting_time: string | null; centre_name: string; venue_address: string; target_grade: string; applied: boolean }
        const rows: Row[] = events ?? []
        const { tracks, fees, labels } = await loadFees(rows.map((e) => e.id), [...new Set(rows.map((e) => e.target_grade))])
        const mapped = rows.map((event) => ({
          id: event.id, name: event.name, gradingDate: event.grading_date,
          deadline: event.application_deadline, reportingRelease: event.reporting_release_on,
          reportingTime: event.reporting_time, centre: event.centre_name, venueAddress: event.venue_address,
          target: event.target_grade, targetLabel: labels.get(event.target_grade) ?? event.target_grade,
          fee: fees.get(`${event.target_grade}:${tracks.get(event.id)}`) ?? null,
          applied: event.applied,
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-3xl font-bold">Grading applications</h1>
      <Link to="/grading/requirements" className="text-sm font-medium text-primary underline-offset-4 hover:underline">View grading requirements</Link>
    </div>
    {params.get('checkout') === 'success' && <Alert><AlertDescription>Payment is being verified. Your application will appear after confirmation. Refresh this page shortly.</AlertDescription></Alert>}
    {params.get('checkout') === 'cancel' && <Alert><AlertDescription>Checkout was canceled. No application was submitted.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <p>Loading grading opportunities…</p> : gradings.length === 0 ? <Card className="p-6"><p>No grading applications are open right now.</p><Link to="/dashboard" className="text-primary underline">Back to dashboard</Link></Card>
      : gradings.map((grading) => <Card key={grading.id} className="gap-3 p-6">
        <h2 className="text-xl font-semibold">{grading.name}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Grading date</dt><dd>{new Date(`${grading.gradingDate}T00:00:00+08:00`).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'long' })}</dd></div>
          <div><dt className="text-muted-foreground">Location</dt><dd>{grading.centre} · {grading.venueAddress}</dd></div>
          <div><dt className="text-muted-foreground">Reporting time</dt><dd>{grading.reportingTime ? new Date(`2026-01-01T${grading.reportingTime.slice(0, 5)}:00+08:00`).toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', timeStyle: 'short' }) : 'To be confirmed'}{!grading.reportingTime && grading.reportingRelease && ` · released ${grading.reportingRelease}`}</dd></div>
          <div><dt className="text-muted-foreground">Apply by</dt><dd>{grading.deadline}</dd></div>
          <div><dt className="text-muted-foreground">Fee</dt><dd>{grading.fee != null ? sgd.format(grading.fee) : 'Contact HQ'}</dd></div>
          <div><dt className="text-muted-foreground">Target grade</dt><dd>{grading.targetLabel}</dd></div>
        </dl>
        {grading.applied ? <p className="font-medium text-primary">Application submitted after payment.</p> : <>
          <p className="text-sm text-muted-foreground">Your eligibility and target grade are checked again when you proceed. Your application is submitted only after payment is confirmed.</p>
          {grading.fee != null
            ? <Button disabled={pending !== null} onClick={() => void apply(grading.id)}>{pending === grading.id ? 'Opening checkout…' : `Submit application — pay ${sgd.format(grading.fee)}`}</Button>
            : <p className="text-sm text-brand-red-ink">The fee for this grade isn't set up yet. Please contact HQ to apply.</p>}
        </>}
      </Card>)}
  </main>
}
