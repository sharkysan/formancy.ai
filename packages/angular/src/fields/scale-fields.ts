import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'

/**
 * The `number` field and its two scale widgets.
 *
 * Its own file, matching `packages/react/src/fields/scale-fields.tsx` — the two
 * renderers keep the same seams on purpose, so a reader looking for the rating
 * finds the same filename in either. It left `text-fields.ts` for the ordinary
 * reason: a scale and a text box change for different reasons.
 *
 * **Both are widgets and neither changes the answer**
 * ([0104](../../../docs/decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)),
 * so one component branches in its template rather than three fighting over one
 * registry entry — the shape `selectboxes` uses for its tag picker.
 *
 * The two things a scale control gets wrong, and what is done about each:
 *
 * **The keyboard.** Stars drawn as a row of buttons are a row of tab stops that
 * a screen reader announces as unrelated controls, with no sense that they form
 * a scale or that one is chosen. A rating is a **radio group**: one tab stop,
 * arrow keys along the scale. And the group is named with `aria-labelledby`,
 * because a `label[for]` names a form control and a `role="radiogroup"` is not
 * one — in React the group rendered with no accessible name at all until that
 * was fixed.
 *
 * **The bounds.** A scale needs both ends and the format cannot require them:
 * `min` and `max` are optional on every number field, and making them
 * conditional on a widget would mean a document that stops validating when
 * somebody changes presentation. So a field without them falls back to the
 * ordinary number input rather than inventing 1–5 or 0–100.
 */
@Component({
  selector: 'formancy-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      @if (scale() !== undefined && widget() === 'rating') {
        <!-- The group carries the field's wiring and the radios carry the name
             that binds them. An "aria-describedby" repeated eleven times is the
             error text read eleven times. -->
        <div
          role="radiogroup"
          [id]="control().id"
          [attr.aria-labelledby]="labelId()"
          [attr.aria-invalid]="control()['aria-invalid']"
          [attr.aria-required]="control()['aria-required']"
          [attr.aria-describedby]="control()['aria-describedby']"
          data-formancy-part="rating"
        >
          @for (value of steps(); track value) {
            <label data-formancy-part="rating-step" [attr.data-chosen]="value === chosen() ? 'true' : null">
              <input
                type="radio"
                [attr.name]="control().id"
                [value]="value"
                [checked]="value === chosen()"
                [disabled]="control().disabled === true"
                (change)="field.setValue(value)"
                (blur)="field.touch()"
              />
              <!-- The number is the accessible name. A star with no name reads
                   as "radio button, blank". -->
              <span data-formancy-part="rating-label">{{ value }}</span>
            </label>
          }
        </div>
      } @else if (scale() !== undefined && widget() === 'slider') {
        <div data-formancy-part="slider">
          <input
            type="range"
            [id]="control().id"
            [attr.name]="control().name"
            [attr.aria-invalid]="control()['aria-invalid']"
            [attr.aria-required]="control()['aria-required']"
            [attr.aria-describedby]="control()['aria-describedby']"
            [disabled]="control().disabled === true"
            [min]="scale()!.min"
            [max]="scale()!.max"
            [step]="scale()!.step"
            [value]="shown()"
            (input)="onRange($event)"
            (blur)="field.touch()"
          />
          <!-- A span, not an "output". An "output" carries an implicit
               role="status", which makes it a live region -- so every step of a
               drag would be announced on top of the value the range input
               announces itself. That is the double-announcement bug, and the
               playground's own accessible-name guard is what found it. The
               slider announces its own value; this is decoration, so it is
               hidden from the tree entirely. -->
          <span data-formancy-part="slider-value" aria-hidden="true">{{ shown() }}</span>
        </div>
      } @else {
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
      }
    </formancy-field-shell>
  `,
})
export class FormancyNumberField extends FieldComponentBase {
  protected readonly widget = computed(() => this.field.snapshot().def.widget)
  protected readonly labelId = computed(() => this.field.snapshot().ids.label)

  /**
   * Both ends and a step, or nothing.
   *
   * The step defaults to one because that is what `<input type="range">` steps
   * by with no attribute: leaving it out and writing it are the same control.
   * The opposite reading — that a missing step means continuous — is what a
   * reader assumes and is wrong.
   */
  protected readonly scale = computed<{ min: number; max: number; step: number } | undefined>(() => {
    const def = this.field.snapshot().def
    if (def.min === undefined || def.max === undefined || def.max <= def.min) return undefined
    return { min: def.min, max: def.max, step: def.step !== undefined && def.step > 0 ? def.step : 1 }
  })

  /** Every value on the scale, both ends included. */
  protected readonly steps = computed<number[]>(() => {
    const scale = this.scale()
    if (scale === undefined) return []
    const out: number[] = []
    // A half-step of slack, because the ends are inclusive — 0 to 10 is eleven
    // options, and a scale that started at 1 would drop the answer somebody
    // meant. The slack is for the same binary-fraction reason the engine's step
    // check has a tolerance.
    for (let value = scale.min; value <= scale.max + scale.step / 2; value += scale.step) {
      out.push(Math.round(value / scale.step) * scale.step)
    }
    return out
  })

  protected readonly chosen = computed<number | undefined>(() => {
    const value = this.field.snapshot().value
    return typeof value === 'number' ? value : undefined
  })

  /**
   * Where the thumb sits when there is no answer.
   *
   * A range input with no value sits at the midpoint — the browser's own
   * behaviour — so the thumb's position is a claim about an answer that does not
   * exist. The engine is told nothing, so `required` still bites; the read-out
   * shows where the thumb is rather than pretending it is the answer.
   */
  protected readonly shown = computed(() => {
    const chosen = this.chosen()
    if (chosen !== undefined) return chosen
    const scale = this.scale()
    return scale === undefined ? 0 : scale.min + (scale.max - scale.min) / 2
  })

  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'number' ? String(value) : ''
  })

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.field.setValue(raw === '' ? null : Number(raw))
  }

  protected onRange(event: Event): void {
    this.field.setValue((event.target as HTMLInputElement).valueAsNumber)
  }
}
