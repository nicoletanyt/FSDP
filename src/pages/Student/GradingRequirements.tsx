import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Check, ChevronDown, ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/student/button'
import { Card } from '@/components/ui/card'
import { money } from '@/lib/format'

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

function Toggle<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex w-fit gap-1 rounded-full bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3.5 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
            value === option.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

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

export default function GradingRequirements() {
  const [track, setTrack] = useState<Track>('adult')
  const [level, setLevel] = useState<Level>('kyu')
  const rows = level === 'kyu' ? kyu[track] : dan

  return (
    <main className="w-full">
      <Link to="/dashboard" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 gap-1.5' })}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Dashboard
      </Link>

      <header className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-red-ink">Aikido Shinju-Kai</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Grading requirements</h1>
        </div>
        <Link to="/grading" className={buttonVariants({ variant: 'outline' })}>View grading applications</Link>
      </header>

      {/* Key facts */}
      <section aria-label="Key requirements" className="mt-6 grid gap-3 sm:grid-cols-3">
        {keyFacts.map((fact) => (
          <Card key={fact.value} className="gap-0.5 rounded-2xl p-4">
            <p className="text-2xl font-bold tracking-tight text-primary">{fact.value}</p>
            <p className="text-sm text-muted-foreground">{fact.label}</p>
          </Card>
        ))}
      </section>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid gap-4">
          {/* What to submit */}
          <Card className="gap-3 rounded-2xl p-5">
            <h2 className="font-bold">Submit with your application</h2>
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
          <Card className="gap-0 rounded-2xl px-5 py-1">
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
        <Card className="gap-3 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Prerequisites and fees</h2>
            <div className="flex flex-wrap gap-2">
              <Toggle label="Grade level" value={level} onChange={setLevel}
                options={[{ value: 'kyu', label: 'Kyu' }, { value: 'dan', label: 'Dan' }]} />
              {level === 'kyu' && (
                <Toggle label="Grading track" value={track} onChange={setTrack}
                  options={[{ value: 'adult', label: 'Adults' }, { value: 'children', label: 'Children' }]} />
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <caption className="sr-only">
                {level === 'kyu' ? `Kyu grades for ${track === 'adult' ? 'adults' : 'children'}` : 'Dan grades'}
              </caption>
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Grade</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Since last grading</th>
                  <th scope="col" className="py-2 text-right font-medium">Fee</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.grade}-${row.belt}`} className="border-b last:border-0">
                    <th scope="row" className="py-2 pr-3 text-left font-semibold">
                      {row.grade}
                      {row.belt && <span className="ml-1.5 font-normal text-muted-foreground">{row.belt}</span>}
                    </th>
                    <td className="py-2 pr-3">{row.needs}</td>
                    <td className="py-2 text-right tabular-nums">{money.format(row.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </main>
  )
}
