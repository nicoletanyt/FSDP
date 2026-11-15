import { useRef } from 'react'
import type { PointerEvent } from 'react'

/**
 * Swipe left/right on touch to step a calendar by a day. Spread the returned
 * props on the container. A swipe never counts as a tap on what's under it.
 */
export function useSwipeDay(onSwipe: (direction: 1 | -1) => void) {
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  function end(event: PointerEvent<HTMLElement>) {
    const start = gesture.current
    gesture.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    suppressClick.current = start.moved
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
  }

  return {
    className: 'touch-pan-y touch-pinch-zoom',
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      suppressClick.current = false
      if (event.pointerType === 'touch' && event.isPrimary) gesture.current = { x: event.clientX, y: event.clientY, moved: false }
    },
    onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
      if (gesture.current && Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 12) gesture.current.moved = true
    },
    onPointerUpCapture: end,
    onPointerCancel() {
      gesture.current = null
      suppressClick.current = true
    },
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (suppressClick.current) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick.current = false
      }
    },
  }
}
