import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import type { Signal } from '@angular/core'
import { formatMasked, maskIsNumeric, maskPlaceholder, pasteOutcome, storedFromTyped, temporalEntryMask, typedFromStored } from '@formancy/spec'
import type { TypedTemporalType } from '@formancy/spec'
import type { FieldBinding } from '../field.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'
import { applyMaskedEdit } from './masked-edit.js'

/**
 * What a control that types a `time` or a `datetime` at its `precision` needs: the text to
 * show, the hint and keypad, and the handlers.
 *
 * A function over a field rather than logic in the component, so the handlers read as one
 * unit away from the markup. It holds no state of its own, only computed views of the
 * field's. Material draws no control of its own for it: a precision is the default
 * control's there, as a mask is (0132).
 *
 * What the digits mean, and what they are stored as, is `@formancy/spec`'s, because five
 * controls type into it and must agree
 * ([0091](../../../../docs/decisions/0091-a-second-builder-is-a-binding.md)); this is the
 * Angular binding of it, shaped like the text field's masked branch (0125) and like React's
 * `TypedTemporalField`. Written only on the person's input, never on mount: an answer
 * somebody supplied and nobody touched is submitted byte for byte, whatever width it has.
 *
 * `type` is the field's, taken as React's control takes it.
 */
function typedTemporalEntry(field: FieldBinding, type: TypedTemporalType, authoredPlaceholder: Signal<string | null>) {
  const precision = computed(() => {
    const declared = field.snapshot().def.precision
    return typeof declared === 'number' ? declared : 0
  })
  const mask = computed(() => temporalEntryMask(type, precision()))
  const typed = computed(() => {
    const value = field.snapshot().value
    return typedFromStored(type, precision(), typeof value === 'string' ? value : '')
  })

  /** The answer in its shape: every digit it holds, whatever its width. */
  const shown = computed(() => formatMasked(mask(), typed()))

  /**
   * Text a paste or a drop puts over what is shown from `start` to `end`. Whether it is an
   * answer, typing or nothing is `@formancy/spec`'s, for every control (0091): a drop that
   * reached the control as `input` instead was read by the mask, which dropped an instant's
   * `Z` and stored its digits as the person's own clock.
   */
  function replace(input: HTMLInputElement, pasted: string, start: number, end: number): void {
    const before = shown().slice(0, start)
    const after = shown().slice(end)
    const outcome = pasteOutcome(type, precision(), { before, selected: shown().slice(start, end), pasted, after })
    if ('answer' in outcome) {
      // When the answer shows as the text the field now holds, the control is written and
      // the caret placed before the binding renders, as typing leaves it; the binding would
      // write the same text and leave the caret at the end.
      const text = formatMasked(mask(), typedFromStored(type, precision(), outcome.answer))
      if (text === `${before}${pasted}${after}`) {
        input.value = text
        input.setSelectionRange(before.length + pasted.length, before.length + pasted.length)
      }
      field.setValue(outcome.answer)
    } else if ('typed' in outcome) {
      const caret = before.length + pasted.length
      field.setValue(storedFromTyped(type, precision(), applyMaskedEdit(input, mask(), typed(), outcome.typed, { caret, forward: false })))
    }
    // Ignored, the default is prevented and nothing else happens, as for a key the mask cannot place.
  }

  return {
    shown,
    placeholder: computed(() => authoredPlaceholder() ?? maskPlaceholder(mask())),
    inputMode: computed(() => (maskIsNumeric(mask()) ? 'numeric' : null)),

    onInput(event: Event): void {
      const input = event.target as HTMLInputElement
      const forward = (event as InputEvent).inputType === 'deleteContentForward'
      const edited = applyMaskedEdit(input, mask(), typed(), input.value, { caret: input.selectionStart, forward })
      field.setValue(storedFromTyped(type, precision(), edited))
    },

    onPaste(event: ClipboardEvent): void {
      // The engine ignores a write to a read-only field, but the control would still be
      // rewritten to digits that are not stored.
      if (field.snapshot().readOnly) return
      const input = event.target as HTMLInputElement
      event.preventDefault()
      // The paste replaces the selection.
      replace(input, event.clipboardData?.getData('text') ?? '', input.selectionStart ?? shown().length, input.selectionEnd ?? shown().length)
    },

    onDrop(event: DragEvent): void {
      if (field.snapshot().readOnly) return
      event.preventDefault()
      // A drop replaces the whole field. Where it lands is a pointer position, which no gate
      // here can turn into a place in the text and check (jsdom has no layout); a fragment
      // typed at a guessed caret would land where the person did not drop it.
      replace(event.target as HTMLInputElement, event.dataTransfer?.getData('text') ?? '', 0, shown().length)
    },
  }
}

/**
 * A `time` or a `datetime` that declares a `precision`, typed into its own shape.
 *
 * The browser's pickers hold minutes, or milliseconds at best, so they cannot show or keep
 * a seventh digit: a field with a precision is typed instead, into the mask
 * `@formancy/spec` derives from it. `FormancyTimeField` and `FormancyDateTimeField` draw
 * this when the field declares one and are otherwise the browser's control.
 */
@Component({
  selector: 'formancy-typed-temporal-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <!-- Read-only, never disabled, so a computed answer is still reached and read (0181). -->
      <input
        type="text"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [readOnly]="field.snapshot().readOnly"
        [value]="entry.shown()"
        [attr.placeholder]="entry.placeholder()"
        [attr.inputmode]="entry.inputMode()"
        (input)="entry.onInput($event)"
        (paste)="entry.onPaste($event)"
        (drop)="entry.onDrop($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyTypedTemporalField extends FieldComponentBase {
  protected readonly entry = typedTemporalEntry(this.field, this.field.snapshot().def.type === 'datetime' ? 'datetime' : 'time', this.authoredPlaceholder)
}
