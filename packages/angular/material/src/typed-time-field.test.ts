import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from '../../src/index'
import { provideFormancyMaterial } from './index'

/**
 * A `time` with a `precision` in Material's form field, held to the cases the default
 * control and React's are (0033). Material draws only `time`: it has no datetime control, so
 * a `datetime` with a precision is the default control's, which the Angular suite covers.
 *
 * What the digits mean is `@formancy/spec`'s; these are about the binding: that the typed
 * control sits inside Material's form field, writes only on the person's input, and leaves
 * a time without a precision as the browser's own control.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const CLOCK = { now: () => 0, today: () => '2026-11-15', random: () => 0.5 }

type Engine = ReturnType<typeof createFormEngine>

async function mount(field: FieldDef, initialValue?: unknown, cel?: string): Promise<Engine> {
  const schema: FormSchema = {
    specVersion: '6',
    id: 'log',
    title: 'Log',
    model: { fields: [field] },
    ...(cel === undefined ? {} : { logic: { rules: [{ target: field.key, kind: 'computed', cel }] } }),
  }
  const engine = createFormEngine({ schema, capabilities: CLOCK, ...(initialValue === undefined ? {} : { initialValue }) })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine), ...provideFormancyMaterial()],
  })
  await view.fixture.whenStable()
  return engine
}

const control = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('At')
const value = (engine: Engine): unknown => engine.getFieldSnapshot(['at']).value
const paste = (text: string): void => void fireEvent.paste(control(), { clipboardData: { getData: () => text } })

function type(input: HTMLInputElement, text: string): void {
  input.setSelectionRange(input.value.length, input.value.length)
  for (const typed of text) {
    const at = input.selectionStart ?? input.value.length
    input.value = input.value.slice(0, at) + typed + input.value.slice(at)
    input.setSelectionRange(at + 1, at + 1)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: typed }))
  }
}

const time = (extra: Partial<FieldDef> = {}): FieldDef => ({ key: 'at', type: 'time', label: 'At', precision: 3, ...extra })

describe('a time with a precision, in Material', () => {
  test('is a typed control inside the form field, shown at every digit it holds', async () => {
    // Drawn outside Material's form field it would be a bare input among Material controls;
    // and a control that rewrote a supplied value on mount would change an answer nobody edited.
    const engine = await mount(time({ precision: 7 }), { at: '10:34:56.7890121' })

    expect(control().closest('mat-form-field')).not.toBeNull()
    expect(control().type).toBe('text')
    expect(control().value).toBe('10:34:56.7890121')
    expect(value(engine)).toBe('10:34:56.7890121')
  })

  test('is offered as its shape, with a keypad', async () => {
    // The placeholder is the statement of the shape (0125); the keypad is why the mask is digits.
    await mount(time())

    expect(control().placeholder).toBe('__:__:__.___')
    expect(control().inputMode).toBe('numeric')
  })

  test('typing digits stores the time as the mask writes it', async () => {
    // The answer is the time, not its digits: the mask's separators belong in what is stored.
    const engine = await mount(time())

    type(control(), '140327415')

    expect(control().value).toBe('14:03:27.415')
    expect(value(engine)).toBe('14:03:27.415')
  })

  test('a paste over a selection in the middle replaces only the selection, and the caret follows it', async () => {
    // Judged as the whole text it makes, not as the pasted piece alone: 59 alone is no time.
    const engine = await mount(time(), { at: '14:03:27.415' })
    control().setSelectionRange(3, 5)

    paste('59')

    expect(value(engine)).toBe('14:59:27.415')
    expect(control().value).toBe('14:59:27.415')
    expect(control().selectionStart).toBe(6)
  })

  test('a paste completes a partial answer as typing would', async () => {
    // The pasted tail joined to what was shown must read as the rest of one time.
    const engine = await mount(time(), { at: '14:0' })
    control().setSelectionRange(4, 4)

    paste('3:27.415')

    expect(value(engine)).toBe('14:03:27.415')
    expect(control().selectionStart).toBe(12)
  })

  test('a paste of nothing leaves the time as it was', async () => {
    // An empty clipboard at the caret was read as a backspace: 14:02:74.15.
    const engine = await mount(time(), { at: '14:03:27.415' })
    control().setSelectionRange(5, 5)

    paste('')

    expect(control().value).toBe('14:03:27.415')
    expect(value(engine)).toBe('14:03:27.415')
  })

  test('a paste the mask has no place for changes nothing', async () => {
    // Dropping what the mask has no place for would make an answer out of text nobody typed.
    const engine = await mount(time())

    paste('noon-ish')

    expect(value(engine)).toBeUndefined()
    expect(control().value).toBe('')
  })

  test('a read-only time shows every digit, takes no typing, and a paste leaves the control as it was', async () => {
    // A computed answer is the engine's: without the guard in the paste handler a typeable
    // paste rewrites the control to digits that are not stored, which the engine's own
    // refusal to store them does not prevent.
    const engine = await mount(time({ precision: 7 }), undefined, "'10:34:56.7890121'")

    expect(control().readOnly).toBe(true)
    type(control(), '9')
    // After the typing, which moves the caret: the paste replaces the whole time.
    control().setSelectionRange(0, control().value.length)
    paste('0102034560000')

    expect(control().value).toBe('10:34:56.7890121')
    expect(value(engine)).toBe('10:34:56.7890121')
  })

  test('a time without a precision is still Material’s browser control', async () => {
    // The typed control is for a precision only; every existing form keeps its picker.
    await mount({ key: 'at', type: 'time', label: 'At' })

    expect(control().type).toBe('time')
    expect(control().closest('mat-form-field')).not.toBeNull()
  })
})
