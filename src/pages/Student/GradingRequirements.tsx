import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, ChevronDown, ExternalLink } from 'lucide-react'
import { BackNav } from '@/components/shared/layout/BackLink'
import { Segmented } from '@/components/shared/Segmented'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageHeader from '@/components/shared/layout/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status/StatusBadge'
import EligibilityChecklist from '@/components/grading/EligibilityChecklist'
import { DatabaseGradeBadge, gradeFromId } from '@/components/shared/grade/GradeBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useGradingReadiness } from '@/hooks/use-grading-readiness'
import { useStudentDashboard } from '@/hooks/use-student-dashboard'
import { money } from '@/lib/format'
import { classPassAudience, resolveMembershipType } from '@/lib/membership'
import { cn } from '@/lib/utils'

// Static for now: the same content for every student account.
// Source: Aikido Shinju-Kai Grading Standard Operating Procedures (September 2025).
// Fees match grade_requirements.fee_cents, which the grading checkout charges.
// A per-student version (attendance, sign-offs) is in src/hooks/use-grading-requirements.ts.

type Track = 'adult' | 'children'
type Level = 'kyu' | 'dan'
type Row = { grade: string; belt?: string; needs: string; fee: number }

const LATE_FEE = 22

const kyu: Record<Track, Row[]> = {
  adult: [
    { grade: '6th Kyu', belt: 'Blue', needs: '3 mo · 20 sessions', fee: 50 },
    { grade: '5th Kyu', belt: 'Blue Gold', needs: '24 sessions', fee: 55 },
    { grade: '4th Kyu', belt: 'Brown', needs: '32 sessions', fee: 60 },
    { grade: '3rd Kyu', belt: 'Brown Gold', needs: '6 mo · 36 sessions', fee: 65 },
    { grade: '2nd Kyu', belt: 'Black', needs: '6 mo · 56 sessions', fee: 90 },
    { grade: '1st Kyu', belt: 'Black Gold', needs: '9 mo · 62 sessions', fee: 95 },
  ],
  children: [
    { grade: '12th Kyu', belt: 'Red', needs: 'Age 5 · 3 mo', fee: 45 },
    { grade: '11th Kyu', belt: 'Red Gold', needs: '4 mo', fee: 45 },
    { grade: '10th Kyu', belt: 'Yellow', needs: '4 mo', fee: 45 },
    { grade: '9th Kyu', belt: 'Orange', needs: '4 mo', fee: 45 },
    { grade: '8th Kyu', belt: 'Green', needs: '4–6 mo', fee: 45 },
    { grade: '7th Kyu', belt: 'Purple', needs: '6 mo', fee: 45 },
    { grade: '6th Kyu', belt: 'Blue', needs: '6 mo', fee: 50 },
    { grade: '6th Kyu', belt: 'Blue Silver', needs: '6 mo', fee: 50 },
    { grade: '5th Kyu', belt: 'Blue Gold', needs: '6 mo', fee: 55 },
    { grade: '4th Kyu', belt: 'Brown', needs: '10 mo', fee: 60 },
    { grade: '4th Kyu', belt: 'Brown Silver', needs: '10 mo', fee: 60 },
    { grade: '3rd Kyu', belt: 'Brown Gold', needs: '8–10 mo', fee: 65 },
    { grade: '2nd Kyu', belt: 'Black', needs: 'Age 12+ · 10 mo', fee: 90 },
    { grade: '2nd Kyu', belt: 'Black Silver', needs: '10 mo', fee: 90 },
    { grade: '1st Kyu', belt: 'Black Gold', needs: '9 mo · 62 sessions', fee: 95 },
  ],
}

// Dan (Yudansha) grades are the same on both tracks.
const dan: Row[] = [
  { grade: 'Junior Dan', belt: 'Under 14', needs: '9 mo · 62 sessions', fee: 215 },
  { grade: 'Shodan (1st)', belt: '15 and over', needs: '9 mo · 70 sessions', fee: 535 },
  { grade: 'Nidan (2nd)', needs: '18 mo · 150 sessions', fee: 590 },
  { grade: 'Sandan (3rd)', needs: '30 mo · 240 sessions', fee: 695 },
  { grade: 'Yondan (4th)', needs: '42 mo · 400 sessions', fee: 910 },
]

const keyFacts = [
  { value: '3 months', label: 'as a member, fees paid' },
  { value: '2 weeks', label: 'before grading to apply' },
  { value: money.format(LATE_FEE), label: 'late submission charge' },
]

const toSubmit = ['Proof of training sessions', 'Paid-up membership book', 'Grading fee']

// "Blue-Gold (5th Kyu)" from the database and "Blue Gold" + "5th Kyu" here compare equal.
const normalise = (label: string | null | undefined) => (label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function More({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group border-b last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-semibold">{title}</span>
          {hint && <span className="ml-2 text-sm text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-4 text-sm">{children}</div>
    </details>
  )
}

/** The signed-in student's own checklist for their next grade (same rules instructors see). */
function YourEligibility() {
  const { profile } = useAuth()
  const { rows, loading, error, retry } = useGradingReadiness(profile?.id)
  if (loading) {
    return (
      <Card role="status" aria-label="Checking your grading eligibility" className="mt-6 gap-3 p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24" />
      </Card>
    )
  }
  if (error) {
    return (
      <Card className="mt-6 gap-2 p-4">
        <p className="text-muted-foreground">We couldn't check your grading eligibility.</p>
        <Button variant="link" className="h-auto w-fit p-0" onClick={retry}>Try again</Button>
      </Card>
    )
  }
  // Non-members and students at the top of their ladder have no next grade to check.
  if (!rows.length) return null
  const met = rows.filter((row) => row.met).length
  const eligible = met === rows.length
  return (
    <Card aria-labelledby="your-eligibility" className="mt-6 gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="your-eligibility" className="flex flex-wrap items-center gap-2 font-semibold">
          Your eligibility for
          <DatabaseGradeBadge grade={gradeFromId(rows[0].target_grade_id)} />
        </h2>
        <StatusBadge tone={eligible ? 'success' : 'warning'}>
          {eligible ? 'Eligible' : `${met} of ${rows.length} requirements met`}
        </StatusBadge>
      </div>
      <EligibilityChecklist requirements={rows} compact />
      <p className="text-sm text-muted-foreground">
        Time and training sessions count from your last grading, or from joining if you haven't graded yet.
      </p>
    </Card>
  )
}

export default function GradingRequirements() {
  // Junior members start on the children's ladder; everyone can still switch.
  const [track, setTrack] = useState<Track>(() => classPassAudience(resolveMembershipType()) === 'junior' ? 'children' : 'adult')
  const [level, setLevel] = useState<Level>('kyu')
  // Best effort: non-members and unranked students simply see no highlight.
  const nextGrade = normalise(useStudentDashboard().summary?.nextBelt?.label)
  const rows = level === 'kyu' ? kyu[track] : dan

  return (
    <section className="w-full">
      <BackNav to="/grading" label="Back to grading">

      <PageHeader
        title="Grading requirements"
        actions={<Link to="/grading" className={buttonVariants({ variant: 'outline' })}>View grading applications</Link>}
      />
      </BackNav>

      <YourEligibility />

      {/* Key facts */}
      <section aria-label="Key requirements" className="mt-6 grid gap-2 sm:grid-cols-3 sm:gap-3">
        {keyFacts.map((fact) => (
          // Phones: one slim row per fact; wider screens: three cards.
          <Card key={fact.value} className="flex-row items-baseline gap-2 px-4 py-3 sm:flex-col sm:items-start sm:gap-0.5 sm:p-4">
            <p className="shrink-0 text-lg font-semibold tracking-tight text-primary sm:text-2xl">{fact.value}</p>
            <p className="text-sm text-muted-foreground">{fact.label}</p>
          </Card>
        ))}
      </section>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid gap-4">
          {/* What to submit */}
          <Card className="gap-3 p-4">
            <h2 className="font-semibold">Submit with your application</h2>
            <ul className="grid gap-2 text-sm">
              {toSubmit.map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">All prerequisites must be met when you submit.</p>
          </Card>

          {/* Everything else, folded */}
          <Card className="gap-0 px-4 py-1">
            <More title="Weapons course" hint="2nd Kyu and above">
              <p>Complete a weapons course and test before grading. Dates are announced on WhatsApp.</p>
            </More>
            <More title="Dan grades" hint="form, photo, points">
              <p>Submit the Yudansha form with one passport photo, and average <b>3 points a year</b>:</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <li>1st Dan · 3 pts</li>
                <li>2nd Dan · 6 pts</li>
                <li>3rd Dan · 9 pts</li>
                <li>4th Dan · 12 pts</li>
              </ul>
              <p className="mt-2 text-muted-foreground">
                Earn them at HQ seminars (1), international events (2.5) and workshops (0.5). Show your point card at HQ.
              </p>
            </More>
            <More title="On grading day">
              <ul className="list-disc space-y-1 pl-5 marker:text-primary">
                <li>Proper do-gi and belt (hakama if required)</li>
                <li>Arrive on time</li>
                <li>Tell registration about any medical issues</li>
                <li>No alcohol</li>
              </ul>
            </More>
            <More title="Missed your grading?">
              <p>With a valid reason, ask the Chief Instructor for another date.</p>
            </More>
            <More title="After grading" hint="about 1 week">
              <p>
                Your instructor collects your belt, stamped membership book and certificate (issued at 6th, 4th and
                2nd Kyu) from HQ.
              </p>
            </More>
          </Card>
        </div>

        {/* Prerequisites and fees */}
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Prerequisites and fees</h2>
            <div className="flex flex-wrap gap-2">
              <Segmented label="Grade level" value={level} onChange={setLevel}
                options={[{ value: 'kyu', text: 'Kyu' }, { value: 'dan', text: 'Dan' }]} />
              {level === 'kyu' && (
                <Segmented label="Grading track" value={track} onChange={setTrack}
                  options={[{ value: 'adult', text: 'Adults' }, { value: 'children', text: 'Children' }]} />
              )}
            </div>
          </div>
          <Table>
            <TableCaption className="sr-only">
              {level === 'kyu' ? `Kyu grades for ${track === 'adult' ? 'adults' : 'children'}` : 'Dan grades'}
            </TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-2">Grade</TableHead>
                <TableHead className="whitespace-normal">Since last grading</TableHead>
                <TableHead className="pr-2 text-right">Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const next = level === 'kyu' && Boolean(nextGrade) && normalise(`${row.belt} ${row.grade}`) === nextGrade
                return (
                <TableRow key={`${row.grade}-${row.belt}`} className={cn(next && 'bg-primary/5')}>
                  <TableHead scope="row" className="h-auto py-2 pl-2 font-semibold whitespace-normal">
                    <span className="whitespace-nowrap">{row.grade}</span>
                    {row.belt && <span className="block font-normal text-muted-foreground sm:ml-1.5 sm:inline">{row.belt}</span>}
                    {next && <>
                      {/* Phones rely on the row highlight; the badge would squeeze the other columns. */}
                      <span className="sr-only sm:hidden">, your next grade</span>
                      <span className="hidden sm:inline"><StatusBadge tone="info" dot={false} className="ml-2 align-middle">Your next grade</StatusBadge></span>
                    </>}
                  </TableHead>
                  <TableCell className="whitespace-normal">{row.needs}</TableCell>
                  <TableCell className="pr-2 text-right tabular-nums">{money.format(row.fee)}</TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">mo = months of training. Fees in SGD.</p>
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Based on the Aikido Shinju-Kai Grading SOP (September 2025). Grading-day conduct follows the{' '}
        <a href="https://www.aikidofederation.com/policy" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline">
          Aikido Federation (Singapore) policy
          <ExternalLink className="size-3" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>. Rules may change.
      </p>
    </section>
  )
}
