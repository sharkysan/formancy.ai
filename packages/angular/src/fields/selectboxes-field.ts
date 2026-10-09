import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { narrowOptionsByLabel } from '@formancy/spec'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'


/**
 * Many answers from a set, as checkboxes or as a tag picker.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
/**
 * Several answers from a list, every option visible at once.
 *
 * A fieldset with a legend, exactly like the radio group, because the
 * relationship is the same one: several controls answering a single question.
 * What differs is only that more than one may be chosen.
 *
 * "At least one" is a property of the QUESTION, not of any one box, so it
 * belongs to the group — but not as `aria-required`, which `role="group"`
 * does not support and assistive technology therefore ignores. The group's
 * description carries it instead. On every box it would announce each option
 * as required, which is the opposite of what it means.
 */
/**
 * `widget: "tagpicker"` — several answers, narrowed by typing, shown as chips.
 *
 * The same control the React renderer emits, part for part and role for role: a
 * theme dresses both through one set of `data-formancy-part` names, and the
 * conformance rule is that two renderers agree by role and accessible name.
 *
 * A shell with a label rather than a fieldset with a legend, for the reason the
 * React one carries: a `selectboxes` without this widget is a group of controls
 * and a legend names it correctly, while a tag picker is a single combobox with
 * a list of what has been chosen beside it — so a legend would name the group
 * and leave the control somebody types into with no name at all.
 */
@Component({
  selector: 'formancy-tagpicker-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <div data-formancy-part="tagpicker">
        @if (chosen().length > 0) {
          <ul data-formancy-part="tagpicker-chips" [attr.aria-label]="context.label + ': chosen'">
            @for (value of chosen(); track value) {
              <li data-formancy-part="tagpicker-chip">
                {{ labelFor(value) }}
                <button
                  type="button"
                  data-formancy-part="tagpicker-remove"
                  [attr.aria-label]="'Remove ' + labelFor(value)"
                  (click)="remove(value)"
                >
                  &times;
                </button>
              </li>
            }
          </ul>
        }

        <div data-formancy-part="tagpicker-anchor">
          <input
            type="text"
            role="combobox"
            data-formancy-part="tagpicker-input"
            autocomplete="off"
            [id]="control().id"
            [attr.name]="control().name"
            [attr.aria-invalid]="control()['aria-invalid']"
            [attr.aria-required]="control()['aria-required']"
            [attr.aria-describedby]="control()['aria-describedby']"
            [attr.aria-expanded]="expanded()"
            [attr.aria-controls]="listboxId()"
            aria-autocomplete="list"
            [value]="query()"
            (input)="onQuery($event)"
            (click)="open.set(true)"
            (keydown)="onKey($event)"
            (blur)="onBlur()"
          />
          <ul
            [id]="listboxId()"
            role="listbox"
            [attr.aria-label]="context.label + ' suggestions'"
            data-formancy-part="tagpicker-listbox"
            [hidden]="!expanded()"
          >
            @for (option of matches(); track option.value) {
              <li
                role="option"
                data-formancy-part="tagpicker-option"
                [attr.aria-selected]="false"
                (mousedown)="$event.preventDefault()"
                (click)="add(option.value)"
              >
                {{ option.label }}
              </li>
            }
          </ul>
        </div>
      </div>
    </formancy-field-shell>
  `,
})
export class FormancyTagPickerField extends FieldComponentBase {
  protected readonly query = signal('')
  protected readonly open = signal(false)

  protected readonly chosen = computed(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? value.map(String) : []
  })

  /** Not already chosen, then narrowed by what was typed. */
  protected readonly matches = computed(() =>
    narrowOptionsByLabel(
      this.options().filter((option) => !this.chosen().includes(option.value)),
      this.query(),
    ),
  )

  protected readonly expanded = computed(() => this.open() && this.matches().length > 0)
  protected readonly listboxId = computed(() => `${this.control().id}:listbox`)

  protected labelFor(value: string): string {
    return this.options().find((option) => option.value === value)?.label ?? value
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value)
    this.open.set(true)
  }

  protected add(value: string): void {
    // The options' own order, never the order they were chosen: two people
    // choosing the same answers store the same array.
    const next = this.options()
      .map((option) => option.value)
      .filter((candidate) => candidate === value || this.chosen().includes(candidate))
    this.field.setValue(next)
    this.query.set('')
    this.open.set(false)
  }

  protected remove(value: string): void {
    this.field.setValue(this.chosen().filter((candidate) => candidate !== value))
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.open.set(false)
      return
    }
    const first = this.matches()[0]
    if (event.key === 'Enter' && this.expanded() && first !== undefined) {
      event.preventDefault()
      this.add(first.value)
      return
    }
    // Backspace on an empty box takes the last chip back.
    const chosen = this.chosen()
    if (event.key === 'Backspace' && this.query() === '' && chosen.length > 0) {
      this.remove(chosen[chosen.length - 1]!)
    }
  }

  protected onBlur(): void {
    this.open.set(false)
    this.field.touch()
  }
}

@Component({
  selector: 'formancy-select-boxes-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyTagPickerField],
  template: `
    @if (tagpicker()) {
      <!-- A widget changes the CONTROL and nothing else: same field, same
           accessible name, same stored answer — an array of offered option values
           in the options' own order. Dispatched here rather than in the registry,
           exactly as the select hands over to the typeahead. -->
      <formancy-tagpicker-field />
    } @else {
    <fieldset
      data-formancy-part="field"
      [attr.data-formancy-field-path]="context.path"
      [attr.data-state]="showError() ? 'invalid' : 'valid'"
      [attr.aria-describedby]="control()['aria-describedby']"
    >
      <legend data-formancy-part="label">{{ context.label }}</legend>
      @if (field.snapshot().required) {
        <!-- A real element rather than the aria-required attribute, which
             role=group does not support: assistive technology ignores it
             there and an auditor reports it as invalid ARIA. The engine puts
             this id into the group's aria-describedby, so it is announced
             after the legend. Visible too, because WCAG 1.4.1. -->
        <span data-formancy-part="required-hint" [id]="field.snapshot().ids.hint">required</span>
      }
      @for (option of options(); track option.value) {
        <span data-formancy-part="checkbox-option">
          <input
            type="checkbox"
            [id]="optionId(option)"
            [attr.name]="control().name"
            [value]="option.value"
            [checked]="isChosen(option.value)"
            [disabled]="field.snapshot().disabled"
            (change)="toggle(option.value, $event)"
            (blur)="field.touch()"
          />
          <!-- As the radio group draws it, and on one line for the same reason. -->
          <label [attr.for]="optionId(option)">@if (option.image; as image) {<img data-formancy-part="option-image" [src]="image.src" [alt]="image.alt" loading="lazy" decoding="async" />&ngsp;}{{ option.label }}</label>
        </span>
      }
      @if (showError()) {
        <p data-formancy-part="error" [id]="field.snapshot().props.error.id">{{ errorText() }}</p>
      }
    </fieldset>
    }
  `,
})
export class FormancySelectBoxesField extends FieldComponentBase {
  protected readonly tagpicker = computed(() => this.field.snapshot().def.widget === 'tagpicker')

  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })

  protected readonly errorText = computed(() => this.field.snapshot().errors.join(', '))

  protected readonly chosen = computed<readonly unknown[]>(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? value : []
  })

  protected isChosen(value: string): boolean {
    return this.chosen().includes(value)
  }

  protected optionId(option: { value: string }): string {
    return `${this.field.snapshot().ids.control}:${option.value}`
  }

  protected toggle(value: string, event: Event): void {
    const on = (event.target as HTMLInputElement).checked
    // Rebuilt in the options' own order rather than the order they were
    // ticked, so two people choosing the same answers store the same array and
    // the React binding stores it identically.
    const next = this.options()
      .map((option) => option.value)
      .filter((candidate) => (candidate === value ? on : this.isChosen(candidate)))
    this.field.setValue(next)
  }
}
