import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { inOptionOrder } from '@formancy/core'
import { isImageSource } from '@formancy/spec'
import type { FieldOption } from '@formancy/spec'
import { injectField } from '../field.js'
import type { FieldBinding } from '../field.js'
import { injectEngine } from '../provide.js'
import { injectFieldContext } from '../registry.js'
import { injectSourcedOptions, sameValues, storedValues } from '../sourced-options.js'
import { FormancyErrorText } from './error-text.js'

/**
 * The shell every control renders inside, and the base they all extend.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
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
  imports: [FormancyErrorText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      data-formancy-part="field"
      [attr.data-formancy-field-path]="path()"
      [attr.data-state]="showError() ? 'invalid' : 'valid'"
    >
      <label data-formancy-part="label" [id]="field().snapshot().props.label.id" [attr.for]="field().snapshot().props.label.for">{{ label() }}</label>
      @if (field().snapshot().description; as said) {
        <p data-formancy-part="description" [id]="field().snapshot().ids.description">{{ said }}</p>
      }
      <ng-content />
      @if (showError()) {
        <p data-formancy-part="error" [id]="field().snapshot().props.error.id" [formancyErrorText]="field().snapshot()"></p>
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
}

/** The state every leaf control shares; components extend it so the templates
 *  stay the only per-type code. Context comes through DI (see registry.ts). */
export abstract class FieldComponentBase {
  protected readonly context = injectFieldContext()
  protected readonly field = injectField(this.context.path)
  protected readonly control = computed(() => this.field.snapshot().props.control)
  protected readonly engine = injectEngine()
  /** The author's example for the empty box, in the form's language (0196); null for none. */
  protected readonly authoredPlaceholder = computed(() => this.engine.text(this.field.snapshot().def.placeholder) ?? null)

  /**
   * Option labels resolved to strings, since a label may be a reference into
   * the message catalogue. Falling back to the stored value keeps an
   * untranslated option selectable rather than blank.
   *
   * A picture is drawn only when `isImageSource` — the schema's own rule, which the
   * React binding asks too — accepts its address, so the two renderers draw the same
   * pictures from a document the validator never saw (0126).
   */
  protected readonly options = computed<ReadonlyArray<{ value: string; label: string; image?: { src: string; alt: string } }>>(() =>
    // In the order the engine chose for a shuffled field, and as written otherwise (0200).
    inOptionOrder(
      (this.field.snapshot().def.options ?? []).map((option: FieldOption) => ({
        value: option.value,
        label: this.engine.text(option.label) ?? option.value,
        ...(option.image !== undefined && isImageSource(option.image.src)
          ? {
              image: {
                src: option.image.src,
                alt: this.engine.text(option.image.alt) ?? '',
              },
            }
          : {}),
      })),
      this.field.snapshot().optionOrder,
    ),
  )

  /**
   * What the control types into, when it has something to type into.
   *
   * A plain `<select>` never writes to it, so its source is asked for everything and
   * shows what fits; the typeahead writes every keystroke.
   */
  protected readonly sourceQuery = signal('')

  /** The remote half, or an inert one for the ordinary field that lists its options. */
  protected readonly remote = injectSourcedOptions({
    sourceName: computed(() => this.field.snapshot().def.optionsSource),
    dataPath: () => this.context.path,
    // Compared by what it holds: a snapshot is rebuilt on every change, and a new list each
    // time would wake the names effect on every keystroke.
    stored: computed(() => storedValues(this.field.snapshot().value), { equal: sameValues }),
    query: this.sourceQuery,
    locale: () => this.engine.locale(),
    enabled: computed(() => this.sourceEnabled()),
    disabled: computed(() => this.field.snapshot().disabled),
  })

  /**
   * Whether THIS component is the one that will render the field.
   *
   * True for every control but the select that hands over to the typeahead, which
   * overrides it. Both extend this base, so without the distinction a sourced
   * typeahead asked its source twice and read one set of answers.
   */
  protected sourceEnabled(): boolean {
    return true
  }

  /**
   * The options to offer: the document's, or the deployment's.
   *
   * A stored answer is always offerable even when the current query does not match it — a
   * control that dropped it would show an empty box over an answer the form holds, and the
   * next blur would look like the person cleared it, or, in a list of ticks, an untick
   * nobody could make (0215).
   */
  protected readonly offered = computed<ReadonlyArray<{ value: string; label: string; image?: { src: string; alt: string } }>>(() => {
    if (!this.remote.sourced()) return this.options()
    const rows = this.remote.rows()
    const named = this.remote.named()
    const unlisted = storedValues(this.field.snapshot().value).filter((value) => !rows.some((row) => row.value === value))
    return [...unlisted.map((value) => ({ value, label: named.get(value) ?? value })), ...rows]
  })
}
