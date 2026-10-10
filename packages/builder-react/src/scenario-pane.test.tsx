import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { ScenarioPane } from './scenario-pane.js'

/**
 * The pane that answers the question nothing else can.
 *
 * A condition type-checks and is still the wrong business rule. What is pinned
 * here is not that the runner works — `@formancy/core` owns that and tests it
 * against eighteen real templates — but the two things this pane adds: that it
 * reruns when the document changes, and that it names **what stopped holding**
 * rather than how many fail
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 */
afterEach(cleanup)

const form: FormSchema = {
  specVersion: '2',
  id: 'leave',
  title: 'Leave',
  model: {
    fields: [
      { key: 'kind', type: 'radio', label: 'Kind', options: [
        { value: 'holiday', label: 'Holiday' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'reason', type: 'text', label: 'Reason' },
    ],
  },
  logic: { rules: [{ target: 'reason', kind: 'visible', cel: "kind == 'other'" }] },
}

const SCENARIOS: Scenario[] = [
  { name: 'other shows the reason', changes: { kind: 'other' }, valid: true, visible: { reason: true } },
  { name: 'holiday hides it', changes: { kind: 'holiday' }, valid: true, visible: { reason: false } },
]

describe('when the host has no scenarios', () => {
  test('the pane is not there at all', () => {
    // Rather than an empty table. A feature nobody has set up should be
    // absent, which is how `ask` behaves on the prompt pane.
    const { container } = render(<ScenarioPane session={createBuilderSession(form)} />)

    expect(container.innerHTML).toBe('')
  })
})

describe('with scenarios', () => {
  test('says they hold, and says it out loud', async () => {
    render(<ScenarioPane session={createBuilderSession(form)} scenarios={SCENARIOS} />)

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('All 2 scenarios hold'),
    )
  })

  test('names what stopped holding when the document changes under it', async () => {
    /*
     * The whole pane in one case. Inverting the rule is the mistake that
     * passes every other gate here: the expression still compiles, the
     * document still validates, the engine still opens it. Only an example
     * with its answer written down notices — and the sentence has to name the
     * scenario, because "1 of 2 do not hold" sends somebody back to the
     * document to work out which rule they broke.
     */
    const session = createBuilderSession(form)
    render(<ScenarioPane session={session} scenarios={SCENARIOS} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('All 2'))

    const inverted = JSON.parse(JSON.stringify(form)) as FormSchema
    inverted.logic!.rules[0]!.cel = "kind != 'other'"
    session.replaceDocument(inverted)

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Stopped holding'),
    )
    const said = screen.getByRole('status').textContent ?? ''
    expect(said).toContain('other shows the reason')
    expect(said).toContain('holiday hides it')
  })

  test('and says when one holds again, so a repair is visible as a repair', async () => {
    /*
     * The other direction. A panel that only ever reports bad news is a panel
     * people stop reading, and somebody fixing a rule needs to see that it
     * worked in the same glance that tells them nothing else broke.
     */
    const inverted = JSON.parse(JSON.stringify(form)) as FormSchema
    inverted.logic!.rules[0]!.cel = "kind != 'other'"
    const session = createBuilderSession(inverted)
    render(<ScenarioPane session={session} scenarios={SCENARIOS} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('do not hold'))

    session.replaceDocument(form)

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Holds again'))
  })

  test('a form that arrives with failing scenarios has not regressed', async () => {
    // It arrived that way. Greeting somebody with a list of things they are
    // not responsible for is how a panel whose value is speaking up only when
    // it matters stops being read.
    const inverted = JSON.parse(JSON.stringify(form)) as FormSchema
    inverted.logic!.rules[0]!.cel = "kind != 'other'"

    render(<ScenarioPane session={createBuilderSession(inverted)} scenarios={SCENARIOS} />)

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('do not hold'))
    expect(screen.getByRole('status').textContent).not.toContain('Stopped holding')
  })

  test('another session is another form, not an edit of this one', async () => {
    // A host that keeps the pane on screen and opens another document — the playground,
    // on every switch of form — was told examples had stopped holding that had never run
    // against the document now open.
    const { rerender } = render(
      <ScenarioPane session={createBuilderSession(form)} scenarios={SCENARIOS} />,
    )
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('All 2'))

    const inverted = JSON.parse(JSON.stringify(form)) as FormSchema
    inverted.logic!.rules[0]!.cel = "kind != 'other'"
    rerender(<ScenarioPane session={createBuilderSession(inverted)} scenarios={SCENARIOS} />)

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('do not hold'))
    expect(screen.getByRole('status').textContent).not.toContain('Stopped holding')
  })

  test('shows what was expected and what happened, not that something failed', async () => {
    const inverted = JSON.parse(JSON.stringify(form)) as FormSchema
    inverted.logic!.rules[0]!.cel = "kind != 'other'"

    render(<ScenarioPane session={createBuilderSession(inverted)} scenarios={SCENARIOS} />)

    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(2))
    const text = screen.getAllByRole('listitem').map((item) => item.textContent ?? '').join(' ')
    expect(text).toContain('reason')
    expect(text).toMatch(/expected to be visible|expected to be hidden/)
  })

  test('and removing one goes back to the host rather than being swallowed', async () => {
    // The scenarios are the host's: this package decides nothing about where
    // they are kept, which is what lets them be a file beside the form and a
    // CI gate out of the same file.
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ScenarioPane session={createBuilderSession(form)} scenarios={SCENARIOS} onChange={onChange} />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove holiday hides it' }))

    expect(onChange).toHaveBeenCalledWith([SCENARIOS[0]])
  })

  test('without an onChange the list is read-only rather than offering a button that does nothing', async () => {
    render(<ScenarioPane session={createBuilderSession(form)} scenarios={SCENARIOS} />)

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('hold'))
    expect(screen.queryByRole('button')).toBeNull()
  })
})
