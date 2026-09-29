import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import type { FieldOption } from '@formancy/spec'
import { injectField } from '../field.js'
import type { FieldBinding } from '../field.js'
import { injectEngine } from '../provide.js'
import { injectFieldContext } from '../registry.js'
import { injectSourcedOptions } from '../sourced-options.js'


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
export abstract class FieldComponentBase {
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
    () => this.context.path,
    computed(() => {
      const value = this.field.snapshot().value
      return typeof value === 'string' && value !== '' ? value : undefined
    }),
    this.sourceQuery,
    () => this.engine.locale(),
    computed(() => this.sourceEnabled()),
  )

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
