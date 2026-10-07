import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

/**
 * What the three temporal controls write, and what they refuse to write.
 *
 * Found by reading the coverage report: `fields/temporal-fields.tsx` was the
 * lowest-covered file in any published package at 67% of its lines and 59% of
 * its branches — the `date` control was not exercised at all, and the branch
 * that matters most was argued in a comment and tested by nothing.
 *
 * **That branch is the one the engine depends on.** A `datetime` control can
 * hand back something unparseable mid-edit, and the control writes `null` rather
 * than a malformed string so the stored answer is always either empty or
 * canonical — which is what the engine's shape check assumes
 * ([0067](../../../docs/decisions/0067-a-temporal-answer-is-one-fixed-width-string.md)).
 * If it ever wrote the half-typed text instead, the bound comparison would be
 * against a string of the wrong shape, and comparing those is how a date
 * platform loses an answer.
 */
afterEach(cleanup)

const mount = (
  type: 'date' | 'time' | 'datetime',
  over: Record<string, unknown> = {},
): ReturnType<typeof createFormEngine> => {
  const schema: FormSchema = {
    specVersion: type === 'date' ? '1' : '2',
    id: 'booking',
    title: 'Booking',
    model: { fields: [{ key: 'when', type, label: 'When', ...over } as never] },
  }
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-10-07', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
  return engine
}

describe('a date', () => {
  test('records the day as the one canonical string', () => {
    const engine = mount('date')

    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2027-05-03' } })

    expect(engine.value()).toEqual({ when: '2027-05-03' })
  })

  test('and clearing it writes nothing rather than an empty string', () => {
    /*
     * `''` is not an empty answer, it is an answer of the wrong shape — and the
     * bound check compares strings, so a `''` would be "before" every earliest
     * date there is. Emptiness is `required`'s job and the control's job is to
     * say nothing.
     */
    const engine = mount('date')

    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2027-05-03' } })
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '' } })

    /*
     * `{ when: null }`, not `{}` — the key stays and the value becomes null.
     * Worth writing down, because it is the difference between a submission that
     * says "this was asked and left blank" and one that does not mention the
     * question. The first version of this case expected `{}` and was wrong about
     * the representation while being right about the behaviour.
     */
    expect(engine.value()).toEqual({ when: null })
  })
})

describe('a time', () => {
  test('records the wall clock, and carries its bounds to the control', () => {
    // The bounds are the field's, and the control passes them on so the browser
    // refuses out-of-range input before the engine has to.
    const engine = mount('time', { earliest: '09:00', latest: '17:00' })
    const control = screen.getByLabelText('When') as HTMLInputElement

    expect(control.min).toBe('09:00')
    expect(control.max).toBe('17:00')

    fireEvent.change(control, { target: { value: '10:30' } })
    expect(engine.value()).toEqual({ when: '10:30' })
  })

  test('and clearing it writes nothing', () => {
    const engine = mount('time')

    fireEvent.change(screen.getByLabelText('When'), { target: { value: '10:30' } })
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '' } })

    expect(engine.value()).toEqual({ when: null })
  })
})

describe('a datetime', () => {
  test('stores an instant in UTC, to the second, with no fraction', () => {
    /*
     * One canonical shape per type is what makes the bound comparison a string
     * comparison at all. A millisecond fraction would compare as *greater* than
     * the same instant without one, so two answers meaning the same moment would
     * sort differently.
     */
    const engine = mount('datetime')

    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2027-05-03T10:30' } })

    const stored = (engine.value() as { when?: string }).when
    expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })

  test('and writes nothing for input it cannot parse, which is the branch the engine relies on', () => {
    /*
     * The case this file exists for. A `datetime-local` control hands back
     * partial text while somebody is typing, and `new Date('2027-05')` is
     * unparseable in this position. The control writes `null`.
     *
     * Had it written the text instead, the stored answer would be a string of
     * the wrong shape — and `earliest`/`latest` compare strings, so the
     * comparison would silently succeed or fail against something that is not a
     * datetime at all. The comment above this branch argued exactly that and
     * nothing checked it.
     */
    const engine = mount('datetime')

    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2027-05-03T10:30' } })
    expect((engine.value() as { when?: string }).when).toBeTypeOf('string')

    fireEvent.change(screen.getByLabelText('When'), { target: { value: 'not-a-date' } })

    // Null, and above all **not the text**: a string of the wrong shape is what
    // the bound comparison cannot survive.
    expect(engine.value(), 'a malformed datetime reached the stored answer').toEqual({ when: null })
  })

  test('and clearing it writes nothing', () => {
    const engine = mount('datetime')

    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2027-05-03T10:30' } })
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '' } })

    expect(engine.value()).toEqual({ when: null })
  })
})

describe('all three', () => {
  test('mark themselves touched when focus leaves, or their errors never show', () => {
    /*
     * The same property the scale controls needed: an untouched field shows no
     * error, so a control that never touches is a control whose own validation
     * message never appears. Three `onBlur` lines, one per control, all
     * uncovered.
     */
    for (const type of ['date', 'time', 'datetime'] as const) {
      const engine = mount(type, { required: true })

      expect(engine.getFieldSnapshot(['when']).touched, type).toBe(false)
      fireEvent.focusOut(screen.getByLabelText('When'))

      expect(engine.getFieldSnapshot(['when']).touched, `${type} never marked itself touched`).toBe(true)
      cleanup()
    }
  })
})
