import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import type { Type } from '@angular/core'
import { answerFromText, editMasked, formatMasked, maskIsNumeric, maskPlaceholder } from '@formancy/spec'
import { injectScanner } from '../scanning.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'


/**
 * The controls that take typed text, and the widgets over them.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
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
        [attr.placeholder]="placeholder()"
        [attr.inputmode]="inputMode()"
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

  /**
   * The answer, and with a mask the answer in its shape. Where a typed, deleted or
   * pasted character lands is `editMasked`'s, in `@formancy/spec`, which the React
   * binding calls too — two answers to one keystroke would be the drift 0091 exists to
   * prevent (0125).
   */
  private readonly mask = computed(() => this.field.snapshot().def.mask)
  private readonly answer = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })
  protected readonly text = computed(() => {
    const mask = this.mask()
    return mask === undefined ? this.answer() : formatMasked(mask, this.answer())
  })
  /** The shape as the hint, and a keypad when every position takes a digit. */
  protected readonly placeholder = computed(() => {
    const mask = this.mask()
    return mask === undefined ? null : maskPlaceholder(mask)
  })
  protected readonly inputMode = computed(() => {
    const mask = this.mask()
    return mask !== undefined && maskIsNumeric(mask) ? 'numeric' : null
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
    const input = event.target as HTMLInputElement
    const mask = this.mask()
    if (mask === undefined) {
      this.commit(input.value)
      return
    }
    const forward = (event as InputEvent).inputType === 'deleteContentForward'
    const edit = editMasked(mask, this.answer(), input.value, {
      caret: input.selectionStart,
      direction: forward ? 'forward' : 'backward',
    })
    // Written to the control here rather than left to the binding: a refused character
    // leaves the answer — and so `text()` — unchanged, and Angular writes a bound value
    // only when it changes, so the character would stay on screen. And the caret can
    // only be placed in text that is already there.
    input.value = formatMasked(mask, edit.answer)
    input.setSelectionRange(edit.caret, edit.caret)
    this.commit(edit.answer)
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
      // empty, which is the worse of the two failures by some distance. A masked
      // field reads it the way it reads a paste.
      const mask = this.mask()
      this.commit(mask === undefined ? text : answerFromText(mask, text))
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
