import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { computeAccessibleName } from 'dom-accessibility-api'
import { FORM_WORDS, FORM_WORDS_DE, FORM_WORDS_FR } from '@formancy/core/words'
import { App } from './app.js'

/**
 * One schema, two renderers, on one page.
 *
 * This is the project's founding claim — a headless engine that is genuinely
 * framework-neutral — and until now it was demonstrated nowhere. Both Angular
 * packages were complete, published and mounted by no application, so parity
 * was a test result in two jsdom suites that never saw each other.
 *
 * The danger with a demo like this is that it looks right while being inert.
 * A bootstrap that throws, a plugin that stops transforming, a provider that
 * goes missing — every one of those leaves the React half rendering perfectly
 * and the other half empty, and nothing in the rest of this suite would notice,
 * because every query in it is scoped to the React region. So the assertions
 * here are specifically that the ANGULAR region contains a form, that it
 * contains the same fields by role and accessible name, and that its logic runs.
 *
 * Queried by role and accessible name only, which is the conformance rule
 * ([0034](../../../docs/decisions/0034-accessible-name-only.md)) and also the
 * only way to compare two renderers at all: the markup is deliberately each
 * package's own, so anything structural would be comparing the wrong thing.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => <textarea readOnly aria-label="Schema" value={value ?? ''} />,
  useMonaco: () => null,
}))

afterEach(cleanup)

const reactPane = (): HTMLElement => screen.getByRole('region', { name: 'React' })
const angularPane = (): HTMLElement => screen.getByRole('region', { name: 'Angular' })

/**
 * Mount the app and wait for the Angular half to arrive.
 *
 * Angular bootstraps asynchronously, so there is a moment where the page has
 * one form. Waited for by the thing that proves it mounted rather than by a
 * timer.
 */
const mounted = async (): Promise<void> => {
  render(<App />)
  await waitFor(
    () => {
      const found = within(angularPane()).queryByRole('textbox', { name: 'First name' })
      expect(found, 'the Angular renderer never rendered a field').not.toBeNull()
    },
    { timeout: 10_000 },
  )
}

describe('the same document under both renderers', () => {
  test('the Angular half renders a real form, not an empty box', async () => {
    await mounted()

    // The bootstrap reports its own failure in the pane, so a broken one shows
    // up as this alert rather than as a mystery. Asserted absent, because the
    // waitFor above would otherwise be the only thing standing between a failed
    // bootstrap and a green suite.
    expect(within(angularPane()).queryByRole('alert')).toBeNull()
    expect(within(angularPane()).getByRole('textbox', { name: 'First name' })).toBeTruthy()
  })

  test('and offers the same fields as React, by role and accessible name', async () => {
    /*
     * The claim stated as an equality rather than as a spot check. If one
     * renderer drops a field type, misses a label, or names a control
     * differently, these two lists stop matching — and an accessible name is
     * exactly the right granularity, because the markup underneath is each
     * package's own on purpose.
     */
    await mounted()

    const CONTROL_ROLES = ['textbox', 'checkbox', 'combobox', 'spinbutton'] as const

    /** The accessible name of every visible control in one pane, sorted. */
    const named = (pane: HTMLElement): string[] =>
      CONTROL_ROLES.flatMap((role) =>
        within(pane)
          .queryAllByRole(role)
          .map((control) => computeAccessibleName(control)),
      )
        .filter((name) => name !== '')
        .sort()

    const react = named(reactPane())
    const angular = named(angularPane())

    // Not vacuous: the demo is the form with every field type in it, so a pane
    // offering three controls has not rendered.
    expect(react.length).toBeGreaterThan(3)
    /*
     * As a difference rather than an equality, so a failure names the control
     * instead of printing two lists of twenty-three strings and leaving the
     * reader to spot which one moved. That is how the real defect here was
     * read: `missing: ["Where to collect it"]`.
     */
    expect({
      missing: react.filter((name) => !angular.includes(name)),
      extra: angular.filter((name) => !react.includes(name)),
    }).toEqual({ missing: [], extra: [] })
  })

  test('and its logic runs, which is what makes it the same engine', async () => {
    /*
     * The assertion that a bootstrap check cannot make. A renderer can mount,
     * paint every field and still be bound to nothing — the engine arrives
     * through Angular's injector, and a missing provider throws where this
     * suite would see an empty pane rather than an error.
     *
     * So: a conditional field. `canton` is hidden until `country` is CH, by a
     * rule in the shared document, evaluated by the shared engine. If the
     * Angular pane responds to typing, the engine is wired.
     */
    await mounted()

    const angular = within(angularPane())
    expect(angular.queryByRole('textbox', { name: 'Canton' })).toBeNull()

    await userEvent.selectOptions(angular.getByRole('combobox', { name: 'Country' }), 'CH')

    await waitFor(() => {
      expect(angular.queryByRole('textbox', { name: 'Canton' })).not.toBeNull()
    })
  })

  test('and the two do not share element ids, which would break both of them', async () => {
    /*
     * Measured before it was fixed: two engines over one schema mint identical
     * ids, because they are derived from the form id. Each renderer is correct
     * about its own tree, so neither can see the collision.
     *
     * And the consequence is worse than "two elements share an id". Measured by
     * giving both engines the same form id and running this file: every one of
     * the four cases fails, because `label[for]` resolves to the FIRST matching
     * control in the document — so the second renderer's fields lose their
     * accessible names entirely and are unreachable by name, not merely
     * duplicated.
     *
     * Asserted across the whole page rather than per pane, which is the only
     * place the collision exists.
     */
    await mounted()

    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    const duplicated = ids.filter((id, at) => ids.indexOf(id) !== at)

    expect([...new Set(duplicated)]).toEqual([])
  })
})

describe('the Language switch', () => {
  test('changes both renderers’ own words, not only the form’s', async () => {
    /*
     * The switch rebuilt both engines in the chosen locale and the questions followed;
     * the Submit button under them stayed English in both panes, because the renderers'
     * own words were literals (0171). Read off the shipped catalogues rather than through
     * the function the renderers ask, which could be wrong for both in the same way. The
     * playground checks the answers before sending (0204), so the button is that one.
     */
    const user = userEvent.setup()
    await mounted()
    const end = (pane: HTMLElement, name: string) => within(pane).queryByRole('button', { name })

    for (const [locale, words] of [
      ['de', FORM_WORDS_DE],
      ['fr', FORM_WORDS_FR],
    ] as const) {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), locale)

      await waitFor(
        () => {
          expect(end(reactPane(), words['review.open']), `React in ${locale}`).not.toBeNull()
          expect(end(angularPane(), words['review.open']), `Angular in ${locale}`).not.toBeNull()
        },
        { timeout: 10_000 },
      )
      expect(end(reactPane(), FORM_WORDS['review.open'])).toBeNull()
      expect(end(angularPane(), FORM_WORDS['review.open'])).toBeNull()
    }
  })
})

describe('what the playground, as a host, draws under a field', () => {
  // Under the pickup point, the point the answer holds, by name and code (0233): in the field's
  // own wrapper, in each renderer, and empty until a point is chosen, which a theme gives no room.
  test('is the chosen pickup point, under that field, in both renderers', async () => {
    await mounted()
    const user = userEvent.setup()

    for (const pane of [reactPane(), angularPane()]) {
      const box = within(pane).getByRole('combobox', { name: 'Where to collect it' })
      const addition = () => box.closest('[data-formancy-part="field"]')?.querySelector('[data-formancy-part="field-addition"]')
      expect(addition()?.textContent?.trim() ?? '').toBe('')

      await user.type(box, 'Bern')
      await user.click(await within(pane).findByRole('option', { name: 'Bern Bahnhof' }, { timeout: 3_000 }))

      await waitFor(() => expect(addition()?.textContent).toContain('Bern Bahnhof · p3'))
    }
  })
})

describe('what the playground, as a host, draws beside a field', () => {
  /*
   * Beside the pickup point an Open, as a host draws one for the record a lookup points to, and
   * beside the country a Clear (0237): each a button on the box's own line, after the box, which a
   * theme draws with the box as one field. The row has no role and no name by design, so where the
   * button sits is read from the DOM by the parts a theme selects on, starting from the button and
   * the box found by role and name.
   */
  const rowHolding = (button: HTMLElement): HTMLElement | null => {
    const beside = button.parentElement
    if (beside?.getAttribute('data-formancy-part') !== 'field-beside') return null
    const row = beside.parentElement
    return row?.getAttribute('data-formancy-part') === 'field-control-row' ? row : null
  }
  /** The row's children by part, or by tag where a child is the select itself. */
  const parts = (row: HTMLElement | null): string[] => [...(row?.children ?? [])].map((child) => child.getAttribute('data-formancy-part') ?? child.tagName)

  // Without the option passed in either pane, no row is drawn there and the feature is documented
  // and seen nowhere; a row around something other than the box, or a button outside it, is the
  // place a theme cannot join to the box. And each button is unavailable while its field is empty,
  // not missing, so the box keeps its width when an answer is picked.
  test('is a button joined to the pickup point’s box and to the country’s, in both renderers', async () => {
    await mounted()
    const user = userEvent.setup()

    for (const pane of [reactPane(), angularPane()]) {
      const where = pane === reactPane() ? 'React' : 'Angular'
      const point = within(pane).getByRole('combobox', { name: 'Where to collect it' })
      const country = within(pane).getByRole('combobox', { name: 'Country' })

      const open = within(pane).getByRole('button', { name: 'Open the pickup point' })
      const clear = within(pane).getByRole('button', { name: 'Clear the country' })
      expect(parts(rowHolding(open)), `${where}: the pickup point's row`).toEqual(['typeahead-anchor', 'field-beside'])
      expect(rowHolding(open)?.firstElementChild, `${where}: the pickup point's box`).toBe(point.closest('[data-formancy-part="typeahead-anchor"]'))
      expect(parts(rowHolding(clear)), `${where}: the country's row`).toEqual(['SELECT', 'field-beside'])
      expect(rowHolding(clear)?.firstElementChild, `${where}: the country's box`).toBe(country)
      expect([open.getAttribute('aria-disabled'), clear.getAttribute('aria-disabled')], `${where}: both while empty`).toEqual(['true', 'true'])

      await user.type(point, 'Bern')
      await user.click(await within(pane).findByRole('option', { name: 'Bern Bahnhof' }, { timeout: 3_000 }))
      const opened = await within(pane).findByRole('button', { name: 'Open Bern Bahnhof' })
      expect(opened, `${where}: the same button, named for the point`).toBe(open)
      expect(opened.hasAttribute('aria-disabled'), `${where}: available once a point is chosen`).toBe(false)
    }
  })

  // A button that did nothing once its field held an answer only looks like one: the Open moves the
  // keyboard to the point drawn under the field, as a host's Open moves it to the record it opens,
  // and the Clear takes the answer away, which the engine hears. And the Clear keeps the keyboard
  // as the field empties: a button that left the keyboard's order as it became unavailable would
  // drop the keyboard to the page.
  test('does what it says once its field holds an answer, and keeps the keyboard, in both renderers', async () => {
    await mounted()
    const user = userEvent.setup()

    for (const pane of [reactPane(), angularPane()]) {
      const where = pane === reactPane() ? 'React' : 'Angular'
      const point = within(pane).getByRole('combobox', { name: 'Where to collect it' })
      const country = within(pane).getByRole<HTMLSelectElement>('combobox', { name: 'Country' })

      await user.type(point, 'Bern')
      await user.click(await within(pane).findByRole('option', { name: 'Bern Bahnhof' }, { timeout: 3_000 }))
      await user.click(await within(pane).findByRole('button', { name: 'Open Bern Bahnhof' }))
      await waitFor(() => expect(document.activeElement?.textContent, `${where}: the Open moves the keyboard to the point`).toBe('Bern Bahnhof · p3'))
      expect(document.activeElement?.closest('[data-formancy-part="field-addition"]'), `${where}: under the field`).toBe(
        point.closest('[data-formancy-part="field"]')?.querySelector('[data-formancy-part="field-addition"]'),
      )

      const clear = within(pane).getByRole('button', { name: 'Clear the country' })
      await user.selectOptions(country, 'CH')
      await waitFor(() => expect(clear.hasAttribute('aria-disabled'), `${where}: available once a country is chosen`).toBe(false))
      expect(within(pane).queryByRole('textbox', { name: 'Canton' })).not.toBeNull()
      await user.click(clear)
      await waitFor(() => expect(country.value, `${where}: the Clear empties the country`).toBe(''))
      await waitFor(() => expect(within(pane).queryByRole('textbox', { name: 'Canton' }), `${where}: and the engine heard it`).toBeNull())
      expect(clear.getAttribute('aria-disabled'), `${where}: unavailable again`).toBe('true')
      expect(document.activeElement, `${where}: the keyboard stays on the Clear`).toBe(clear)
    }
  })
})
