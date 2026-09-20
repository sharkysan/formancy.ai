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
import { resolveText } from '@formancy/spec'
import type { FieldDef, LayoutNode } from '@formancy/spec'
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
    const label = snapshot().label ?? this.fallbackLabel() ?? path
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
  /** The row's stable identity, which `@for` tracks instead of its position. */
  id: string
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
        @for (row of s.rows(); track row.id) {
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
    const label = this.engine.text(def?.label) ?? this.labels()?.[wire] ?? wire
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
          // Identity, not position: removing a row renumbers everything after
          // it, and tracking by index would make Angular reuse the wrong DOM
          // nodes — moving focus and animating the wrong element.
          id: repeater.rowIds()[index] ?? String(index),
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
 * Rendering a named `layouts` entry — fields side by side, in sections, in the
 * arrangement the document asks for rather than model order. The Angular half
 * of the same decisions packages/react/src/layout.tsx documents, and
 * deliberately the same markup.
 *
 * Four WCAG criteria shape it, and all four say the DOM is the arrangement:
 *
 * - **1.3.2 Meaningful Sequence** and **2.4.3 Focus Order** — children are
 *   emitted in declared order and the stylesheet places them by source order
 *   alone. Nothing here or in CSS may reorder them, or a screen reader and an
 *   eye meet the form in different orders.
 * - **1.4.10 Reflow** — becoming one column when there is no room for two is a
 *   media query, not a measurement. A layout that reflows only after scripts
 *   have run does not reflow.
 * - **1.3.1 Info and Relationships** — a row is presentation and gets no
 *   semantics; a labelled section is visibly grouping fields, so it is a real
 *   `group` with an accessible name.
 */
@Component({
  selector: 'formancy-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldSlot, FormancyRepeaterSection],
  template: `
    @for (node of nodes(); track $index) {
      @if (node.kind === 'field') {
        @if (isRepeater(node.path)) {
          <formancy-repeater [wire]="node.path" [labels]="labels()" />
        } @else {
          <formancy-field [path]="node.path" />
        }
      } @else if (node.kind === 'row') {
        <!-- Presentation only: two fields being beside each other is not a
             relationship the author described, and announcing "group" around
             every pair would be noise. -->
        <div data-formancy-part="layout-row" [attr.data-columns]="node.children.length">
          <formancy-layout [nodes]="node.children" [labels]="labels()" />
        </div>
      } @else if (node.kind === 'column') {
        <div data-formancy-part="layout-column">
          <formancy-layout [nodes]="node.children" [labels]="labels()" />
        </div>
      } @else if (headingFor(node); as heading) {
        <div data-formancy-part="layout-section" role="group" [attr.aria-labelledby]="heading.id">
          <p [id]="heading.id" data-formancy-part="layout-section-heading">{{ heading.text }}</p>
          <formancy-layout [nodes]="node.children" [labels]="labels()" />
        </div>
      } @else {
        <!-- A group with no accessible name is announced as "group" and tells
             nobody anything, so an unlabelled section stays a box. -->
        <div data-formancy-part="layout-section">
          <formancy-layout [nodes]="node.children" [labels]="labels()" />
        </div>
      }
    }
  `,
})
export class FormancyLayout {
  readonly nodes = input.required<readonly LayoutNode[]>()
  readonly labels = input<Record<string, string> | undefined>(undefined)

  private readonly engine = injectEngine()

  /**
   * Headings are cached per node. Minting an id inside the template would give
   * a different one on every change-detection pass, leaving aria-labelledby
   * pointing at an element that no longer exists.
   */
  private readonly headings = new WeakMap<object, { id: string; text: string } | null>()
  private static counter = 0

  protected isRepeater(path: string): boolean {
    return this.engine.repeaterPaths().includes(path)
  }

  protected headingFor(node: LayoutNode): { id: string; text: string } | null {
    const cached = this.headings.get(node)
    if (cached !== undefined) return cached

    const schema = this.engine.schema()
    const label = node.kind === 'field' ? undefined : node.label
    const text = resolveText(schema, label, schema.i18n?.defaultLocale ?? '')
    const heading =
      text === undefined || text === ''
        ? null
        : { id: `formancy-section-${String((FormancyLayout.counter += 1))}`, text }

    this.headings.set(node, heading)
    return heading
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
  imports: [FormancyFieldSlot, FormancyRepeaterSection, FormancyLayout],
  template: `
    @if (wizard; as w) {
      <nav data-formancy-part="stepper" aria-label="Progress">
        <ol>
          @for (page of pages; track page.key; let i = $index) {
            <li [attr.aria-current]="i === w.page() ? 'step' : null">{{ pageLabel(page) }}</li>
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
    } @else if (arrangement(); as nodes) {
      <formancy-layout [nodes]="nodes" [labels]="labels()" />
      <button type="button" data-formancy-part="submit" (click)="onSubmit()">{{ submitLabel() ?? 'Submit' }}</button>
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
  /**
   * Render a named entry from the schema's `layouts` instead of model order.
   * Unknown or absent, the form falls back to model order.
   */
  readonly layout = input<string>()
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
