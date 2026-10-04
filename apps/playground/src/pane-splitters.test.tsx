import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'
import { paneLayout } from './panes.js'
import type { PaneId } from './panes.js'

/**
 * Dragging the boundary between two panes.
 *
 * Folding was the first answer to a crowded laptop and it is a blunt one: a pane
 * is there or it is a strip. Dragging is the other half — the editor wants two
 * thirds of the row while you are writing a schema and a quarter of it while you
 * are filling the form in, and neither of those is a fold.
 *
 * **What these cases can and cannot see**, because the limit decides what is
 * worth asserting here:
 *
 * - They can see the template. It is a string the component composes and puts on
 *   the row, so every case below reads the state through the thing the browser
 *   would read.
 * - They cannot see a width. jsdom has no layout, so every box measures zero —
 *   which is also why the drag case stubs one rather than pretending. The
 *   behaviour that depends on real layout was measured in Chromium instead and
 *   is written down in `panes.tsx`: once a pane reaches its `minmax` minimum the
 *   grid redistributes, so the far pane does move. No test here could have found
 *   that, and the comment claiming otherwise survived until the measurement.
 * - The arithmetic is tested in `panes.test.ts`, with no DOM in the way.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => (
    <textarea readOnly aria-label="Schema" value={value ?? ''} />
  ),
  useMonaco: () => null,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The handle between two panes, by role and accessible name. */
const handle = (between: string): HTMLElement =>
  screen.getByRole('separator', { name: `Resize the ${between} panes` })

/** The template the row is actually carrying. */
const template = (): string =>
  (document.querySelector('.panes') as HTMLElement).style.getPropertyValue('--pane-template')

describe('the handles on the page', () => {
  test('there is one between each adjacent pair, named for both panes', () => {
    render(<App />)

    expect(handle('Editor and Form')).toBeTruthy()
    expect(handle('Form and Engine')).toBeTruthy()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  test('each is focusable and announces where it sits', () => {
    // A separator with a value is the role ARIA gives a window splitter, and it
    // is what makes "separator, 44%" and the arrow keys agree.
    render(<App />)
    const editorForm = handle('Editor and Form')

    expect(editorForm.tabIndex).toBe(0)
    expect(editorForm.getAttribute('aria-orientation')).toBe('vertical')
    expect(editorForm.getAttribute('aria-valuenow')).toBe('44')
    expect(editorForm.getAttribute('aria-controls')).toBe('pane-editor pane-form')
  })

  test('and the row reserves exactly the columns the handles need', () => {
    /*
     * The divergence worth guarding on the page as well as in the arithmetic: a
     * handle occupies a grid column, so what is rendered and what the template
     * reserves have to agree. They come from one call for that reason, and this
     * asserts the result rather than the intent — the JSX asks for a handle at
     * each of two fixed seams, and a fourth pane would make that list wrong
     * while the template stayed right.
     */
    render(<App />)
    const columns = template().split(/ (?![^(]*\))/)

    expect(columns).toHaveLength(3 + screen.getAllByRole('separator').length)
  })

  test('and the handle beside a folded pane goes away with it', async () => {
    // Nothing to resize, so no tab stop and no value that cannot change.
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Engine pane' }))

    expect(screen.getAllByRole('separator')).toHaveLength(1)
    expect(handle('Editor and Form')).toBeTruthy()
    expect(template()).toBe(paneLayout(new Set<PaneId>(['engine']), { editor: 1, form: 1.25, engine: 0.8 }).template)
  })
})

describe('moving a handle by keyboard', () => {
  test('the arrow keys move it, which is the path a drag cannot provide', async () => {
    /*
     * Not a nicety. A drag with no keyboard equivalent fails WCAG 2.2 SC 2.5.7,
     * and this repository's driver contract says a control is reached by role
     * and accessible name or it is not reached at all
     * ([0034](../../../docs/decisions/0034-accessible-name-only.md)).
     */
    const user = userEvent.setup()
    render(<App />)

    await user.tab()
    handle('Editor and Form').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')

    expect(template()).toContain('1.2fr')
    expect(handle('Editor and Form').getAttribute('aria-valuenow')).toBe('53')
  })

  test('and the pane on the far side of the row keeps its share', async () => {
    // The handle is a boundary, not a slider: the two panes either side of it
    // trade with each other. (In pixels the grid may still move the third pane
    // once one of the pair hits its minimum — see `dragSplitter`.)
    const user = userEvent.setup()
    render(<App />)

    handle('Editor and Form').focus()
    await user.keyboard('{ArrowLeft}')

    expect(template()).toContain('minmax(16rem, 0.8fr)')
  })

  test('and Home and End go to the ends of the travel, not of the row', async () => {
    // Announcing 0 and 100 and then stopping at the clamp would be the control
    // lying about itself, so both keys are wired to the clamp that exists.
    const user = userEvent.setup()
    render(<App />)
    const editorForm = handle('Editor and Form')

    editorForm.focus()
    await user.keyboard('{Home}')
    expect(handle('Editor and Form').getAttribute('aria-valuenow')).toBe(
      editorForm.getAttribute('aria-valuemin'),
    )

    handle('Editor and Form').focus()
    await user.keyboard('{End}')
    expect(handle('Editor and Form').getAttribute('aria-valuenow')).toBe(
      editorForm.getAttribute('aria-valuemax'),
    )
  })

  test('and a key it does not use is left alone', async () => {
    // `preventDefault` on everything would eat Tab and trap focus on a handle.
    const user = userEvent.setup()
    render(<App />)

    const before = template()
    handle('Editor and Form').focus()
    await user.keyboard('{ArrowUp}{PageDown}{a}')

    expect(template()).toBe(before)
  })
})

describe('moving a handle by pointer', () => {
  /**
   * A box, because jsdom has none.
   *
   * Every `getBoundingClientRect` in jsdom reports zero, and the component turns
   * a pointer's pixels into a fraction by dividing by the pane's measured width
   * — so without a box the drag divides by zero and the component correctly
   * declines to move. Stubbing the measurement is the honest way to reach the
   * arithmetic: it is a function, unlike the cascade the fold tests could not
   * stub.
   */
  const withPaneWidth = (pixels: number): void => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: pixels,
      height: 600,
      top: 0,
      left: 0,
      right: pixels,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
  }

  /**
   * A pointer event, through `fireEvent` rather than `dispatchEvent`.
   *
   * Not a style choice. A raw `dispatchEvent` reaches the handler and the state
   * update it causes is scheduled outside `act`, so an assertion on the next
   * line reads the markup from before the event — three cases here failed
   * exactly that way and looked like a drag that did nothing. The same timing
   * caught me measuring this in a real browser, where the first reading said
   * the handle had not moved and a 60ms wait said it had.
   */
  const press = (element: Element | Window, type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientX: number): void => {
    fireEvent[type](element as Element, { clientX })
  }

  test('a press and a move to the right gives the left pane the difference', async () => {
    render(<App />)
    // 441px is what the editor pane measures in Chromium at a 1440px viewport,
    // against its starting fraction of 1 — so a 110px drag is a quarter of a
    // fraction, and the assertion below is the same arithmetic the browser did.
    withPaneWidth(441)

    press(handle('Editor and Form'), 'pointerDown', 500)
    press(window, 'pointerMove', 610)

    expect(template()).toContain('minmax(19rem, 1.249fr)')
  })

  test('and a move to the left gives it away again', () => {
    render(<App />)
    withPaneWidth(441)

    press(handle('Editor and Form'), 'pointerDown', 500)
    press(window, 'pointerMove', 390)

    expect(template()).toContain('minmax(19rem, 0.751fr)')
  })

  test('and every move measures from the press, so a drag cannot drift', () => {
    /*
     * The handler reads the fraction captured at `pointerdown` rather than the
     * state it has just written. Accumulating instead would add a rounding error
     * per pointer event — invisible for one move, a visibly wrong row after a
     * few seconds of dragging, and worse the faster the pointer moves.
     */
    render(<App />)
    withPaneWidth(441)

    press(handle('Editor and Form'), 'pointerDown', 500)
    for (const x of [520, 560, 601, 580, 610]) press(window, 'pointerMove', x)

    // The same place one move of +110 reaches, not the sum of five.
    expect(template()).toContain('minmax(19rem, 1.249fr)')
  })

  test('and releasing stops it, rather than leaving a listener on the window', () => {
    // A handle that keeps resizing after the button is up is the bug every
    // hand-rolled splitter ships first.
    render(<App />)
    withPaneWidth(441)

    press(handle('Editor and Form'), 'pointerDown', 500)
    press(window, 'pointerMove', 610)
    const atRelease = template()
    press(window, 'pointerUp', 610)
    press(window, 'pointerMove', 900)

    expect(template()).toBe(atRelease)
  })

  test('and a row with no width is left alone rather than divided by', () => {
    /*
     * The real case this protects, and the reason jsdom's zero box is useful
     * rather than only awkward: a hidden or not-yet-laid-out row measures zero,
     * and dividing by it gives `Infinity` — one pointer event would send a pane
     * to its clamp. Here it is the default state of every element.
     */
    render(<App />)
    const before = template()

    press(handle('Editor and Form'), 'pointerDown', 500)
    press(window, 'pointerMove', 610)

    expect(template()).toBe(before)
  })
})

describe('putting it back', () => {
  test('a double-click on the handle restores the widths it started with', async () => {
    // The escape hatch from a drag that went wrong, on the thing that went
    // wrong. Discoverable through the handle's own tooltip rather than only here.
    const user = userEvent.setup()
    render(<App />)
    const before = template()

    handle('Editor and Form').focus()
    await user.keyboard('{End}')
    expect(template()).not.toBe(before)

    await user.dblClick(handle('Editor and Form'))
    expect(template()).toBe(before)
  })

  test('and the answers in the form survive being resized, as they do a fold', async () => {
    // The engine lives above the panes, so this is really a statement about
    // where it lives — and it would break the day somebody moved it inside one.
    const user = userEvent.setup()
    render(<App />)

    const first = screen.getAllByRole('textbox', { name: 'First name' })[0]
    await user.type(first!, 'Ada')

    handle('Editor and Form').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')

    expect((screen.getAllByRole('textbox', { name: 'First name' })[0] as HTMLInputElement).value).toBe('Ada')
  })
})
