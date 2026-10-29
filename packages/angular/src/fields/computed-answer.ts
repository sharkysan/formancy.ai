import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { answerInWords } from '@formancy/core/words'
import { injectFormText } from '../text.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'

/**
 * A field a computed rule writes, where its own control has no read-only state: its answer in
 * words, in a read-only box (0216) — the React binding's `ComputedAnswerField`.
 *
 * A computed value is the engine's, and is read rather than operated (0181). A tick box, a
 * choice, a list, a ranking, a matrix, a rating or a signature drawn as itself took a change the
 * engine refused, and here went on showing it, since a bound value is written only when it
 * changes: a ticked box over `false`. `readonly`, never `disabled`, as a computed number's box
 * is. The words are a submission read back's, so the box says what the review and the admin say.
 */
@Component({
  selector: 'formancy-computed-answer-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <input
        type="text"
        readonly
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="said()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyComputedAnswerField extends FieldComponentBase {
  private readonly words = injectFormText()

  protected readonly said = computed(() => {
    const snapshot = this.field.snapshot()
    return answerInWords(this.engine.schema(), snapshot.def, snapshot.value, this.words, this.engine.locale())
  })

  /** Nothing is chosen here, so a source is asked for no page. */
  protected override sourceEnabled(): boolean {
    return false
  }
}
