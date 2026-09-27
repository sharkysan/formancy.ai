import { NgTemplateOutlet } from '@angular/common'
import {
  DestroyRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Directive,
  ElementRef,
  Injector,
  ViewContainerRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
  viewChildren,
} from '@angular/core'
import type { ComponentRef, OnChanges, OnDestroy, OnInit, Signal, Type } from '@angular/core'
import { encode } from 'uqr'
import { parsePath } from '@formancy/core'
import type { FieldSnapshot } from '@formancy/core'
import { datagridColumns, resolveText, LAYOUT_LEAF_KINDS, layoutChildren } from '@formancy/spec'
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
  /** Each field of the row: its key within the row, and its positional wire.
   *  Tracked by `key`, bound by `wire`. */
  children: ReadonlyArray<{ key: string; wire: string }>
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
  imports: [NgTemplateOutlet, FormancyFieldSlot],
  template: `
    @if (state; as s) {
      <fieldset data-formancy-part="repeater">
        <legend data-formancy-part="repeater-legend">{{ s.label }}</legend>
        <!-- The buttons a row carries, written once and used by both arrangements.
             Their NAMES are identical in each, because 0068 put the row's position in
             them and a grid does not change where a person is. -->
        <ng-template #rowButtons let-row let-count="count">
          <!-- Position context in the NAME, so a screen-reader user knows
               which row this button kills without walking the tree. -->
          <button type="button" (click)="state!.repeater.removeRow(row.index)">{{ state!.removeLabel }} {{ row.index + 1 }} of {{ count }}</button>
          <!-- Reordering by button, which is the KEYBOARD route and therefore the
               primary one: WCAG 2.5.7 requires a non-drag equivalent for any drag,
               so a drag affordance can only ever be a second route to these.
               Absent at the ends rather than disabled: a disabled button is still in
               the tab order in some browsers and announces a control that does
               nothing. -->
          @if (row.index > 0) {
            <button type="button" (click)="state!.repeater.moveRow(row.index, row.index - 1)">Move {{ state!.label }} {{ row.index + 1 }} of {{ count }} up</button>
          }
          @if (row.index < count - 1) {
            <button type="button" (click)="state!.repeater.moveRow(row.index, row.index + 1)">Move {{ state!.label }} {{ row.index + 1 }} of {{ count }} down</button>
          }
        </ng-template>

        @if (plan().length > 0) {
          <!-- A container inside the fieldset rather than the fieldset itself, so the
               legend and the Add button do not become grid items.

               No role anywhere in here, and that is the decision rather than an
               omission. role="grid" would take the arrow keys, which the controls in
               the cells already own -- a select with widget: "typeahead" is legal in a
               row and claims Up, Down, Home, End, Enter and Escape -- and it would
               replace twenty tab stops with one. A role is not paint, which is the
               line 0065 draws. -->
          <div data-formancy-part="datagrid" [attr.data-columns]="plan().length" [style]="trackStyle()">
            <!-- Only once there is a row to head, and plain static text. A heading here
                 names nothing, so a theme may delete it at phone width without changing
                 what any control announces -- which is what makes the narrow-screen
                 reflow possible at all. -->
            @if (s.rows().length > 0) {
              <div data-formancy-part="datagrid-head">
                @for (entry of plan(); track entry.key) {
                  <span data-formancy-part="datagrid-heading" [attr.data-align]="entry.align">{{ entry.heading }}</span>
                }
              </div>
            }
            @for (row of s.rows(); track row.id) {
              <div data-formancy-part="datagrid-row">
                @for (entry of plan(); track entry.key) {
                  <!-- Always emitted, even when every field in it renders nothing. A
                       rule that hides one answer must not shift that row's remaining
                       columns out of line with the heading strip and with every other
                       row, which is the whole reason this arrangement exists. -->
                  <div data-formancy-part="datagrid-cell" [attr.data-align]="entry.align">
                    @for (child of cellChildren(row, entry.key); track child.wire) {
                      <formancy-field [path]="child.wire" [fallbackLabel]="fallbackFor(child.wire)" />
                    }
                  </div>
                }
                <!-- One cell for all of a row's buttons, because there are two on the
                     first and last rows and three in between. A track whose cell count
                     varied per row is exactly what a table cannot express without a
                     cell that announces a blank. -->
                <div data-formancy-part="datagrid-actions">
                  <ng-container *ngTemplateOutlet="rowButtons; context: { $implicit: row, count: s.rows().length }" />
                </div>
              </div>
            }
          </div>
        } @else {
          @for (row of s.rows(); track row.id) {
            <div data-formancy-part="row">
              <!-- Tracked by the POSITIONAL WIRE, which recreates every control in a
                   row whenever the row moves, so focus is lost on a reorder.
                   Deliberate, and the obstacle is named so the next attempt starts from
                   it: tracking by the field's key instead would let Angular reuse the
                   component, and this component reads its path once in ngOnInit and
                   never rebinds -- so after a removal it would keep the old wire and
                   show the wrong row's answer. A conformance fixture caught exactly
                   that. Reactive path binding has to come first. -->
              @for (child of row.children; track child.wire) {
                <formancy-field [path]="child.wire" [fallbackLabel]="fallbackFor(child.wire)" />
              }
              <ng-container *ngTemplateOutlet="rowButtons; context: { $implicit: row, count: s.rows().length }" />
            </div>
          }
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

  /** The repeater's own definition, kept because the column plan reads `widget`,
   *  `columns` and the child labels off it on every render. */
  protected definition: FieldDef | undefined

  protected state?: {
    repeater: RepeaterBinding
    label: string
    addLabel: string
    removeLabel: string
    rows: Signal<readonly RepeaterRow[]>
  }

  /**
   * The columns the grid shows, in the order it shows them, or an empty list when the
   * widget was not asked for.
   *
   * `columns` without the widget stays inert on purpose: 0066 lets an author write the
   * arrangement before a renderer honours it, and a repeater that silently became a grid
   * because somebody sized its columns would be the opposite of that.
   *
   * The React binding computes the same list with the same helper, for the same reasons.
   */
  protected readonly plan = computed(
    (): ReadonlyArray<{ key: string; heading: string; align: string | null; width?: number }> => {
      const def = this.definition
      if (def?.widget !== 'datagrid') return []
      return datagridColumns(def, def.columns ?? []).map((entry) => ({
        key: entry.key,
        // The author's shortening, else the child's own label, else the labels input,
        // else the key. Visible text and NOTHING else -- never an id target and never an
        // aria-label, because a heading that named the answers beneath it is the failure
        // 0066 separates `header` from `label` to prevent.
        heading:
          this.engine.text(entry.column?.header) ??
          this.engine.text(entry.child?.label) ??
          this.fallbackFor(`${this.wire()}[0].${entry.key}`) ??
          entry.key,
        align: entry.column?.align ?? null,
        ...(entry.column?.width === undefined ? {} : { width: entry.column.width }),
      }))
    },
  )

  /**
   * The authored ratios, as ONE custom property rather than as `grid-template-columns`.
   *
   * A property lays nothing out by itself, so a theme's narrow-screen media query
   * replaces its own declaration and wins rather than losing to an inline one it cannot
   * outrank. It also carries a value space no attribute could enumerate: `width` is a
   * number with `exclusiveMinimum: 0`, so 1.5 is legal and nothing bounds it from above.
   *
   * Nothing at all when no column was sized, so the theme's fallback is live code.
   */
  protected trackStyle(): Record<string, string> {
    const plan = this.plan()
    if (!plan.some((entry) => entry.width !== undefined)) return {}
    return {
      '--fm-datagrid-columns': plan
        .map((entry) => (entry.width === undefined ? '1fr' : `${String(entry.width)}fr`))
        .join(' '),
    }
  }

  /**
   * The controls in one cell: every leaf inside the row that belongs to that column's
   * child field.
   *
   * Matched on a segment boundary rather than with a bare `startsWith`, because a child
   * called `name` must not swallow `nameOnCard` and a grouped child owns everything under
   * it. A column names a DIRECT CHILD, while the row's children are leaves.
   */
  protected cellChildren(row: RepeaterRow, key: string): readonly RepeaterRow['children'][number][] {
    const prefix = `${this.wire()}[${String(row.index)}].${key}`
    return row.children.filter(
      (child) =>
        child.wire === prefix ||
        child.wire.startsWith(`${prefix}.`) ||
        child.wire.startsWith(`${prefix}[`),
    )
  }

  ngOnInit(): void {
    const wire = this.wire()
    const def = this.engine.repeaters().find((candidate) => candidate.wire === wire)?.def
    this.definition = def
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
          children: this.engine
            .fieldPaths()
            .filter((candidate) => candidate.startsWith(`${wire}[${index}]`))
            .map((candidate) => ({
              key: candidate.slice(`${wire}[${index}]`.length),
              wire: candidate,
            })),
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
 *
 * Every container also carries `data-formancy-layout-path`, the index path of
 * the node that produced it, matching the React renderer attribute for
 * attribute. It is inert — nothing in this package reads it — and exists so a
 * tool outside the renderer can say which node an element on screen came from
 * without the renderer knowing anything about editing.
 */
/**
 * One panel at a time, behind a row of tabs — the ARIA tabs pattern, matching
 * the React binding element for element.
 *
 * Written out rather than reached for from a library because the keyboard
 * behaviour IS the specification: arrows move between tabs, Home and End reach
 * the ends, and the strip is one tab stop through a roving tabindex, so a form
 * with twelve tabs does not cost twelve presses to get past.
 *
 * **Every panel stays in the DOM.** A closed tab is hidden, not removed. Tabs
 * are presentation, unlike pages: a field in a closed tab is still validated
 * and still submitted, so it has to be there to be validated, and the
 * browser's own find-in-page finds it. Removing it would also throw away what
 * somebody had typed the moment they looked at another tab.
 *
 * **A tab opens before error navigation focuses a control inside it.** An error summary focuses the
 * first invalid control, and focusing something inside a hidden panel does
 * nothing at all — the reader is told the form has an error and sent nowhere.
 */
@Component({
  selector: 'formancy-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [forwardRef(() => FormancyLayout)],
  template: `
    <div data-formancy-part="layout-tabs" [attr.data-formancy-layout-path]="at()">
      <div
        role="tablist"
        [attr.aria-label]="stripLabel()"
        data-formancy-part="tablist"
        (keydown)="onKeyDown($event)"
      >
        @for (panel of panels(); track $index; let i = $index) {
          <button
            #tab
            type="button"
            role="tab"
            [id]="tabId(i)"
            [attr.aria-controls]="panelId(i)"
            [attr.aria-selected]="i === open()"
            [attr.tabindex]="i === open() ? 0 : -1"
            data-formancy-part="tab"
            (click)="open.set(i)"
          >{{ nameOf(panel, i) }}</button>
        }
      </div>

      @for (panel of panels(); track $index; let i = $index) {
        <div
          role="tabpanel"
          [id]="panelId(i)"
          [attr.aria-labelledby]="tabId(i)"
          data-formancy-part="tabpanel"
          [hidden]="i !== open()"
          (formancy-reveal)="reveal(i)"
        >
          <formancy-layout
            [nodes]="childrenOf(panel)"
            [labels]="labels()"
            [at]="panelPath(i)"
          />
        </div>
      }
    </div>
  `,
})
export class FormancyTabs {
  readonly at = input<string>('')
  readonly stripLabel = input<string | null>(null)
  readonly panels = input.required<readonly LayoutNode[]>()
  readonly labels = input<Record<string, string> | undefined>(undefined)

  protected readonly open = signal(0)
  private readonly changeDetector = inject(ChangeDetectorRef)

  protected reveal(index: number): void {
    this.open.set(index)
    this.changeDetector.detectChanges()
  }

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tab')
  private readonly engine = injectEngine()
  /** Set only by a key press, so focus is never taken from elsewhere. */
  private moveFocus = false

  private static counter = 0
  // After the counter, not before: a static read from a field initialiser runs
  // in declaration order, and the other way round it is NaN on every instance.
  private readonly id = `formancy-tabs-${String((FormancyTabs.counter += 1))}`

  constructor() {
    effect(() => {
      const index = this.open()
      if (!this.moveFocus) return
      this.moveFocus = false
      this.tabButtons()[index]?.nativeElement.focus()
    })
  }

  protected tabId(index: number): string {
    return `${this.id}-tab-${String(index)}`
  }

  protected panelId(index: number): string {
    return `${this.id}-panel-${String(index)}`
  }

  protected panelPath(index: number): string {
    const prefix = this.at()
    return prefix === '' ? String(index) : `${prefix}.${String(index)}`
  }

  protected childrenOf(node: LayoutNode): readonly LayoutNode[] {
    // `LAYOUT_LEAF_KINDS`, not `kind === 'field'`: a `qrcode` node is childless and is
    // not a field, so the old spelling read `children` off it and got `undefined`.
    return LAYOUT_LEAF_KINDS.has(node.kind) ? [node] : layoutChildren(node)
  }

  /** A tab's name is its section's heading. The validator insists it has one. */
  protected nameOf(node: LayoutNode, index: number): string {
    if (node.kind === 'field') return `Tab ${String(index + 1)}`
    const schema = this.engine.schema()
    return (
      resolveText(schema, node.label, schema.i18n?.defaultLocale ?? '') ??
      `Tab ${String(index + 1)}`
    )
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const last = this.panels().length - 1
    const current = this.open()
    const next =
      event.key === 'ArrowRight'
        ? Math.min(current + 1, last)
        : event.key === 'ArrowLeft'
          ? Math.max(current - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined
    if (next === undefined) return
    event.preventDefault()
    this.moveFocus = true
    this.open.set(next)
  }
}

@Component({
  selector: 'formancy-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-formancy-part="code" [attr.data-state]="text() === '' ? 'empty' : 'ready'">
      @if (label(); as caption) {
        <span data-formancy-part="code-label">{{ caption }}</span>
      }
      <!-- The drawing. Decorative: aria-hidden, because a picture of a code says nothing
           to a screen reader and an alt of "QR code" says nothing either. The value below
           is the content.
           Drawn from the encoder's matrix rather than with its own renderSVG, which emits
           white and black fills: a renderer shipping colours is the thing this project
           exists to avoid, so the modules use currentColor and the light ones are absent.
           Nothing is drawn for an empty answer -- an empty string encodes to a valid code,
           and a scannable picture of nothing is worse than no picture. -->
      @if (drawing(); as code) {
        <svg
          data-formancy-part="code-drawing"
          [attr.viewBox]="'0 0 ' + code.size + ' ' + code.size"
          aria-hidden="true"
          focusable="false"
          shape-rendering="crispEdges"
        >
          @for (module of code.modules; track module.key) {
            <rect [attr.x]="module.x" [attr.y]="module.y" width="1" height="1" fill="currentColor" />
          }
        </svg>
      }
      <output data-formancy-part="code-value">{{ text() }}</output>
    </div>
  `,
})
/**
 * A machine-readable code drawn from an answer the form already holds.
 *
 * A component with its OWN field binding rather than a method on the layout: reading the
 * snapshot from the layout rendered the value once and never again, because a plain method
 * call is not a signal an OnPush component re-runs for. Measured — the code stayed
 * `data-state="empty"` after the answer was typed.
 *
 * **The accessible content is the value, not the picture.** A picture of a code says
 * nothing to a screen reader and an alt of "QR code" says nothing either; what somebody
 * needs is the value, which they can read, copy or dictate. There is no picture at all:
 * encoding one is a dependency for something a design system may want to draw its own way,
 * so the renderer emits the value and the hooks and a consumer registers a component for
 * the drawing. Out of the box a code node shows the value as text and no code — a usable
 * form with a visible gap, which is the right way round.
 */
export class FormancyCode implements OnInit {
  readonly path = input.required<string>()
  readonly label = input<string>()

  private readonly engine = injectEngine()
  private readonly destroyRef = inject(DestroyRef)

  /**
   * Subscribed, not computed.
   *
   * The first version was `computed(() => engine.getFieldSnapshot(...))`, which has no
   * reactive dependency at all -- `getFieldSnapshot` is a plain call, not a signal -- so
   * it ran once and never again. Measured twice now, in both renderers: the code stayed
   * `data-state="empty"` after the answer was typed. A code is a live view of an answer
   * and has to subscribe like any other reader of one.
   */
  private readonly value = signal<unknown>(undefined)

  ngOnInit(): void {
    const parsed = parsePath(this.path())
    this.value.set(this.engine.getFieldSnapshot(parsed).value)
    const unsubscribe = this.engine.subscribeField(parsed, () => {
      this.value.set(this.engine.getFieldSnapshot(parsed).value)
    })
    this.destroyRef.onDestroy(unsubscribe)
  }

  protected readonly text = computed(() => {
    const value = this.value()
    if (typeof value === 'string') return value
    return value === null || value === undefined ? '' : String(value)
  })

  /**
   * The modules of the code, or undefined when there is nothing to encode.
   *
   * One rect per dark module rather than one path: a rect carries its own fill, so a theme
   * can address them, and the count is bounded by the version (a version 1 code is 23×23).
   * `track module.key` so Angular reuses rects across a redraw rather than rebuilding the
   * whole picture on every keystroke.
   */
  protected readonly drawing = computed(() => {
    const value = this.text()
    if (value === '') return undefined
    const { size, data } = encode(value)
    const modules: Array<{ key: string; x: number; y: number }> = []
    for (const [row, cells] of data.entries()) {
      for (const [column, dark] of cells.entries()) {
        if (dark) modules.push({ key: `${String(row)}.${String(column)}`, x: column, y: row })
      }
    }
    return { size, modules }
  })
}

@Component({
  selector: 'formancy-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, FormancyFieldSlot, FormancyRepeaterSection, FormancyTabs, FormancyCode],
  /**
   * The one stylesheet this package ships, and it exists to UNDO an element rather
   * than to style one.
   *
   * Angular gives every component a host element. This one recurses, so a container's
   * children arrive wrapped in a `<formancy-layout>` that React does not emit — and a
   * wrapper that participates in layout is the only grid item its parent has. Measured
   * in a browser against `blueprint.css`, with the two renderers' exact markup side by
   * side: React put two fields at the same top and 442px apart; Angular stacked them,
   * 86px apart at the same left edge. A two-column table layout has therefore never
   * produced two columns in Angular, and nothing failed, because jsdom has no layout
   * and no application in this repository renders the Angular bindings.
   *
   * `display: contents` removes the box and keeps the children, so the consumer's grid
   * sees what it sees in React. It also removes the element from the accessibility
   * tree, which is right: it has no role and names nothing.
   *
   * This is a deliberate amendment to [0008](../../../docs/decisions/0008-layered-packages.md)'s
   * "nothing below the component kit ships a CSS file", argued in
   * [0073](../../../docs/decisions/0073-a-host-element-is-not-a-layout.md). The rule is
   * about who owns APPEARANCE; this declaration owns none of it and a theme cannot fix
   * it, because a consumer styling their own design system never reads our themes.
   */
  styles: ':host { display: contents }',
  template: `
    @for (node of nodes(); track $index; let i = $index) {
      <!-- A node that spans gets a cell to span WITH, and one that does not is left
           exactly as it was: a direct child of the container, so the markup of a form
           using no span is unchanged.

           The body is an ng-template rather than the same @if chain written twice,
           because two copies of a nine-branch chain is two places for them to drift.

           Two channels for one fact, and the reason is arithmetic: data-span is the
           authored value, which a selector can match, and --fm-span is the same number
           where CSS can COUNT with it, because 'grid-column: span attr(data-span)' is
           not a thing. 'all' needs no number -- it is 1 / -1 whatever the column count
           -- so it carries no property and the theme's fallback covers the rest.

           The React binding does the same, for the same reasons. -->
      @if (node.span !== undefined) {
        <div
          data-formancy-part="layout-cell"
          [attr.data-span]="node.span"
          [style]="spanStyle(node)"
        >
          <ng-container *ngTemplateOutlet="nodeBody; context: { $implicit: node, i: i }" />
        </div>
      } @else {
        <ng-container *ngTemplateOutlet="nodeBody; context: { $implicit: node, i: i }" />
      }
    }

    <ng-template #nodeBody let-node let-i="i">
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
        <div
          data-formancy-part="layout-row"
          [attr.data-formancy-layout-path]="pathOf(i)"
          [attr.data-columns]="node.children.length"
        >
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" />
        </div>
      } @else if (node.kind === 'column') {
        <div data-formancy-part="layout-column" [attr.data-formancy-layout-path]="pathOf(i)">
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" />
        </div>
      } @else if (node.kind === 'tabs') {
        <formancy-tabs
          [panels]="node.children"
          [labels]="labels()"
          [at]="pathOf(i)"
          [stripLabel]="stripLabelFor(node)"
        />
      } @else if (node.kind === 'qrcode') {
        <!-- The accessible content is the VALUE, not the picture. A picture of a code
             says nothing to a screen reader and an alt of "QR code" says nothing
             either; what somebody needs is the value, which they can read, copy or
             dictate. And there is no picture: encoding one is a dependency (a matrix,
             mask patterns, Reed-Solomon) for something a design system may want to draw
             its own way, so the renderer emits the value and the hooks and a consumer
             registers a component for the drawing. Out of the box a code node shows the
             value as text and no code -- a usable form with a visible gap, which is the
             right way round. -->
        <formancy-code
          [path]="node.path"
          [label]="headingFor(node)?.text"
          [attr.data-formancy-layout-path]="pathOf(i)"
        />
      } @else if (node.kind === 'table') {
        <!-- A grid, not a <table>. Laying fields out in columns is not
             tabular data, and marking it up as a table would announce rows and
             columns that mean nothing (WCAG 1.3.1). The column count is data
             so the stylesheet can collapse it with a media query. -->
        <div
          data-formancy-part="layout-table"
          [attr.data-formancy-layout-path]="pathOf(i)"
          [attr.data-columns]="node.columns"
          [attr.role]="headingFor(node) ? 'group' : null"
          [attr.aria-labelledby]="headingFor(node)?.id ?? null"
        >
          @if (headingFor(node); as heading) {
            <p [id]="heading.id" data-formancy-part="layout-section-heading">{{ heading.text }}</p>
          }
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" />
        </div>
      } @else if (headingFor(node); as heading) {
        <div
          data-formancy-part="layout-section"
          [attr.data-formancy-layout-path]="pathOf(i)"
          role="group"
          [attr.aria-labelledby]="heading.id"
        >
          <p [id]="heading.id" data-formancy-part="layout-section-heading">{{ heading.text }}</p>
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" />
        </div>
      } @else {
        <!-- A group with no accessible name is announced as "group" and tells
             nobody anything, so an unlabelled section stays a box. -->
        <div data-formancy-part="layout-section" [attr.data-formancy-layout-path]="pathOf(i)">
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" />
        </div>
      }
    </ng-template>
  `,
})
export class FormancyLayout {
  readonly nodes = input.required<readonly LayoutNode[]>()
  readonly labels = input<Record<string, string> | undefined>(undefined)
  /** Index path of the container these nodes are the children of. */
  readonly at = input<string>('')

  private readonly engine = injectEngine()


  /** The span as a number CSS can count with, and nothing at all for `all`.
   *
   *  A style OBJECT rather than `[style.--fm-span]`: both set a custom property --
   *  measured, both work -- and the object form lets this return nothing for `all`
   *  without binding an empty string. */
  protected spanStyle(node: LayoutNode): Record<string, string> {
    return typeof node.span === 'number' ? { '--fm-span': String(node.span) } : {}
  }
  /** This node's index path, as the dotted string the attribute carries. */
  protected pathOf(index: number): string {
    const prefix = this.at()
    return prefix === '' ? String(index) : `${prefix}.${String(index)}`
  }

  /**
   * Headings are cached per node. Minting an id inside the template would give
   * a different one on every change-detection pass, leaving aria-labelledby
   * pointing at an element that no longer exists.
   */
  private readonly headings = new WeakMap<object, { id: string; text: string } | null>()
  private static counter = 0

  /** A tabs node's own name, for the tab strip. Null when it has none. */
  protected stripLabelFor(node: LayoutNode): string | null {
    if (node.kind !== 'tabs') return null
    const schema = this.engine.schema()
    return resolveText(schema, node.label, schema.i18n?.defaultLocale ?? '') ?? null
  }

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
