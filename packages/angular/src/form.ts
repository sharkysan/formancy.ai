import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { parsePath } from '@formancy/core'
import type { FieldDef, LayoutNode } from '@formancy/spec'
import { injectSubmit } from './submit.js'
import { injectWizard } from './wizard.js'
import type { WizardBinding } from './wizard.js'
import { injectEngine } from './provide.js'
import { FormancyLayout } from './layout.js'
import { FormancyFieldSlot, FormancyRepeaterSection } from './slots.js'
import { FormancyTextPipe, injectFormText } from './text.js'
import { FormancyReview } from './review.js'
import { injectGoToField } from './go-to-field.js'
import type { ReviewedAnswer } from '@formancy/core/words'

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
  imports: [FormancyFieldSlot, FormancyRepeaterSection, FormancyLayout, FormancyReview, FormancyTextPipe, NgTemplateOutlet],
  template: `
    <!-- What ends the form: sending it, or checking the answers first where it asks (0204). -->
    <ng-template #end>
      @if (review()) {
        <button type="button" data-formancy-part="check-answers" (click)="check()">{{ 'review.open' | formancyText }}</button>
      } @else {
        <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitText() }}</button>
      }
    </ng-template>
    @if (reviewing()) {
      <formancy-review (changed)="change($event)">
        <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitText() }}</button>
      </formancy-review>
    } @else if (wizard; as w) {
      <nav data-formancy-part="stepper" [attr.aria-label]="'form.progress' | formancyText">
        <ol>
          @for (page of w.livePages(); track page.key) {
            <li [attr.aria-current]="page.index === w.page() ? 'step' : null">{{ pageLabel(page) }}</li>
          }
        </ol>
      </nav>
      <!-- The current step's help text (0194), under the steps and above its questions. -->
      @if (pageDescription(); as said) {
        <p data-formancy-part="description">{{ said }}</p>
      }
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
          <ng-container *ngTemplateOutlet="end" />
        }
      </div>
    } @else if (arrangement(); as nodes) {
      <formancy-layout [nodes]="nodes" [labels]="labels()" />
      <ng-container *ngTemplateOutlet="end" />
    } @else {
      @for (wire of staticWires; track wire) {
        <formancy-field [path]="wire" [fallbackLabel]="fallbackFor(wire)" />
      }
      @for (wire of repeaterWires; track wire) {
        <formancy-repeater [wire]="wire" [labels]="labels()" />
      }
      <ng-container *ngTemplateOutlet="end" />
    }
  `,
})
export class FormancyForm {
  private readonly engine = injectEngine()
  private readonly submit = injectSubmit()

  protected readonly wizard: WizardBinding | undefined =
    this.engine.wizard() === undefined ? undefined : injectWizard()

  /** The current step's help text (0194), or nothing on a form with no pages. */
  protected readonly pageDescription = computed(() => {
    const page = this.wizard?.page()
    return page === undefined ? undefined : this.engine.text(this.engine.pages()[page]?.def.description)
  })

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
  /**
   * Show the answers in words before sending, each with a way back to its question: the last
   * step offers "Check your answers" in place of sending (0204). Off unless asked for.
   */
  readonly review = input(false)
  readonly submitted = output<SubmitOutcome>()

  /** Whether the answers are being checked. */
  protected readonly reviewing = signal(false)
  private readonly goToField = injectGoToField()

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

  /** Validate everything as a send would; open the review only when nothing is wrong. */
  protected check(): void {
    const outcome = this.submit()
    if (outcome.ok) return this.reviewing.set(true)
    const firstInvalid = this.engine.firstInvalid()
    if (firstInvalid !== null) this.wizard?.goTo(this.engine.pageOf(parsePath(firstInvalid)))
  }

  /** Leave the review for the page the question is on, and focus it once that is drawn. */
  protected change(answer: ReviewedAnswer): void {
    this.reviewing.set(false)
    this.goToField(answer.field)
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
