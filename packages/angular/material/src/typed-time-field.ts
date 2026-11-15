import { ChangeDetectionStrategy, Component } from '@angular/core'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { FormancyErrorText, typedTemporalEntry } from '@formancy/angular'
import { MaterialFieldBase } from './base.js'

/**
 * A `time` that declares a `precision`, typed into its own shape inside Material's form field.
 *
 * `FormancyMaterialTimeField` draws this when the field has a precision and is otherwise
 * Material's browser control. Material has no `datetime` control, so a `datetime` with a
 * precision is the default control's, which is the same typed control without the form field.
 *
 * What the digits mean, and what they are stored as, is `@formancy/spec`'s, reached through
 * `typedTemporalEntry` so Material, the default control and React cannot answer one
 * keystroke or one paste differently
 * ([0091](../../../../docs/decisions/0091-a-second-builder-is-a-binding.md)). Only the markup
 * is Material's, and it is `FormancyMaterialTimeField`'s line for line.
 */
@Component({
  selector: 'formancy-material-typed-time-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyErrorText, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field [attr.data-formancy-field-path]="context.path">
      <mat-label>{{ context.label }}</mat-label>
      <input
        matInput
        type="text"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.placeholder]="entry.placeholder()"
        [attr.inputmode]="entry.inputMode()"
        [required]="field.snapshot().required"
        [disabled]="field.snapshot().disabled"
        [readonly]="field.snapshot().readOnly"
        [errorStateMatcher]="matcher"
        [aria-describedby]="describedBy() ?? ''"
        [value]="entry.shown()"
        (input)="entry.onInput($event)"
        (paste)="entry.onPaste($event)"
        (blur)="field.touch()"
      />
      <mat-error [id]="errorId()" [formancyErrorText]="field.snapshot()"></mat-error>
    </mat-form-field>
    <!-- The field's help text under the box, as the other Material controls draw it (0194, 0211). -->
    @if (field.snapshot().description; as said) {
      <p data-formancy-part="description" [id]="field.snapshot().ids.description">{{ said }}</p>
    }
  `,
})
export class FormancyMaterialTypedTimeField extends MaterialFieldBase {
  protected readonly entry = typedTemporalEntry(this.field, this.authoredPlaceholder)
}
