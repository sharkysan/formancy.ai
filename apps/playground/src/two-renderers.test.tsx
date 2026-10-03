import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { computeAccessibleName } from 'dom-accessibility-api'
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
  default: ({ value }: { value?: string }) => (
    <textarea readOnly aria-label="Schema" value={value ?? ''} />
  ),
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
