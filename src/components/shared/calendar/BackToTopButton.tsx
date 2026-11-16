import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** True once the page has scrolled past roughly a third of a phone screen (only while enabled). */
function useScrolledDown(enabled: boolean) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setScrolled(false)
      return
    }
    const update = () => setScrolled(window.scrollY > 300)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [enabled])
  return scrolled
}

/**
 * Phone calendar day views: the 24-hour timeline is long, so a way back up once
 * the page has scrolled. Bottom-left, the same size and edge offsets as the chat
 * button opposite, so the two sit level.
 */
export default function BackToTopButton({ enabled }: { enabled: boolean }) {
  const show = useScrolledDown(enabled)
  if (!show) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-30 size-14 rounded-full bg-card shadow-lg sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:left-6"
    >
      <ArrowUp aria-hidden="true" className="size-6" />
    </Button>
  )
}
