import { NgComponentOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatRadioModule } from '@angular/material/radio'
import { FormancyTextPipe } from '@formancy/angular'
import { MaterialFieldBase } from './base.js'

/**
 * The answers chosen from a set, drawn with Material: a list, a tick, a group of radios,
 * a group of ticks.
 *
 * **Material's controls only where they keep what the default controls are.** The list is
 * the platform's `<select>` under Material's `matNativeControl`, not `mat-select`: a
 * `mat-select` is a combobox over an overlay, a different control with different keys, and
 * a person moving between a formancy form and its Material twin should meet the same one.
 * Radios and ticks are Material's, which put a native input inside — the same role, the
 * same keys. A picture on an option, a list from a source, a typeahead, a tag picker: the
 * default control draws those, because Material has nothing that does.
 */
interface Offered {
  value: string
  label: string
}

/** Options as written in the document, or undefined when the default control must draw them. */
function plainOptions(
  field: MaterialFieldBase['field'],
  text: (label: unknown) => string | undefined,
) {
  const def = field.snapshot().def
  const options = def.options ?? []
  if (def.widget !== undefined || def.optionsSource !== undefined) return undefined
  if (options.some((option) => option.image !== undefined)) return undefined
  return options.map((option): Offered => ({
    value: option.value,
    label: text(option.label) ?? option.value,
  }))
}

@Component({
  selector: 'formancy-material-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, NgComponentOutlet],
  template: `
    @if (offered(); as offered) {
      <mat-form-field [attr.data-formancy-field-path]="context.path">
        <mat-label>{{ context.label }}</mat-label>
        <select
          matNativeControl
          [id]="control().id"
          [attr.name]="control().name"
          [required]="field.snapshot().required"
          [disabled]="field.snapshot().disabled"
          [errorStateMatcher]="matcher"
          [aria-describedby]="describedBy() ?? ''"
          (change)="onChange($event)"
          (blur)="field.touch()"
        >
          <!-- The unanswered state, as in the default control: without it the browser
               pre-selects the first real option, which the engine never heard about. -->
          <option value="" [selected]="selected() === ''"></option>
          @for (option of offered; track option.value) {
            <option [value]="option.value" [selected]="selected() === option.value">
              {{ option.label }}
            </option>
          }
        </select>
        <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
      </mat-form-field>
    } @else {
      <ng-container *ngComponentOutlet="fallbackFor('select')" />
    }
  `,
})
export class FormancyMaterialSelectField extends MaterialFieldBase {
  protected readonly offered = computed(() =>
    plainOptions(this.field, (label) => this.engine.text(label as never)),
  )

  protected readonly selected = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected onChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value
    this.field.setValue(raw === '' ? null : raw)
  }
}

/**
 * A tick, as Material's checkbox.
 *
 * Material puts the engine's control id on its host and `<id>-input` on the input inside,
 * so the id a summary links to names the host. `focusControl` in `@formancy/angular` moves
 * focus into a host that cannot take it, which is what makes that link land on the box.
 * A `toggle` widget is still a checkbox here: Material's slide toggle claims
 * `role="switch"`, which a form field is not — the default control's reasoning, kept.
 */
@Component({
  selector: 'formancy-material-checkbox-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckboxModule, MatFormFieldModule],
  template: `
    <div [attr.data-formancy-field-path]="context.path">
      <mat-checkbox
        [id]="control().id"
        [checked]="field.snapshot().value === true"
        [required]="field.snapshot().required"
        [disabled]="field.snapshot().disabled"
        [aria-describedby]="control()['aria-describedby'] ?? ''"
        (change)="field.setValue($event.checked)"
        (focusout)="field.touch()"
        >{{ context.label }}</mat-checkbox
      >
      @if (showError()) {
        <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
      }
    </div>
  `,
})
export class FormancyMaterialCheckboxField extends MaterialFieldBase {}

/**
 * A group of radios, as Material's radio group inside a fieldset.
 *
 * The fieldset is what makes it a named group — `mat-radio-group` is `role="radiogroup"`
 * with no name of its own — and it carries the engine's description, as in the default
 * control, with the required hint as a real element because `role="group"` does not
 * support `aria-required`. The frame is this adapter's markup rather than Material's, so it
 * carries the default group's hooks — `field`, `label`, `required-hint` and `data-state` —
 * and a host styles both registries' groups with one rule.
 */
@Component({
  selector: 'formancy-material-radio-group-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatRadioModule, MatFormFieldModule, NgComponentOutlet, FormancyTextPipe],
  template: `
    @if (offered(); as offered) {
      <fieldset
        data-formancy-part="field"
        [attr.data-formancy-field-path]="context.path"
        [attr.data-state]="showError() ? 'invalid' : 'valid'"
        [attr.aria-describedby]="control()['aria-describedby']"
      >
        <legend data-formancy-part="label">{{ context.label }}</legend>
        @if (field.snapshot().required) {
          <span data-formancy-part="required-hint" [id]="field.snapshot().ids.hint">{{ 'form.required' | formancyText }}</span>
        }
        <mat-radio-group
          [name]="control().name"
          [value]="field.snapshot().value"
          [disabled]="field.snapshot().disabled"
          (change)="field.setValue($event.value)"
          (focusout)="field.touch()"
        >
          @for (option of offered; track option.value) {
            <mat-radio-button [id]="control().id + ':' + option.value" [value]="option.value">{{
              option.label
            }}</mat-radio-button>
          }
        </mat-radio-group>
        @if (showError()) {
          <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
        }
      </fieldset>
    } @else {
      <ng-container *ngComponentOutlet="fallbackFor('radio')" />
    }
  `,
})
export class FormancyMaterialRadioGroupField extends MaterialFieldBase {
  protected readonly offered = computed(() =>
    plainOptions(this.field, (label) => this.engine.text(label as never)),
  )
}

/** A group of ticks answering one question, as Material checkboxes inside a fieldset. */
@Component({
  selector: 'formancy-material-select-boxes-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckboxModule, MatFormFieldModule, NgComponentOutlet, FormancyTextPipe],
  template: `
    @if (offered(); as offered) {
      <fieldset
        data-formancy-part="field"
        [attr.data-formancy-field-path]="context.path"
        [attr.data-state]="showError() ? 'invalid' : 'valid'"
        [attr.aria-describedby]="control()['aria-describedby']"
      >
        <legend data-formancy-part="label">{{ context.label }}</legend>
        @if (field.snapshot().required) {
          <span data-formancy-part="required-hint" [id]="field.snapshot().ids.hint">{{ 'form.required' | formancyText }}</span>
        }
        @for (option of offered; track option.value) {
          <mat-checkbox
            [id]="control().id + ':' + option.value"
            [value]="option.value"
            [checked]="chosen().includes(option.value)"
            [disabled]="field.snapshot().disabled"
            (change)="toggle(option.value, $event.checked)"
            (focusout)="field.touch()"
            >{{ option.label }}</mat-checkbox
          >
        }
        @if (showError()) {
          <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
        }
      </fieldset>
    } @else {
      <ng-container *ngComponentOutlet="fallbackFor('selectboxes')" />
    }
  `,
})
export class FormancyMaterialSelectBoxesField extends MaterialFieldBase {
  protected readonly offered = computed(() =>
    plainOptions(this.field, (label) => this.engine.text(label as never)),
  )

  protected readonly chosen = computed<readonly unknown[]>(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? value : []
  })

  protected toggle(value: string, on: boolean): void {
    // In the options' own order, not the order they were ticked, as the default control
    // stores it: two people choosing the same answers store the same array.
    const next = (this.offered() ?? [])
      .map((option) => option.value)
      .filter((candidate) => (candidate === value ? on : this.chosen().includes(candidate)))
    this.field.setValue(next)
  }
}
