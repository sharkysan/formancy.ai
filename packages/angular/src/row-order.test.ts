import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest only
// provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * Reordering rows, by button — the same assertions the React file makes.
 *
 * The buttons are the KEYBOARD route and therefore the primary one: WCAG 2.5.7 requires
 * a non-drag equivalent for any drag operation, so a drag affordance can only ever be a
 * second route to these.
 *
 * Angular had the same stale-id defect as React and with the same comment:
 * `injectRepeater` computed row ids from `rowCount`, and `rowCount.set` with an equal
 * value notifies nothing — correct, and also why a move did not redraw. A counter bumped
 * on every notification fixes it.
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

async function mount(names: readonly string[]) {
  const engine = createFormEngine({
    schema,
    initialValue: { items: names.map((name) => ({ name })) },
    capabilities: { now: () => 0, today: () => '2026-09-27', random: () => 0.5 },
  })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
  return { engine, view }
}

const namesIn = (engine: ReturnType<typeof createFormEngine>): unknown[] =>
  (engine.value() as { items: Array<Record<string, unknown>> }).items.map((row) => row['name'])

describe('the move buttons', () => {
  test('say where the row goes, with its position in the name', async () => {
    await mount(['a', 'b', 'c'])
    expect(screen.getByRole('button', { name: 'Move Item 2 of 3 up' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Move Item 2 of 3 down' })).toBeDefined()
  })

  test('are absent at the ends rather than disabled', async () => {
    await mount(['a', 'b'])
    expect(screen.queryByRole('button', { name: 'Move Item 1 of 2 up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move Item 2 of 2 down' })).toBeNull()
  })

  test('reorder the rows when pressed', async () => {
    const { engine, view } = await mount(['a', 'b', 'c'])
    fireEvent.click(screen.getByRole('button', { name: 'Move Item 1 of 3 down' }))
    await view.fixture.whenStable()
    expect(namesIn(engine)).toEqual(['b', 'a', 'c'])
  })

  test('move the values with the rows, not the controls', async () => {
    // The stale-id bug at the level a person experiences it: after a move the control
    // showing 'first' must be the one in the row it is now in. Read by display value
    // rather than by DOM position, because DOM position is what was wrong.
    const { engine, view } = await mount(['first', 'second'])
    fireEvent.click(screen.getByRole('button', { name: 'Move Item 1 of 2 down' }))
    await view.fixture.whenStable()

    const inputs = screen.getAllByLabelText('Name') as HTMLInputElement[]
    expect(inputs.map((input) => input.value)).toEqual(['second', 'first'])
    expect(namesIn(engine)).toEqual(['second', 'first'])
  })

  test('loses focus on a reorder, which is a known limitation and not a decision', async () => {
    // Pinned deliberately so that FIXING it fails this test and prompts its removal. The
    // same limitation React has, on purpose — see the comment in `form.ts`.
    //
    // A row is tracked by its stable id, so it travels. Its children are tracked by the
    // POSITIONAL WIRE, which changes when the row moves, so every control inside is
    // destroyed and recreated. Tracking by the field's key instead would let Angular
    // reuse a component whose path is read once in `ngOnInit` and never rebound — so
    // after a row removal it would show the previous row's answer, which a conformance
    // fixture caught. Reactive path binding has to come first, in both renderers at once.
    const { engine, view } = await mount(['first', 'second'])
    const inputs = screen.getAllByLabelText('Name') as HTMLInputElement[]
    inputs[0]!.focus()
    expect((document.activeElement as HTMLInputElement).value).toBe('first')

    engine.moveRow(['items'], 0, 1)
    await view.fixture.whenStable()

    expect(document.activeElement).not.toBe(inputs[0])
  })

  test('a row moved from outside the form still redraws in order', async () => {
    // Nothing was clicked, so only the engine notification can have reordered the
    // rendered rows. Before the fix the ids were computed from a count that had not
    // changed, so the signal never fired.
    const { engine, view } = await mount(['x', 'y'])
    engine.moveRow(['items'], 0, 1)
    await view.fixture.whenStable()
    const inputs = screen.getAllByLabelText('Name') as HTMLInputElement[]
    expect(inputs.map((input) => input.value)).toEqual(['y', 'x'])
  })
})
