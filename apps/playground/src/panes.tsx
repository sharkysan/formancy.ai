import { useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Which panes there are, how wide each one is, and how to fold one away.
 *
 * Its own file because `app.tsx`'s size budget named the seam as one pane per
 * file, and folding pushed it over: three panes have already left — the Angular
 * renderer, this deployment's capabilities, and the builder.
 *
 * One subject rather than three lists that happen to be adjacent. The narrow
 * screen shows one pane and needs their names; the wide screen shows all three
 * and needs their widths; folding needs both and a control. Splitting them would
 * mean three files that must be edited together, which is worse than the one
 * they came from.
 */

/**
 * The three panes, for a screen too narrow to show them side by side.
 *
 * Stacked, each pane became a 320-pixel box with its own scrollbar inside a
 * page with another one — a form you could see four fields of at a time.
 * Narrow, the page shows one pane at a time at its full height instead, and
 * this chooses which. The form is first because it is what somebody came to
 * see. Wide, all three are shown and the switch is not.
 */
export const PANES = [
  { id: 'form', label: 'Form' },
  { id: 'editor', label: 'Editor' },
  { id: 'engine', label: 'Engine' },
] as const

export type PaneId = (typeof PANES)[number]['id']

/**
 * The grid column each pane gets when it is open, in the order they appear.
 *
 * Here rather than in the stylesheet because the template depends on which
 * panes are folded, and three panes is eight combinations — eight CSS rules
 * that all say the same thing. The widths are still one list in one place; what
 * is computed is only which of them apply. How narrow a folded strip is stays
 * in the stylesheet, as `--pane-folded`.
 *
 * **The minimum and the fraction are separate now**, because the fraction is
 * state: a splitter moves it and the minimum does not move. They were one
 * `minmax(…)` string while both were constant, and splitting them is what lets
 * the template be composed rather than pattern-matched.
 */
export const PANE_COLUMNS: ReadonlyArray<{
  readonly pane: PaneId
  /** Below this the pane stops being usable, so the grid refuses to go there. */
  readonly minimum: string
  /** Its share of what is left over, which is what a splitter changes. */
  readonly fraction: number
}> = [
  { pane: 'editor', minimum: '19rem', fraction: 1 },
  { pane: 'form', minimum: '24rem', fraction: 1.25 },
  { pane: 'engine', minimum: '16rem', fraction: 0.8 },
]

/** The fractions a row starts at, and the ones a reset returns to. */
export const DEFAULT_WIDTHS: Readonly<Record<PaneId, number>> = Object.freeze(
  Object.fromEntries(PANE_COLUMNS.map(({ pane, fraction }) => [pane, fraction])) as Record<PaneId, number>,
)

/** A pane may not be dragged below this much of the width it starts at. */
const FLOOR = 0.25

/** What one arrow key moves, in fractions. */
export const KEYBOARD_STEP = 0.1

/** The smallest fraction a pane may be dragged to. */
const floorFor = (pane: PaneId): number => DEFAULT_WIDTHS[pane] * FLOOR

/** Two open panes with a draggable boundary between them. */
export interface Splitter {
  readonly left: PaneId
  readonly right: PaneId
}

/**
 * The grid template, and the splitters that belong to it.
 *
 * **One function returning both**, which is the only interesting thing about it.
 * A splitter sits in a grid column of its own, so the template and the list of
 * splitters have to agree about how many there are — and if they ever disagreed
 * the symptom would be a layout that is subtly wrong rather than an error.
 * `panes.test.ts` asserts the column count against the two lists for exactly
 * that reason.
 *
 * A folded pane gets no splitter: there is nothing to resize, and a handle that
 * does nothing is worse than no handle.
 */
export function paneLayout(
  folded: ReadonlySet<PaneId>,
  widths: Readonly<Record<PaneId, number>>,
): { template: string; splitters: Splitter[] } {
  const columns: string[] = []
  const splitters: Splitter[] = []

  PANE_COLUMNS.forEach(({ pane, minimum }, index) => {
    if (index > 0) {
      const previous = PANE_COLUMNS[index - 1]!.pane
      if (!folded.has(previous) && !folded.has(pane)) {
        columns.push('var(--pane-split)')
        splitters.push({ left: previous, right: pane })
      }
    }
    columns.push(folded.has(pane) ? 'var(--pane-folded)' : `minmax(${minimum}, ${String(widths[pane])}fr)`)
  })

  return { template: columns.join(' '), splitters }
}

/**
 * Moving a splitter by `delta` fractions, positive towards the right pane.
 *
 * Conserves the pair's total **fraction**, which is what makes the handle a
 * boundary rather than a slider: the two panes either side of it trade with each
 * other and the third pane's share is untouched.
 *
 * **In pixels it is not conserved, and the comment here said otherwise until it
 * was measured.** Once one of the pair reaches its `minmax` minimum the grid
 * stops shrinking it and redistributes what is left over by fraction — so the
 * far pane does move. Measured in Chromium at 1440px: dragging the Editor/Form
 * handle 160px right took Form to its 24rem floor and pulled Engine from 353px
 * to 304px, a pane nobody touched. That is the grid declining to make the form
 * unusable, which is the behaviour the minimum is there for, and no amount of
 * arithmetic on this side changes it. jsdom has no layout, so nothing in the
 * test suite could have caught the wrong claim.
 *
 * Clamped at a quarter of each pane's starting width. Not a measured figure: it
 * is there so a pane cannot reach zero, where the handle stops tracking the
 * pointer and dragging back feels broken. The grid's own `minmax` minimum is
 * what actually stops a pane being too narrow to use; this stops the *state*
 * becoming incoherent, which is a different failure.
 */
export function dragSplitter(
  widths: Readonly<Record<PaneId, number>>,
  { left, right }: Splitter,
  delta: number,
): Record<PaneId, number> {
  const total = widths[left] + widths[right]

  /*
   * Rounded to three decimals, then clamped — in that order, and the order is
   * the point.
   *
   * Three decimals because two arrow presses otherwise put
   * `minmax(19rem, 1.2000000000000002fr)` in the DOM: floating-point noise in a
   * value a person can read and a test would have to match. A thousandth of a
   * fraction is finer than a pixel at any width this page is used at.
   *
   * Rounding *after* the clamp moved the stop: a floor of 0.3125 came out as
   * 0.312, half a thousandth below the floor it was enforcing. Harmless, and
   * still a function not doing what it says. Rounding first leaves the clamp
   * exact, so a pane resting on its floor reports the floor.
   *
   * Rounded on this side only and the other side taken as the remainder, so a
   * drag conserves the pair exactly rather than leaking a rounding error per
   * pointer event — invisible for one move, a visibly wrong row after a few
   * seconds of dragging.
   */
  const wanted = Math.round((widths[left] + delta) * 1000) / 1000
  const next = Math.min(Math.max(wanted, floorFor(left)), total - floorFor(right))

  return { ...widths, [left]: next, [right]: total - next }
}

/** Where the handle sits between its two panes, as a percentage. */
export function splitterPosition(
  widths: Readonly<Record<PaneId, number>>,
  { left, right }: Splitter,
): { now: number; min: number; max: number } {
  const total = widths[left] + widths[right]
  const percent = (fraction: number): number => Math.round((fraction / total) * 100)

  return {
    now: percent(widths[left]),
    min: percent(floorFor(left)),
    max: percent(total - floorFor(right)),
  }
}

/**
 * The handle between two open panes.
 *
 * A `separator` with a tabindex, which is the role ARIA gives a window splitter:
 * it carries a value, so a screen reader announces "Resize the Editor and Form
 * panes, separator, 45%" and the arrow keys do what the announcement implies.
 * **The keyboard path is not an afterthought here** — a drag with no keyboard
 * equivalent fails WCAG 2.2 SC 2.5.7, and this repository's driver contract says
 * a control is found by role and accessible name or it is not found at all
 * ([0034](../../../docs/decisions/0034-accessible-name-only.md)).
 *
 * Pointer events rather than mouse events, and no pointer capture: the move and
 * release listeners go on the window, which is what keeps a drag alive when the
 * pointer outruns a 12-pixel-wide handle.
 */
export function PaneSplitter({
  splitter,
  label,
  widths,
  onResize,
  onReset,
}: {
  splitter: Splitter
  label: (pane: PaneId) => string
  widths: Readonly<Record<PaneId, number>>
  onResize: (next: Record<PaneId, number>) => void
  onReset: () => void
}) {
  const position = splitterPosition(widths, splitter)
  const names = `${label(splitter.left)} and ${label(splitter.right)}`

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const row = event.currentTarget.parentElement
    const pane = row?.querySelector(`#pane-${splitter.left}`)
    if (pane === null || pane === undefined) return

    /*
     * Pixels to fractions, linearised at the point the drag starts.
     *
     * Not a model of CSS grid's `fr` algorithm, which with a `minmax` minimum is
     * not a proportion at all — a pane sitting on its minimum does not grow with
     * its fraction until the row has slack again. Modelling that properly would
     * mean reimplementing the track-sizing algorithm to move a handle.
     *
     * It does not drift, because every move recomputes from the anchor taken
     * here rather than accumulating, and the next drag measures again. Where it
     * is wrong is the one place the exact answer does not matter: near a
     * minimum, where the grid refuses to move anyway.
     */
    const perFraction = pane.getBoundingClientRect().width / widths[splitter.left]
    if (!Number.isFinite(perFraction) || perFraction <= 0) return

    const fromX = event.clientX

    const move = (moved: PointerEvent): void => {
      const delta = (moved.clientX - fromX) / perFraction
      // `widths` is the value at pointerdown, which is the anchor -- the state
      // has moved on by now and reading it would accumulate rounding per event.
      onResize(dragSplitter(widths, splitter, delta))
    }
    const release = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Home and End go to the ends of the travel rather than of the row, because
    // the clamp is where the handle actually stops; announcing 0% and arriving
    // at 25% would be the control lying about itself.
    const step = { ArrowLeft: -KEYBOARD_STEP, ArrowRight: KEYBOARD_STEP, Home: -Infinity, End: Infinity }[
      event.key
    ]
    if (step === undefined) return

    event.preventDefault()
    onResize(dragSplitter(widths, splitter, step))
  }

  return (
    <div
      className="split"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize the ${names} panes`}
      aria-valuenow={position.now}
      aria-valuemin={position.min}
      aria-valuemax={position.max}
      aria-controls={`pane-${splitter.left} pane-${splitter.right}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      title={`Drag to resize, arrow keys to nudge, double-click to reset the ${names} panes`}
    />
  )
}

/**
 * The fold control for one pane.
 *
 * A disclosure: the name says which pane and `aria-expanded` says the state, so
 * a screen reader reads "Engine pane, button, expanded" and the name does not
 * change under somebody mid-sentence. The heading beside it is not the button,
 * because the editor's heading already holds the build/schema switch.
 */
export function FoldPane({
  pane,
  folded,
  onToggle,
}: {
  pane: string
  folded: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="fold"
      aria-label={`${pane} pane`}
      aria-expanded={!folded}
      onClick={onToggle}
      title={folded ? `Open the ${pane.toLowerCase()} pane` : `Fold the ${pane.toLowerCase()} pane away`}
    >
      {/* Decoration: the name and the state are on the button, and a screen
          reader reading "chevron" here would be reading the icon twice. */}
      <span aria-hidden="true">{folded ? '›' : '‹'}</span>
    </button>
  )
}

/**
 * Which panes are folded, how wide each one is, and the template that follows.
 *
 * One hook because it is one subject — this file's own subject — and because
 * `app.tsx` had grown past its size ceiling holding both halves of it. The
 * budget is a signal rather than a verdict, and here it was pointing at
 * something real: the page was carrying two pieces of pane state, the arithmetic
 * that turns them into a template, and the renderer for the handles between
 * them, none of which is the page's business.
 *
 * Session-only, like the theme, the locale and the demo chooser. Nothing in this
 * app persists and one setting that did would be the odd one out.
 */
export function usePaneLayout(): {
  folded: ReadonlySet<PaneId>
  foldPane: (pane: PaneId) => void
  widths: Readonly<Record<PaneId, number>>
  resize: (next: Record<PaneId, number>) => void
  reset: () => void
  template: string
  splitters: Splitter[]
} {
  const [folded, setFolded] = useState<ReadonlySet<PaneId>>(() => new Set())
  const [widths, setWidths] = useState<Readonly<Record<PaneId, number>>>(DEFAULT_WIDTHS)

  return {
    folded,
    foldPane: (pane) =>
      setFolded((current) => {
        const next = new Set(current)
        if (!next.delete(pane)) next.add(pane)
        return next
      }),
    widths,
    resize: setWidths,
    reset: () => setWidths(DEFAULT_WIDTHS),
    ...paneLayout(folded, widths),
  }
}

/**
 * The handle between two named panes, when there is one.
 *
 * `paneLayout` decides *whether* a boundary exists — a folded pane has nothing
 * to resize — and this only asks. The template and the splitter list come from
 * the one call inside the hook, so a handle can never occupy a column the
 * template did not reserve.
 */
export function PaneBoundary({
  layout,
  left,
  right,
}: {
  layout: ReturnType<typeof usePaneLayout>
  left: PaneId
  right: PaneId
}) {
  const splitter = layout.splitters.find((candidate) => candidate.left === left && candidate.right === right)
  if (splitter === undefined) return null

  return (
    <PaneSplitter
      splitter={splitter}
      label={(pane) => PANES.find((candidate) => candidate.id === pane)?.label ?? pane}
      widths={layout.widths}
      onResize={layout.resize}
      onReset={layout.reset}
    />
  )
}
