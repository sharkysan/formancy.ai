/**
 * The page's scroll effects, and the one rule they all obey.
 *
 * **Everything here is optional.** The page is a document: headings, prose,
 * links, a form that works. The effects are added on top by CSS scroll-driven
 * animations, which the browser runs off the compositor with no scroll
 * listener and no frame loop — so there is nothing here to jank, and a browser
 * that has never heard of `animation-timeline` simply shows the page.
 *
 * **`prefers-reduced-motion` turns all of it off**, in the stylesheet rather
 * than here, because a preference honoured by script is a preference honoured
 * only once the script has loaded. A project whose whole argument is that
 * accessibility is structural cannot ship a landing page that makes somebody
 * motion-sick to read what it says about accessibility.
 *
 * This module holds the two things CSS genuinely cannot do: notice which
 * section is in view, and reveal the ending.
 */

/** How far down the page, 0 to 1. Drives the progress rail and the HUD. */
export function scrollProgress(scrollY: number, height: number, viewport: number): number {
  const travel = height - viewport
  if (travel <= 0) return 1
  return Math.min(1, Math.max(0, scrollY / travel))
}

/**
 * Which answers the visitor has "given" by scrolling this far.
 *
 * The page's conceit: reading it fills in a form. Each section answers one
 * field, and the running submission in the corner is the real thing — the
 * same shape a formancy submission has — rather than a decoration shaped like
 * one. The payoff at the end only lands because the panel was honest the
 * whole way down.
 */
export interface Answer {
  key: string
  value: unknown
}

export const JOURNEY: ReadonlyArray<{ section: string; answer: Answer }> = [
  { section: 'hero', answer: { key: 'interested', value: true } },
  { section: 'engine', answer: { key: 'runsIn', value: ['browser', 'server'] } },
  { section: 'renderers', answer: { key: 'framework', value: 'react-and-angular' } },
  { section: 'builder', answer: { key: 'authoredBy', value: 'anyone-with-a-keyboard' } },
  { section: 'access', answer: { key: 'accessible', value: true } },
  { section: 'host', answer: { key: 'hostedBy', value: 'you' } },
  { section: 'licence', answer: { key: 'licence', value: 'Apache-2.0' } },
]

/** The submission as it stands, given the sections seen so far. */
export function submissionFor(seen: ReadonlySet<string>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const stop of JOURNEY) {
    if (seen.has(stop.section)) data[stop.answer.key] = stop.answer.value
  }
  return data
}

/** Whether the visitor has read the whole thing. */
export function isComplete(seen: ReadonlySet<string>): boolean {
  return JOURNEY.every((stop) => seen.has(stop.section))
}
