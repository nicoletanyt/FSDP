import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tracks whether a horizontally scrolling element has content hidden on
 * either side, so the UI can show a cue only while there is more to reach.
 * Pass `deps` that change the content width (e.g. row count).
 */
export function useScrollEdges<T extends HTMLElement>(deps: readonly unknown[] = []) {
  const ref = useRef<T>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    el.addEventListener('scroll', update, { passive: true })
    return () => { observer.disconnect(); el.removeEventListener('scroll', update) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, ...deps])

  return { ref, canScrollLeft: edges.left, canScrollRight: edges.right }
}
