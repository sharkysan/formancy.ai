import { NgTemplateOutlet } from '@angular/common'
import {
  DestroyRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core'
import type { OnInit } from '@angular/core'
import { encode } from 'uqr'
import { parsePath, placedGroup, placedPage } from '@formancy/core'
import type { PlacedGroup } from '@formancy/core'
import {
  resolveText,
  LAYOUT_LEAF_KINDS,
  layoutChildren,
  layoutNodeShows,
} from '@formancy/spec'
import type { LayoutNode } from '@formancy/spec'
import { injectEngine } from './provide.js'
import { FormancyFieldSlot, FormancyGroupSection, FormancyRepeaterSection } from './slots.js'

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
        @for (shown of shownPanels(); track shown.index; let i = $index) {
          <button
            #tab
            type="button"
            role="tab"
            [id]="tabId(i)"
            [attr.aria-controls]="panelId(i)"
            [attr.aria-selected]="i === current()"
            [attr.tabindex]="i === current() ? 0 : -1"
            data-formancy-part="tab"
            (click)="open.set(i)"
          >{{ nameOf(shown.node, i) }}</button>
        }
      </div>

      @for (shown of shownPanels(); track shown.index; let i = $index) {
        <div
          role="tabpanel"
          [id]="panelId(i)"
          [attr.aria-labelledby]="tabId(i)"
          data-formancy-part="tabpanel"
          [hidden]="i !== current()"
          (formancy-reveal)="reveal(i)"
        >
          <formancy-layout
            [nodes]="childrenOf(shown.node)"
            [labels]="labels()"
            [at]="panelPath(shown.index)"
            [page]="page()"
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
  /** On a paged form, the page somebody is on: a tab with nothing on it is not offered. */
  readonly page = input<number | undefined>(undefined)

  /** The tabs with anything to show, each with its position in the authored layout (0137). */
  protected readonly shownPanels = computed(() => {
    const page = this.page()
    return this.panels()
      .map((node, index) => ({ node, index }))
      .filter(
        ({ node }) =>
          page === undefined ||
          layoutNodeShows(node, (path) => placedPage(this.engine, path) === page),
      )
  })

  protected readonly open = signal(0)
  /** The open tab, among the shown: a page change can leave fewer than the one that was open. */
  protected readonly current = computed(() =>
    Math.min(this.open(), this.shownPanels().length - 1),
  )
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
      const index = this.current()
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
    return (
      resolveText(this.engine.schema(), node.label, this.engine.locale()) ??
      `Tab ${String(index + 1)}`
    )
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const last = this.shownPanels().length - 1
    const current = this.current()
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

/** One per `formancy-code` on the page, so two codes never share a label id. */
let codeInstances = 0

@Component({
  selector: 'formancy-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-formancy-part="code" [attr.data-state]="text() === '' ? 'empty' : 'ready'">
      <!-- Named, and the name is ATTACHED. It was a loose span beside the value, and
           measured, the value's accessible name was the empty string: a screen reader
           announced a booking reference with nothing to say what it was. A label that
           only looks like a label is the failure this repository's describedby
           composition exists to prevent, in the one place a layout node wires its own.
           The React binding does the same. -->
      @if (label(); as caption) {
        <span [id]="labelId" data-formancy-part="code-label">{{ caption }}</span>
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
      <!-- output is a live region, so its text is announced when the answer changes --
           right for a second view of an answer, and exactly why it must be named: an
           unnamed live region reads a string out of nowhere. -->
      <output data-formancy-part="code-value" [attr.aria-labelledby]="label() ? labelId : null">{{ text() }}</output>
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

  /**
   * The label's own id, so the value can point at it.
   *
   * From Angular's `inject(...)`-free counter rather than from the engine: the engine
   * mints ids for FIELDS, and a code is a layout node with no field of its own. Unique
   * per component instance, which is what two codes on one page need.
   */
  protected readonly labelId = `formancy-code-${String((codeInstances += 1))}`

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
  imports: [
    NgTemplateOutlet,
    FormancyFieldSlot,
    FormancyGroupSection,
    FormancyRepeaterSection,
    FormancyTabs,
    FormancyCode,
  ],
  /**
   * Undoing an element rather than styling one.
   *
   * Angular gives every component a host element. This one recurses, so a container's
   * children arrive wrapped in a `<formancy-layout>` that React does not emit — and a
   * wrapper that takes part in layout is the only grid item its parent has, which is why
   * a two-column table produced one column in this renderer
   * ([0073](../../../docs/decisions/0073-a-host-element-is-not-a-layout.md)).
   *
   * `display: contents` removes the box and keeps the children, so the consumer's grid
   * sees what it sees in React. It also removes the element from the accessibility
   * tree, which is right: it has no role and names nothing.
   *
   * Set in the CONSTRUCTOR through CSSOM, and **never as a component style**: Angular
   * emits one as a `<style>` element that `style-src 'self'` blocks without a nonce,
   * which would silently restore the bug above. CSP does not govern CSSOM
   * ([0079](../../../docs/decisions/0079-a-host-is-undone-without-a-stylesheet.md),
   * which supersedes 0073's mechanism). `layout.test.ts` asserts both halves: the
   * display is `contents`, and no `<style>` is what says so.
   *
   * It also restores [0008](../../../docs/decisions/0008-layered-packages.md)'s "nothing
   * below the component kit ships a CSS file" rather than amending it, which is the better
   * outcome for a rule about who owns appearance.
   */
  template: `
    @for (node of nodes(); track $index; let i = $index) {
      @if (shows(node)) {
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
    }

    <ng-template #nodeBody let-node let-i="i">
      @if (node.kind === 'field') {
        @if (isRepeater(node.path)) {
          <formancy-repeater [wire]="node.path" [labels]="labels()" />
        } @else if (groupAt(node.path); as group) {
          <formancy-group [path]="node.path" [group]="group" [labels]="labels()" />
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
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" [page]="page()" />
        </div>
      } @else if (node.kind === 'column') {
        <div data-formancy-part="layout-column" [attr.data-formancy-layout-path]="pathOf(i)">
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" [page]="page()" />
        </div>
      } @else if (node.kind === 'tabs') {
        <formancy-tabs
          [panels]="node.children"
          [labels]="labels()"
          [at]="pathOf(i)"
          [stripLabel]="stripLabelFor(node)"
          [page]="page()"
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
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" [page]="page()" />
        </div>
      } @else if (headingFor(node); as heading) {
        <div
          data-formancy-part="layout-section"
          [attr.data-formancy-layout-path]="pathOf(i)"
          role="group"
          [attr.aria-labelledby]="heading.id"
        >
          <p [id]="heading.id" data-formancy-part="layout-section-heading">{{ heading.text }}</p>
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" [page]="page()" />
        </div>
      } @else {
        <!-- A group with no accessible name is announced as "group" and tells
             nobody anything, so an unlabelled section stays a box. -->
        <div data-formancy-part="layout-section" [attr.data-formancy-layout-path]="pathOf(i)">
          <formancy-layout [nodes]="node.children" [labels]="labels()" [at]="pathOf(i)" [page]="page()" />
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
  /**
   * On a paged form, the page somebody is on. A node with nothing on it is skipped and
   * keeps its position, so the index paths stay the authored layout's (0137).
   */
  readonly page = input<number | undefined>(undefined)

  private readonly engine = injectEngine()

  protected shows(node: LayoutNode): boolean {
    const page = this.page()
    return (
      page === undefined ||
      layoutNodeShows(node, (path) => placedPage(this.engine, path) === page)
    )
  }

  constructor() {
    // The host takes no part in layout. Through CSSOM rather than a stylesheet, for the
    // reason written above the template: a component style is a `<style>` element a
    // strict `style-src` blocks, and this has to hold with no CSP configuration at all.
    inject(ElementRef<HTMLElement>).nativeElement.style.setProperty('display', 'contents')
  }


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
    return resolveText(this.engine.schema(), node.label, this.engine.locale()) ?? null
  }

  protected isRepeater(path: string): boolean {
    return this.engine.repeaterPaths().includes(path)
  }

  /** A group placed whole, which is drawn as its fields (0151). */
  protected groupAt(path: string): PlacedGroup | undefined {
    return placedGroup(this.engine, path)
  }

  protected headingFor(node: LayoutNode): { id: string; text: string } | null {
    const cached = this.headings.get(node)
    if (cached !== undefined) return cached

    // `engine.locale()` at all three sites, not the document's default: that
    // showed German fields under English headings, and React had it too (0107).
    // The cache stays safe — an engine's locale is fixed for its life.
    const label = node.kind === 'field' ? undefined : node.label
    const text = resolveText(this.engine.schema(), label, this.engine.locale())
    const heading =
      text === undefined || text === ''
        ? null
        : { id: `formancy-section-${String((FormancyLayout.counter += 1))}`, text }

    this.headings.set(node, heading)
    return heading
  }
}
