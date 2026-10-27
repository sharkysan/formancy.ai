import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import type { FieldSnapshot } from '@formancy/core'
import { errorSentence } from '@formancy/core/words'
import { injectFormText } from '../text.js'

/**
 * A field's errors, said: one sentence per code, in the form's language, with the field's
 * own limit in it (0191) — the React binding's `ErrorText`, sentence for sentence, since both
 * call `errorSentence`.
 *
 * On the error element itself — `<p [formancyErrorText]="snapshot">`, or Material's
 * `<mat-error>` — rather than a host element of its own, so the markup a theme styles and
 * `aria-describedby` points at is the element it always was. Exported, so a host's own
 * control says its errors as the shipped ones do. Each sentence is its own element carrying its code in
 * `data-formancy-code`, which is where the conformance driver reads the code.
 */
@Component({
  selector: '[formancyErrorText]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (said of sentences(); track said.code; let first = $first) {@if (!first) {{{ ' ' }}}<span [attr.data-formancy-code]="said.code">{{ said.text }}</span>}`,
})
export class FormancyErrorText {
  readonly snapshot = input.required<FieldSnapshot>({ alias: 'formancyErrorText' })
  private readonly text = injectFormText()

  protected readonly sentences = computed(() => {
    const { errors, def, messages } = this.snapshot()
    return errors.map((code) => ({ code, text: errorSentence(this.text, def, code, messages) }))
  })
}
