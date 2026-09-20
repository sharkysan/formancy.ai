import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import type { Type } from '@angular/core'
import type { FieldOption, FieldType } from '@formancy/spec'
import { injectField } from './field.js'
import type { FieldBinding } from './field.js'
import { injectFieldContext } from './registry.js'

/**
 * The built-in unstyled field components — the Angular rendering of the same
 * decisions React's defaults made. Zero CSS; `data-formancy-part` is the
 * styling hook; every id and ARIA attribute comes from the engine's prop
 * getters so the wiring is byte-identical across renderers.
 *
 * The interpolations that become accessible text (labels, error codes) sit on
 * one template line on purpose: element-internal whitespace would leak into
 * textContent, and the conformance driver reads error codes verbatim.
 */

/** Shared unstyled shell: real label, projected control, error text as the
 *  describedby target. */
@Component({
  selector: 'formancy-field-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-formancy-part="field" [attr.data-state]="showError() ? 'invalid' : 'valid'">
      <label data-formancy-part="label" [id]="field().snapshot().props.label.id" [attr.for]="field().snapshot().props.label.for">{{ label() }}</label>
      <ng-content />
      @if (showError()) {
        <p data-formancy-part="error" [id]="field().snapshot().props.error.id">{{ errorText() }}</p>
      }
    </div>
  `,
})
export class FormancyFieldShell {
  readonly field = input.required<FieldBinding>()
  readonly label = input.required<string>()

  protected readonly showError = computed(() => {
    const snapshot = this.field().snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })

  protected readonly errorText = computed(() => this.field().snapshot().errors.join(', '))
}

/** The state every leaf control shares; components extend it so the templates
 *  stay the only per-type code. Context comes through DI (see registry.ts). */
abstract class FieldComponentBase {
  protected readonly context = injectFieldContext()
  protected readonly field = injectField(this.context.path)
  protected readonly control = computed(() => this.field.snapshot().props.control)
}

@Component({
  selector: 'formancy-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label">
      <input
        type="text"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyTextField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected onInput(event: Event): void {
    this.field.setValue((event.target as HTMLInputElement).value)
  }
}

@Component({
  selector: 'formancy-textarea-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label">
      <textarea
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      ></textarea>
    </formancy-field-shell>
  `,
})
export class FormancyTextareaField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected onInput(event: Event): void {
    this.field.setValue((event.target as HTMLTextAreaElement).value)
  }
}

@Component({
  selector: 'formancy-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label">
      <input
        type="number"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyNumberField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'number' ? String(value) : ''
  })

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.field.setValue(raw === '' ? null : Number(raw))
  }
}

@Component({
  selector: 'formancy-checkbox-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label">
      <input
        type="checkbox"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [checked]="checked()"
        (change)="onChange($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyCheckboxField extends FieldComponentBase {
  protected readonly checked = computed(() => this.field.snapshot().value === true)

  protected onChange(event: Event): void {
    this.field.setValue((event.target as HTMLInputElement).checked)
  }
}

@Component({
  selector: 'formancy-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label">
      <input
        type="date"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyDateField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.field.setValue(raw === '' ? null : raw)
  }
}

@Component({
  selector: 'formancy-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label">
      <select
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        (change)="onChange($event)"
        (blur)="field.touch()"
      >
        <!-- The empty option is the unanswered state; without it the browser
             silently pre-selects the first real option, which the engine never
             heard about. Selectedness is bound per option because a select's
             value property is only settable once its options exist. -->
        <option value="" [selected]="selected() === ''"></option>
        @for (option of options(); track option.value) {
          <option [value]="option.value" [selected]="selected() === option.value">{{ option.label }}</option>
        }
      </select>
    </formancy-field-shell>
  `,
})
export class FormancySelectField extends FieldComponentBase {
  protected readonly options = computed<readonly FieldOption[]>(
    () => this.field.snapshot().def.options ?? [],
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

@Component({
  selector: 'formancy-radio-group-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset
      data-formancy-part="field"
      [attr.data-state]="showError() ? 'invalid' : 'valid'"
      [attr.aria-describedby]="control()['aria-describedby']"
    >
      <legend data-formancy-part="label">{{ context.label }}</legend>
      @for (option of options(); track option.value) {
        <span data-formancy-part="radio-option">
          <input
            type="radio"
            [id]="optionId(option)"
            [attr.name]="control().name"
            [value]="option.value"
            [checked]="field.snapshot().value === option.value"
            (change)="field.setValue(option.value)"
            (blur)="field.touch()"
          />
          <label [attr.for]="optionId(option)">{{ option.label }}</label>
        </span>
      }
      @if (showError()) {
        <p data-formancy-part="error" [id]="field.snapshot().props.error.id">{{ errorText() }}</p>
      }
    </fieldset>
  `,
})
export class FormancyRadioGroupField extends FieldComponentBase {
  protected readonly options = computed<readonly FieldOption[]>(
    () => this.field.snapshot().def.options ?? [],
  )

  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })

  protected readonly errorText = computed(() => this.field.snapshot().errors.join(', '))

  protected optionId(option: FieldOption): string {
    return `${this.field.snapshot().ids.control}:${option.value}`
  }
}

/**
 * The built-in unstyled components. `null` means the type renders nothing here:
 * hidden and static are non-inputs, and the container types are laid out by
 * their own machinery, not by a leaf slot.
 */
export const DEFAULT_FIELD_COMPONENTS: Record<FieldType, Type<unknown> | null> = {
  text: FormancyTextField,
  textarea: FormancyTextareaField,
  number: FormancyNumberField,
  checkbox: FormancyCheckboxField,
  date: FormancyDateField,
  select: FormancySelectField,
  radio: FormancyRadioGroupField,
  hidden: null,
  static: null,
  group: null,
  page: null,
  repeater: null,
}
