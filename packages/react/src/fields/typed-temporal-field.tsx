import { formatMasked, maskIsNumeric, maskPlaceholder, pasteOutcome, storedFromTyped, temporalEntryMask, typedFromStored } from '@formancy/spec'
import type { TypedTemporalType } from '@formancy/spec'
import { useField } from '../use-field.js'
import { FieldShell, applyMaskedEdit, usePlaceholder } from './internals.js'

/**
 * A `time` or a `datetime` that declares a `precision`, typed into its own shape.
 *
 * The browser's pickers hold minutes, or milliseconds at best, so they cannot show or
 * keep a seventh digit: a field with a precision is typed instead, into the mask
 * `@formancy/spec` derives from it. That package also says what the digits mean and what
 * they are stored as, because five controls type into it and must agree
 * ([0091](../../../../docs/decisions/0091-a-second-builder-is-a-binding.md)); this file is
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
          const input = event.target
          const forward = (event.nativeEvent as InputEvent).inputType === 'deleteContentForward'
          field.setValue(storedFromTyped(type, precision, applyMaskedEdit(input, mask, typed, input.value, { caret: input.selectionStart, forward })))
        }}
        onPaste={(event) => {
          // The engine ignores a write to a read-only field, but the control would still be
          // rewritten to digits that are not stored.
          if (field.readOnly) return
          const input = event.currentTarget
          const pasted = event.clipboardData.getData('text')
          // What is shown before and after the selection, which is what the paste replaces.
          const before = shown.slice(0, input.selectionStart ?? shown.length)
          const after = shown.slice(input.selectionEnd ?? shown.length)
          event.preventDefault()
          // Whether the paste is an answer or typing is `@formancy/spec`'s, for every control (0091).
          const outcome = pasteOutcome(type, precision, { before, pasted, after })
          if ('answer' in outcome) {
            // When the answer shows as the text the field now holds, the control is written and
            // the caret placed before React renders, as typing leaves it; React would write the
            // same text and leave the caret at the end.
            const text = formatMasked(mask, typedFromStored(type, precision, outcome.answer))
            if (text === `${before}${pasted}${after}`) {
              input.value = text
              input.setSelectionRange(before.length + pasted.length, before.length + pasted.length)
            }
            field.setValue(outcome.answer)
          } else {
            const caret = before.length + pasted.length
            field.setValue(storedFromTyped(type, precision, applyMaskedEdit(input, mask, typed, outcome.typed, { caret, forward: false })))
          }
        }}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}
