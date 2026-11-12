import { useSearchParams } from 'react-router'
import type { GradingDayLayout, GradingDayList } from '@/components/grading/GradingDayView'

// The grading day's list (students or sessions) and session layout (list or
// grid), kept in the URL like the calendar's display mode so they survive
// reloads and back navigation. A missing list means "the default for this day".
export function useGradingDayLayout() {
  const [search, setSearch] = useSearchParams()
  const requested = search.get('list')
  const list: GradingDayList | null = requested === 'students' || requested === 'sessions' ? requested : null
  const layout: GradingDayLayout = search.get('view') === 'grid' ? 'grid' : 'list'
  const update = (name: 'list' | 'view', value: string | null) => setSearch(current => {
    const params = new URLSearchParams(current)
    if (value) params.set(name, value)
    else params.delete(name)
    return params
  }, { replace: true })
  return {
    list, layout,
    setList: (next: GradingDayList) => update('list', next),
    setLayout: (next: GradingDayLayout) => update('view', next === 'grid' ? 'grid' : null),
  }
}
