import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm } from '../form.js'
import { FormancyProvider } from '../context.js'

/**
 * A `time` or `datetime` with a `precision`, as a person types into it.
 *
 * What the digits mean, and what they are stored as, is `@formancy/spec`'s and is tested
 * there. These cases are about the binding: that the control shows the answer in its own
 * shape, writes only on the person's input, and leaves a field without a precision as the
 * browser's own control.
 */
// Put back by name. `vi.unstubAllEnvs()` deletes TZ, and Node keeps the zone it was last given
// rather than returning to the one it started in, so a case pinned to New York would leave the
// rest of the file in New York (as builder-core's condition-draft.test.ts does).
const started = Intl.DateTimeFormat().resolvedOptions().timeZone
afterEach(() => {
  cleanup()
  vi.stubEnv('TZ', started)
  vi.unstubAllEnvs()
})

const CLOCK = { now: () => 0, today: () => '2026-11-15', random: () => 0.5 }

function mount(field: FieldDef, initialValue?: unknown, cel?: string): ReturnType<typeof createFormEngine> {
  const schema: FormSchema = {
    specVersion: '6',
    id: 'log',
    title: 'Log',
    model: { fields: [field] },
    ...(cel === undefined ? {} : { logic: { rules: [{ target: field.key, kind: 'computed', cel }] } }),
  }
  const engine = createFormEngine({
    schema,
    capabilities: CLOCK,
    ...(initialValue === undefined ? {} : { initialValue }),
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
  return engine
}

const control = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('At')
const value = (engine: ReturnType<typeof createFormEngine>): unknown => engine.getFieldSnapshot(['at']).value

/**
 * A drop as the browser applies it: `drop`, and unless a handler prevents it or the field is
 * read-only, the text put over the selection and `input` saying `insertFromDrop`. jsdom has no
 * default action for a drop, so without the second half a binding that never handled `drop`
 * would pass. The value is written through the prototype's setter, as a browser writes it, so
 * React sees the change.
 */
function drop(input: HTMLInputElement, text: string): void {
  const dropped = createEvent.drop(input, { dataTransfer: { getData: () => text } })
  fireEvent(input, dropped)
  if (dropped.defaultPrevented || input.readOnly) return
  const from = input.selectionStart ?? input.value.length
  const to = input.selectionEnd ?? input.value.length
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, input.value.slice(0, from) + text + input.value.slice(to))
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromDrop', data: text }))
}

describe('a time with a precision', () => {
  test('an untouched supplied value shows every digit and is submitted byte for byte', () => {
    // A control that rewrote what it was given on mount would change a stored answer nobody
    // edited; a time of seven digits is the width a browser picker cannot hold at all.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 7 }, { at: '10:34:56.7890121' })

    expect(control().value).toBe('10:34:56.7890121')
    expect(control().type).toBe('text')
    expect(value(engine)).toBe('10:34:56.7890121')
  })

  test('typing digits stores the time as the mask writes it', async () => {
    // The answer is the time, not its digits: the mask's separators belong in what is stored.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 })

    await userEvent.setup().type(control(), '140327415')

    expect(control().value).toBe('14:03:27.415')
    expect(value(engine)).toBe('14:03:27.415')
  })

  test('is offered as its shape, with a keypad', () => {
    // The placeholder is the statement of the shape (0125), and a numeric keypad is the
    // reason to have a mask of digits at all.
    mount({ key: 'at', type: 'time', label: 'At', precision: 3 })

    expect(control().placeholder).toBe('__:__:__.___')
    expect(control().inputMode).toBe('numeric')
  })

  test('clearing the control stores null', async () => {
    // An empty control left as the partial text "" would read as a malformed answer and not
    // as no answer, so a field that is not required would refuse a person who changed their mind.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.415' })

    await userEvent.setup().clear(control())

    expect(value(engine)).toBeNull()
  })

  test('a supplied value of another width is shown, and is a shape error once touched', async () => {
    // Stored as it was supplied is not the mask's to repair: a value at the wrong width must
    // reach the engine's shape check, not be padded into one that passes.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.41' })

    expect(control().value).toBe('14:03:27.41')
    await userEvent.setup().type(control(), '{Backspace}')

    expect(value(engine)).toBe('14:03:27.4')
    expect(engine.submit().errors['at']).toContain('shape')
  })

  test('a value wider than its field shows as complete, and an edit drops the hidden digits', async () => {
    // Accepted, and named in the safety analysis: the mask has no position for the extra
    // digits. This pins it so that it changes on purpose rather than by accident.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.4155' })

    expect(control().value).toBe('14:03:27.415')
    await userEvent.setup().type(control(), '{Backspace}')

    expect(value(engine)).toBe('14:03:27.41')
  })

  test('a paste of an instant with an offset is stored as the same instant, at the field width', () => {
    // The mask reads digits and drops the rest; a pasted log timestamp would otherwise become
    // a complete, valid answer moved by the sender's offset.
    const engine = mount({ key: 'at', type: 'datetime', label: 'At', precision: 3 })

    fireEvent.paste(control(), { clipboardData: { getData: () => '2026-11-15T14:03:27.415+01:00' } })

    expect(value(engine)).toBe('2026-11-15T13:03:27.415Z')
  })

  test('a paste a person could have typed goes through the mask', () => {
    // Digits and separators in the mask's own places are typing; they must land as typing
    // does, including the separators the mask writes itself.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 })

    fireEvent.paste(control(), { clipboardData: { getData: () => '140327415' } })

    expect(value(engine)).toBe('14:03:27.415')
    expect(control().value).toBe('14:03:27.415')
  })

  test('a paste the mask has no place for changes nothing', () => {
    // Dropping the characters the mask has no place for would make an answer out of text
    // nobody typed; ignored, the field is as it was, as it is for a letter typed.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 })

    fireEvent.paste(control(), { clipboardData: { getData: () => 'noon-ish' } })

    expect(value(engine)).toBeUndefined()
    expect(control().value).toBe('')
  })

  test('a read-only field shows every digit, and a change writes nothing', () => {
    // A computed answer is the engine's: a control that took the typing would watch the
    // engine take it back, and one that hid digits would misreport what is stored.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 7 }, undefined, "'10:34:56.7890121'")

    expect(control().readOnly).toBe(true)
    expect(control().value).toBe('10:34:56.7890121')
    fireEvent.change(control(), { target: { value: '10:34:56.78901219' } })
    fireEvent.paste(control(), { clipboardData: { getData: () => '01:02:03.4560000' } })

    expect(value(engine)).toBe('10:34:56.7890121')
  })

  test('a paste into a read-only field leaves the control as it was', () => {
    // The engine ignores the write, so only the control can go wrong: without the guard in
    // onPaste a typeable paste rewrites the control to digits that are not stored.
    mount({ key: 'at', type: 'time', label: 'At', precision: 7 }, undefined, "'10:34:56.7890121'")
    control().setSelectionRange(0, control().value.length)

    fireEvent.paste(control(), { clipboardData: { getData: () => '0102034560000' } })

    expect(control().value).toBe('10:34:56.7890121')
  })

  test('a whole instant pasted over part of a filled datetime replaces the answer, in New York', () => {
    // The mask dropped the Z and stored the shown clock's digits, five hours from the instant.
    vi.stubEnv('TZ', 'America/New_York')
    const engine = mount({ key: 'at', type: 'datetime', label: 'At', precision: 3 }, { at: '2026-11-15T14:03:27.415Z' })
    control().setSelectionRange(0, 4)

    fireEvent.paste(control(), { clipboardData: { getData: () => '2026-11-15T13:03:27.415Z' } })

    expect(value(engine)).toBe('2026-11-15T13:03:27.415Z')
    expect(control().value).toBe('2026-11-15 08:03:27.415')
  })

  test('a paste over a selection in the middle replaces only the selection', () => {
    // Judged as the whole text it makes, not as the pasted piece alone: 59 alone is no time.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.415' })
    control().setSelectionRange(3, 5)

    fireEvent.paste(control(), { clipboardData: { getData: () => '59' } })

    expect(value(engine)).toBe('14:59:27.415')
    expect(control().value).toBe('14:59:27.415')
    // The caret stays after the paste, as typing leaves it.
    expect(control().selectionStart).toBe(6)
  })

  test('a paste that leaves a separator out of its place changes nothing', () => {
    // "5:" over the minutes makes "14:5::27.415", which no typing makes; read through the mask it
    // would move every digit after it.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.415' })
    control().setSelectionRange(3, 5)

    fireEvent.paste(control(), { clipboardData: { getData: () => '5:' } })

    expect(control().value).toBe('14:03:27.415')
    expect(value(engine)).toBe('14:03:27.415')
  })

  test('a paste completes a partial answer as typing would', () => {
    // The pasted tail joined to what was shown must read as the rest of one time.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:0' })
    control().setSelectionRange(4, 4)

    fireEvent.paste(control(), { clipboardData: { getData: () => '3:27.415' } })

    expect(value(engine)).toBe('14:03:27.415')
    expect(control().selectionStart).toBe(12)
  })

  test('a digit with no room in a complete field changes nothing, and a whole time replaces it', () => {
    // Held, a digit after a complete time was stored where the control could not show it; read
    // as typing, a digit that does not fit is cut. A whole time says what it is, so it is the
    // answer rather than digits merged into the old one.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.415' })
    control().setSelectionRange(12, 12)

    fireEvent.paste(control(), { clipboardData: { getData: () => '6' } })
    expect(value(engine)).toBe('14:03:27.415')
    fireEvent.paste(control(), { clipboardData: { getData: () => '09:15:00.000' } })

    expect(value(engine)).toBe('09:15:00.000')
    expect(control().value).toBe('09:15:00.000')
  })

  test('a paste of one digit over a selected hour types as the key would', () => {
    // Digits carry no zone: "0" there is what typing 0 over the hour does.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.415' })
    control().setSelectionRange(0, 2)

    fireEvent.paste(control(), { clipboardData: { getData: () => '0' } })

    expect(control().value).toBe('00:32:74.15')
    expect(value(engine)).toBe('00:32:74.15')
  })

  test('more digits than the field has room for change nothing, never cut into an answer', () => {
    // Read as typing, the first six were stored as 13:03:27, complete and accepted, and the
    // three after them dropped: an answer the paste did not denote.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 0 })

    fireEvent.paste(control(), { clipboardData: { getData: () => '130327415' } })

    expect(value(engine)).toBeUndefined()
    expect(control().value).toBe('')
  })

  test.each([
    // An empty clipboard, or one holding only an image, gives '' to paste. At a caret the text was
    // unchanged, which the mask reads as a backspace: 14:02:74.15.
    ['an empty paste at the caret', 5, 5, ''],
    // Over a selection it was the selection deleted: null, and 14:03. Deleting is the Delete key's.
    ['an empty paste over the whole time', 0, 12, ''],
    ['an empty paste over the seconds', 6, 12, ''],
    // The same text over itself, typed, was unchanged text and a backspace too: 14:32:74.15.
    ['0 pasted over a selected 0', 3, 4, '0'],
  ])('%s leaves a time as it was', (_name, from, to, pasted) => {
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.415' })
    control().setSelectionRange(from, to)

    fireEvent.paste(control(), { clipboardData: { getData: () => pasted } })

    expect(control().value).toBe('14:03:27.415')
    expect(value(engine)).toBe('14:03:27.415')
  })

  test('a time pasted over the same text shown replaces a stored value wider than the field', () => {
    // 14:03:27.4155 shows as 14:03:27.415. Ignored as a change of nothing, the paste of what the
    // person reads left the hidden digit stored, and the shape error with it.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.4155' })
    control().setSelectionRange(0, 12)

    fireEvent.paste(control(), { clipboardData: { getData: () => '14:03:27.415' } })

    expect(value(engine)).toBe('14:03:27.415')
    expect(control().value).toBe('14:03:27.415')
  })

  test("a datetime's own clock pasted over itself leaves it as it was, in New York", () => {
    // Read as an edit that changed nothing, it lost its last digit and stored an unfinished answer.
    vi.stubEnv('TZ', 'America/New_York')
    const engine = mount({ key: 'at', type: 'datetime', label: 'At', precision: 3 }, { at: '2026-11-15T14:03:27.415Z' })
    control().setSelectionRange(11, 23)

    fireEvent.paste(control(), { clipboardData: { getData: () => '09:03:27.415' } })

    expect(control().value).toBe('2026-11-15 09:03:27.415')
    expect(value(engine)).toBe('2026-11-15T14:03:27.415Z')
  })

  test('a complete datetime pasted a digit keeps showing its answer', () => {
    // Same blanking, for the control whose held text shows as nothing.
    vi.stubEnv('TZ', 'America/New_York')
    mount({ key: 'at', type: 'datetime', label: 'At', precision: 3 }, { at: '2026-11-15T14:03:27.415Z' })
    control().setSelectionRange(23, 23)

    fireEvent.paste(control(), { clipboardData: { getData: () => '9' } })

    expect(control().value).toBe('2026-11-15 09:03:27.415')
  })

  test('a dropped UTC instant is stored as that instant, in Zurich', () => {
    // A drop reached the control as `input`, past the paste decision: the mask dropped the
    // separators and the Z, read the digits as Zurich's clock, and stored …T12:03:27.415Z,
    // complete, valid and an hour off.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const engine = mount({ key: 'at', type: 'datetime', label: 'At', precision: 3 })

    drop(control(), '2026-11-15T13:03:27.415Z')

    expect(value(engine)).toBe('2026-11-15T13:03:27.415Z')
    expect(control().value).toBe('2026-11-15 14:03:27.415')
  })

  test('a dropped text that is no time changes nothing', () => {
    // Read as typing, a drop over the selected answer took its letters for no digits at all
    // and stored null: the answer erased by a drop of text that names no time.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '14:03:27.415' })
    control().setSelectionRange(0, control().value.length)

    drop(control(), 'noon-ish')

    expect(value(engine)).toBe('14:03:27.415')
    expect(control().value).toBe('14:03:27.415')
  })

  test('dropped digits are typed over the whole field, not at the caret the drag left', () => {
    // Where a drop lands is a pointer position the binding cannot read; at the old caret, the
    // digits would land where the person did not drop them, and here would not fit at all.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 3 }, { at: '09:00:00.000' })
    control().setSelectionRange(5, 5)

    drop(control(), '140327415')

    expect(value(engine)).toBe('14:03:27.415')
  })

  test('a drop into a read-only field leaves it as it was', () => {
    // The paste's guard, for the drop: the engine ignores the write, and the control must not
    // be rewritten to digits that are not stored.
    const engine = mount({ key: 'at', type: 'time', label: 'At', precision: 7 }, undefined, "'10:34:56.7890121'")

    drop(control(), '01:02:03.4560000')

    expect(value(engine)).toBe('10:34:56.7890121')
    expect(control().value).toBe('10:34:56.7890121')
  })

  test('a time without a precision is still the browser control', () => {
    // The typed control is for a precision only; every existing form keeps its picker.
    mount({ key: 'at', type: 'time', label: 'At' })

    expect(control().type).toBe('time')
  })
})

describe('a datetime with a precision', () => {
  test('typed on the wall clock of New York, it is stored as UTC with the fraction unchanged', async () => {
    // The zone moves whole seconds and never a fraction: a fraction passed through Date
    // would be cut to milliseconds, and a stored answer would differ from the typed one.
    vi.stubEnv('TZ', 'America/New_York')
    const engine = mount({ key: 'at', type: 'datetime', label: 'At', precision: 3 })

    await userEvent.setup().type(control(), '20261115090327415')

    expect(control().value).toBe('2026-11-15 09:03:27.415')
    expect(value(engine)).toBe('2026-11-15T14:03:27.415Z')
  })

  test('a stored instant is shown on the wall clock of the person', () => {
    // Shown in UTC, the person would read an hour they did not type.
    vi.stubEnv('TZ', 'America/New_York')
    mount({ key: 'at', type: 'datetime', label: 'At', precision: 3 }, { at: '2026-11-15T14:03:27.415Z' })

    expect(control().value).toBe('2026-11-15 09:03:27.415')
  })

  test('a datetime without a precision is still the browser control', () => {
    // As above, for the second control.
    mount({ key: 'at', type: 'datetime', label: 'At' })

    expect(control().type).toBe('datetime-local')
  })
})
