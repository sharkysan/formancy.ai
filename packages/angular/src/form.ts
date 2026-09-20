import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  Injector,
  ViewContainerRef,
  computed,
  effect,
  inject,
  input,
  output,
  runInInjectionContext,
} from '@angular/core'
import type { ComponentRef, OnChanges, OnDestroy, OnInit, Signal, Type } from '@angular/core'
import { parsePath } from '@formancy/core'
import type { FieldSnapshot } from '@formancy/core'
import { DEFAULT_FIELD_COMPONENTS } from './fields.js'
import { injectField } from './field.js'
import { injectRepeater } from './repeater.js'
import type { RepeaterBinding } from './repeater.js'
import { injectSubmit } from './submit.js'
import { injectWizard } from './wizard.js'
import type { WizardBinding } from './wizard.js'
import { injectEngine } from './provide.js'
import { FORMANCY_FIELD_CONTEXT, FORMANCY_REGISTRY } from './registry.js'

export interface SubmitOutcome {
  ok: boolean
  errors: Record<string, string[]>
  /** The canonical value, present when accepted. */
  data?: unknown
}

/**
 * A minimal dynamic-component outlet: NgComponentOutlet's job without pulling
 * @angular/common into the library's runtime dependencies for one directive.
 * Creation happens in ngOnChanges — the framework-blessed moment for view
 * manipulation — and the injector input is how the slot hands each component
 * its FORMANCY_FIELD_CONTEXT.
 */
@Directive({ selector: '[formancyOutlet]' })
export class FormancyComponentOutlet implements OnChanges, OnDestroy {
  private readonly container = inject(ViewContainerRef)

  readonly formancyOutlet = input.required<Type<unknown>>()
  readonly formancyOutletInjector = input.required<Injector>()

  private ref: ComponentRef<unknown> | undefined

  ngOnChanges(): void {
    this.ref?.destroy()
    this.ref = this.container.createComponent(this.formancyOutlet(), {
      injector: this.formancyOutletInjector(),
    })
  }

  ngOnDestroy(): void {
    this.ref?.destroy()
  }
}

/**
 * One field's slot: resolve the component through the registry (per-path beats
 * per-type beats the defaults) and mount it while the field is visible.
 *
 * A hidden field leaves the DOM entirely: display:none would still ship the
 * markup, keep it in the accessibility tree's shadow, and leak its labels to
 * screen-reader "read all" passes.
 *
 * The binding is wired in ngOnInit rather than a field initialiser because the
 * path arrives as an input, which does not exist yet at construction time.
 */
@Component({
  selector: 'formancy-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyComponentOutlet],
  template: `
    @if (state; as s) {
      @if (s.component !== null && s.snapshot().visible) {
        <ng-container [formancyOutlet]="s.component" [formancyOutletInjector]="s.injector" />
      }
    }
  `,
})
export class FormancyFieldSlot implements OnInit {
  private readonly registry = inject(FORMANCY_REGISTRY, { optional: true })
  private readonly injector = inject(Injector)

  readonly path = input.required<string>()
  readonly fallbackLabel = input<string>()

  protected state?: {
    snapshot: Signal<FieldSnapshot>
    component: Type<unknown> | null
    injector: Injector
  }

  ngOnInit(): void {
    const path = this.path()
    const binding = runInInjectionContext(this.injector, () => injectField(path))
    const snapshot = binding.snapshot
    const component =
      this.registry?.byPath?.[path] ??
      this.registry?.byType?.[snapshot().type] ??
      DEFAULT_FIELD_COMPONENTS[snapshot().type]
    // Labels ride on the model definition (version-0 presentation-lite); the
    // labels input is the fallback, and the wire path is at least honest.
    const label = snapshot().def.label ?? this.fallbackLabel() ?? path
    this.state = {
      snapshot,
      component,
      injector: Injector.create({
        providers: [{ provide: FORMANCY_FIELD_CONTEXT, useValue: { path, label } }],
        parent: this.injector,
      }),
    }
  }
}

interface RepeaterRow {
  index: number
  wires: readonly string[]
}

/**
 * A repeater's own chrome: a named fieldset, one row div per item with the row
 * fields and a remove control, and an add control. Row fields render here,
 * never in the flat list — a row needs its remove button and its position
 * context.
 */
@Component({
  selector: 'formancy-repeater',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldSlot],
  template: `
    @if (state; as s) {
      <fieldset data-formancy-part="repeater">
        <legend data-formancy-part="repeater-legend">{{ s.label }}</legend>
        @for (row of s.rows(); track row.index) {
          <div data-formancy-part="row">
            @for (instanceWire of row.wires; track instanceWire) {
              <formancy-field [path]="instanceWire" [fallbackLabel]="fallbackFor(instanceWire)" />
            }
            <!-- Position context in the NAME, so a screen-reader user knows
                 which row this button kills without walking the tree. -->
            <button type="button" (click)="s.repeater.removeRow(row.index)">{{ s.removeLabel }} {{ row.index + 1 }} of {{ s.rows().length }}</button>
          </div>
        }
        <button type="button" (click)="s.repeater.addRow()">{{ s.addLabel }}</button>
      </fieldset>
    }
  `,
})
export class FormancyRepeaterSection implements OnInit {
  private readonly engine = injectEngine()
  private readonly injector = inject(Injector)

  readonly wire = input.required<string>()
  readonly labels = input<Record<string, string>>()

  protected state?: {
    repeater: RepeaterBinding
    label: string
    addLabel: string
    removeLabel: string
    rows: Signal<readonly RepeaterRow[]>
  }

  ngOnInit(): void {
    const wire = this.wire()
    const def = this.engine.repeaters().find((candidate) => candidate.wire === wire)?.def
    const label = def?.label ?? this.labels()?.[wire] ?? wire
    const minItems = def?.minItems ?? 0

    const repeater = runInInjectionContext(this.injector, () => {
      const binding = injectRepeater(wire)
      // Seed to minItems: a repeater that promises one row must show one empty
      // row, not an add button and a shrug. An effect rather than a one-shot,
      // so dropping below the floor later re-seeds exactly as React's does.
      effect(() => {
        const shortfall = minItems - binding.rowCount()
        for (let i = 0; i < shortfall; i++) binding.addRow()
      })
      return binding
    })

    this.state = {
      repeater,
      label,
      addLabel: def?.addLabel ?? `Add ${label}`,
      removeLabel: def?.removeLabel ?? `Remove ${label}`,
      rows: computed(() =>
        Array.from({ length: repeater.rowCount() }, (_, index) => ({
          index,
          wires: this.engine.fieldPaths().filter((candidate) => candidate.startsWith(`${wire}[${index}]`)),
        })),
      ),
    }
  }

  protected fallbackFor(instanceWire: string): string | undefined {
    const template = instanceWire.replace(/\[\d+\]/, '[]')
    return this.labels()?.[template] ?? this.labels()?.[instanceWire]
  }
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
  imports: [FormancyFieldSlot, FormancyRepeaterSection],
  template: `
    @if (wizard; as w) {
      <nav data-formancy-part="stepper" aria-label="Progress">
        <ol>
          @for (page of pages; track page.key; let i = $index) {
            <li [attr.aria-current]="i === w.page() ? 'step' : null">{{ page.def.label ?? page.key }}</li>
          }
        </ol>
      </nav>
      @for (wire of staticOnPage(); track wire) {
        <formancy-field [path]="wire" [fallbackLabel]="fallbackFor(wire)" />
      }
      @for (wire of repeatersOnPage(); track wire) {
        <formancy-repeater [wire]="wire" [labels]="labels()" />
      }
      <div data-formancy-part="wizard-nav">
        @if (w.page() > 0) {
          <button type="button" (click)="w.back()">Back</button>
        }
        @if (w.page() < w.pageCount - 1) {
          <button type="button" (click)="onNext()">Next</button>
        } @else {
          <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitLabel() ?? 'Submit' }}</button>
        }
      </div>
    } @else {
      @for (wire of staticWires; track wire) {
        <formancy-field [path]="wire" [fallbackLabel]="fallbackFor(wire)" />
      }
      @for (wire of repeaterWires; track wire) {
        <formancy-repeater [wire]="wire" [labels]="labels()" />
      }
      <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitLabel() ?? 'Submit' }}</button>
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
  readonly submitLabel = input<string>()
  readonly submitted = output<SubmitOutcome>()

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

  protected fallbackFor(wire: string): string | undefined {
    return this.labels()?.[wire]
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
