import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { FormancyTextPipe } from '../text.js'
import { FieldComponentBase } from './field-shell.js'

/**
 * One question asked of several rows ([0139](../../../../docs/decisions/0139-a-matrix-answers-one-question-per-row.md)).
 *
 * The control the React renderer emits, part for part and role for role: a fieldset named
 * by the label, holding a fieldset per row named by the row, holding a radio per column
 * named by the column — a radio group per row, which is what each row is. Each row's radios
 * share a name of their own, so choosing in one row never clears another.
 */
@Component({
  selector: 'formancy-matrix-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyTextPipe],
  template: `
    <fieldset
      [id]="control().id"
      data-formancy-part="field"
      [attr.data-formancy-field-path]="context.path"
      [attr.data-state]="showError() ? 'invalid' : 'valid'"
      [attr.aria-describedby]="control()['aria-describedby']"
      [disabled]="field.snapshot().disabled"
    >
      <legend data-formancy-part="label">{{ context.label }}</legend>
      @if (field.snapshot().required) {
        <!-- As the checkbox group carries it: role=group does not support
             aria-required, so the engine describes the group by this instead. -->
        <span data-formancy-part="required-hint" [id]="field.snapshot().ids.hint">{{ 'form.required' | formancyText }}</span>
      }
      <div data-formancy-part="matrix" [attr.data-columns]="options().length">
        @for (row of rows(); track row.value) {
          <fieldset data-formancy-part="matrix-row">
            <legend data-formancy-part="matrix-row-label">{{ row.label }}</legend>
            @for (column of options(); track column.value) {
              <span data-formancy-part="matrix-option">
                <input
                  type="radio"
                  [id]="optionId(row.value, column.value)"
                  [attr.name]="control().name + '.' + row.value"
                  [value]="column.value"
                  [checked]="answer()[row.value] === column.value"
                  (change)="choose(row.value, column.value)"
                  (blur)="field.touch()"
                />
                <label [attr.for]="optionId(row.value, column.value)">{{ column.label }}</label>
              </span>
            }
          </fieldset>
        }
      </div>
      @if (showError()) {
        <p data-formancy-part="error" [id]="field.snapshot().props.error.id">{{ errorText() }}</p>
      }
    </fieldset>
  `,
})
export class FormancyMatrixField extends FieldComponentBase {
  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })

  protected readonly errorText = computed(() => this.field.snapshot().errors.join(', '))

  /** The rows, their labels resolved as the options' are. */
  protected readonly rows = computed(() =>
    (this.field.snapshot().def.rows ?? []).map((row) => ({
      value: row.value,
      label: this.engine.text(row.label) ?? row.value,
    })),
  )

  /** The column chosen under each row answered. */
  protected readonly answer = computed<Readonly<Record<string, unknown>>>(() => {
    const value = this.field.snapshot().value
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  })

  protected optionId(row: string, column: string): string {
    return `${this.control().id}:${row}:${column}`
  }

  protected choose(row: string, column: string): void {
    this.field.setValue({ ...this.answer(), [row]: column })
  }
}
