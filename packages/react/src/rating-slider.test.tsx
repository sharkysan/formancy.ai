import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

/**
 * A rating and a slider: one number, two controls.
 *
 * Both are widgets on `number` and neither changes the answer, which is what
 * makes them widgets ([0104](../../../docs/decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)).
 * So the interesting cases are not "does it store a number" — the number field
 * already did that — but the two places a scale control goes wrong:
 *
 * - **The keyboard.** A row of stars built from buttons is a row of tab stops a
 *   screen reader reads as eleven unrelated controls. A radio group is one stop
 *   with arrow keys, which is what a scale is.
 * - **The bounds.** A rating with no `max` has nothing to draw, and a slider
 *   with no `step` is unusable at a range of 1. Both must say so rather than
 *   render something that looks like a control and is not one.
 */
afterEach(cleanup)

const schemaFor = (widget: 'rating' | 'slider', over: Record<string, unknown> = {}): FormSchema => ({
  specVersion: '4',
  id: 'survey',
  title: 'How did we do',
  model: {
    fields: [
      {
        key: 'score',
        type: 'number',
        label: 'How likely are you to recommend us',
        min: 0,
        max: 10,
        widget,
        ...over,
      } as never,
    ],
  },
})

const mount = (schema: FormSchema): ReturnType<typeof createFormEngine> => {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-10-06', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
  return engine
}

describe('a rating', () => {
  test('is one radio group, not a row of buttons', () => {
    /*
     * The accessibility decision, and the one worth pinning. Stars drawn as
     * eleven buttons are eleven tab stops, and a screen reader announces them as
     * unrelated controls with no sense that they are a scale or that one is
     * chosen. A radio group is a single tab stop whose arrow keys move along the
     * scale, which is what the control *is*.
     */
    mount(schemaFor('rating'))

    expect(screen.getByRole('radiogroup', { name: /how likely/i })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(11)
  })

  test('offers every value from the minimum to the maximum, named by its number', () => {
    // 0 to 10 inclusive is eleven options — the off-by-one that makes an NPS
    // scale run 1 to 10 and quietly drop the answer somebody meant.
    mount(schemaFor('rating'))

    for (const value of [0, 5, 10]) {
      expect(screen.getByRole('radio', { name: String(value) }), String(value)).toBeTruthy()
    }
  })

  test('stores the number, not the position', () => {
    // A scale from 2 to 5 has four options, and picking the second one means 3.
    // Storing the index would store 1 and be wrong in a way nothing else notices.
    const engine = mount(schemaFor('rating', { min: 2, max: 5 }))

    screen.getByRole('radio', { name: '3' }).click()

    expect(engine.value()).toEqual({ score: 3 })
  })

  test('and refuses to draw a scale it has no bounds for', () => {
    /*
     * A rating needs both ends. Without them the honest thing is to say so: a
     * control that renders nothing is a field a person cannot answer, and one
     * that guesses a range of 1 to 5 invents a scale the author did not write.
     *
     * The spec cannot require them — `min` and `max` are optional on every
     * number field and making them conditional on a widget would mean a document
     * that stops validating when somebody changes presentation.
     */
    mount(schemaFor('rating', { min: undefined, max: undefined }))

    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('spinbutton', { name: /how likely/i }), 'no fallback control').toBeTruthy()
  })
})

describe('a slider', () => {
  test('is a range input carrying the field’s bounds and step', () => {
    mount(schemaFor('slider', { step: 0.5 }))
    const slider = screen.getByRole('slider', { name: /how likely/i }) as HTMLInputElement

    expect(slider.min).toBe('0')
    expect(slider.max).toBe('10')
    expect(slider.step).toBe('0.5')
  })

  test('steps by one when the document does not say, because a range input defaults to it anyway', () => {
    // Not invented: `<input type="range">` steps by 1 with no attribute, so
    // leaving it out and writing it are the same control. Stated here because
    // the opposite reading — that a missing step means continuous — is what a
    // reader would assume, and it is wrong.
    mount(schemaFor('slider'))

    expect((screen.getByRole('slider') as HTMLInputElement).step).toBe('1')
  })

  test('shows the value, because a track with no number is a guess', () => {
    // A slider with no read-out is a control somebody drags until it looks
    // right. The value is rendered beside it and is not a second control.
    mount(schemaFor('slider', { min: 0, max: 10 }))

    expect(screen.getByText('5')).toBeTruthy()
  })

  test('starts in the middle rather than at zero when there is no answer yet', () => {
    /*
     * A range input with no value sits at the midpoint — the browser's own
     * behaviour, and it means the thumb's position is a *lie* about the answer
     * until somebody moves it. So the engine is told nothing (the value stays
     * null and `required` still bites), and the read-out shows where the thumb
     * is rather than claiming an answer.
     */
    const engine = mount(schemaFor('slider'))

    expect(engine.value()).toEqual({})
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('5')
  })

  test('and records what was dragged to', () => {
    /*
     * Through `fireEvent.change`, which is the only thing that works here.
     * Assigning `.value` and dispatching an event does not reach React: React
     * tracks the last value it set on the node, sees no difference, and skips
     * the handler — so the first version of this case asserted that dragging did
     * nothing and was right about its own mistake.
     */
    const engine = mount(schemaFor('slider', { step: 2 }))

    fireEvent.change(screen.getByRole('slider'), { target: { value: '8' } })

    expect(engine.value()).toEqual({ score: 8 })
  })

  test('and refuses to draw a track it has no bounds for, like the rating', () => {
    // Same reasoning: a range from an unknown minimum to an unknown maximum is
    // 0 to 100, which is a scale nobody wrote.
    mount(schemaFor('slider', { min: undefined, max: undefined }))

    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByRole('spinbutton', { name: /how likely/i })).toBeTruthy()
  })
})
