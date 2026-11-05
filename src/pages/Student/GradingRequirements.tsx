import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/student/button'
import { Card } from '@/components/ui/card'

// Static for now: the same policy for every student account. Summarised from
// the Aikido Federation (Singapore) grading policy linked below.
// A per-student version (attendance, sign-offs) is in src/hooks/use-grading-requirements.ts.
const POLICY_URL = 'https://www.aikidofederation.com/policy'

const eligibility = [
  'You can apply for your first grading after four months of steady training at your registered dojo: 7th Kyu for adults, 12th Kyu for children.',
  'From 5th Kyu upwards, you also need the prerequisites set by Hombu or the Association. Your grading syllabus lists them.',
  'Your membership and training fees must be paid, and you need at least 75% attendance over the required practice period.',
  'Hand in your membership booklet, attendance card and grading fee at least three weeks before the grading date.',
  'In exceptional cases, you may be graded on your dojo instructor’s recommendation and/or with the Chief Instructor’s approval.',
  'Students from other Aikido schools or organisations need written consent from their own Chief Instructor before they can be graded.',
]

const marks = [
  { mark: 'A', meaning: 'Excellent', note: 'May earn a double promotion, e.g. 7th Kyu straight to 5th Kyu' },
  { mark: 'B', meaning: 'Good', note: 'Pass' },
  { mark: 'C', meaning: 'Fair', note: 'Minimum mark to pass' },
  { mark: 'D', meaning: 'Fail', note: 'Not promoted' },
]

const rules = [
  'Wear a proper do-gi and belt, plus hakama if your grade requires it.',
  'Arrive on time. Punctuality is mandatory.',
  'Candidates under the influence of alcohol will not be graded.',
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-3 rounded-2xl p-5">
      <h2 className="font-bold">{title}</h2>
      {children}
    </Card>
  )
}

export default function GradingRequirements() {
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
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Who can apply, how gradings are marked, and the rules on the day.
          </p>
        </div>
        <Link to="/grading" className={buttonVariants({ variant: 'outline' })}>View grading applications</Link>
      </header>

      {/* Two rows: Eligibility | Marking, then On grading day | Missed your grading */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title="Eligibility">
          <ul className="list-disc space-y-2 pl-5 text-sm marker:text-primary">
            {eligibility.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>

        <Section title="Performance and marking">
          <p className="text-sm text-muted-foreground">
            You must show every technique and movement in the Hombu (Aikido World Headquarters, Japan) grading
            syllabus to the best of your ability. Each candidate receives one mark:
          </p>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Grading marks</caption>
            <thead className="border-b text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Mark</th>
                <th scope="col" className="py-2 pr-3 font-medium">Meaning</th>
                <th scope="col" className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((m) => (
                <tr key={m.mark} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-bold">{m.mark}</td>
                  <td className="py-2 pr-3">{m.meaning}</td>
                  <td className="py-2 text-muted-foreground">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="On grading day">
          <ul className="list-disc space-y-2 pl-5 text-sm marker:text-primary">
            {rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </Section>

        <Section title="Missed your grading?">
          <p className="text-sm">
            If you miss a grading for a valid reason, you can ask to be graded on another date set by the Chief Instructor.
          </p>
        </Section>
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
        These rules may be amended at any time. Summarised from the
        <a href={POLICY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
          Aikido Federation (Singapore) grading policy
          <ExternalLink className="size-3.5" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>.
      </p>
    </main>
  )
}
