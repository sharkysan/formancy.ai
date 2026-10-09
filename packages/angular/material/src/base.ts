import { Directive, computed, effect, viewChild } from '@angular/core'
import type { Type } from '@angular/core'
import type { ErrorStateMatcher } from '@angular/material/core'
import { MatInput } from '@angular/material/input'
import type { FieldType } from '@formancy/spec'
import {
  DEFAULT_FIELD_COMPONENTS,
  injectEngine,
  injectField,
  injectFieldContext,
} from '@formancy/angular'

/**
 * What every Material control shares: the field, and the three things Material and the
 * engine both have an opinion about.
 *
 * **Errors.** Material shows `<mat-error>` only while its control is in an error state,
 * which it decides with an `ErrorStateMatcher` over Angular forms — and these controls use
 * none. The matcher here asks the engine instead: invalid **and** touched, the rule the
 * default controls follow, so a pristine form does not open by shouting. And it has to be
 * asked: `matInput` re-checks its state in `ngDoCheck` only when an `NgControl` is
 * present, so without one its error state stayed false and no error was ever shown —
 * measured, a required field submitted empty said nothing. The effect below asks again
 * whenever the engine's verdict changes.
 *
 * **Descriptions.** The engine composes `aria-describedby` centrally
 * ([0021](../../../../docs/decisions/0021-engine-owns-aria.md)), and Material adds the ids of
 * the `mat-error` it shows. Handed the engine's list whole, the error id would be in it
 * twice and an error read out twice; so Material is given the engine's ids without the
 * error's, and adds that one itself — from a `mat-error` carrying the engine's error id.
 *
 * **The fallback.** Anything Material has no equivalent for — a mask, a scanner, a
 * typeahead, a rating — is drawn by the default control, through `fallback`, so a design
 * system never makes a feature disappear
 * ([0132](../../../../docs/decisions/0132-material-draws-what-it-has-an-equivalent-for.md)).
 */
// Decorated so the query below is one: Angular reads a signal query from a class it compiles.
@Directive()
export abstract class MaterialFieldBase {
  protected readonly context = injectFieldContext()
  protected readonly field = injectField(this.context.path)
  protected readonly engine = injectEngine()
  protected readonly control = computed(() => this.field.snapshot().props.control)

  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })

  /** Codes joined as the default controls join them, which the conformance driver reads. */
  protected readonly errorText = computed(() => this.field.snapshot().errors.join(', '))
  protected readonly errorId = computed(() => this.field.snapshot().props.error.id)

  /** The engine's description ids without its error id, which Material adds itself. */
  protected readonly describedBy = computed(() => {
    const ids = (this.control()['aria-describedby'] ?? '')
      .split(/\s+/)
      .filter((id) => id !== '' && id !== this.errorId())
    return ids.length === 0 ? null : ids.join(' ')
  })

  protected readonly matcher: ErrorStateMatcher = { isErrorState: () => this.showError() }

  /** The `matInput` of a form-field control, when this one has one. */
  private readonly input = viewChild(MatInput)

  constructor() {
    effect(() => {
      this.showError()
      this.input()?.updateErrorState()
    })
  }

  /** The default control for this field's type, drawn where Material has no equivalent. */
  protected fallbackFor(type: FieldType): Type<unknown> {
    const fallback = DEFAULT_FIELD_COMPONENTS[type]
    if (fallback === null) throw new Error(`formancy has no default control for "${type}"`)
    return fallback
  }
}
