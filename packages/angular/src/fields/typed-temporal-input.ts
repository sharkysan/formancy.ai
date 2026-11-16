import { Directive, computed, input, linkedSignal, output } from '@angular/core'
import { formatMasked, maskIsNumeric, maskPlaceholder, pasteOutcome, storedFromTyped, temporalEntryMask, typedFromStored } from '@formancy/spec'
import type { TypedTemporalType } from '@formancy/spec'
import { applyMaskedEdit } from './masked-edit.js'

/**
 * The box a `time` or a `datetime` that declares a `precision` is typed into, bound to nothing:
 * the value in, the stored answer out. Put on an `<input>`, so the element keeps whatever id,
 * name and `aria-*` its host gives it. The form's field draws it inside its shell, and a host,
 * or a builder writing a condition's literal, may draw it on its own, so that every control
 * typing into the mask is this one and cannot read a keystroke, a paste or a drop another way
 * ([0091](../../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * A directive rather than a component because it draws nothing: the element is the host's
 * `<input>`, and a component's own template would put a second element inside a void one.
 *
 * The browser's pickers hold minutes, or milliseconds at best, so they cannot show or keep a
 * seventh digit: it is typed instead, into the mask `@formancy/spec` derives from the
 * precision. That package also says what the digits mean and what they are stored as; this is
 * the Angular binding of it, shaped like the text field's masked branch (0125) and like React's
 * `TypedTemporalInput`. It emits `valueChange` only on the person's input, never on mount: an
 * answer somebody supplied and nobody touched is submitted byte for byte, whatever width it has.
 */
@Directive({
  selector: 'input[formancyTypedTemporalInput]',
  host: {
    type: 'text',
    '[value]': 'shown()',
    '[readOnly]': 'readOnly()',
    '[attr.placeholder]': 'hint()',
    '[attr.inputmode]': 'inputMode()',
    '(input)': 'onInput($event)',
    '(paste)': 'onPaste($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class FormancyTypedTemporalInput {
  /** `time` or `datetime`. */
  readonly type = input.required<TypedTemporalType>({ alias: 'formancyTypedTemporalInput' })
  /** The field's `precision`, 0 to 9. */
  readonly precision = input.required<number>()
  /** The stored answer: a time or an instant at the width, or the formatted partial `storedFromTyped` holds. */
  readonly value = input.required<string>()
  /** An authored placeholder; absent, the mask's own. */
  readonly placeholder = input<string | null>(null)
  readonly readOnly = input(false)
  /** The stored answer for what was typed, pasted or dropped; null when emptied. */
  readonly valueChange = output<string | null>()

  private readonly mask = computed(() => temporalEntryMask(this.type(), this.precision()))
  /**
   * The digits behind the text the control shows, which every edit is read against. Linked to
   * `value` rather than computed from it, because the two disagree for a while after each edit:
   * the edit is written to the control at once, and `value` comes back only when the host is
   * next rendered, on a later task in a zoneless application. A key pressed in between, read
   * against `value`, was read against the answer one keystroke behind what the person saw, and a
   * Backspace across a colon did nothing. So an edit sets it as it writes the control, and a new
   * `value` replaces it.
   */
  private readonly typed = linkedSignal(() => typedFromStored(this.type(), this.precision(), this.value()))

  /** The answer in its shape: every digit it holds, whatever its width. */
  protected readonly shown = computed(() => formatMasked(this.mask(), this.typed()))
  protected readonly hint = computed(() => this.placeholder() ?? maskPlaceholder(this.mask()))
  protected readonly inputMode = computed(() => (maskIsNumeric(this.mask()) ? 'numeric' : null))

  /**
   * Text a paste or a drop puts over what is shown from `start` to `end`. Whether it is an
   * answer, typing or nothing is `@formancy/spec`'s, for every control (0091): a drop that
   * reached the control as `input` instead was read by the mask, which dropped an instant's
   * `Z` and stored its digits as the person's own clock.
   */
  private replace(element: HTMLInputElement, pasted: string, start: number, end: number): void {
    const type = this.type()
    const precision = this.precision()
    const mask = this.mask()
    const shown = this.shown()
    const before = shown.slice(0, start)
    const after = shown.slice(end)
    const outcome = pasteOutcome(type, precision, { before, selected: shown.slice(start, end), pasted, after })
    if ('answer' in outcome) {
      // When the answer shows as the text the field now holds, the control is written and
      // the caret placed before the binding renders, as typing leaves it; the binding would
      // write the same text and leave the caret at the end.
      const typed = typedFromStored(type, precision, outcome.answer)
      const text = formatMasked(mask, typed)
      if (text === `${before}${pasted}${after}`) {
        element.value = text
        element.setSelectionRange(before.length + pasted.length, before.length + pasted.length)
        this.typed.set(typed)
      }
      this.valueChange.emit(outcome.answer)
    } else if ('typed' in outcome) {
      const caret = before.length + pasted.length
      this.edited(applyMaskedEdit(element, mask, this.typed(), outcome.typed, { caret, forward: false }))
    }
    // Ignored, the default is prevented and nothing else happens, as for a key the mask cannot place.
  }

  /** The digits an edit wrote to the control: kept as what the next edit is read against, and reported as the stored answer. */
  private edited(typed: string): void {
    this.typed.set(typed)
    this.valueChange.emit(storedFromTyped(this.type(), this.precision(), typed))
  }

  protected onInput(event: Event): void {
    const element = event.target as HTMLInputElement
    const forward = (event as InputEvent).inputType === 'deleteContentForward'
    this.edited(applyMaskedEdit(element, this.mask(), this.typed(), element.value, { caret: element.selectionStart, forward }))
  }

  protected onPaste(event: ClipboardEvent): void {
    // The engine ignores a write to a read-only field, but the control would still be
    // rewritten to digits that are not stored.
    if (this.readOnly()) return
    const element = event.target as HTMLInputElement
    event.preventDefault()
    // The paste replaces the selection.
    this.replace(
      element,
      event.clipboardData?.getData('text') ?? '',
      element.selectionStart ?? this.shown().length,
      element.selectionEnd ?? this.shown().length,
    )
  }

  protected onDrop(event: DragEvent): void {
    if (this.readOnly()) return
    event.preventDefault()
    // A drop replaces the whole field. Where it lands is a pointer position, which no gate
    // here can turn into a place in the text and check (jsdom has no layout); a fragment
    // typed at a guessed caret would land where the person did not drop it.
    this.replace(event.target as HTMLInputElement, event.dataTransfer?.getData('text') ?? '', 0, this.shown().length)
  }
}
