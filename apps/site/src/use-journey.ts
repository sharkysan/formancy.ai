import { useEffect, useMemo, useRef, useState } from 'react'
import { JOURNEY, isComplete, submissionFor } from './scroll.js'

/**
 * Noticing which sections have been read.
 *
 * `IntersectionObserver`, not a scroll handler: the browser does the work off
 * the main thread and tells us only when something crosses a threshold, so
 * reading the page costs nothing per frame. A scroll handler here would be the
 * one piece of this page capable of making it stutter.
 *
 * Sections are remembered once seen rather than tracked in and out. The panel
 * is a submission being filled in, and an answer you scroll past does not
 * un-answer itself.
 */
export interface Journey {
  seen: ReadonlySet<string>
  data: Record<string, unknown>
  complete: boolean
  /** 0 to 1, for the progress rail. */
  progress: number
  register: (section: string) => (element: HTMLElement | null) => void
}

export function useJourney(): Journey {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set<string>())
  const elements = useRef(new Map<string, HTMLElement>())

  const register = useMemo(() => {
    const cache = new Map<string, (element: HTMLElement | null) => void>()
    return (section: string) => {
      const existing = cache.get(section)
      if (existing !== undefined) return existing
      // Memoised per section: a fresh callback ref on every render detaches and
      // reattaches the node each time, which re-fires the observer forever.
      const ref = (element: HTMLElement | null): void => {
        if (element === null) elements.current.delete(section)
        else elements.current.set(section, element)
      }
      cache.set(section, ref)
      return ref
    }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const arrived = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.getAttribute('data-section'))
          .filter((section): section is string => section !== null)
        if (arrived.length === 0) return
        setSeen((before) => {
          const after = new Set(before)
          for (const section of arrived) after.add(section)
          return after.size === before.size ? before : after
        })
      },
      // Halfway up the viewport: a section counts as read when it is genuinely
      // the thing being looked at, not when a pixel of it appears at the edge.
      { rootMargin: '0px 0px -45% 0px', threshold: 0.01 },
    )

    for (const element of elements.current.values()) observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const progress = seen.size / JOURNEY.length

  return {
    seen,
    data: submissionFor(seen),
    complete: isComplete(seen),
    progress,
    register,
  }
}
