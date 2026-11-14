import { useMediaQuery } from '@/hooks/use-media-query'

/**
 * How many days of a week the calendars show at the current width:
 * 785px+ 3 days, 1200px+ 4 days, 1440px+ the full 7.
 */
export function useWeekSpan() {
  const w785 = useMediaQuery('(min-width: 785px)')
  const w1200 = useMediaQuery('(min-width: 1200px)')
  const w1440 = useMediaQuery('(min-width: 1440px)')
  return w1440 ? 7 : w1200 ? 4 : w785 ? 3 : 7
}
