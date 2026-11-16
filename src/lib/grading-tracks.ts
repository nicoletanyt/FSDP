import { isDateOnly, singaporeDate } from './grading-fees'

export type GradingTrack = 'adult' | 'children'

/** ASK grading uses the age reached in the Singapore calendar year. */
export function gradingTrackForDob(dob: string, today = singaporeDate()): GradingTrack | null {
  if (!isDateOnly(dob) || dob > today) return null
  return Number(today.slice(0, 4)) - Number(dob.slice(0, 4)) >= 13 ? 'adult' : 'children'
}

export const gradingTrackLabel = (track: GradingTrack) => track === 'adult' ? 'Adult Track' : 'Children Track'

// Presentation labels/order from the Membership brief. Values are resolved from
// the actual database catalogue; numeric aliases support older installations.
const KYU_OPTIONS = [
  { ids: ['red-12th-kyu', '12-kyu'], label: '12th Kyu (Red)' },
  { ids: ['red-gold-11th-kyu', '11-kyu'], label: '11th Kyu (Red Gold)' },
  { ids: ['yellow-10th-kyu', '10-kyu'], label: '10th Kyu (Yellow)' },
  { ids: ['orange-9th-kyu', '9-kyu'], label: '9th Kyu (Orange)' },
  { ids: ['green-8th-kyu', '8-kyu'], label: '8th Kyu (Green)' },
  { ids: ['purple-7th-kyu', '7-kyu'], label: '7th Kyu (Purple)' },
  { ids: ['blue-6th-kyu', '6-kyu'], label: '6th Kyu (Blue)' },
  { ids: ['blue-silver-6th-kyu', '6-kyu-silver'], label: '6th Kyu (Blue Silver)' },
  { ids: ['blue-gold-5th-kyu', '5-kyu'], label: '5th Kyu (Blue Gold)' },
  { ids: ['brown-4th-kyu', '4-kyu'], label: '4th Kyu (Brown)' },
  { ids: ['brown-silver-4th-kyu', '4-kyu-silver'], label: '4th Kyu (Brown Silver)' },
  { ids: ['brown-gold-3rd-kyu', '3-kyu'], label: '3rd Kyu (Brown Gold)' },
  { ids: ['black-2nd-kyu', '2-kyu'], label: '2nd Kyu (Black)' },
  { ids: ['black-silver-2nd-kyu', '2-kyu-silver'], label: '2nd Kyu (Black Silver)' },
  { ids: ['black-gold-1st-kyu', '1-kyu'], label: '1st Kyu (Black Gold)' },
]
const ADULT_KYU = [6, 8, 9, 11, 12, 14]

export function membershipBeltOptions(grades: { id: string; label: string }[], track: GradingTrack | null) {
  if (!track) return []
  const definitions = track === 'children' ? KYU_OPTIONS : [
    { ids: ['unranked'], label: 'Unranked (Beginner)' },
    ...ADULT_KYU.map(index => KYU_OPTIONS[index]),
  ]
  return definitions.map(definition => {
    const matches = grades.filter(grade => definition.ids.includes(grade.id))
    if (matches.length !== 1) throw new Error(`Your dojo must configure a unique catalogue grade for ${definition.label}.`)
    return { value: matches[0].id, label: definition.label }
  })
}
