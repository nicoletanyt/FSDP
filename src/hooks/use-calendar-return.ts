import { useLocation } from 'react-router'

// The calendar view a page was opened from (passed as navigation state by the
// calendar's "View Grading"), so its back link can return to that exact view.
// Only an internal calendar path is honoured, never an arbitrary URL.
export function useCalendarReturn(): string | null {
  const from = (useLocation().state as { from?: unknown } | null)?.from
  return typeof from === 'string' && /^\/instructor\/calendar(?:\?[^#]*)?$/.test(from) ? from : null
}
