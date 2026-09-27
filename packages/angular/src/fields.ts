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
import { applyRichCommand, narrowOptionsByLabel } from '@formancy/spec'
import type { FieldOption, FieldType, RichCommand } from '@formancy/spec'
import { injectField } from './field.js'
import type { FieldBinding } from './field.js'
import { injectEngine } from './provide.js'
import { injectFieldContext } from './registry.js'
import { FormancyRichText } from './rich-text.js'
import { injectRichTextEditorFactory } from './rich-text-editor.js'
import type { RichTextEditorHandle } from './rich-text-editor.js'
import { injectScanner } from './scanning.js'
import { injectSourcedOptions } from './sourced-options.js'
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
  protected readonly engine = injectEngine()

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

  /**
   * What the control types into, when it has something to type into.
   *
   * A plain `<select>` never writes to it, so its source is asked for everything and
   * shows what fits; the typeahead writes every keystroke.
   */
  protected readonly sourceQuery = signal('')

  /** The remote half, or an inert one for the ordinary field that lists its options. */
  protected readonly remote = injectSourcedOptions(
    computed(() => {
      const def = this.field.snapshot().def
      return { key: def.key, ...(def.optionsSource === undefined ? {} : { optionsSource: def.optionsSource }) }
    }),
    computed(() => {
      const value = this.field.snapshot().value
      return typeof value === 'string' && value !== '' ? value : undefined
    }),
    this.sourceQuery,
    () => this.engine.locale(),
  )

  /**
   * The options to offer: the document's, or the deployment's.
   *
   * The stored answer is always offerable even when the current query does not match
   * it — a control that dropped it would show an empty box over an answer the form
   * holds, and the next blur would look like the person cleared it.
   */
  protected readonly offered = computed<ReadonlyArray<{ value: string; label: string }>>(() => {
    if (!this.remote.sourced()) return this.options()
    const rows = [...this.remote.rows()]
    const stored = this.field.snapshot().value
    if (typeof stored === 'string' && stored !== '' && !rows.some((row) => row.value === stored)) {
      rows.unshift({ value: stored, label: this.remote.named().get(stored) ?? stored })
    }
    return rows
  })
}

/**
 * A single-line answer, and — with `widget: "scanner"` — a camera route to the same
 * string.
 *
 * The input is the control in both cases, never a second one beside it: typing is the
 * accessibility floor and the fallback at once, so it is what is always there and the
 * scan button is what is sometimes added. With no scanner supplied the markup is the
 * default control exactly, because a Scan button that opens nothing is worse than no
 * button ([0071](../../../docs/decisions/0071-a-scanner-is-supplied-not-built.md)).
 *
 * The React binding renders the same three elements for the same reasons.
 */
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
      @if (scannable()) {
        <!-- The word is the visible label and the field's name completes the
             accessible one, so three scannable fields on a page do not offer three
             buttons called "Scan" — and the visible text is still contained in the
             accessible name (WCAG 2.5.3). One line, because element-internal
             whitespace leaks into the accessible name. -->
        <!-- Disabled only when the FIELD is, never while scanning: disabling the button
             somebody just pressed blurs it and the browser resets focus to the document
             body, so a keyboard user is returned to the top of the page and told to type
             instead into a field they must find again. Busy is said with aria-busy, which
             does not touch focus, and the guard in read() does what disabled was doing.
             Kept on one line because element-internal whitespace leaks into the accessible
             name. -->
        <button type="button" data-formancy-part="scanner-button" [disabled]="field.snapshot().disabled" [attr.aria-busy]="scanning() ? 'true' : null" (click)="read()">Scan <span data-formancy-part="visually-hidden">{{ context.label }}</span></button>
        <!-- The camera's own progress and its failures, in this field's polite
             region. NOT the error region: that one is the control's describedby
             target, it holds the engine's verdicts, and a refused permission put
             there would describe a hardware problem as a wrong answer. The same
             shape the file field uses for an upload. -->
        <p role="status" data-formancy-part="scanner-status">{{ status() }}</p>
      }
    </formancy-field-shell>
  `,
})
export class FormancyTextField extends FieldComponentBase {
  private readonly scan = injectScanner()
  protected readonly scanning = signal(false)
  /** A device failure, held here rather than in the field's errors. See above. */
  private readonly trouble = signal<string | undefined>(undefined)

  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  /**
   * A computed over the field's SIGNAL, not over `engine.getFieldSnapshot` — the
   * widget can arrive with a new document, and a plain method call is not a
   * dependency an OnPush component re-runs for.
   */
  protected readonly scannable = computed(
    () => this.scan !== null && this.field.snapshot().def.widget === 'scanner',
  )

  protected readonly status = computed(() =>
    this.scanning() ? 'Scanning…' : (this.trouble() ?? ''),
  )

  protected onInput(event: Event): void {
    this.commit((event.target as HTMLInputElement).value)
  }

  /**
   * The ONE place a text field's answer is written, typed or scanned.
   *
   * Structural rather than careful: the parameter is a `string`, so there is no path
   * from the camera to `setValue` that could store something typing could not — the
   * line a widget may never cross
   * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
   */
  private commit(text: string): void {
    // See the React binding: `<input type="text">` strips CR and LF from anything typed or
    // pasted, so a multi-line code payload stored verbatim would be an answer the default
    // control cannot produce -- the one thing a widget may never do.
    this.field.setValue(text.replace(/[\r\n]/g, ''))
  }

  protected async read(): Promise<void> {
    // Re-entrancy, which `disabled` used to prevent: a second press while a scan is in
    // flight is ignored rather than opening a second camera session.
    if (this.scan === null || this.scanning()) return
    this.scanning.set(true)
    this.trouble.set(undefined)
    try {
      const text = await this.scan({ label: this.context.label, path: this.context.path })
      // Nobody scanned anything: the sheet was closed, or they changed their mind.
      // Not a failure, and an apology in a live region for a decision somebody made
      // on purpose is noise.
      if (text === null) return
      if (typeof text !== 'string') {
        // A host written in plain JavaScript can resolve with anything. Reported as
        // the device failure it is, rather than stored — an object in a text field is
        // exactly what `commit` exists to make impossible.
        this.trouble.set(
          'Scanning did not work: the scanner did not return text. Type the value instead.',
        )
        return
      }
      // Stored as typed, THEN touched — so a value the field's `pattern` refuses
      // shows the engine's own error rather than being dropped. Dropping it would
      // discard the only record of what the camera read and leave the field looking
      // empty, which is the worse of the two failures by some distance.
      this.commit(text)
      this.field.touch()
    } catch (error) {
      this.trouble.set(
        `Scanning did not work: ${
          error instanceof Error ? error.message : String(error)
        }. Type the value instead.`,
      )
    } finally {
      this.scanning.set(false)
    }
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
  selector: 'formancy-time-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <input
        type="time"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [attr.min]="earliest()"
        [attr.max]="latest()"
        [disabled]="control().disabled === true"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
/**
 * A time of day, as `HH:MM`.
 *
 * `<input type="time">` gives the platform's picker, keyboard handling and locale
 * display — a 12-hour clock where the reader expects one — while its `value` is
 * always 24-hour `HH:MM`. Exactly the split the format wants: the reader sees their
 * convention, the answer records one canonical shape.
 *
 * No `step`, so the browser offers no seconds. A time answer has none, and a control
 * offering precision the format discards loses what somebody typed.
 */
export class FormancyTimeField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  /* Bounds handed to the browser as well as checked by the engine. The engine's
     check is the truth — it runs again on the server — and these let the platform
     grey out what it will not accept, which beats a message after the fact. */
  protected readonly earliest = computed(() => {
    const bound = this.field.snapshot().def.earliest
    return typeof bound === 'string' ? bound : null
  })

  protected readonly latest = computed(() => {
    const bound = this.field.snapshot().def.latest
    return typeof bound === 'string' ? bound : null
  })

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.field.setValue(raw === '' ? null : raw)
  }
}

@Component({
  selector: 'formancy-datetime-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <input
        type="datetime-local"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="localText()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
/**
 * An instant, stored as `YYYY-MM-DDTHH:MM:SSZ`.
 *
 * `datetime-local` because no browser has a zoned datetime input, so the control
 * shows a local wall clock and this converts. The conversion is why this is not the
 * date field with another `type`:
 *
 * - **In:** the control gives `YYYY-MM-DDTHH:MM` in the reader's own zone, and `new
 *   Date(local)` reads a zoneless string as local time — which is what is wanted at
 *   the moment somebody types, and exactly what `bindTimestamp` refuses for a value
 *   already stored, because the zone is not knowable later.
 * - **Out:** the stored instant is rendered back into local parts for the control,
 *   never `toISOString()`, which would show UTC in a box the browser labels local.
 *
 * Seconds are therefore `00` in any answer a person typed. The format keeps them
 * because a machine-supplied answer has them, and one fixed width is what makes
 * ordering work.
 */
export class FormancyDateTimeField extends FieldComponentBase {
  protected readonly localText = computed(() => {
    const value = this.field.snapshot().value
    if (typeof value !== 'string' || value === '') return ''
    const instant = new Date(value)
    if (Number.isNaN(instant.getTime())) return ''
    const pad = (part: number): string => String(part).padStart(2, '0')
    return (
      `${String(instant.getFullYear())}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
      `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`
    )
  })

  protected onInput(event: Event): void {
    const local = (event.target as HTMLInputElement).value
    if (local === '') {
      this.field.setValue(null)
      return
    }
    const instant = new Date(local)
    // A control can hand back something unparseable mid-edit. Null rather than a
    // malformed string keeps the stored answer always either empty or canonical,
    // which is what the engine's shape check assumes.
    this.field.setValue(
      Number.isNaN(instant.getTime()) ? null : `${instant.toISOString().slice(0, 19)}Z`,
    )
  }
}

/**
 * `widget: "typeahead"` - the same select, narrowed by typing.
 *
 * An ARIA 1.2 editable combobox over a listbox popup: a text box with
 * `role="combobox"` and a `<ul role="listbox">` of `<li role="option">`. DOM focus
 * never leaves the text box, so the arrowed-over option is named by
 * `aria-activedescendant` - the only thing that says where somebody is when what
 * they are moving through does not hold focus.
 *
 * **The list element exists while the popup is collapsed.** `aria-expanded` and
 * `aria-controls` are required properties of the role, and an `aria-controls`
 * pointing at an element that is not there is an unresolvable IDREF - so the
 * listbox is rendered and `hidden` rather than created when it opens.
 *
 * `aria-autocomplete="list"`, never `"both"`: nothing is written into the box on
 * the person's behalf, and `"both"` announces an inline completion that does not
 * exist. No `aria-haspopup`: `listbox` is the role's implicit popup.
 *
 * While a source is being asked, the box carries `aria-busy` and is never disabled:
 * disabling the element somebody just typed into blurs it, and the browser then
 * resets focus to the document body — the same reason the scanner's button stays
 * enabled while a scan is in flight.
 *
 * `aria-selected` is on the CHOSEN option and nothing else. Following the arrow
 * keys with it tells a screen reader the answer changed every time somebody
 * pressed Down to read the next row.
 *
 * **It cannot store what somebody typed.** `setValue` is reached from two places
 * here, with an option's own value or with `null`, and the text goes nowhere but
 * the filter - which is what makes
 * [0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)
 * structural rather than remembered. The filter itself is
 * `narrowOptionsByLabel` from `@formancy/spec`, the same function React calls, so
 * a query cannot narrow one way here and another way there.
 *
 * Every piece of state is a signal, and the field's own state arrives through
 * `injectField`, which is a signal fed by `engine.subscribeField`. Reading
 * `engine.getFieldSnapshot` instead - or wrapping a plain call in `computed()`,
 * which has no reactive dependency at all - renders this once and never again.
 * That bug has been written twice in this repository.
 */
@Component({
  selector: 'formancy-typeahead-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <!-- The popup's containing block, and the reason it is an element rather than
           nothing at all.

           The popup was absolutely positioned with 'top: auto', on the reasoning that
           it would then land at its STATIC position -- where it would have sat in the
           flow, directly under the box. That holds inside a block container and NOT
           inside a grid or flex one, and every theme lays a field out with
           'display: grid'. For an absolutely positioned child of a grid container the
           static position is the container's own content-box origin, so the list opened
           over its own label and box rather than under them. Measured in the playground
           before the fix: the field's top edge was 457px, an in-flow child would have
           sat at 537px, and the popup sat at 459px.

           So the popup is given a containing block that wraps the control and nothing
           else, and every theme positions it against that explicitly. The status region
           stays OUTSIDE it, because it is a row of the field's grid exactly as the
           error region is. The React binding does the same, for the same reason. -->
      <div data-formancy-part="typeahead-anchor">
        <input
          type="text"
          role="combobox"
          [id]="control().id"
          [attr.name]="control().name"
          [attr.aria-invalid]="control()['aria-invalid']"
          [attr.aria-required]="control()['aria-required']"
          [attr.aria-describedby]="control()['aria-describedby']"
          [disabled]="control().disabled === true"
          data-formancy-part="typeahead"
          autocomplete="off"
          aria-autocomplete="list"
          [attr.aria-busy]="remote.busy() ? 'true' : null"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="listboxId()"
          [attr.aria-activedescendant]="activeId()"
          [value]="text()"
          (input)="onInput($event)"
          (click)="open.set(true)"
          (keydown)="onKeyDown($event)"
          (blur)="onBlur()"
        />
        <!-- Named, because the listbox role is one whose accessible name is required.
             Not with the name the field already has: two elements answering to the
             same accessible name make every query by that name ambiguous. -->
        <ul
          [id]="listboxId()"
          role="listbox"
          [attr.aria-label]="popupLabel()"
          data-formancy-part="typeahead-listbox"
          [hidden]="!expanded()"
        >
          @for (option of matches(); track option.value) {
            <li [id]="optionId(option.value)" role="option" data-formancy-part="typeahead-option" [attr.data-active]="option.value === activeValue() ? 'true' : null" [attr.aria-selected]="chosen()?.value === option.value ? 'true' : null" (mousedown)="$event.preventDefault()" (click)="choose(option.value)">{{ option.label }}</li>
          }
        </ul>
      </div>
      <!-- Present from the start and empty until there is something to say: a live
           region created at the moment it gets its text is one several screen
           readers never announce. -->
      <!-- ONE region, four things it may say, and never the error region: a source
           being down is not a wrong answer, and the error region is the control's
           describedby target carrying the engine's verdict. -->
      <p role="status" data-formancy-part="typeahead-status" [attr.data-state]="statusState()">{{ statusMessage() }}</p>
    </formancy-field-shell>
  `,
})
export class FormancyTypeaheadSelect extends FieldComponentBase {
  /**
   * What is in the box while somebody types, or null when the box is simply
   * showing the answer.
   *
   * Two states rather than one string, because "empty because they cleared it" and
   * "empty because there is no answer" are different facts, and only the first
   * clears the answer on the way out.
   */
  protected readonly query = signal<string | null>(null)
  protected readonly open = signal(false)
  /** The arrowed-over option by VALUE, not by index: the filtered list changes on
   *  every keystroke and an index would point at a different row after one. */
  protected readonly activeValue = signal<string | null>(null)

  protected readonly chosen = computed(() => {
    const value = this.field.snapshot().value
    return this.options().find((option) => option.value === value)
  })

  /**
   * A source is the AUTHORITY on what matches: it was handed the query, and
   * re-folding its rows here would drop ones it matched on data the person cannot
   * see. A host wanting fetch-once-filter-locally composes `narrowOptionsByLabel` in
   * its own resolver, which is why that function lives in `@formancy/spec`.
   */
  protected readonly matches = computed(() =>
    this.remote.sourced()
      ? this.offered()
      : narrowOptionsByLabel(this.options(), this.query() ?? ''),
  )

  /** Collapsed whenever there is nothing on the screen, so `aria-expanded` never
   *  claims a popup a person cannot see. */
  protected readonly expanded = computed(() => this.open() && this.matches().length > 0)

  protected readonly text = computed(() => this.query() ?? this.chosen()?.label ?? '')

  protected readonly listboxId = computed(() => `${this.control().id}:listbox`)

  protected readonly popupLabel = computed(() => `${this.context.label} suggestions`)

  private readonly activeIndex = computed(() =>
    this.matches().findIndex((option) => option.value === this.activeValue()),
  )

  /** Absent rather than empty when nothing is active: an empty IDREF is a broken
   *  reference, not a way of saying "nothing". Angular omits an attribute bound to
   *  null, which is exactly that. */
  protected readonly activeId = computed(() => {
    const index = this.activeIndex()
    if (!this.expanded() || index === -1) return null
    return this.optionId(this.matches()[index]!.value)
  })

  /**
   * A source's own words win over "no options match": while a request is in flight,
   * "nothing matched" is not yet true.
   */
  protected readonly statusMessage = computed(() => {
    const fromSource = this.remote.status()
    if (fromSource !== '') return fromSource
    return this.open() && this.matches().length === 0 && !this.remote.busy()
      ? 'No options match'
      : ''
  })

  /** What the region is saying, as a word a theme can select on. */
  protected readonly statusState = computed(() => {
    if (this.remote.busy()) return 'busy'
    const message = this.remote.status()
    if (message.startsWith('The options could not')) return 'failed'
    if (message !== '') return 'hint'
    return this.open() && this.matches().length === 0 ? 'empty' : null
  })

  /** One option's element id, in the shape the radio group already uses. */
  protected optionId(value: string): string {
    return `${this.control().id}:option:${value}`
  }

  protected onInput(event: Event): void {
    const typed = (event.target as HTMLInputElement).value
    this.query.set(typed)
    // What a source is asked for. A plain select never writes to this, so its source
    // is asked for everything and shows what fits.
    this.sourceQuery.set(typed)
    this.open.set(true)
    // Nothing is active on a keystroke: aria-activedescendant is ABSENT rather
    // than pointing at a row the person has not moved to.
    this.activeValue.set(null)
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const matches = this.matches()

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!this.open()) {
        this.open.set(true)
        // Opens ON the answer when there is one, so Down then Enter cannot
        // quietly change an answer somebody only wanted to look at.
        const fallback = event.key === 'ArrowDown' ? matches[0] : matches[matches.length - 1]
        this.activeValue.set(this.chosen()?.value ?? fallback?.value ?? null)
        return
      }
      this.moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if ((event.key === 'Home' || event.key === 'End') && this.expanded()) {
      // The popup's keys while it is open. Left to the caret, a long list is
      // reachable only by holding Down.
      event.preventDefault()
      this.activeValue.set(
        (event.key === 'Home' ? matches[0]! : matches[matches.length - 1]!).value,
      )
      return
    }

    if (event.key === 'Enter') {
      // Only while the list is showing. Otherwise Enter belongs to the form, and a
      // control that swallowed it would break submitting from the keyboard.
      if (!this.expanded()) return
      event.preventDefault()
      const index = this.activeIndex()
      if (index === -1) {
        this.open.set(false)
        return
      }
      this.choose(matches[index]!.value)
      return
    }

    if (event.key === 'Escape') {
      if (!this.open() && this.query() === null) return
      event.preventDefault()
      // "Never mind about this list", not "delete what I chose earlier": the query
      // is abandoned and the ANSWER is untouched.
      this.open.set(false)
      this.activeValue.set(null)
      this.query.set(null)
    }
  }

  protected choose(value: string): void {
    this.field.setValue(value)
    this.query.set(null)
    this.open.set(false)
    this.activeValue.set(null)
  }

  protected onBlur(): void {
    this.open.set(false)
    this.activeValue.set(null)
    const typed = this.query()
    if (typed !== null) {
      // An emptied box is the empty option, and the only route to null. Anything
      // else typed is abandoned - it was never an answer.
      if (typed.trim() === '') this.field.setValue(null)
      this.query.set(null)
    }
    this.field.touch()
  }

  private moveActive(delta: number): void {
    const matches = this.matches()
    if (matches.length === 0) return
    const index = this.activeIndex()
    const from = index === -1 ? (delta > 0 ? -1 : matches.length) : index
    // Clamped, not wrapped: Down means further down the list, and a list that
    // jumps back to the top moves somebody past the end without saying so.
    const next = Math.min(Math.max(from + delta, 0), matches.length - 1)
    this.activeValue.set(matches[next]!.value)
  }
}

@Component({
  selector: 'formancy-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell, FormancyTypeaheadSelect],
  template: `
    @if (typeahead()) {
      <!-- A widget changes the CONTROL and nothing else: same field, same
           accessible name, same stored answer. The registry still wins over both
           branches, because it replaces the component. -->
      <formancy-typeahead-select />
    } @else if (remote.unavailable()) {
      <!-- The document names a source this deployment does not have. Unlike a missing
           scanner this costs the whole field -- a select with no options collects
           nothing -- so it says so where the chooser would be, exactly as the file
           field does without an uploader. -->
      <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
        <p data-formancy-part="options-unavailable">This field's answers come from "{{ sourceName() }}", which this application has not provided.</p>
      </formancy-field-shell>
    } @else {
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
        @for (option of offered(); track option.value) {
          <option [value]="option.value" [selected]="selected() === option.value">{{ option.label }}</option>
        }
      </select>
      <!-- Only a sourced select has anything to say: how many rows were left out, or
           that the source could not be reached. Never the error region, which carries
           the engine's verdict -- a source being down is not a wrong answer. -->
      @if (remote.sourced()) {
        <p role="status" data-formancy-part="select-status">{{ remote.status() }}</p>
      }
    </formancy-field-shell>
    }
  `,
})
export class FormancySelectField extends FieldComponentBase {
  protected readonly typeahead = computed(() => this.field.snapshot().def.widget === 'typeahead')

  /** The name the document gave, for the message when this deployment has no such source. */
  protected readonly sourceName = computed(() => this.field.snapshot().def.optionsSource ?? '')

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
        <!--
          The picker inside a drop target, not instead of one.

          Dropping is a pointer gesture with no keyboard equivalent, so it can
          only ever be a SECOND route (WCAG 2.1.1). The input stays exactly as it
          was and keeps the field's label and ARIA wiring; the region around it
          accepts a drop and hands the files to the same function. Two routes,
          one implementation, the same as the React binding.
        -->
        <div
          data-formancy-part="file-dropzone"
          [attr.data-state]="over() ? 'over' : null"
          (dragover)="onDragOver($event)"
          (dragleave)="over.set(false)"
          (drop)="onDrop($event)"
        >
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
        </div>
      }

      @if (files().length > 0 || removed().length > 0) {
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

          <!--
            A removed attachment stays visible with a way back. The bytes are
            still in storage until the unclaimed collector runs, so the removal
            is recoverable for free, and a misclick on the wrong row of six is
            the ordinary way somebody loses the evidence they came to attach.
          -->
          @for (entry of removed(); track entry.file.id) {
            <li data-formancy-part="file-item" data-state="removed">
              <span>{{ entry.file.name }}</span>
              <button
                type="button"
                [disabled]="field.snapshot().disabled"
                (click)="undo(entry.file.id)"
              >
                Undo removing {{ entry.file.name }}
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
  protected readonly over = signal(false)
  /** Attachments taken out of the answer but not yet forgotten, with where
   *  they came from so undoing restores the order as well as the file. */
  protected readonly removed = signal<ReadonlyArray<{ at: number; file: StoredFile }>>([])

  protected onDragOver(event: DragEvent): void {
    // Without preventDefault the browser navigates to the file instead of
    // letting the page have it, which looks like the form vanishing.
    event.preventDefault()
    if (this.field.snapshot().disabled || this.busy()) return
    this.over.set(true)
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault()
    this.over.set(false)
    if (this.field.snapshot().disabled || this.busy()) return
    const dropped = event.dataTransfer?.files
    if (dropped === undefined || dropped.length === 0) return
    void this.store(Array.from(dropped))
  }

  protected undo(id: string): void {
    const entry = this.removed().find((other) => other.file.id === id)
    if (entry === undefined) return
    this.removed.update((before) => before.filter((other) => other.file.id !== id))
    const next = [...this.files()]
    next.splice(Math.min(entry.at, next.length), 0, entry.file)
    this.field.setValue(next)
  }
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
    const at = this.files().findIndex((file) => file.id === id)
    const going = this.files()[at]
    if (going === undefined) return
    // Out of the answer immediately, so a submit in between is correct, and
    // remembered with its position so undoing puts it BACK where it was rather
    // than on the end — the order matters to somebody who numbered their
    // attachments in a covering note.
    this.removed.update((before) => [...before, { at, file: going }])
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
  time: FormancyTimeField,
  datetime: FormancyDateTimeField,
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
