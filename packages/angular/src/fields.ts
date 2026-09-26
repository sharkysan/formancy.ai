import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core'
import type { ElementRef, Type } from '@angular/core'
import { applyRichCommand } from '@formancy/spec'
import type { FieldOption, FieldType, RichCommand } from '@formancy/spec'
import { injectField } from './field.js'
import type { FieldBinding } from './field.js'
import { injectEngine } from './provide.js'
import { injectFieldContext } from './registry.js'
import { FormancyRichText } from './rich-text.js'
import { injectRichTextEditorFactory } from './rich-text-editor.js'
import type { RichTextEditorHandle } from './rich-text-editor.js'
import { injectUploader } from './uploads.js'
import type { StoredFile } from './uploads.js'

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
    <div
      data-formancy-part="field"
      [attr.data-formancy-field-path]="path()"
      [attr.data-state]="showError() ? 'invalid' : 'valid'"
    >
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
  /** Inert here; read by tools outside the renderer. See FormancyLayout. */
  readonly path = input<string>('')

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
  private readonly engine = injectEngine()

  /**
   * Option labels resolved to strings, since a label may be a reference into
   * the message catalogue. Falling back to the stored value keeps an
   * untranslated option selectable rather than blank.
   */
  protected readonly options = computed<ReadonlyArray<{ value: string; label: string }>>(() =>
    (this.field.snapshot().def.options ?? []).map((option: FieldOption) => ({
      value: option.value,
      label: this.engine.text(option.label) ?? option.value,
    })),
  )
}

@Component({
  selector: 'formancy-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
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
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
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
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
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
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
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
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
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
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
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
  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })

  protected readonly errorText = computed(() => this.field.snapshot().errors.join(', '))

  protected optionId(option: { value: string }): string {
    return `${this.field.snapshot().ids.control}:${option.value}`
  }
}

/**
 * The built-in unstyled components. `null` means the type renders nothing here:
 * hidden and static are non-inputs, and the container types are laid out by
 * their own machinery, not by a leaf slot.
 */
/**
 * Text the reader sees that collects nothing — a heading, an explanation, a
 * notice.
 *
 * Not a label, because there is no control for one to label. Not a heading
 * element either: the spec does not say what level it would be, and guessing
 * produces a document outline that skips levels.
 */
@Component({
  selector: 'formancy-static-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p data-formancy-part="static">{{ context.label }}</p>`,
})
export class FormancyStaticField {
  protected readonly context = injectFieldContext()
}

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
@Component({
  selector: 'formancy-select-boxes-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
          <label [attr.for]="optionId(option)">{{ option.label }}</label>
        </span>
      }
      @if (showError()) {
        <p data-formancy-part="error" [id]="field.snapshot().props.error.id">{{ errorText() }}</p>
      }
    </fieldset>
  `,
})
export class FormancySelectBoxesField extends FieldComponentBase {
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

/**
 * Formatted text, written as the restricted markup the spec defines.
 *
 * **Two surfaces over one value.** By default a toolbar over a textarea, whose
 * transformations live in `@formancy/spec` so a Bold button cannot mean one
 * thing here and something else in React. When the host provides an editor
 * factory, a contenteditable surface instead — which was refused in
 * [0052](../../../docs/decisions/0052-richtext-is-not-html.md) and admitted in
 * [0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md) once
 * the reason was read properly: 0052's argument was against a string of HTML
 * crossing the boundary, not against contenteditable, and a ProseMirror schema
 * built from the grammar cannot produce markup the grammar has no way to store.
 *
 * The factory is the host's because ProseMirror is larger than this whole
 * package and most forms have no rich-text field. Its absence is the default and
 * costs only the WYSIWYG surface.
 */
@Component({
  selector: 'formancy-rich-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell, FormancyRichText],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      @if (make !== null) {
        <!-- The toolbar stays. An editor library brings keyboard shortcuts and
             no toolbar UI, so leaving ours out left Bold reachable by Ctrl+B and
             by no visible control. One toolbar drives either surface, over the
             same RichCommand values. The preview does go: the surface IS the
             preview, which is the whole reason somebody wanted it. -->
        <div
          role="toolbar"
          [attr.aria-label]="toolbarLabel()"
          data-formancy-part="richtext-toolbar"
          (keydown)="onToolbarKey($event)"
        >
          @for (entry of commands; track entry.command; let i = $index) {
            <button
              type="button"
              #toolbarButton
              [disabled]="field.snapshot().disabled"
              [attr.tabindex]="i === active() ? 0 : -1"
              data-formancy-part="richtext-button"
              (focus)="active.set(i)"
              (click)="press(entry.command)"
            >
              <span aria-hidden="true">{{ entry.glyph }}</span>
              <span data-formancy-part="visually-hidden">{{ entry.name }}</span>
            </button>
          }
        </div>
        <div #editorHost data-formancy-part="richtext-editor" (blur)="field.touch()"></div>
      } @else {
      <!-- The ARIA toolbar pattern: ONE tab stop for the row, arrows within
           it. Five buttons that each took a tab press would put five stops
           between a keyboard user and the box they came to type in. -->
      <div
        role="toolbar"
        [attr.aria-label]="toolbarLabel()"
        data-formancy-part="richtext-toolbar"
        (keydown)="onToolbarKey($event)"
      >
        @for (entry of commands; track entry.command; let i = $index) {
          <button
            type="button"
            #toolbarButton
            [disabled]="field.snapshot().disabled"
            [attr.tabindex]="i === active() ? 0 : -1"
            data-formancy-part="richtext-button"
            (focus)="active.set(i)"
            (click)="press(entry.command)"
          >
            <span aria-hidden="true">{{ entry.glyph }}</span>
            <span data-formancy-part="visually-hidden">{{ entry.name }}</span>
          </button>
        }
      </div>
      <textarea
        #box
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-describedby]="control()['aria-describedby']"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [disabled]="field.snapshot().disabled"
        rows="5"
        [value]="text()"
        (keydown)="onKey($event)"
        (input)="field.setValue($any($event.target).value)"
        (blur)="field.touch()"
      ></textarea>
      <div data-formancy-part="richtext-preview">
        <formancy-rich-text [source]="text()" />
      </div>
      }
    </formancy-field-shell>
  `,
})
export class FormancyRichTextField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected readonly active = signal(0)

  protected readonly commands: ReadonlyArray<{
    command: RichCommand
    name: string
    glyph: string
  }> = [
    { command: 'strong', name: 'Bold', glyph: 'B' },
    { command: 'emphasis', name: 'Italic', glyph: 'I' },
    { command: 'link', name: 'Link', glyph: '↗' },
    { command: 'bulletList', name: 'Bulleted list', glyph: '•' },
    { command: 'orderedList', name: 'Numbered list', glyph: '1.' },
  ]

  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box')
  private readonly toolbarButtons = viewChildren<ElementRef<HTMLButtonElement>>('toolbarButton')

  protected readonly make = injectRichTextEditorFactory()
  private readonly editorHost = viewChild<ElementRef<HTMLDivElement>>('editorHost')
  private handle: RichTextEditorHandle | undefined

  /**
   * Mount once, then feed.
   *
   * A contenteditable rebuilt when the value changes loses the caret, the
   * selection and the undo stack, which is the difference between an editor and
   * a box that fights you. So the effect mounts on its first run and afterwards
   * only pushes a value that came from somewhere other than this editor —
   * comparing first, because pushing back the change it just reported would move
   * the caret to the end after every keystroke.
   */
  private readonly mounted = effect(() => {
    const next = this.text()
    const element = this.editorHost()?.nativeElement
    const make = this.make
    if (element === undefined || make === null) return

    if (this.handle === undefined) {
      this.handle = make({
        element,
        value: next,
        onChange: (value) => {
          this.field.setValue(value)
        },
        editable: this.field.snapshot().disabled !== true,
        attributes: this.editorAttributes(),
      })
      return
    }

    if (this.handle.value() === next) return

    // And never while the person is in the editor.
    //
    // Without this the editor reverts its own change. Pressing Bold updates the
    // document, reports the new answer, and the signal re-runs this effect — but
    // for one run `next` is still the answer from BEFORE the command. That run
    // sees a difference, pushes the stale answer back, un-bolds the word and
    // reports THAT. Observed in the playground: the stored value went to
    // `**hello**` and back to `hello` on its own.
    //
    // A value arriving from elsewhere while somebody is typing is rare; losing
    // what they just did is not recoverable. So the sync waits for them to leave,
    // and the comparison above catches it then.
    if (element.contains(document.activeElement)) return

    this.handle.setValue(next)
  })

  private readonly cleanup = inject(DestroyRef).onDestroy(() => {
    // ProseMirror holds DOM listeners and a plugin state. One left per mounted
    // form is a leak that only shows up in a long-lived admin app.
    this.handle?.destroy()
    this.handle = undefined
  })

  /**
   * The engine's wiring, passed to the surface rather than invented on it.
   *
   * Byte-identical to what the React binding passes, which is the point: the ids
   * and the describedby composition are computed once in `@formancy/core`, and a
   * renderer that assembled its own would be the implementation that drifts.
   * `aria-labelledby` rather than a `<label for>` because the surface is a div,
   * and `for` does not reach one.
   */
  private editorAttributes(): Record<string, string> {
    const control = this.control()
    const props = this.field.snapshot().props
    const attributes: Record<string, string> = {
      id: control.id,
      'aria-labelledby': props.label.id,
      // The editing surface is a CHILD of the mount point, so it is the element
      // a theme has to style. Named here rather than left as the editor
      // library's own class, so a theme is not coupled to TipTap.
      'data-formancy-part': 'richtext-surface',
    }
    const describedby = control['aria-describedby']
    if (describedby !== undefined) attributes['aria-describedby'] = describedby
    if (control['aria-invalid'] !== undefined) attributes['aria-invalid'] = 'true'
    if (control['aria-required'] !== undefined) attributes['aria-required'] = 'true'
    return attributes
  }

  /** Named with the field: a form may have several of these, and "toolbar"
   *  five times says nothing about which question is being answered. */
  protected toolbarLabel(): string {
    const label = this.context.label
    return typeof label === 'string' ? `Formatting for ${label}` : 'Formatting'
  }

  protected press(command: RichCommand): void {
    if (command === 'link') {
      // A prompt rather than a dialog this package would then own the
      // accessibility of. A host wanting its own replaces the field through
      // the component registry.
      const href = window.prompt('Address for the link')
      if (href === null || href === '') return
      this.run(command, href)
      return
    }
    this.run(command)
  }

  protected onKey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    const command = key === 'b' ? 'strong' : key === 'i' ? 'emphasis' : undefined
    if (command === undefined) return
    event.preventDefault()
    this.run(command)
  }

  protected onToolbarKey(event: KeyboardEvent): void {
    const last = this.commands.length - 1
    const to =
      event.key === 'ArrowRight'
        ? this.active() + 1
        : event.key === 'ArrowLeft'
          ? this.active() - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined
    if (to === undefined) return
    event.preventDefault()
    const index = (to + this.commands.length) % this.commands.length
    this.active.set(index)
    this.toolbarButtons()[index]?.nativeElement.focus()
  }

  private run(command: RichCommand, href?: string): void {
    // With a WYSIWYG surface mounted the markers are not what somebody
    // typed, so inserting them would put literal asterisks into their
    // answer. The command goes to the editor instead.
    if (this.handle !== undefined) {
      this.handle.run(command, href)
      return
    }

    const element = this.box()?.nativeElement
    if (element === undefined) return

    const next = applyRichCommand(
      command,
      { value: this.text(), start: element.selectionStart, end: element.selectionEnd },
      href === undefined ? {} : { href },
    )
    this.field.setValue(next.value)
    // After the signal has been written through to the DOM. An editor that
    // drops the caret to the end after every button is one nobody can use for
    // a second word.
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.start, next.end)
    })
  }
}

/**
 * Attached files.
 *
 * The control picks files; an injected uploader puts them somewhere and
 * reports what was stored. Without one the field is read-only and says so,
 * rather than accepting a file it has nowhere to put.
 */
@Component({
  selector: 'formancy-file-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      @if (upload === null) {
        <p data-formancy-part="file-unavailable">
          This form cannot accept files here, because no upload destination has been configured.
        </p>
      } @else {
        <input
          type="file"
          [id]="control().id"
          [attr.name]="control().name"
          [attr.aria-describedby]="control()['aria-describedby']"
          [attr.accept]="acceptAttribute()"
          [attr.multiple]="multiple() ? '' : null"
          [disabled]="field.snapshot().disabled || busy()"
          (change)="pick($event)"
        />
      }

      @if (files().length > 0) {
        <ul data-formancy-part="file-list">
          @for (file of files(); track file.id) {
            <li data-formancy-part="file-item">
              <span>{{ file.name }}</span>
              <button
                type="button"
                [disabled]="field.snapshot().disabled"
                (click)="remove(file.id)"
              >
                <!-- Named with the file, so a screen reader user hears which
                     attachment a button removes rather than "remove" six
                     times over. -->
                Remove {{ file.name }}
              </button>
            </li>
          }
        </ul>
      }

      <!-- One polite region per field for the upload itself: the form's error
           region belongs to validation, and a failed upload is not one. -->
      <p role="status" data-formancy-part="file-status">{{ status() }}</p>
    </formancy-field-shell>
  `,
})
export class FormancyFileField extends FieldComponentBase {
  protected readonly upload = injectUploader()
  protected readonly busy = signal(false)
  protected readonly failure = signal<string | undefined>(undefined)

  protected readonly files = computed<readonly StoredFile[]>(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? (value as StoredFile[]) : []
  })

  protected readonly status = computed(() => (this.busy() ? 'Uploading…' : (this.failure() ?? '')))

  protected acceptAttribute(): string | null {
    const accept = this.field.snapshot().def.accept
    return accept === undefined || accept.length === 0 ? null : accept.join(',')
  }

  protected multiple(): boolean {
    const max = this.field.snapshot().def.maxItems
    return max === undefined || max > 1
  }

  protected remove(id: string): void {
    this.field.setValue(this.files().filter((file) => file.id !== id))
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement
    const picked = input.files
    if (picked === null || picked.length === 0 || this.upload === null) return
    void this.store(Array.from(picked)).finally(() => {
      input.value = ''
    })
  }

  private async store(picked: readonly File[]): Promise<void> {
    this.busy.set(true)
    this.failure.set(undefined)

    // Each file succeeds or fails on its own.
    //
    // The first version collected them into an array and set the value once, so
    // a throw on the third of five discarded the two that had ALREADY uploaded:
    // their bytes were in storage, the submission never mentioned them, the
    // collector reclaimed them within the day, and the person was told the
    // upload failed when half of it had not. Whose fault the failure is does not
    // change who loses the file. The React binding does exactly the same thing.
    const uploaded: StoredFile[] = []
    const refused: string[] = []

    for (const file of picked) {
      try {
        uploaded.push(await this.upload!(file))
      } catch (error) {
        refused.push(`${file.name} (${error instanceof Error ? error.message : String(error)})`)
      }
    }

    // Recorded before the failure is reported, so nothing that reached storage
    // is left unclaimed while somebody reads the message.
    if (uploaded.length > 0) this.field.setValue([...this.files(), ...uploaded])

    if (refused.length > 0) {
      // Named, because "the upload failed" over a list of five attachments does
      // not say which one to try again.
      this.failure.set(
        refused.length === 1
          ? `${refused[0]!} was not attached.`
          : `${String(refused.length)} files were not attached: ${refused.join(', ')}.`,
      )
    }

    this.busy.set(false)
    this.field.touch()
  }
}

export const DEFAULT_FIELD_COMPONENTS: Record<FieldType, Type<unknown> | null> = {
  text: FormancyTextField,
  textarea: FormancyTextareaField,
  number: FormancyNumberField,
  checkbox: FormancyCheckboxField,
  date: FormancyDateField,
  select: FormancySelectField,
  radio: FormancyRadioGroupField,
  selectboxes: FormancySelectBoxesField,
  file: FormancyFileField,
  richtext: FormancyRichTextField,
  hidden: null,
  static: FormancyStaticField,
  group: null,
  page: null,
  repeater: null,
}
