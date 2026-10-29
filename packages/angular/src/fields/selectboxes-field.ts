import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal } from '@angular/core'
import { ticked } from '@formancy/core'
import { optionsStatus } from '@formancy/core/words'
import { narrowOptionsByLabel } from '@formancy/spec'
import { FormancyTextPipe, injectFormText } from '../text.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'
import { FormancyErrorText } from './error-text.js'


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
  imports: [FormancyFieldShell, FormancyTextPipe],
  template: `
    @if (remote.unavailable()) {
      <!-- The document names a source this deployment does not have: said where the
           combobox would be, which could never answer, as the select says it (0215). Its
           control's id is on the sentence, so a summary's link lands there (0221). -->
      <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
        <p data-formancy-part="options-unavailable" [id]="field.snapshot().ids.control" tabindex="-1">{{ 'options.unavailable' | formancyText: { source: sourceName() } }}</p>
      </formancy-field-shell>
    } @else {
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <div data-formancy-part="tagpicker">
        @if (chosen().length > 0) {
          <ul data-formancy-part="tagpicker-chips" [attr.aria-label]="'tagpicker.chosen' | formancyText: { label: context.label }">
            @for (value of chosen(); track value) {
              <li data-formancy-part="tagpicker-chip">
                {{ labelFor(value) }}
                <button
                  type="button"
                  data-formancy-part="tagpicker-remove"
                  [attr.aria-label]="'tagpicker.remove' | formancyText: { option: labelFor(value) }"
                  [disabled]="field.snapshot().disabled"
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
            [disabled]="field.snapshot().disabled"
            [attr.aria-expanded]="expanded()"
            [attr.aria-controls]="listboxId()"
            aria-autocomplete="list"
            [attr.aria-busy]="remote.busy() ? true : null"
            [value]="query()"
            (input)="onQuery($event)"
            (click)="open.set(true)"
            (keydown)="onKey($event)"
            (blur)="onBlur()"
          />
          <ul
            [id]="listboxId()"
            role="listbox"
            [attr.aria-label]="'options.suggestions' | formancyText: { label: context.label }"
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
        <!-- Only a sourced tag picker has anything to say, and never in the error region: a
             source being down is not a wrong answer. -->
        @if (remote.sourced()) {
          <p role="status" data-formancy-part="tagpicker-status" [attr.data-state]="remote.failed() ? 'failed' : null">{{ sourceStatus() }}</p>
        }
      </div>
    </formancy-field-shell>
    }
  `,
})
export class FormancyTagPickerField extends FieldComponentBase {
  /** What is typed, which is what a source is asked: the base's query, so the search reads it. */
  protected readonly query = this.sourceQuery
  protected readonly open = signal(false)
  protected readonly sourceName = computed(() => this.field.snapshot().def.optionsSource ?? '')
  private readonly words = injectFormText()

  protected readonly chosen = computed(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? value.map(String) : []
  })

  /**
   * Not already chosen, then narrowed by what was typed — the document's options. A source's
   * rows are not narrowed again: it was handed the query, as the typeahead's is (0215).
   */
  protected readonly matches = computed(() => {
    const remaining = this.offered().filter((option) => !this.chosen().includes(option.value))
    return this.remote.sourced() ? remaining : narrowOptionsByLabel(remaining, this.query())
  })

  /**
   * A field a rule disabled draws no list, whatever the person had open: the list and the
   * chips' remove buttons are outside the text box, and the engine does not refuse a value
   * set on a disabled field, so each element is its own guard (B6a). Derived rather than
   * closed in answer to the rule, as the typeahead's is (0177).
   */
  protected readonly expanded = computed(
    () => this.open() && !this.field.snapshot().disabled && this.matches().length > 0,
  )
  protected readonly listboxId = computed(() => `${this.control().id}:listbox`)

  /** In the typeahead's words: typing asks again, and what is left out is said while open. */
  protected readonly sourceStatus = computed(() =>
    optionsStatus(this.words, {
      control: 'typeahead',
      open: this.open() && !this.field.snapshot().disabled,
      disabled: this.field.snapshot().disabled,
      failed: this.remote.failed(),
      busy: this.remote.busy(),
      needs: this.remote.needs(),
      query: this.query(),
      completeness: this.remote.completeness(),
    }),
  )

  protected labelFor(value: string): string {
    return this.offered().find((option) => option.value === value)?.label ?? value
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value)
    this.open.set(true)
  }

  protected add(value: string): void {
    // The options' own order, and an exclusive option alone: the core's one function, as the
    // React binding's (0199).
    this.field.setValue(ticked(this.field.snapshot().def, this.chosen(), value, true))
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
  imports: [FormancyErrorText, FormancyTagPickerField, FormancyTextPipe],
  template: `
    @if (tagpicker()) {
      <!-- A widget changes the CONTROL and nothing else: same field, same
           accessible name, same stored answer — an array of offered option values
           in the options' own order. Dispatched here rather than in the registry,
           exactly as the select hands over to the typeahead. -->
      <formancy-tagpicker-field />
    } @else {
    <!-- The field's control id on the group, and each box keeps its own, as the radio
         group does and for its reason (0186). -->
    <fieldset
      [id]="control().id"
      data-formancy-part="field"
      [attr.data-formancy-field-path]="context.path"
      [attr.data-state]="showError() ? 'invalid' : 'valid'"
      [attr.aria-describedby]="control()['aria-describedby']"
      [attr.aria-busy]="remote.busy() ? true : null"
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
      @if (remote.unavailable()) {
        <!-- A source the deployment does not have: said where the boxes would be, rather
             than an empty group that collects nothing (0215). Focus moved by the group's id
             lands here (0221). -->
        <p data-formancy-part="options-unavailable" tabindex="-1">{{ 'options.unavailable' | formancyText: { source: sourceName() } }}</p>
      }
      @for (option of offered(); track option.value) {
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
      <!-- What a sourced list says, never in the error region; and, when its source failed,
           a way to ask again, since a list that did not arrive may have no box to move to. -->
      @if (remote.sourced() && !remote.unavailable()) {
        <p role="status" data-formancy-part="checkbox-status" [attr.data-state]="remote.failed() ? 'failed' : null">{{ sourceStatus() }}</p>
      }
      @if ((remote.failed() || retrying()) && !field.snapshot().disabled) {
        <button type="button" data-formancy-part="checkbox-retry" (click)="retry()">{{ 'options.retry' | formancyText }}</button>
      }
      @if (showError()) {
        <p data-formancy-part="error" [id]="field.snapshot().props.error.id" [formancyErrorText]="field.snapshot()"></p>
      }
    </fieldset>
    }
  `,
})
export class FormancySelectBoxesField extends FieldComponentBase {
  protected readonly tagpicker = computed(() => this.field.snapshot().def.widget === 'tagpicker')
  protected readonly sourceName = computed(() => this.field.snapshot().def.optionsSource ?? '')
  private readonly words = injectFormText()

  /** This one hands a tag picker over, which does its own asking: asked here too, the source
   *  answered twice per search and one answer was read by nobody (0215). */
  protected override sourceEnabled(): boolean {
    return !this.tagpicker()
  }

  /**
   * Asking again from the button keeps the button until the source answers, as the React
   * binding's does: it goes with the failure, and focus on an element that goes falls to the
   * page, where nothing is said, since success is not announced. Answered, the focus moves to
   * the first box once it is drawn, if it was still on the button; failed again, it stays.
   */
  protected readonly retrying = signal(false)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly injector = inject(Injector)
  private readonly focusAfterRetry = effect(() => {
    if (!this.retrying() || this.remote.busy() || this.remote.failed()) return
    this.retrying.set(false)
    const again = this.host.nativeElement.querySelector('[data-formancy-part="checkbox-retry"]')
    if (again === null || document.activeElement !== again) return
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus(), {
      injector: this.injector,
    })
  })

  protected retry(): void {
    this.retrying.set(true)
    this.remote.retry()
  }

  /** In a select's words — nobody types into a list of ticks — but a failure is its own. */
  protected readonly sourceStatus = computed(() =>
    optionsStatus(this.words, {
      control: 'ticks',
      open: true,
      disabled: this.field.snapshot().disabled,
      failed: this.remote.failed(),
      busy: this.remote.busy(),
      needs: this.remote.needs(),
      query: '',
      completeness: this.remote.completeness(),
    }),
  )

  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })


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
    // Rebuilt in the options' own order rather than the order they were ticked, so two people
    // choosing the same answers store the same array, and an exclusive option ticked alone —
    // the core's one function, so the React binding stores it identically (0199).
    this.field.setValue(ticked(this.field.snapshot().def, this.chosen(), value, on))
  }
}
