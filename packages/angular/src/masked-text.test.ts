import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * A text field with an input mask in Angular — the cases React's binding is held to.
 *
 * A near-copy on purpose, as the toggle's tests explain: where a character lands is
 * `editMasked`'s and is tested once in `@formancy/spec`; what is tested here is this
 * binding's own markup and events. And one case React does not have, because the
 * failure is Angular's: a bound value is written only when it changes, so a refused
 * character leaves the answer as it was and nothing would take it off the screen (0125).
 */
const PHONE = '(999) 999-9999'

async function mount(mask = PHONE) {
  const schema: FormSchema = {
    specVersion: '4',
    id: 'contact',
    title: 'Contact',
    model: { fields: [{ key: 'phone', type: 'text', label: 'Phone', mask }] },
  }
  const engine = createFormEngine({ schema })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  const settle = async (): Promise<void> => void (await view.fixture.whenStable())
  return { engine, settle }
}

const phone = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Phone' }) as HTMLInputElement

/**
 * Keystrokes as the browser applies them: the text at the caret changes, the caret
 * moves, and an `input` event says how. Done by hand rather than through
 * `@testing-library/user-event`, which this package does not depend on — and the
 * control reads exactly these three things, so nothing it relies on is left out.
 */
function type(input: HTMLInputElement, text: string, caret = input.value.length): void {
  input.setSelectionRange(caret, caret)
  for (const typed of text) {
    const at = input.selectionStart ?? input.value.length
    input.value = input.value.slice(0, at) + typed + input.value.slice(at)
    input.setSelectionRange(at + 1, at + 1)
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: typed }),
    )
  }
}

function erase(input: HTMLInputElement, direction: 'backward' | 'forward', caret: number): void {
  const from = direction === 'backward' ? caret - 1 : caret
  input.value = input.value.slice(0, from) + input.value.slice(from + 1)
  input.setSelectionRange(from, from)
  const inputType = direction === 'backward' ? 'deleteContentBackward' : 'deleteContentForward'
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }))
}

describe('a masked text field', () => {
  test('shows the shape while the answer holds only the digits typed', async () => {
    const { engine, settle } = await mount()

    type(phone(), '5551234567')
    await settle()

    expect(phone().value).toBe('(555) 123-4567')
    expect(engine.getFieldSnapshot(['phone']).value).toBe('5551234567')
  })

  test('and a character no position takes does not stay on screen', async () => {
    // The answer does not change, so `text()` does not either, and Angular writes a
    // bound value only when it changes: without the write in `onInput`, the letter
    // would stay on screen while the engine held something else.
    // Rendered before the letter, which is what makes the case: typed in one batch, the
    // bound value changes from empty to "(555" and Angular writes it, hiding the
    // failure — this case passed with the write removed until it settled first.
    const { engine, settle } = await mount()
    type(phone(), '555')
    await settle()

    type(phone(), 'x')
    await settle()

    expect(phone().value).toBe('(555')
    expect(engine.getFieldSnapshot(['phone']).value).toBe('555')
  })

  test('and the caret stays where somebody types in the middle', async () => {
    const { engine, settle } = await mount()
    type(phone(), '555123')
    await settle()

    type(phone(), '9', 7)
    await settle()

    expect(engine.getFieldSnapshot(['phone']).value).toBe('5551923')
    expect(phone().selectionStart).toBe(8)
  })

  test('and backspace and delete beside a written character remove the digit on their side', async () => {
    const { engine, settle } = await mount()
    type(phone(), '555123')
    await settle()

    erase(phone(), 'forward', 4)
    await settle()
    expect(engine.getFieldSnapshot(['phone']).value).toBe('55523')

    erase(phone(), 'backward', 5)
    await settle()
    expect(engine.getFieldSnapshot(['phone']).value).toBe('5523')
  })

  test('offers the shape as a placeholder, and a keypad when every position is a digit', async () => {
    await mount()

    expect(phone().placeholder).toBe('(___) ___-____')
    expect(phone().getAttribute('inputmode')).toBe('numeric')
  })

  test('and a mask with letters in it keeps the ordinary keyboard', async () => {
    await mount('aa-9999')

    expect(phone().getAttribute('inputmode')).toBeNull()
  })
})
