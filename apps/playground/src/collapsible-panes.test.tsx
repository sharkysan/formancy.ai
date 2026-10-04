import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'

/**
 * Folding a pane away by hand.
 *
 * Three panes at once is right on a wide screen and crowded on a laptop, and the
 * existing answer — the switcher that shows one at a time — only appears below
 * 64rem. Between those two widths there was nothing: you got all three or you
 * resized the window.
 *
 * **Folding hides the body with CSS and keeps it in the tree**, which is the
 * implementation choice worth pinning. Unmounting would be simpler and would
 * tear down the Angular application the preview bootstrapped, and lose focus and
 * scroll position — a pane you cannot fold without losing your place is a pane
 * nobody folds twice.
 *
 * Two things these cases deliberately do NOT claim, because measuring said so:
 *
 * - They cannot see the hide itself. jsdom applies no CSS, so `display: none`
 *   and any other hiding rule look identical here. Swapping the rule leaves them
 *   green; what they pin is that the body is still *there*.
 * - The answers are not what unmounting would cost. The engine is created above
 *   the pane, so even forcing a remount of the body — tried, by keying it on the
 *   folded state — keeps every value. Worth saying, because the obvious comment
 *   to write here is the wrong one.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => (
    <textarea readOnly aria-label="Schema" value={value ?? ''} />
  ),
  useMonaco: () => null,
}))

afterEach(cleanup)

/** The toggle for one pane, by role and accessible name. */
const toggle = (pane: string): HTMLElement =>
  screen.getByRole('button', { name: `${pane} pane` })

const paneNamed = (pane: string): HTMLElement =>
  screen.getByRole('region', { name: pane })

describe('folding a pane away', () => {
  test('every pane has a toggle, and they all start open', () => {
    render(<App />)

    for (const pane of ['Editor', 'Form', 'Engine']) {
      expect(toggle(pane).getAttribute('aria-expanded'), pane).toBe('true')
    }
  })

  test('clicking one folds it, and clicking again brings it back', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(toggle('Engine'))
    expect(toggle('Engine').getAttribute('aria-expanded')).toBe('false')

    await user.click(toggle('Engine'))
    expect(toggle('Engine').getAttribute('aria-expanded')).toBe('true')
  })

  test('a folded pane keeps its title readable, so it can be found again', async () => {
    // A strip with no name is a strip nobody clicks. The heading stays in the
    // DOM and the toggle keeps its accessible name, which is also what makes
    // the state recoverable by keyboard.
    const user = userEvent.setup()
    render(<App />)

    await user.click(toggle('Engine'))

    expect(paneNamed('Engine')).toBeTruthy()
    expect(within(paneNamed('Engine')).getByRole('heading', { name: 'Engine' })).toBeTruthy()
  })

  test('keeps the folded body in the tree, rather than unmounting it', async () => {
    /*
     * The implementation choice, pinned. Making the body conditional is the
     * obvious alternative and it tears down the Angular application the preview
     * bootstrapped on every fold.
     *
     * Asserted by asking for a real control *while folded*: the pane is hidden
     * on screen and its contents are still queryable, which is exactly what
     * `display: none` gives and unmounting does not. Observed failing with the
     * body wrapped in `{!folded.has('form') && (…)}`.
     */
    const user = userEvent.setup()
    render(<App />)

    await user.click(toggle('Form'))

    expect(toggle('Form').getAttribute('aria-expanded')).toBe('false')
    expect(
      within(paneNamed('Form')).queryAllByRole('textbox', { name: 'First name' }).length,
      'the body was removed from the tree instead of hidden',
    ).toBeGreaterThan(0)
  })

  test('and what somebody typed survives a fold, because the engine outlives the pane', async () => {
    /*
     * True, and not for the reason it looks like: the engine is created above
     * this pane, so the values are not the pane's to lose. Kept because it is
     * the behaviour a visitor actually cares about, and it would break the day
     * somebody moved the engine into the pane.
     */
    const user = userEvent.setup()
    render(<App />)

    const first = within(paneNamed('Form')).getAllByRole('textbox', { name: 'First name' })[0]
    expect(first, 'the form pane rendered no First name control').toBeDefined()
    await user.type(first!, 'Ada')
    expect((first as HTMLInputElement).value).toBe('Ada')

    await user.click(toggle('Form'))
    await user.click(toggle('Form'))

    const again = within(paneNamed('Form')).getAllByRole('textbox', { name: 'First name' })[0]
    expect((again as HTMLInputElement).value, 'folding the pane lost the answer').toBe('Ada')
  })

  test('all three can be folded at once, and each can be brought back', async () => {
    // Allowed rather than prevented: three named strips is a recoverable state,
    // and a rule against it would need somewhere to put the refusal.
    const user = userEvent.setup()
    render(<App />)

    for (const pane of ['Editor', 'Form', 'Engine']) await user.click(toggle(pane))
    for (const pane of ['Editor', 'Form', 'Engine']) {
      expect(toggle(pane).getAttribute('aria-expanded'), pane).toBe('false')
    }

    await user.click(toggle('Form'))
    expect(toggle('Form').getAttribute('aria-expanded')).toBe('true')
  })
})
