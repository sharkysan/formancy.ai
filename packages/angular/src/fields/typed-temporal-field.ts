import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import type { TypedTemporalType } from '@formancy/spec'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'
import { FormancyTypedTemporalInput } from './typed-temporal-input.js'

/**
 * A `time` or a `datetime` that declares a `precision`, typed into its own shape: the shell
 * and the engine's binding around `FormancyTypedTemporalInput`, which is the control itself
 * and is exported for a host that draws one of its own. `FormancyTimeField` and
 * `FormancyDateTimeField` draw this when the field declares one and are otherwise the
 * browser's control. Material draws no control of its own for it: a precision is the default
 * control's there, as a mask is (0132).
 *
 * `type` is the field's. Written only on the person's input, never on mount.
 */
@Component({
  selector: 'formancy-typed-temporal-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell, FormancyTypedTemporalInput],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <!-- Read-only, never disabled, so a computed answer is still reached and read (0181). -->
      <input
        [formancyTypedTemporalInput]="type"
        [precision]="precision()"
        [value]="text()"
        [placeholder]="authoredPlaceholder()"
        [readOnly]="field.snapshot().readOnly"
        (valueChange)="field.setValue($event)"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyTypedTemporalField extends FieldComponentBase {
  protected readonly type: TypedTemporalType = this.field.snapshot().def.type === 'datetime' ? 'datetime' : 'time'
  protected readonly precision = computed(() => {
    const declared = this.field.snapshot().def.precision
    return typeof declared === 'number' ? declared : 0
  })
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })
}
