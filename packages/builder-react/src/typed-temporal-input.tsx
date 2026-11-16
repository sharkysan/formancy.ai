import { editMasked, formatMasked, maskIsNumeric, maskPlaceholder, pasteOutcome, temporalEntryMask, typedFromStored } from '@formancy/spec'
import type { TypedTemporalType } from '@formancy/spec'
import type { ReactElement } from 'react'

/**
 * The box a condition's value is typed into when the field compared declares a `precision`.
 *
 * It mirrors `TypedTemporalField` in `@formancy/react`, handler for handler, because the
 * author types the same shape the respondent does and two readings of one keystroke would be
 * two answers (0091). That control is not exported, and a builder imports a package's public
 * surface only, so what it decides is `@formancy/spec`'s: the mask, what a paste means, and
 * the digits of a stored text. Nothing is decided here.
 *
 * What differs from the renderer's control is what it holds. A renderer stores the answer; a
 * condition row holds the typed digits, the mask's answer, and `conditionOf` stores them at
 * the field's width (0238). So a paste of an instant is turned into the digits the author
 * would see for it, and the row carries those.
 */
export function TypedTemporalInput({
  type,
  precision,
  value,
  onChange,
}: {
  type: TypedTemporalType
  precision: number
  /** The typed digits: the mask's answer. */
  value: string
  onChange: (typed: string) => void
}): ReactElement {
  const mask = temporalEntryMask(type, precision)
  const shown = formatMasked(mask, value)

  /** An edit applied to the control and the digits it leaves, with the caret placed before React renders. */
  const edit = (input: HTMLInputElement, next: string, caret: number | null, forward: boolean): string => {
    const edited = editMasked(mask, value, next, { caret, direction: forward ? 'forward' : 'backward' })
    input.value = formatMasked(mask, edited.answer)
    input.setSelectionRange(edited.caret, edited.caret)
    return edited.answer
  }

  const replace = (input: HTMLInputElement, pasted: string, start: number, end: number): void => {
    const before = shown.slice(0, start)
    const after = shown.slice(end)
    const outcome = pasteOutcome(type, precision, { before, selected: shown.slice(start, end), pasted, after })
    if ('answer' in outcome) {
      const typed = typedFromStored(type, precision, outcome.answer)
      const text = formatMasked(mask, typed)
      if (text === `${before}${pasted}${after}`) {
        input.value = text
        input.setSelectionRange(before.length + pasted.length, before.length + pasted.length)
      }
      onChange(typed)
    } else if ('typed' in outcome) {
      onChange(edit(input, outcome.typed, before.length + pasted.length, false))
    }
    // Ignored, the default is prevented and nothing else happens, as for a key the mask cannot place.
  }

  return (
    <input
      type="text"
      value={shown}
      placeholder={maskPlaceholder(mask)}
      inputMode={maskIsNumeric(mask) ? 'numeric' : undefined}
      onChange={(event) => {
        const input = event.target
        const forward = (event.nativeEvent as InputEvent).inputType === 'deleteContentForward'
        onChange(edit(input, input.value, input.selectionStart, forward))
      }}
      onPaste={(event) => {
        const input = event.currentTarget
        event.preventDefault()
        replace(input, event.clipboardData.getData('text'), input.selectionStart ?? shown.length, input.selectionEnd ?? shown.length)
      }}
      onDrop={(event) => {
        event.preventDefault()
        // A drop replaces the whole field, as in the renderers: where it lands is a pointer position.
        replace(event.currentTarget, event.dataTransfer.getData('text'), 0, shown.length)
      }}
    />
  )
}
