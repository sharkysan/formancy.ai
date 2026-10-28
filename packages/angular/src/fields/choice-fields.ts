import { ChangeDetectionStrategy, Component, computed, effect, input } from '@angular/core'
import { optionsStatus } from '@formancy/core/words'
import { FormancyTextPipe, injectFormText } from '../text.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'
import { FormancyTypeaheadSelect } from './typeahead-field.js'
import { FormancyErrorText } from './error-text.js'


/**
 * One answer from a set: a tick, a list, or a group of radios.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
@Component({
  selector: 'formancy-checkbox-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <input
        type="checkbox"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [attr.data-formancy-part]="part()"
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

  /**
   * `widget: "toggle"` is a part name and NOT `role="switch"`.
   *
   * ARIA's switch means a control that takes effect when you operate it, and a form
   * field sets a value submitted later or never — so announcing "switch" describes
   * it incorrectly to the people who rely on the description. A role is also not
   * paint: changing it would make this the first widget to change what a control
   * claims to be, which is the line the widget mechanism exists to hold. The switch
   * is CSS, and conformance keeps finding this by role `checkbox` either way.
   *
   * Null rather than absent when there is no widget, because Angular omits an
   * attribute bound to null — which is what keeps an ordinary checkbox's markup
   * exactly as it was.
   */
  protected readonly part = computed(() =>
    this.field.snapshot().def.widget === 'toggle' ? 'toggle' : null,
  )

  protected onChange(event: Event): void {
    this.field.setValue((event.target as HTMLInputElement).checked)
  }
}

@Component({
  selector: 'formancy-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell, FormancyTypeaheadSelect, FormancyTextPipe],
  template: `
    @if (remote.unavailable()) {
      <!-- The document names a source this deployment does not have. Unlike a missing
           scanner this costs the whole field -- a select with no options collects
           nothing -- so it says so where the chooser would be, exactly as the file
           field does without an uploader.

           BEFORE the widget, and the order is the fix: dispatching to the typeahead
           first made this message unreachable for the very widget the feature was
           built for, leaving a working-looking combobox that returned nothing and
           announced "No options match" -- which says the list has no such row, when
           the truth is that there is no list. The React binding orders it the same. -->
      <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
        <p data-formancy-part="options-unavailable">{{ 'options.unavailable' | formancyText: { source: sourceName() } }}</p>
      </formancy-field-shell>
    } @else if (typeahead()) {
      <!-- A widget changes the CONTROL and nothing else: same field, same
           accessible name, same stored answer. The registry still wins over every
           branch, because it replaces the component. -->
      <formancy-typeahead-select />
    } @else {
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <select
        [id]="control().id"
        [attr.name]="control().name"
        [attr.autocomplete]="field.snapshot().def.autocomplete ?? null"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        (change)="onChange($event)"
        (focus)="onFocus()"
        (blur)="field.touch()"
      >
        <!-- The empty option is the unanswered state; without it the browser
             silently pre-selects the first real option, which the engine never
             heard about. Selectedness is bound per option because a select's
             value property is only settable once its options exist. -->
        <option value="" [selected]="selected() === ''"></option>
        @for (option of offered(); track option.value) {
          <option [value]="option.value" [selected]="selected() === option.value">{{ option.label }}</option>
        }
      </select>
      <!-- Only a sourced select has anything to say: that its source failed, that it
           answers only a search, or what its list leaves out, in words for a list nobody
           can type into. Never the error region, which carries the engine's verdict -- a
           source being down is not a wrong answer. -->
      @if (remote.sourced()) {
        <p role="status" data-formancy-part="select-status">{{ sourceStatus() }}</p>
      }
    </formancy-field-shell>
    }
  `,
})
export class FormancySelectField extends FieldComponentBase {
  protected readonly typeahead = computed(() => this.field.snapshot().def.widget === 'typeahead')

  /** The name the document gave, for the message when this deployment has no such source. */
  protected readonly sourceName = computed(() => this.field.snapshot().def.optionsSource ?? '')

  /** This one hands over to the typeahead, which does its own asking. */
  protected override sourceEnabled(): boolean {
    return !this.typeahead()
  }

  protected readonly selected = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  private readonly words = injectFormText()

  /**
   * The one sentence under a sourced list, decided by `optionsStatus` as the typeahead's
   * is (0177). Always "open": a native select has no event for its list showing, and it
   * says what it can while it is enabled. Its query is the empty one it always asks with.
   */
  protected readonly sourceStatus = computed(() =>
    optionsStatus(this.words, {
      control: 'select',
      open: true,
      disabled: this.field.snapshot().disabled,
      failed: this.remote.failed(),
      busy: this.remote.busy(),
      needs: this.remote.needs(),
      query: '',
      completeness: this.remote.completeness(),
    }),
  )

  protected onChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value
    this.field.setValue(raw === '' ? null : raw)
  }

  /**
   * Moving to a select whose search failed asks again, and nothing else does.
   *
   * Its query never changes, so without this a failure was final. Focus precedes every
   * way of opening a native list, by pointer or by keyboard, which has no event of its
   * own. Not on a timer: that would load a source that is down, from every sourced
   * select on every open form, with a live region speaking on a schedule.
   */
  protected onFocus(): void {
    if (this.remote.failed()) this.remote.retry()
  }
}

@Component({
  selector: 'formancy-radio-group-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyErrorText, FormancyTextPipe],
  template: `
    <!-- The field's control id on the group, as the rating, the ranking and the matrix
         carry it, and each radio keeps its own <id>:<value>: the error summary's link and
         a failed submit focus by this id, and a fieldset takes no focus, so focusControl
         moves into the first radio. Without it no element had the id and both left focus
         where it was (0186). -->
    <fieldset
      [id]="control().id"
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
        <span data-formancy-part="required-hint" [id]="field.snapshot().ids.hint">{{ 'form.required' | formancyText }}</span>
      }
      @if (field.snapshot().description; as said) {
        <p data-formancy-part="description" [id]="field.snapshot().ids.description">{{ said }}</p>
      }
      @for (option of options(); track option.value) {
        <span data-formancy-part="radio-option">
          <input
            type="radio"
            [id]="optionId(option)"
            [attr.name]="control().name"
            [value]="option.value"
            [checked]="field.snapshot().value === option.value"
            [disabled]="field.snapshot().disabled"
            (change)="field.setValue(option.value)"
            (blur)="field.touch()"
          />
          <!-- The picture inside the label, so pressing it chooses the option and its text
               alternative joins the option's name. One line, because whitespace inside a
               label leaks into that name, except the one space after the picture, which
               is meant (&ngsp;, which Angular keeps where it strips a plain space):
               without it the alternative and the label run together. -->
          <label [attr.for]="optionId(option)">@if (option.image; as image) {<img data-formancy-part="option-image" [src]="image.src" [alt]="image.alt" loading="lazy" decoding="async" />&ngsp;}{{ option.label }}</label>
        </span>
      }
      @if (showError()) {
        <p data-formancy-part="error" [id]="field.snapshot().props.error.id" [formancyErrorText]="field.snapshot()"></p>
      }
    </fieldset>
  `,
})
export class FormancyRadioGroupField extends FieldComponentBase {
  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })


  protected optionId(option: { value: string }): string {
    return `${this.field.snapshot().ids.control}:${option.value}`
  }
}
