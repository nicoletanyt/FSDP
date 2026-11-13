import { useSearchParams } from 'react-router'
import type { GradingDayList } from '@/components/grading/GradingDayView'

// The grading day's list (students or sessions), kept in the URL like the
// calendar's display mode so it survives reloads and back navigation. A
// missing list means "the default for this day".
export function useGradingDayLayout() {
  const [search, setSearch] = useSearchParams()
  const requested = search.get('list')
  const list: GradingDayList | null = requested === 'students' || requested === 'sessions' ? requested : null
  return {
    list,
    setList: (next: GradingDayList) => setSearch(current => {
      const params = new URLSearchParams(current)
      params.set('list', next)
      return params
    }, { replace: true }),
  }
}
