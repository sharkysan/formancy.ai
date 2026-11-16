import { computed } from '@angular/core'
import type { Signal } from '@angular/core'
import { editMasked, formatMasked, maskIsNumeric, maskPlaceholder, pasteOutcome, temporalEntryMask, typedFromStored } from '@formancy/spec'
import type { TypedTemporalType } from '@formancy/spec'

/**
 * What a condition's value box needs when the field compared declares a `precision`: the text
 * to show, the hint and keypad, and the handlers.
 *
 * It mirrors `typedTemporalEntry` in `@formancy/angular`, handler for handler, because the
 * author types the same shape the respondent does and two readings of one keystroke would be
 * two answers (0091). That function is not exported, and a builder imports a package's public
 * surface only, so what it decides is `@formancy/spec`'s: the mask, what a paste means, and
 * the digits of a stored text. Nothing is decided here.
 *
 * What differs is what it holds. A renderer stores the answer; a condition row holds the typed
 * digits, the mask's answer, and `conditionOf` stores them at the field's width (0238). So a
 * pasted instant is turned into the digits the author would see for it, and the row carries those.
 */
export function typedTemporalEntry(type: Signal<TypedTemporalType>, precision: Signal<number>, typed: Signal<string>, change: (typed: string) => void) {
  const mask = computed(() => temporalEntryMask(type(), precision()))
  const shown = computed(() => formatMasked(mask(), typed()))

  /** An edit applied to the control and the digits it leaves, with the caret placed in the text it belongs to. */
  function edit(input: HTMLInputElement, next: string, caret: number | null, forward: boolean): string {
    const edited = editMasked(mask(), typed(), next, { caret, direction: forward ? 'forward' : 'backward' })
    input.value = formatMasked(mask(), edited.answer)
    input.setSelectionRange(edited.caret, edited.caret)
    return edited.answer
  }

  function replace(input: HTMLInputElement, pasted: string, start: number, end: number): void {
    const before = shown().slice(0, start)
    const after = shown().slice(end)
    const outcome = pasteOutcome(type(), precision(), { before, selected: shown().slice(start, end), pasted, after })
    if ('answer' in outcome) {
      const digits = typedFromStored(type(), precision(), outcome.answer)
      const text = formatMasked(mask(), digits)
      if (text === `${before}${pasted}${after}`) {
        input.value = text
        input.setSelectionRange(before.length + pasted.length, before.length + pasted.length)
      }
      change(digits)
    } else if ('typed' in outcome) {
      change(edit(input, outcome.typed, before.length + pasted.length, false))
    }
    // Ignored, the default is prevented and nothing else happens, as for a key the mask cannot place.
  }

  return {
    shown,
    placeholder: computed(() => maskPlaceholder(mask())),
    inputMode: computed(() => (maskIsNumeric(mask()) ? 'numeric' : null)),

    onInput(event: Event): void {
      const input = event.target as HTMLInputElement
      const forward = (event as InputEvent).inputType === 'deleteContentForward'
      change(edit(input, input.value, input.selectionStart, forward))
    },

    onPaste(event: ClipboardEvent): void {
      const input = event.target as HTMLInputElement
      event.preventDefault()
      replace(input, event.clipboardData?.getData('text') ?? '', input.selectionStart ?? shown().length, input.selectionEnd ?? shown().length)
    },

    onDrop(event: DragEvent): void {
      event.preventDefault()
      // A drop replaces the whole field, as in the renderers: where it lands is a pointer position.
      replace(event.target as HTMLInputElement, event.dataTransfer?.getData('text') ?? '', 0, shown().length)
    },
  }
}
