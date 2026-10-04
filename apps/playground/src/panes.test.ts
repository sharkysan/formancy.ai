import { describe, expect, test } from 'vitest'
import {
  DEFAULT_WIDTHS,
  KEYBOARD_STEP,
  PANES,
  PANE_COLUMNS,
  dragSplitter,
  paneLayout,
  splitterPosition,
} from './panes.js'
import type { PaneId } from './panes.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The arithmetic behind a draggable boundary, with no DOM in it.
 *
 * Separate from `pane-splitters.test.tsx` for the reason `arrange.ts` is
 * separate in the builder: what a drag *means* is arithmetic, and arithmetic
 * tested through a rendered tree is tested through a layout engine that, in
 * jsdom, does not exist. These cases can state exactly what moves and by how
 * much; the component's cases can only state what ends up in the markup.
 */
const here = dirname(fileURLToPath(import.meta.url))
const css = (): string => readFileSync(join(here, 'app.css'), 'utf8')
const open = new Set<PaneId>()

describe('where the handles are', () => {
  test('one between each adjacent pair, when both are open', () => {
    const { splitters } = paneLayout(open, DEFAULT_WIDTHS)

    expect(splitters).toEqual([
      { left: 'editor', right: 'form' },
      { left: 'form', right: 'engine' },
    ])
  })

  test('and none beside a folded pane, because there is nothing to resize', () => {
    // A handle that does nothing is worse than no handle: it takes a tab stop
    // and announces a value that cannot change.
    expect(paneLayout(new Set<PaneId>(['engine']), DEFAULT_WIDTHS).splitters).toEqual([
      { left: 'editor', right: 'form' },
    ])
    expect(paneLayout(new Set<PaneId>(['form']), DEFAULT_WIDTHS).splitters).toEqual([])
    expect(paneLayout(new Set<PaneId>(['editor', 'form', 'engine']), DEFAULT_WIDTHS).splitters).toEqual([])
  })

  test('and the template reserves a column for each one and no more', () => {
    /*
     * The divergence this exists for. A splitter occupies a grid column, so the
     * template and the splitter list have to agree about how many there are —
     * and they are returned by one call precisely so they cannot disagree. If
     * they ever did, the symptom would be a layout off by one column: every
     * pane in the wrong place, no error anywhere.
     *
     * Every fold combination, because the count differs in each.
     */
    for (const folded of [
      [],
      ['editor'],
      ['form'],
      ['engine'],
      ['editor', 'form'],
      ['editor', 'engine'],
      ['form', 'engine'],
      ['editor', 'form', 'engine'],
    ] as PaneId[][]) {
      const { template, splitters } = paneLayout(new Set(folded), DEFAULT_WIDTHS)

      // Columns are space-separated, and a `minmax(a, b)` has a space in it.
      const columns = template.split(/ (?![^(]*\))/)
      expect(columns.length, folded.join('+') || 'none folded').toBe(PANES.length + splitters.length)
    }
  })

  test('and a folded pane is a strip, not a column with a width in it', () => {
    // How narrow belongs to the stylesheet; this only says which panes get it.
    expect(paneLayout(new Set<PaneId>(['editor']), DEFAULT_WIDTHS).template).toBe(
      'var(--pane-folded) minmax(24rem, 1.25fr) var(--pane-split) minmax(16rem, 0.8fr)',
    )
  })
})

describe('moving a handle', () => {
  test('trades fraction between its two panes and leaves the third alone', () => {
    const moved = dragSplitter(DEFAULT_WIDTHS, { left: 'editor', right: 'form' }, 0.25)

    expect(moved.editor).toBe(1.25)
    expect(moved.form).toBe(1)
    expect(moved.engine, 'the pane on the far side of the row moved').toBe(DEFAULT_WIDTHS.engine)
  })

  test('and conserves the pair exactly, however many times it is moved', () => {
    /*
     * Rounding is on one side and the other is the remainder, so a drag cannot
     * leak fraction. Without that the row's total drifts by a rounding error per
     * pointer event — invisible for one move and a visibly wrong layout after a
     * few seconds of dragging.
     */
    let widths: Record<PaneId, number> = { ...DEFAULT_WIDTHS }
    const total = widths.editor + widths.form

    for (const delta of [0.137, -0.291, 0.0004, 0.333, -0.111]) {
      widths = dragSplitter(widths, { left: 'editor', right: 'form' }, delta)
      expect(widths.editor + widths.form).toBeCloseTo(total, 10)
    }
  })

  test('and stops at a quarter of each pane, rather than letting one reach zero', () => {
    /*
     * At zero the handle stops tracking the pointer and dragging back feels
     * dead. The grid's own minimum is what keeps a pane usable; this keeps the
     * *state* coherent, which is a different job.
     *
     * Exactly the floor, which it was not at first: rounding applied after the
     * clamp turned a floor of 0.3125 into 0.312, half a thousandth below the
     * value being enforced. The order is now round-then-clamp, and this case is
     * what says so.
     */
    const squashed = dragSplitter(DEFAULT_WIDTHS, { left: 'editor', right: 'form' }, -99)
    expect(squashed.editor).toBe(DEFAULT_WIDTHS.editor * 0.25)

    const stretched = dragSplitter(DEFAULT_WIDTHS, { left: 'editor', right: 'form' }, 99)
    expect(stretched.form).toBe(DEFAULT_WIDTHS.form * 0.25)
  })

  test('and rounds to three decimals, so what lands in the DOM is readable', () => {
    // Two arrow presses put `minmax(19rem, 1.2000000000000002fr)` in the markup
    // before this: floating-point noise in a value a person can read, and in one
    // a test would have to match.
    const nudged = dragSplitter(dragSplitter(DEFAULT_WIDTHS, { left: 'editor', right: 'form' }, KEYBOARD_STEP), {
      left: 'editor',
      right: 'form',
    }, KEYBOARD_STEP)

    expect(paneLayout(open, nudged).template).toContain('1.2fr')
  })
})

describe('what the handle announces', () => {
  test('its position between the two panes, as a percentage of the pair', () => {
    // 1 against 1.25 is 44%, and a screen reader reading "separator, 44%" is
    // reading the thing the arrow keys change.
    expect(splitterPosition(DEFAULT_WIDTHS, { left: 'editor', right: 'form' })).toEqual({
      now: 44,
      min: 11,
      max: 86,
    })
  })

  test('and the ends of its travel, not the ends of the row', () => {
    /*
     * `aria-valuemin` is where the handle actually stops. Announcing 0 and 100
     * would be the control describing a range it refuses to enter — and Home and
     * End are wired to the clamp, so they would land somewhere other than what
     * was announced.
     */
    const { min, max } = splitterPosition(DEFAULT_WIDTHS, { left: 'editor', right: 'form' })
    const atHome = dragSplitter(DEFAULT_WIDTHS, { left: 'editor', right: 'form' }, -Infinity)
    const atEnd = dragSplitter(DEFAULT_WIDTHS, { left: 'editor', right: 'form' }, Infinity)

    expect(splitterPosition(atHome, { left: 'editor', right: 'form' }).now).toBe(min)
    expect(splitterPosition(atEnd, { left: 'editor', right: 'form' }).now).toBe(max)
  })
})

describe('the minimums the grid will not go below', () => {
  test('still leave a handle somewhere to travel at the width the row appears', () => {
    /*
     * The three minimums are what a pane needs to stay usable, and they are also
     * what a drag runs into. Raise one far enough and the row cannot fit inside
     * the viewport where the side-by-side layout starts — at which point the
     * splitters have no travel at all on the narrowest screen that shows them,
     * and the page overflows sideways before anybody touches a handle.
     *
     * The breakpoint is read from the stylesheet rather than written here,
     * because it is the stylesheet's decision and these two going out of step is
     * the whole failure.
     */
    const breakpoint = /@media \(max-width: (\d+)rem\)/.exec(css())?.[1]
    expect(breakpoint, 'the stylesheet has no max-width breakpoint').toBeDefined()

    const minimums = PANE_COLUMNS.reduce((sum, { minimum }) => sum + Number.parseFloat(minimum), 0)

    expect(minimums, `${String(minimums)}rem of minimums against a ${String(breakpoint)}rem breakpoint`).toBeLessThan(
      Number(breakpoint),
    )
  })

  test('and are stated separately from the fraction, which is the part that moves', () => {
    // They were one `minmax(…)` string while both were constant. A test, because
    // merging them back would make the template unbuildable and the error would
    // be a type error somewhere else entirely.
    for (const { minimum, fraction } of PANE_COLUMNS) {
      expect(minimum).toMatch(/^\d+(\.\d+)?rem$/)
      expect(fraction).toBeGreaterThan(0)
    }
  })
})

describe('the stylesheet and the component', () => {
  test('agree that the template arrives as a custom property', () => {
    /*
     * The iPad bug, guarded.
     *
     * The component used to set `grid-template-columns` inline, and an inline
     * declaration beats every rule in the stylesheet — including the
     * narrow-screen override that asks for a single column, which was silently
     * losing. Measured in Chromium at an 820px viewport: the row demanded 992px,
     * the page scrolled sideways by 187px, and the one visible pane was 304px
     * wide inside an 820px screen. At 390px the overflow would be 602px.
     *
     * So the property is what the component sets and the declaration stays in
     * the stylesheet, where the cascade can reach it. This asserts both halves,
     * because either one alone does nothing.
     */
    const stylesheet = css()
    const component = readFileSync(join(here, 'app.tsx'), 'utf8')

    expect(stylesheet, 'the stylesheet no longer reads the property').toContain('var(\n    --pane-template,')
    expect(component, 'the component is setting a grid property inline again').not.toMatch(
      /style=\{\{[^}]*gridTemplate/,
    )
    // The property name, not the expression that feeds it: the fact is which
    // property the row sets, and the value moved from `template` to
    // `panes.template` the first time the file was split.
    expect(component).toContain("'--pane-template':")
  })

  test('and the handle gives up the gesture on a touch screen, or it never moves', () => {
    /*
     * `touch-action: none`. Without it iOS claims a horizontal drag for
     * scrolling and the handle does nothing — the feature works on a trackpad
     * and is absent on the device it was asked for, which is the worst version
     * of shipped.
     *
     * Read from the stylesheet because there is nowhere else to read it: jsdom
     * applies no CSS, so a rendered handle reports no computed value for this.
     * Verified in Chromium, where the handle reports `touch-action: none`.
     */
    const rule = /\.split \{([^}]*)\}/.exec(css())?.[1]

    expect(rule, 'there is no .split rule in the stylesheet').toBeDefined()
    expect(rule).toContain('touch-action: none')
  })

  test('and there are no handles on the screen that shows one pane at a time', () => {
    // A handle between stacked panes is a stray line with a tab stop. Hidden
    // rather than not rendered, so the switcher does not move the focus order
    // under somebody on every tap.
    const narrow = css().slice(css().lastIndexOf('@media (max-width: 64rem)'))

    expect(narrow).toMatch(/\.split \{\s*display: none;\s*\}/)
  })

  test('and the row sets nothing inline but custom properties', () => {
    /*
     * The same fact from the other side, and the one that would have caught the
     * bug on its own: whatever the panes row carries inline, the cascade must
     * still own every real property on it. A custom property is safe exactly
     * because the declaration that reads it is in the stylesheet.
     *
     * **Scoped to this element rather than to the file**, after the general
     * version was written and produced a false positive. It flagged
     * `style={{ padding: '1rem' }}` on an empty-state paragraph, because a media
     * query elsewhere sets `padding` on `.pane > .body` — a different element.
     * An inline property only conflicts with a rule that matches the same
     * element, and deciding that from source means matching selectors against
     * JSX, which is not a thing a regular expression should be asked to do.
     * Six guards in this repository have had their own expression as the defect.
     */
    const component = readFileSync(join(here, 'app.tsx'), 'utf8')
    const at = component.indexOf('className="panes"')
    expect(at, 'there is no panes row in app.tsx').toBeGreaterThan(-1)

    // The opening tag only. Searching the rest of the file found an empty-state
    // paragraph's `padding` instead, because `} as CSSProperties}` does not end
    // in `}}` and the pattern walked past the element it was aimed at.
    const tag = component.slice(at, component.indexOf('\n      >', at))
    const row = /style=\{\{([^}]*)\}/.exec(tag)?.[1]

    expect(row, 'the panes row has no inline style to check').toBeDefined()
    // What it matched, asserted. A pattern that drifts to another element should
    // fail here rather than quietly check the wrong thing.
    expect(row, 'this is not the row that carries the template').toContain('pane-template')

    const properties = [...row!.matchAll(/(?:'([^']+)'|([A-Za-z]+))\s*:/g)].map(
      ([, quoted, plain]) => quoted ?? plain!,
    )
    expect(properties.length).toBeGreaterThan(0)

    for (const property of properties) {
      expect(property.startsWith('--'), `the row sets ${property} inline, where no media query can reach it`).toBe(
        true,
      )
    }
  })
})
