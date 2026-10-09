import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

/**
 * A text field with an input mask, as a person types into it.
 *
 * Where a character lands is `editMasked`'s, in `@formancy/spec`, and that is tested
 * there keystroke by keystroke. These cases are about the binding: that the control
 * shows the shape while the engine holds only the typed characters, that a refused
 * character does not stay on screen, and that the caret stays where the person is
 * typing — the three places a masked input usually goes wrong (0125).
 */
afterEach(cleanup)

const PHONE = '(999) 999-9999'

const mount = (mask = PHONE): ReturnType<typeof createFormEngine> => {
  const schema: FormSchema = {
    specVersion: '4',
    id: 'contact',
    title: 'Contact',
    model: { fields: [{ key: 'phone', type: 'text', label: 'Phone', mask }] },
  }
  const engine = createFormEngine({ schema })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
  return engine
}

const phone = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Phone' }) as HTMLInputElement

describe('a masked text field', () => {
  test('shows the shape while the answer holds only the digits typed', async () => {
    // The answer is the number, not one of its spellings: what an export or the
    // server receives does not change when somebody restyles the mask.
    const engine = mount()

    await userEvent.setup().type(phone(), '5551234567')

    expect(phone().value).toBe('(555) 123-4567')
    expect(engine.getFieldSnapshot(['phone']).value).toBe('5551234567')
  })

  test('and a character no position takes does not stay on screen', async () => {
    // The answer does not change, so a binding that only re-rendered on a change
    // would leave the letter showing while the engine held something else.
    const engine = mount()
    const user = userEvent.setup()

    await user.type(phone(), '555x')

    expect(phone().value).toBe('(555')
    expect(engine.getFieldSnapshot(['phone']).value).toBe('555')
  })

  test('and the caret stays where somebody types in the middle', async () => {
    // A controlled input whose text is rewritten puts the caret at the end, so the
    // second digit of a correction lands at the end of the number.
    const engine = mount()
    const user = userEvent.setup()
    await user.type(phone(), '555123')

    await user.type(phone(), '9', { initialSelectionStart: 7, initialSelectionEnd: 7 })

    expect(engine.getFieldSnapshot(['phone']).value).toBe('5551923')
    expect(phone().selectionStart).toBe(8)
  })

  test('and backspace just after a written character removes the digit before it', async () => {
    // Otherwise the ")" is deleted, written straight back, and the key does nothing.
    const engine = mount()
    const user = userEvent.setup()
    await user.type(phone(), '555123')

    await user.type(phone(), '{Backspace}', { initialSelectionStart: 5, initialSelectionEnd: 5 })

    expect(engine.getFieldSnapshot(['phone']).value).toBe('55123')
  })

  test('and delete just before one removes the digit after it, not the one before', async () => {
    // The direction comes from the input event; read as a backspace, Delete would
    // remove the digit on the wrong side of the caret.
    const engine = mount()
    const user = userEvent.setup()
    await user.type(phone(), '555123')

    await user.type(phone(), '{Delete}', { initialSelectionStart: 4, initialSelectionEnd: 4 })

    expect(engine.getFieldSnapshot(['phone']).value).toBe('55523')
  })

  test('offers the shape as a placeholder, and a keypad when every position is a digit', () => {
    mount()

    expect(phone().placeholder).toBe('(___) ___-____')
    expect(phone().inputMode).toBe('numeric')
  })

  test('and a mask with letters in it keeps the ordinary keyboard', () => {
    mount('aa-9999')

    expect(phone().inputMode).toBe('')
  })
})
