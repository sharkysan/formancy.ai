import { NgTemplateOutlet } from '@angular/common'
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
  runInInjectionContext,
} from '@angular/core'
import type { ComponentRef, OnChanges, OnDestroy, OnInit, Signal, Type } from '@angular/core'
import type { FieldSnapshot } from '@formancy/core'
import {
  datagridColumns,
} from '@formancy/spec'
import type { FieldDef } from '@formancy/spec'
import { DEFAULT_FIELD_COMPONENTS } from './fields.js'
import { injectField } from './field.js'
import { injectRepeater } from './repeater.js'
import type { RepeaterBinding } from './repeater.js'
import { injectEngine } from './provide.js'
import { FORMANCY_FIELD_CONTEXT, FORMANCY_REGISTRY } from './registry.js'

/*
 * A field's place in a form, and a repeater's: the slot that resolves a field to a
 * component through the registry, and the section that draws a repeater's rows. Both the
 * form and the layout renderer place fields through these, which is why they are apart
 * from either.
 */

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
      <!-- The repeater's own path, inert, beside its rows': the rows name their fields,
           and without this nothing named the repeater an arrangement places. -->
      <fieldset data-formancy-part="repeater" [attr.data-formancy-field-path]="wire()">
        <legend data-formancy-part="repeater-legend">{{ s.label }}</legend>
        <!-- The buttons a row carries, written once and used by both arrangements.
             Each one's text sits in its own element so a THEME can clip it and draw a
             mark instead, which is what a grid wants: "Remove recipient 1 of 1" on
             three wrapped lines took more room than the answers beside it. Clipped and
             never removed -- display: none and visibility: hidden both compute the
             button's name to the empty string, and a button called nothing is worse
             than a wide one. The renderer draws no mark of its own, because an icon is
             appearance and appearance belongs to the consumer.
             Their NAMES are identical in each, because 0068 put the row's position in
             them and a grid does not change where a person is. -->
        <ng-template #rowButtons let-row let-count="count">
          <!-- Position context in the NAME, so a screen-reader user knows
               which row this button kills without walking the tree. -->
          <button type="button" data-formancy-part="row-remove" (click)="state!.repeater.removeRow(row.index)"><span data-formancy-part="row-action-text">{{ state!.removeLabel }} {{ row.index + 1 }} of {{ count }}</span></button>
          <!-- Reordering by button, which is the KEYBOARD route and therefore the
               primary one: WCAG 2.5.7 requires a non-drag equivalent for any drag,
               so a drag affordance can only ever be a second route to these.
               Absent at the ends rather than disabled: a disabled button is still in
               the tab order in some browsers and announces a control that does
               nothing. -->
          @if (row.index > 0) {
            <button type="button" data-formancy-part="row-up" (click)="state!.repeater.moveRow(row.index, row.index - 1)"><span data-formancy-part="row-action-text">Move {{ state!.label }} {{ row.index + 1 }} of {{ count }} up</span></button>
          }
          @if (row.index < count - 1) {
            <button type="button" data-formancy-part="row-down" (click)="state!.repeater.moveRow(row.index, row.index + 1)"><span data-formancy-part="row-action-text">Move {{ state!.label }} {{ row.index + 1 }} of {{ count }} down</span></button>
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
   * One child, because a grid's rows are FLAT: a child holding fields of its own is
   * refused when the document is saved (0078). This walked the whole subtree under the
   * child while a group could be a column, and every clause that made that walk safe is
   * gone with the arrangement it served.
   *
   * Still a filter over the children that EXIST rather than the wire the column implies,
   * so a document nobody validated renders an empty cell rather than a field the engine
   * does not have.
   */
  protected cellChildren(row: RepeaterRow, key: string): readonly RepeaterRow['children'][number][] {
    const wanted = `${this.wire()}[${String(row.index)}].${key}`
    return row.children.filter((child) => child.wire === wanted)
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
