import { Children, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Scroll-snap carousel for the student dashboard cards. Phones show one card
 * with the next one peeking, tablets two, and desktop lays every card out in a
 * row (controls hidden). Native scrolling keeps swipe, keyboard and
 * reduced-motion behaviour without a carousel dependency.
 */
export default function DashboardCarousel({
  label,
  slideLabels,
  children,
}: {
  label: string;
  /** One name per slide, used for the dots and screen-reader slide labels. */
  slideLabels: string[];
  children: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children);
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });

  // The active slide is the one whose left edge is closest to the track's.
  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    let best = 0;
    let distance = Infinity;
    [...el.children].forEach((child, index) => {
      const gap = Math.abs(child.getBoundingClientRect().left - left);
      if (gap < distance) {
        distance = gap;
        best = index;
      }
    });
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    // Tablets show two cards, so the last can never reach the left edge.
    setActive(end && el.scrollWidth > el.clientWidth ? el.children.length - 1 : best);
    setEdges({ start: el.scrollLeft <= 1, end });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync]);

  const go = (index: number) => {
    const el = track.current;
    const slide = el?.children[Math.max(0, Math.min(index, slides.length - 1))] as HTMLElement | undefined;
    if (!el || !slide) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const padding = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    const left = el.scrollLeft + slide.getBoundingClientRect().left - el.getBoundingClientRect().left - padding;
    el.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section aria-label={label} aria-roledescription="carousel" className="grid gap-3">
      <div
        ref={track}
        className={cn(
          // Phones bleed to the page edge so the next card peeks in.
          // A scrolling track clips vertically too, so pad it (and pull it back) to keep the cards' rings visible.
          "-mx-6 -my-1 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "md:gap-4",
          // Desktop: every card visible, the first (next class) a little wider.
          "lg:mx-0 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:overflow-visible lg:px-0 lg:py-0 lg:my-0",
        )}
      >
        {slides.map((slide, index) => (
          <div
            key={slideLabels[index] ?? index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}: ${slideLabels[index] ?? ""}`}
            // relative: keeps absolutely positioned content (e.g. sr-only labels) inside the scroller,
            // otherwise off-screen slides widen the whole page.
            className="relative flex w-[calc(100%-2.5rem)] max-w-md shrink-0 snap-start sm:w-[70%] md:w-[calc(50%-0.5rem)] md:max-w-none lg:w-auto"
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden">
        <div className="flex items-center" role="group" aria-label="Choose a card">
          {slideLabels.map((name, index) => (
            <button
              key={name}
              type="button"
              aria-label={`Show ${name}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => go(index)}
              className="group grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 rounded-full transition-all motion-reduce:transition-none",
                  active === index ? "w-6 bg-primary" : "w-2 bg-muted-foreground/35 group-hover:bg-muted-foreground/60",
                )}
              />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-touch" className="rounded-full" aria-label="Previous card" disabled={edges.start} onClick={() => go(active - 1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-touch" className="rounded-full" aria-label="Next card" disabled={edges.end} onClick={() => go(active + 1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
