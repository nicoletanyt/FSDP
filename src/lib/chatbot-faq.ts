import { supabase } from '@/lib/supabase'

// Predefined FAQ prompts for DojoGPT. Answers are built from live Supabase
// data where it exists (fees, class types, grading dates, the student's grade)
// and from the Aikido Shinju-Kai Grading SOP (September 2025) otherwise.
// No AI model is involved: every answer is deterministic.

export type FaqTopic =
  | 'my-grading'
  | 'fees'
  | 'apply'
  | 'requirements'
  | 'dates'
  | 'classes'
  | 'enrol'
  | 'membership'

export type FaqLink = { label: string; to: string }
export type FaqAnswer = { text: string; links: FaqLink[]; followUps: FaqTopic[] }

export const faqPrompts: Record<FaqTopic, string> = {
  'my-grading': 'What’s my next grading?',
  fees: 'How much does grading cost?',
  apply: 'How do I apply for grading?',
  requirements: 'What are the grading requirements?',
  dates: 'When is the next grading?',
  classes: 'Which classes can I join?',
  enrol: 'How do I enrol in a class?',
  membership: 'How do I become a member?',
}

/** Prompts shown when the chat opens. Students also get the personalised one. */
export function starterTopics(isStudent: boolean): FaqTopic[] {
  return [...(isStudent ? ['my-grading' as const] : []), 'fees', 'apply', 'classes', 'dates', 'membership']
}

// Order matters: the first matching topic wins.
const matchers: [FaqTopic, RegExp][] = [
  ['my-grading', /\b(my|am i)\b.*\b(grad\w*|belt|rank|eligib\w*|next)\b|\bnext (grade|belt|rank)\b/],
  ['fees', /\b(fee|fees|cost|costs|price|prices|how much|pay|payment|charge)\b/],
  ['apply', /\b(apply|application|register|registration|sign up for grading|submit)\b/],
  ['dates', /\b(when|date|dates|next grading|upcoming|schedule[ds]?)\b.*\bgrad\w*|\bgrad\w*.*\b(when|date|dates|upcoming)\b/],
  ['requirements', /\b(requirement\w*|eligib\w*|prerequisite\w*|qualif\w*|need|sessions|months)\b/],
  ['enrol', /\b(enrol\w*|enroll\w*|join a class|book|booking|sign up)\b/],
  ['classes', /\b(class|classes|lesson\w*|timetable|training|schedule)\b/],
  ['membership', /\b(member\w*|join|joining|start|beginner|new student)\b/],
]

export function matchTopic(text: string): FaqTopic | null {
  const normalized = text.toLowerCase()
  return matchers.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null
}

const money = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 })
const date = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const DAN_SORT_ORDER = 16 // grades from Junior Dan upwards

type FeeRow = { track: 'adult' | 'children'; fee: number; label: string; sort: number }

async function loadFees(): Promise<FeeRow[]> {
  const { data, error } = await supabase
    .from('grade_requirements')
    .select('track, fee_cents, grade:grades(label, sort_order)')
    .not('fee_cents', 'is', null)
  if (error) throw error
  return (data ?? []).flatMap((row) => {
    const grade = Array.isArray(row.grade) ? row.grade[0] : row.grade
    return grade ? [{ track: row.track, fee: row.fee_cents / 100, label: grade.label, sort: grade.sort_order }] : []
  }).sort((a, b) => a.sort - b.sort)
}

/** "Red (12th Kyu) – Purple (7th Kyu): $45" for runs of grades with the same fee. */
function feeLines(rows: FeeRow[]) {
  const lines: string[] = []
  for (let i = 0; i < rows.length;) {
    let j = i
    while (j + 1 < rows.length && rows[j + 1].fee === rows[i].fee) j++
    const name = i === j ? rows[i].label : `${rows[i].label} – ${rows[j].label}`
    lines.push(`• ${name}: ${money.format(rows[i].fee)}`)
    i = j + 1
  }
  return lines.join('\n')
}

const signInNote: FaqAnswer = {
  text: 'Sign in to see live grading details. The full prerequisite and fee table is on the Grading requirements page.',
  links: [{ label: 'Grading requirements', to: '/grading/requirements' }],
  followUps: ['apply', 'classes'],
}

async function fees(): Promise<FaqAnswer> {
  const rows = await loadFees()
  const adultKyu = rows.filter((r) => r.track === 'adult' && r.sort < DAN_SORT_ORDER)
  const dan = rows.filter((r) => r.track === 'adult' && r.sort >= DAN_SORT_ORDER)
  const children = rows.filter((r) => r.track === 'children')
  return {
    text: [
      'Grading fees depend on the grade you’re applying for:',
      `\nAdults (Kyu)\n${feeLines(adultKyu)}`,
      `\nChildren (Kyu)\n${feeLines(children)}`,
      `\nDan grades\n${feeLines(dan)}`,
      '\nLate submissions cost an extra $22. You pay online when you submit your application.',
    ].join('\n'),
    links: [{ label: 'Grading requirements', to: '/grading/requirements' }],
    followUps: ['my-grading', 'apply'],
  }
}

async function myGrading(userId: string | undefined): Promise<FaqAnswer> {
  if (!userId) return signInNote
  const { data: student, error } = await supabase
    .from('students')
    .select('date_of_birth, membership_status, grade:grades!students_current_grade_id_fkey(label, sort_order)')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!student) {
    return {
      text: 'You don’t have a membership yet, so there’s no grading record. Apply for a membership first, then you can grade after 3 months.',
      links: [{ label: 'Apply for membership', to: '/apply-membership' }],
      followUps: ['membership', 'classes'],
    }
  }
  const current = Array.isArray(student.grade) ? student.grade[0] : student.grade
  // Same rule as the server: aged 13+ this calendar year grades on the adult track.
  const track = new Date().getFullYear() - Number(student.date_of_birth.slice(0, 4)) >= 13 ? 'adult' : 'children'
  const { data: next, error: nextError } = await supabase
    .from('grade_requirements')
    .select('min_months, min_sessions, min_age_years, fee_cents, grade:grades!inner(label, sort_order)')
    .eq('track', track)
    .gt('grade.sort_order', current?.sort_order ?? -1)
    .order('grade(sort_order)')
    .limit(1)
    .maybeSingle()
  if (nextError) throw nextError
  const nextGrade = next ? (Array.isArray(next.grade) ? next.grade[0] : next.grade) : null
  if (!next || !nextGrade) {
    return {
      text: `You’re ${current?.label ?? 'at the highest grade'} on the ${track} track. Speak to your instructor about further gradings.`,
      links: [], followUps: ['dates', 'classes'],
    }
  }
  const needs = [
    next.min_months ? plural(next.min_months, 'month') : null,
    next.min_sessions ? plural(next.min_sessions, 'session') : null,
    next.min_age_years ? `age ${next.min_age_years}+` : null,
  ].filter(Boolean).join(' and ')
  return {
    text: [
      `You’re currently ${current?.label ?? 'Unranked'}. Your next grade is ${nextGrade.label} (${track} track).`,
      needs ? `You need ${needs} since your last grading.` : null,
      next.fee_cents ? `The grading fee is ${money.format(next.fee_cents / 100)}.` : 'The fee for this grade isn’t set up yet; please contact HQ.',
      student.membership_status !== 'active' ? 'Your membership must be active before you can apply.' : null,
    ].filter(Boolean).join('\n'),
    links: [
      { label: 'Grading requirements', to: '/grading/requirements' },
      { label: 'Grading applications', to: '/grading' },
    ],
    followUps: ['dates', 'apply'],
  }
}

function apply(): FaqAnswer {
  return {
    text: [
      'Here’s how grading applications work:',
      '1. Check you meet the requirements: 3 months as a member with fees paid, plus your grade’s prerequisites.',
      '2. HQ announces each grading and its application window.',
      '3. Apply under Grading applications at least 2 weeks before the grading date (late submissions cost $22 extra).',
      '4. Pay the grading fee online. Your application is submitted once payment is confirmed.',
      '5. Grading for 2nd Kyu and above? Complete the weapons course and test first.',
      '6. Results, belts and certificates are ready about 1 week after, collected by your instructor.',
    ].join('\n'),
    links: [
      { label: 'Grading applications', to: '/grading' },
      { label: 'Grading requirements', to: '/grading/requirements' },
    ],
    followUps: ['fees', 'dates'],
  }
}

function requirements(): FaqAnswer {
  return {
    text: [
      'To apply for grading you need:',
      '• At least 3 months as a member, with no outstanding fees',
      '• The minimum training for your next grade (months and/or sessions since your last grading)',
      '• Proof of training, your paid-up membership book and the grading fee',
      '• A weapons course and test for 2nd Kyu and above',
      '• For Dan grades: the Yudansha form, a passport photo and enough grading points',
    ].join('\n'),
    links: [{ label: 'Grading requirements', to: '/grading/requirements' }],
    followUps: ['my-grading', 'fees'],
  }
}

async function dates(): Promise<FaqAnswer> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('gradings')
    .select('track, grading_date, application_opens_on, application_deadline, application_status, event:events!inner(status)')
    .gte('grading_date', today)
    .eq('event.status', 'scheduled')
    .order('grading_date')
    .limit(4)
  if (error) throw error
  if (!data?.length) {
    return {
      text: 'No upcoming gradings are scheduled yet. HQ announces each grading and its application window, so check back soon.',
      links: [{ label: 'Grading applications', to: '/grading' }],
      followUps: ['apply', 'requirements'],
    }
  }
  const lines = data.map((g) => {
    const who = g.track === 'children' ? 'Children' : 'Adults'
    const window = g.application_status === 'closed'
      ? 'applications closed'
      : g.application_status === 'open' && g.application_deadline
        ? `applications open until ${date(g.application_deadline)}`
        : g.application_opens_on ? `applications open ${date(g.application_opens_on)}` : 'application dates to be announced'
    return `• ${who}: ${date(g.grading_date!)} (${window})`
  })
  return {
    text: `Upcoming gradings:\n${lines.join('\n')}\n\nYou’ll only see the gradings you’re eligible for under Grading applications.`,
    links: [{ label: 'Grading applications', to: '/grading' }],
    followUps: ['apply', 'my-grading'],
  }
}

async function classes(): Promise<FaqAnswer> {
  const { data, error } = await supabase.from('class_types').select('label, description').order('label')
  if (error) throw error
  const lines = (data ?? []).map((c) => `• ${c.label}${c.description ? ` — ${c.description}` : ''}`)
  return {
    text: `We run these classes:\n${lines.join('\n')}\n\nThe timetable shows which sessions suit your grade.`,
    links: [{ label: 'Class timetable', to: '/classes' }],
    followUps: ['enrol', 'membership'],
  }
}

function enrol(): FaqAnswer {
  return {
    text: [
      'To enrol in a class:',
      '1. Open the Classes tab to see the timetable.',
      '2. Filter by centre, day or class type. Classes recommended for your grade are marked.',
      '3. Choose a session and select Enrol.',
      '4. Your enrolled classes show up under Attendance and on your dashboard.',
    ].join('\n'),
    links: [{ label: 'Class timetable', to: '/classes' }],
    followUps: ['classes', 'membership'],
  }
}

function membership(): FaqAnswer {
  return {
    text: [
      'To become a member:',
      '1. Fill in the membership application (personal details, training background and an emergency contact).',
      '2. Pay the membership fee online.',
      '3. Your membership activates once payment is confirmed, and your dashboard switches to the member view.',
      'After 3 months as a member you can apply for grading.',
    ].join('\n'),
    links: [{ label: 'Apply for membership', to: '/apply-membership' }],
    followUps: ['classes', 'fees'],
  }
}

export async function answerFaq(topic: FaqTopic, userId: string | undefined): Promise<FaqAnswer> {
  try {
    switch (topic) {
      case 'my-grading': return await myGrading(userId)
      case 'fees': return userId ? await fees() : signInNote
      case 'apply': return apply()
      case 'requirements': return requirements()
      case 'dates': return userId ? await dates() : signInNote
      case 'classes': return userId ? await classes() : { ...enrol(), text: 'Sign in to see our class types and timetable.' }
      case 'enrol': return enrol()
      case 'membership': return membership()
    }
  } catch (failure) {
    console.error('DojoGPT could not load FAQ data:', failure)
    return {
      text: 'Sorry, I couldn’t load that information right now. Please try again in a moment.',
      links: [], followUps: [topic],
    }
  }
}

export function fallbackAnswer(isStudent: boolean): FaqAnswer {
  return {
    text: 'I can answer common questions about grading, fees, classes and membership. Pick one below, or ask about one of those topics.',
    links: [],
    followUps: starterTopics(isStudent),
  }
}
