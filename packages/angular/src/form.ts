import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core'
import { parsePath } from '@formancy/core'
import type { FieldDef, LayoutNode } from '@formancy/spec'
import { injectSubmit } from './submit.js'
import { injectWizard } from './wizard.js'
import type { WizardBinding } from './wizard.js'
import { injectEngine } from './provide.js'
import { FormancyLayout } from './layout.js'
import { FormancyFieldSlot, FormancyRepeaterSection } from './slots.js'
import { FormancyTextPipe, injectFormText } from './text.js'

export interface SubmitOutcome {
  ok: boolean
  errors: Record<string, string[]>
  /** The canonical value, present when accepted. */
  data?: unknown
}

/**
 * Renders the whole form from the engine: one slot per field, resolved through
 * the registry. Slots subscribe individually, so a keystroke re-renders one
 * field and a visibility flip mounts or unmounts exactly the fields it hit.
 * A paged schema renders a stepper, one page at a time, navigation, and the
 * submit control on the last page — a failed submit navigates to the first
 * page with a problem instead of leaving the user on a clean review page
 * staring at a rejection.
 */
@Component({
  selector: 'formancy-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldSlot, FormancyRepeaterSection, FormancyLayout, FormancyTextPipe],
  template: `
    @if (wizard; as w) {
      <nav data-formancy-part="stepper" [attr.aria-label]="'form.progress' | formancyText">
        <ol>
          @for (page of w.livePages(); track page.key) {
            <li [attr.aria-current]="page.index === w.page() ? 'step' : null">{{ pageLabel(page) }}</li>
          }
        </ol>
      </nav>
      <!-- A paged form with a layout is the layout, a page at a time. This dropped the
           layout for any paged form while the React binding drew every page's fields on
           every step; both now ask the spec which nodes the page leaves empty (0137). -->
      @if (arrangement(); as nodes) {
        <formancy-layout [nodes]="nodes" [labels]="labels()" [page]="w.page()" />
      } @else {
        @for (wire of staticOnPage(); track wire) {
          <formancy-field [path]="wire" [fallbackLabel]="fallbackFor(wire)" />
        }
        @for (wire of repeatersOnPage(); track wire) {
          <formancy-repeater [wire]="wire" [labels]="labels()" />
        }
      }
      <div data-formancy-part="wizard-nav">
        @if (w.canGoBack()) {
          <button type="button" (click)="w.back()">{{ 'form.back' | formancyText }}</button>
        }
        @if (w.canGoNext()) {
          <button type="button" (click)="onNext()">{{ 'form.next' | formancyText }}</button>
        } @else {
          <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitText() }}</button>
        }
      </div>
    } @else if (arrangement(); as nodes) {
      <formancy-layout [nodes]="nodes" [labels]="labels()" />
      <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitText() }}</button>
    } @else {
      @for (wire of staticWires; track wire) {
        <formancy-field [path]="wire" [fallbackLabel]="fallbackFor(wire)" />
      }
      @for (wire of repeaterWires; track wire) {
        <formancy-repeater [wire]="wire" [labels]="labels()" />
      }
      <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitText() }}</button>
    }
  `,
})
export class FormancyForm {
  private readonly engine = injectEngine()
  private readonly submit = injectSubmit()

  protected readonly wizard: WizardBinding | undefined =
    this.engine.wizard() === undefined ? undefined : injectWizard()

  /**
   * Display text per wire path (row fields by their template wire,
   * `items[].name`). A `label` on the model definition wins — that is how
   * fixture schemas carry text until the spec's i18n section lands.
   */
  readonly labels = input<Record<string, string>>()
  /**
   * Render a named entry from the schema's `layouts` instead of model order.
   * Unknown or absent, the form falls back to model order.
   */
  readonly layout = input<string>()
  readonly submitLabel = input<string>()
  readonly submitted = output<SubmitOutcome>()

  private readonly text = injectFormText()
  /** The host's word when it gave one, and the form's language's otherwise (0171). */
  protected readonly submitText = computed(() => this.submitLabel() ?? this.text('form.submit'))

  protected readonly pages = this.engine.pages()
  protected readonly repeaterWires = this.engine.repeaterPaths()

  // Row fields render inside their repeater's own section, never in the flat
  // list — a row needs its remove button and its position context. The static
  // wires never change: visibility is per-slot metadata, not list membership.
  protected readonly staticWires = this.engine
    .fieldPaths()
    .filter((wire) => !this.repeaterWires.some((repeater) => wire.startsWith(`${repeater}[`)))

  protected readonly staticOnPage = computed(() => {
    const wizard = this.wizard
    if (wizard === undefined) return this.staticWires
    return this.staticWires.filter((wire) => this.engine.pageOf(parsePath(wire)) === wizard.page())
  })

  protected readonly repeatersOnPage = computed(() => {
    const wizard = this.wizard
    if (wizard === undefined) return this.repeaterWires
    return this.repeaterWires.filter((wire) => this.engine.pageOf(parsePath(wire)) === wizard.page())
  })

  /**
   * The nodes of the named layout, or undefined to fall back to model order —
   * a mistyped layout name should not produce an empty form.
   */
  protected readonly arrangement = computed<readonly LayoutNode[] | undefined>(() => {
    const name = this.layout()
    if (name === undefined) return undefined
    return this.engine.schema().layouts?.find((candidate) => candidate.name === name)?.nodes
  })

  protected fallbackFor(wire: string): string | undefined {
    return this.labels()?.[wire]
  }

  protected pageLabel(page: { key: string; def: FieldDef }): string {
    return this.engine.text(page.def.label) ?? page.key
  }

  protected onNext(): void {
    void this.wizard?.next()
  }

  protected onSubmit(): void {
    const outcome = this.submit()
    if (!outcome.ok && this.wizard !== undefined) {
      // Take the user TO the problem: a rejection on a clean review page
      // explains nothing.
      const firstInvalid = this.engine.firstInvalid()
      if (firstInvalid !== null) this.wizard.goTo(this.engine.pageOf(parsePath(firstInvalid)))
    }
    this.submitted.emit(
      outcome.ok
        ? { ok: true, errors: outcome.errors, data: this.engine.value() }
        : { ok: false, errors: outcome.errors },
    )
  }
}
