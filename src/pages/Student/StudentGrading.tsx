import { useEffect, useState } from 'react'
import { CardListSkeleton } from '@/components/shared/skeletons'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatRank, type RankId } from '@/lib/student-grades'
import { calculateGradingFee } from '@/lib/grading-fees'
import { money } from '@/lib/format'
import EligibilityChecklist from '@/components/grading/EligibilityChecklist'
import type { ChecklistRequirement } from '@/components/grading/EligibilityChecklist'
import { GradeLabelBadge } from '@/components/shared/grade/GradeBadge'
import { DatabaseGradeBadge, gradeFromId } from '@/components/shared/grade/GradeBadge'

type Readiness = { targetLabel: string; requirements: ChecklistRequirement[] }

type ReadinessRow = { target_grade_label: string; key: string; label: string; actual: string; required: string; met: boolean }

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
  applied: boolean
}

function rankLabel(rank: string) {
  if (rank === 'unranked') return 'Unranked'
  const label = formatRank(rank as RankId)
  return label === 'Rank not recorded' ? rank : label
}

export default function StudentGrading() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [gradings, setGradings] = useState<Grading[]>([])
  const [currentRank, setCurrentRank] = useState('')
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [opportunities, student, { data: checks, error: checksError }] = await Promise.all([
          supabase.rpc('my_grading_opportunities'),
          profile?.id
            ? supabase.from('students').select('current_grade_id').eq('user_id', profile.id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.rpc('my_grading_readiness'),
        ])
        const { data: events, error: eventsError } = opportunities
        if (eventsError) throw eventsError
        if (checksError) throw checksError
        const rows = (checks ?? []) as ReadinessRow[]
        if (active) setReadiness(rows.length === 0 ? null : {
          targetLabel: rows[0].target_grade_label,
          requirements: rows.map(({ key, label, actual, required, met }) => ({ key, label, actual, required, met })),
        })
        const mapped = (events ?? []).map((event: { id: string; name: string; grading_date: string; application_deadline: string; reporting_release_on: string | null; reporting_time: string | null; centre_name: string; venue_address: string; target_grade: string; applied: boolean }) => ({
          id: event.id, name: event.name, gradingDate: event.grading_date,
          deadline: event.application_deadline, reportingRelease: event.reporting_release_on,
          reportingTime: event.reporting_time, centre: event.centre_name, venueAddress: event.venue_address,
          target: event.target_grade, applied: event.applied,
        }))
        if (active) {
          setGradings(mapped)
          if (student.data?.current_grade_id) setCurrentRank(rankLabel(student.data.current_grade_id))
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load gradings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [profile?.id])

  function startPayment(grading: Grading) {
    if (!grading.target) return
    navigate('/grading/payment', {
      state: {
        studentName: [profile?.first_name, profile?.last_name].filter(Boolean).join(' '),
        currentBelt: currentRank,
        targetBelt: rankLabel(grading.target),
        applicationDeadline: grading.deadline,
        gradingDate: grading.gradingDate,
        gradingEventId: grading.id,
        targetGradeId: grading.target,
      },
    })
  }

  return <main className="mx-auto w-full max-w-2xl space-y-5">
    <h1 className="text-3xl font-bold">Grading applications</h1>
    <p className="text-sm text-muted-foreground">Applications must be submitted two weeks before the grading. Late submissions incur an additional administrative charge.</p>
    {params.get('checkout') === 'success' && <Alert><AlertDescription>Payment is being verified. Your application will appear after confirmation. Refresh this page shortly.</AlertDescription></Alert>}
    {params.get('checkout') === 'cancel' && <Alert><AlertDescription>Checkout was canceled. No application was submitted.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!loading && !error && <ReadinessCard readiness={readiness} />}
    {loading ? <CardListSkeleton count={2} label="Loading grading opportunities…" /> : gradings.length === 0 ? <Card className="p-6"><p>No grading applications are open right now.</p><Link to="/dashboard" className="text-primary underline">Back to dashboard</Link></Card>
      : gradings.map((grading) => <Card key={grading.id} className="gap-3 p-6">
        <h2 className="text-xl font-semibold">{grading.name}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Grading date</dt><dd>{new Date(`${grading.gradingDate}T00:00:00+08:00`).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'long' })}</dd></div>
          <div><dt className="text-muted-foreground">Location</dt><dd>{grading.centre} · {grading.venueAddress}</dd></div>
          <div><dt className="text-muted-foreground">Reporting time</dt><dd>{grading.reportingTime ? new Date(`2026-01-01T${grading.reportingTime.slice(0, 5)}:00+08:00`).toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', timeStyle: 'short' }) : 'To be confirmed'}{!grading.reportingTime && grading.reportingRelease && ` · released ${grading.reportingRelease}`}</dd></div>
          <div><dt className="text-muted-foreground">Apply by</dt><dd>{grading.deadline}</dd></div>
          <div><dt className="text-muted-foreground">Fee</dt><dd>{(() => {
            const price = calculateGradingFee(grading.target, grading.deadline)
            return price ? `${money.format(price.total)}${price.late ? ' (includes S$22 late charge)' : ''}` : 'Contact dojo for pricing'
          })()}</dd></div>
          <div><dt className="text-muted-foreground">Target grade</dt><dd><DatabaseGradeBadge grade={gradeFromId(grading.target)} showBeltLabel /></dd></div>
        </dl>
        {grading.applied ? <p className="font-medium text-primary">Application submitted after payment.</p> : <>
          <p className="text-sm text-muted-foreground">Your eligibility and target grade are checked again when you proceed. Your application is submitted only after payment is confirmed.</p>
          <Button disabled={!calculateGradingFee(grading.target, grading.deadline)} onClick={() => startPayment(grading)}>Continue to payment</Button>
        </>}
      </Card>)}
  </main>
}

function ReadinessCard({ readiness }: { readiness: Readiness | null }) {
  if (!readiness) {
    return <Card className="gap-1 p-6">
      <h2 className="text-xl font-semibold">Your next grade</h2>
      <p className="text-sm text-muted-foreground">You have reached the highest grade on your grading ladder.</p>
    </Card>
  }
  const met = readiness.requirements.filter((requirement) => requirement.met).length
  const total = readiness.requirements.length
  const eligible = met === total
  return <Card className="gap-4 p-6">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-sm text-muted-foreground">Your next grade</p>
        <h2 className="mt-1 text-xl font-semibold"><GradeLabelBadge label={readiness.targetLabel} /></h2>
      </div>
      <p className={eligible ? 'text-sm font-medium text-success' : 'text-sm font-medium text-muted-foreground'}>
        {eligible ? 'Eligible to grade' : `${met} of ${total} requirements met`}
      </p>
    </div>
    <EligibilityChecklist requirements={readiness.requirements} compact />
    <p className="text-xs text-muted-foreground">
      Requirements follow the published ASK grading sheets. Time and training sessions count from your last grading (or from joining if you have not graded yet).
    </p>
  </Card>
}
