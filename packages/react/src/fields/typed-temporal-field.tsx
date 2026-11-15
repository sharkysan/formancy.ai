import { editMasked, formatMasked, maskIsNumeric, maskPlaceholder, pastedInstant, storedFromTyped, temporalEntryMask, typedFromStored } from '@formancy/spec'
import type { TypedTemporalType } from '@formancy/spec'
import { useField } from '../use-field.js'
import { FieldShell, usePlaceholder } from './internals.js'

/**
 * A `time` or a `datetime` that declares a `precision`, typed into its own shape.
 *
 * The browser's pickers hold minutes, or milliseconds at best, so they cannot show or
 * keep a seventh digit: a field with a precision is typed instead, into the mask
 * `@formancy/spec` derives from it. That package also says what the digits mean and what
 * they are stored as, because five controls type into it and must agree
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)); this file is
 * the React binding of it, shaped like `TextField`'s masked branch (0125).
 *
 * Written only on the person's input, never on mount: an answer somebody supplied and
 * nobody touched is submitted byte for byte, whatever width it has.
 */
export function TypedTemporalField({ path, label, type }: { path: string; label: string; type: TypedTemporalType }) {
  const field = useField(path)
  const placeholder = usePlaceholder(field)
  const precision = typeof field.def.precision === 'number' ? field.def.precision : 0
  const mask = temporalEntryMask(type, precision)
  const typed = typedFromStored(type, precision, typeof field.value === 'string' ? field.value : '')
  const shown = formatMasked(mask, typed)

  /**
   * The ONE place an edit is written: the text the control would hold, read through the
   * mask as typing, with the caret placed in the text it belongs to before React renders.
   */
  const edit = (input: HTMLInputElement, next: string, caret: number | null, forward: boolean): void => {
    const edited = editMasked(mask, typed, next, { caret, direction: forward ? 'forward' : 'backward' })
    input.value = formatMasked(mask, edited.answer)
    input.setSelectionRange(edited.caret, edited.caret)
    field.setValue(storedFromTyped(type, precision, edited.answer))
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="text"
        {...field.controlProps}
        // Read-only, never disabled, so a computed answer is still reached and read (0181).
        readOnly={field.readOnly}
        value={shown}
        placeholder={placeholder ?? maskPlaceholder(mask)}
        inputMode={maskIsNumeric(mask) ? 'numeric' : undefined}
        onChange={(event) => {
          if (field.readOnly) return
          const input = event.target
          const forward = (event.nativeEvent as InputEvent).inputType === 'deleteContentForward'
          edit(input, input.value, input.selectionStart, forward)
        }}
        onPaste={(event) => {
          if (field.readOnly) return
          const input = event.currentTarget
          const pasted = event.clipboardData.getData('text')
          // The text the field would hold after the paste, which is what `pastedInstant`
          // judges: a log's instant is a whole answer, and read digit by digit it would
          // become one moved by the sender's offset.
          const before = shown.slice(0, input.selectionStart ?? shown.length)
          const after = shown.slice(input.selectionEnd ?? shown.length)
          const instant = pastedInstant(type, precision, `${before}${pasted}${after}`)
          event.preventDefault()
          if (instant === undefined) edit(input, `${before}${pasted}${after}`, before.length + pasted.length, false)
          else field.setValue(instant)
        }}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}
