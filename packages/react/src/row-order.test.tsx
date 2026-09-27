import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * Reordering rows, by button.
 *
 * The buttons are the KEYBOARD route and therefore the primary one: WCAG 2.5.7 requires
 * a non-drag equivalent for any drag operation, so a drag affordance can only ever be a
 * second route to these. This repository built the builder's move palette before its
 * drag surface for exactly that reason.
 *
 * Found by these tests rather than by reading: `useRepeater` memoised its row ids on
 * `rowCount`, because "the engine mints an id when a row is created, so the count
 * changing is exactly when the ids change" — true until rows could be reordered. A move
 * leaves the count alone, so the memo held stale ids and React keyed rows by them,
 * reusing the wrong DOM nodes. That is the failure keying by identity exists to prevent,
 * and worse than keying by index because it looks correct.
 */
const schema = {
  specVersion: '2',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      {
        key: 'items',
        type: 'repeater',
        label: 'Item',
        fields: [{ key: 'name', type: 'text', label: 'Name' }],
      },
    ],
  },
} as FormSchema

function mount(names: readonly string[]) {
  const engine = createFormEngine({
    schema,
    initialValue: { items: names.map((name) => ({ name })) },
    capabilities: { now: () => 0, today: () => '2026-09-27', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>,
  )
  return engine
}

const namesIn = (engine: ReturnType<typeof mount>): unknown[] =>
  (engine.value() as { items: Array<Record<string, unknown>> }).items.map((row) => row['name'])

describe('the move buttons', () => {
  test('say where the row goes, with its position in the name', () => {
    // By accessible name, per 0034. The name has to carry the position or a
    // screen-reader user has to count rows before pressing anything.
    mount(['a', 'b', 'c'])
    expect(screen.getByRole('button', { name: 'Move Item 2 of 3 up' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Move Item 2 of 3 down' })).toBeDefined()
  })

  test('are absent at the ends rather than disabled', () => {
    // A disabled button is still in the tab order in some browsers and announces a
    // control that does nothing. A row that cannot move up has no such button.
    mount(['a', 'b'])
    expect(screen.queryByRole('button', { name: 'Move Item 1 of 2 up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move Item 2 of 2 down' })).toBeNull()
  })

  test('reorder the rows when pressed', async () => {
    const engine = mount(['a', 'b', 'c'])
    await userEvent.click(screen.getByRole('button', { name: 'Move Item 1 of 3 down' }))
    expect(namesIn(engine)).toEqual(['b', 'a', 'c'])
  })

  test('move the values with the rows, not the controls', async () => {
    // The stale-id bug, asserted at the level a person experiences it: after a move the
    // control that shows 'a' must be the one in the row 'a' is now in. Reading by
    // display value rather than by DOM position, because DOM position is what was
    // wrong.
    const engine = mount(['first', 'second'])
    await userEvent.click(screen.getByRole('button', { name: 'Move Item 1 of 2 down' }))

    const inputs = screen.getAllByLabelText('Name') as HTMLInputElement[]
    expect(inputs.map((input) => input.value)).toEqual(['second', 'first'])
    expect(namesIn(engine)).toEqual(['second', 'first'])
  })

  test('loses focus on a reorder, which is a known limitation and not a decision', () => {
    // Pinned deliberately so that FIXING it fails this test and prompts its removal.
    //
    // A row div is keyed by the row's stable id, so it travels. Its children are keyed
    // by the POSITIONAL WIRE -- `items[0].name` -- which changes when the row moves, so
    // every control inside is remounted and focus goes nowhere. Somebody pressing "move
    // down" loses their place in the form.
    //
    // Keying children by the field's key within the row fixes it here, and was reverted
    // to keep the renderers identical: in Angular that lets the framework REUSE a
    // component whose path is read once in `ngOnInit` and never rebound, so after a row
    // removal it shows the previous row's answer -- a conformance fixture caught exactly
    // that. One renderer keeping focus and the other not is the divergence this
    // architecture exists to prevent, so both wait for reactive path binding in Angular.

    // THE test for the row ids, and the reason the value-based cases above are not it.
    //
    // A field binds by WIRE, and a wire is positional: the control at position 0 always
    // reads `items[0].name`. So the VALUES are right after a move whether the ids are
    // correct or not, and asserting them proves nothing about identity. What the ids
    // decide is whether React moves the existing DOM node or updates it in place.
    //
    // Focus is the observable difference, and it is also why anybody cares: a person
    // pressing "move down" is holding their place in the form. With correct ids the
    // node travels and focus goes with it, so the focused control still shows what they
    // were editing. With stale ids the node stays and focus is left on somebody else's
    // answer.
    const engine = mount(['first', 'second'])
    const inputs = screen.getAllByLabelText('Name') as HTMLInputElement[]
    inputs[0]!.focus()
    expect((document.activeElement as HTMLInputElement).value).toBe('first')

    act(() => {
      engine.moveRow(['items'], 0, 1)
    })

    // The limitation. When this starts failing, focus survives a reorder — delete the
    // test and the two comments in `form.tsx` and `form.ts` that explain the revert.
    expect(document.activeElement).not.toBe(inputs[0])
  })

  test('a row moved from outside the form still redraws in order', () => {
    // The direct test of the subscription: nothing was clicked, so only the engine
    // notification can have updated the ids. Before the fix the ids were memoised on a
    // count that had not changed.
    const engine = mount(['x', 'y'])
    act(() => {
      engine.moveRow(['items'], 0, 1)
    })
    const inputs = screen.getAllByLabelText('Name') as HTMLInputElement[]
    expect(inputs.map((input) => input.value)).toEqual(['y', 'x'])
  })
})
