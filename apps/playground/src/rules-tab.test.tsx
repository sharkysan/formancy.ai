import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'

/**
 * The rules tab, as a visitor meets it (0128).
 *
 * The overview's words are builder-core's and are tested there against the engine.
 * What is demonstrated here is the playground's half: that the verdicts follow what
 * is typed into the form pane, which is the one thing that shows a person why a field
 * is hidden — change the answer, watch the reason change.
 *
 * The whole application is mounted, as the theme editor's tests explain, so the
 * timeout is theirs.
 */
vi.setConfig({ testTimeout: 60_000 })

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => (
    <textarea readOnly aria-label="Schema" value={value ?? ''} />
  ),
  useMonaco: () => null,
}))

afterEach(cleanup)

describe('the rules tab', () => {
  test('lists the form’s rules, and says why the canton is hidden until Switzerland is chosen', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Rules' }))

    const overview = screen.getByRole('region', { name: 'Every rule in this form' })
    const canton = within(overview).getByRole('heading', { name: 'Canton' }).closest('li')!
    // The starter's rules are hand-written CEL, so they are shown as written.
    expect(within(canton).getAllByText('country == "CH"').length).toBeGreaterThan(0)
    expect(within(canton).getByText('Hidden now.')).toBeTruthy()

    // The React preview's country select; the Angular one is the second.
    const [country] = screen.getAllByRole('combobox', { name: 'Country' })
    await user.selectOptions(country!, 'CH')

    expect(within(canton).getByText('Shown now.')).toBeTruthy()
  })

  test('says a rule in a repeater row in words, and row by row what it does now', async () => {
    // The starter's row rule was written by the condition editor, so it has words, and a
    // verdict for each row the preview holds (0129, 0147). The form opens
    // with one recipient and no amount; a large amount in that row asks for a note there.
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Rules' }))

    const overview = screen.getByRole('region', { name: 'Every rule in this form' })
    const note = within(overview).getByText('Amount in this row is at least 1000').closest('li')!
    const rows = () =>
      [...note.querySelectorAll('[data-formancy-part="rules-overview-rows"] [data-formancy-part="rules-overview-now"] > p')].map(
        (line) => line.textContent,
      )
    expect(rows()).toEqual(['Row 1 Not required now.'])

    // The React preview's first recipient; the Angular one's comes after it.
    const react = screen.getByRole('region', { name: 'React' })
    const [amount] = within(react).getAllByRole('spinbutton', { name: /Amount|CHF/ })
    await user.type(amount!, '1200')

    expect(rows()).toEqual(['Row 1 Required now.'])
    expect(within(note).getByText('Amount in this row is at least 1000: yes')).toBeTruthy()
  })
})
