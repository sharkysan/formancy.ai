import { formatMasked, maskIsNumeric, maskPlaceholder, pasteOutcome, storedFromTyped, temporalEntryMask, typedFromStored } from '@formancy/spec'
import type { TypedTemporalType } from '@formancy/spec'
import type { ComponentProps } from 'react'
import { applyMaskedEdit } from './internals.js'

/** What the control takes of an `input` itself: everything but what it decides. */
type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'inputMode' | 'onPaste' | 'onDrop' | 'defaultValue'>

export interface TypedTemporalInputProps extends InputProps {
  type: TypedTemporalType
  /** The field's `precision`, 0 to 9. */
  precision: number
  /** The stored answer: a time or an instant at the width, or the formatted partial `storedFromTyped` holds. */
  value: string
  /** The stored answer for what was typed, pasted or dropped; null when emptied. */
  onChange: (value: string | null) => void
}

/**
 * The box a `time` or a `datetime` that declares a `precision` is typed into, bound to nothing:
 * the value in, the stored answer out. The form's field draws it inside its shell, and a host,
 * or a builder writing a condition's literal, may draw it on its own, so that every control
 * typing into the mask is this one and cannot read a keystroke, a paste or a drop another way
 * ([0091](../../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * The browser's pickers hold minutes, or milliseconds at best, so they cannot show or keep a
 * seventh digit: it is typed instead, into the mask `@formancy/spec` derives from the
 * precision. That package also says what the digits mean and what they are stored as; this is
 * the React binding of it, shaped like `TextField`'s masked branch (0125).
 *
 * It calls `onChange` only on the person's input, never on mount.
 */
export function TypedTemporalInput({ type, precision, value, onChange, readOnly, placeholder, ...rest }: TypedTemporalInputProps) {
  const mask = temporalEntryMask(type, precision)
  const typed = typedFromStored(type, precision, value)
  const shown = formatMasked(mask, typed)

  /**
   * Text a paste or a drop puts over what is shown from `start` to `end`. Whether it is an
   * answer, typing or nothing is `@formancy/spec`'s, for every control (0091): a drop that
   * reached the control as `input` instead was read by the mask, which dropped an instant's
   * `Z` and stored its digits as the person's own clock.
   */
  const replace = (input: HTMLInputElement, pasted: string, start: number, end: number): void => {
    const before = shown.slice(0, start)
    const after = shown.slice(end)
    const outcome = pasteOutcome(type, precision, { before, selected: shown.slice(start, end), pasted, after })
    if ('answer' in outcome) {
      // When the answer shows as the text the field now holds, the control is written and
      // the caret placed before React renders, as typing leaves it; React would write the
      // same text and leave the caret at the end.
      const text = formatMasked(mask, typedFromStored(type, precision, outcome.answer))
      if (text === `${before}${pasted}${after}`) {
        input.value = text
        input.setSelectionRange(before.length + pasted.length, before.length + pasted.length)
      }
      onChange(outcome.answer)
    } else if ('typed' in outcome) {
      const caret = before.length + pasted.length
      onChange(storedFromTyped(type, precision, applyMaskedEdit(input, mask, typed, outcome.typed, { caret, forward: false })))
    }
    // Ignored, the default is prevented and nothing else happens, as for a key the mask cannot place.
  }

  return (
    <input
      {...rest}
      type="text"
      readOnly={readOnly}
      value={shown}
      placeholder={placeholder ?? maskPlaceholder(mask)}
      inputMode={maskIsNumeric(mask) ? 'numeric' : undefined}
      onChange={(event) => {
        const input = event.target
        const forward = (event.nativeEvent as InputEvent).inputType === 'deleteContentForward'
        onChange(storedFromTyped(type, precision, applyMaskedEdit(input, mask, typed, input.value, { caret: input.selectionStart, forward })))
      }}
      onPaste={(event) => {
        // The engine ignores a write to a read-only field, but the control would still be
        // rewritten to digits that are not stored.
        if (readOnly === true) return
        const input = event.currentTarget
        event.preventDefault()
        // The paste replaces the selection.
        replace(input, event.clipboardData.getData('text'), input.selectionStart ?? shown.length, input.selectionEnd ?? shown.length)
      }}
      onDrop={(event) => {
        if (readOnly === true) return
        event.preventDefault()
        // A drop replaces the whole field. Where it lands is a pointer position, which no gate
        // here can turn into a place in the text and check (jsdom has no layout); a fragment
        // typed at a guessed caret would land where the person did not drop it.
        replace(event.currentTarget, event.dataTransfer.getData('text'), 0, shown.length)
      }}
    />
  )
}
