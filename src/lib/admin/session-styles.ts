import type { Session } from './types'

export interface SessionTypeStyle {
  label: string
  description: string
  card: string
  badge: string
  dot: string
}

/**
 * Colour tokens for the attendance calendar. The palettes intentionally mirror
 * the instructor timetable so both calendars read as the same product, while
 * the admin types stay scoped to admin sessions.
 */
export const sessionTypeStyles: Record<Session['type'], SessionTypeStyle> = {
  regular: {
    label: 'Regular',
    description: 'Evening practice and general training',
    card: 'border-[#cbaa62] bg-[#f2e4b9] text-[#302a19] hover:bg-[#f2e4b9] hover:text-[#302a19] dark:border-[#a99052] dark:bg-[#51452a] dark:text-amber-50 dark:hover:bg-[#51452a] dark:hover:text-amber-50',
    badge:
      'border-[#cbaa62] bg-[#f2e4b9] text-[#302a19] dark:border-[#a99052] dark:bg-[#51452a] dark:text-amber-50',
    dot: 'bg-[#f2e4b9]',
  },
  weapons: {
    label: 'Weapons',
    description: 'Weapons class',
    card: 'border-[#6ca34f] bg-[#c8d9c2] text-[#23331c] hover:bg-[#c8d9c2] hover:text-[#23331c] dark:border-[#82b268] dark:bg-[#30472b] dark:text-green-50 dark:hover:bg-[#30472b] dark:hover:text-green-50',
    badge:
      'border-[#6ca34f] bg-[#c8d9c2] text-[#23331c] dark:border-[#82b268] dark:bg-[#30472b] dark:text-green-50',
    dot: 'bg-[#c8d9c2]',
  },
  kids: {
    label: 'Kids',
    description: 'Class for younger students',
    card: 'border-[#81b6c8] bg-[#98cddd] text-[#102b37] hover:bg-[#98cddd] hover:text-[#102b37] dark:border-[#5d9fb3] dark:bg-[#244955] dark:text-cyan-50 dark:hover:bg-[#244955] dark:hover:text-cyan-50',
    badge:
      'border-[#81b6c8] bg-[#98cddd] text-[#102b37] dark:border-[#5d9fb3] dark:bg-[#244955] dark:text-cyan-50',
    dot: 'bg-[#98cddd]',
  },
  seminar: {
    label: 'Seminar',
    description: 'Joint or special seminar',
    card: 'border-[#7661b4] bg-[#c9c2df] text-[#29213f] hover:bg-[#c9c2df] hover:text-[#29213f] dark:border-[#9c88d1] dark:bg-[#3d345d] dark:text-violet-50 dark:hover:bg-[#3d345d] dark:hover:text-violet-50',
    badge:
      'border-[#7661b4] bg-[#c9c2df] text-[#29213f] dark:border-[#9c88d1] dark:bg-[#3d345d] dark:text-violet-50',
    dot: 'bg-[#c9c2df]',
  },
  external: {
    label: 'External',
    description: 'Session away from the centre',
    card: 'border-[#d96b7a] bg-[#e8c2c7] text-[#48232a] hover:bg-[#e8c2c7] hover:text-[#48232a] dark:border-[#e38a96] dark:bg-[#5b343e] dark:text-rose-50 dark:hover:bg-[#5b343e] dark:hover:text-rose-50',
    badge:
      'border-[#d96b7a] bg-[#e8c2c7] text-[#48232a] dark:border-[#e38a96] dark:bg-[#5b343e] dark:text-rose-50',
    dot: 'bg-[#e8c2c7]',
  },
}

export function getSessionStyle(session: Session): SessionTypeStyle {
  if (session.isExternal && session.type !== 'external') {
    return sessionTypeStyles.external
  }
  return sessionTypeStyles[session.type]
}
