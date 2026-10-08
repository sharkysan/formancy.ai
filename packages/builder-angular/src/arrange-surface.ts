import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import { arrangeDrop, describeLayoutTarget, flattenLayout } from '@formancy/builder-core'
import type { ArrangeDrop, BuilderSession } from './types.js'
import { injectBuilderView } from './view.js'

const LAYOUT_ATTR = 'data-formancy-layout-path'
const FIELD_ATTR = 'data-formancy-field-path'
const SELECTOR = `[${LAYOUT_ATTR}],[${FIELD_ATTR}]`

/** A drop, plus the element to draw the indicator on. */
type DropTarget = ArrangeDrop & { element: HTMLElement }

/**
 * Whether an element already sits side by side with its siblings: a child of a
 * row, or of a table, which lays its children out in columns.
 *
 * A table child that spans is wrapped in a `layout-cell`, so its parent is the
 * cell and the table is one step further up. Missing that step, or the table
 * altogether, offers side zones on a field in a two-column table — and a drop
 * there builds a new row inside a half-width cell, where the dropped field lands
 * below its target rather than beside it. Spelled the same way as the React
 * surface's, because it is a fact about what `@formancy/angular` and
 * `@formancy/react` both emit.
 */
function sitsSideBySide(element: HTMLElement): boolean {
  let parent = element.parentElement
  if (parent?.dataset['formancyPart'] === 'layout-cell') parent = parent.parentElement
  const part = parent?.dataset['formancyPart']
  return part === 'layout-row' || part === 'layout-table'
}

/**
 * Arranging the form on the form itself, rather than on a tree beside it.
 *
 * The Angular half of [0050](../../../docs/decisions/0050-arrange-in-two-places.md),
 * and the last thing the React builder had that this one did not. Three rules
 * keep it from turning the renderer into an editor, and they are the React
 * surface's rules because they are properties of the arrangement rather than of
 * a framework.
 *
 * **The renderer knows nothing about this.** `@formancy/angular` emits
 * `data-formancy-layout-path` on every container and `data-formancy-field-path`
 * on every field, both inert. This reads them from the outside. Nothing in the
 * renderer imports anything from here, and a form in production carries two
 * attributes nobody reads.
 *
 * **It is a second route to commands that already work.** Every move goes
 * through `session.moveLayoutNode` or `session.wrapLayoutNodes` — the same calls
 * the arrangement tree makes and the same calls the keyboard makes. WCAG 2.2
 * SC 2.5.7 is satisfied by that keyboard path existing, not by anything here
 * ([0046](../../../docs/decisions/0046-keyboard-before-drag.md)), which is also
 * why this is off unless a caller turns it on: a preview somebody is typing into
 * should not be picking up drags.
 *
 * **Where a drop lands is decided once, in `@formancy/builder-core`.** This file
 * reads a pointer, marks the DOM and announces the outcome. It does not have an
 * opinion about which half of an element you are over, because two opinions
 * would be two answers to a question somebody asks by pointing at one place
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 */
@Component({
  selector: 'formancy-arrange-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #surface
      [attr.data-formancy-part]="enabled() ? 'arrange-surface' : null"
      [attr.data-arranging]="enabled() ? 'true' : null"
      (dragstart)="onDragStart($event)"
      (dragend)="onDragEnd()"
      (dragover)="onDragOver($event)"
      (dragleave)="clearIndicators()"
      (drop)="onDrop($event)"
    >
      <ng-content />
      @if (enabled()) {
        <p role="status" data-formancy-part="arrange-status">{{ announcement() }}</p>
      }
    </div>
  `,
})
export class FormancyArrangeSurface {
  readonly session = input.required<BuilderSession>()

  /** Which arrangement the preview inside is rendering. */
  readonly layout = input.required<string>()

  /**
   * Off by default. The form is a form until an editor says otherwise, and a
   * draggable input is a form you cannot select text in.
   */
  readonly enabled = input(false)

  protected readonly view = injectBuilderView(this.session)
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface')
  private readonly dragging = signal<readonly number[] | null>(null)
  protected readonly announcement = signal('')

  /** Which elements this has marked, so the marks can be taken off again. */
  private marked: HTMLElement[] = []

  constructor() {
    /*
     * Marking what can be picked up.
     *
     * Done to the DOM rather than in a template because the markup belongs to
     * the renderer — the whole point of the project is that it does. Re-run on
     * every accepted command, because the rendered tree is replaced.
     *
     * Reads `document()` to re-run, and writes only to the DOM: nothing here
     * touches a signal. An effect that wrote one it also read would be a cycle,
     * and Angular's answer to a cycle is to stop scheduling change detection
     * with no error at all — which looks exactly like frozen bindings. The
     * `untracked` is belt and braces for the same reason.
     */
    effect(() => {
      // Read for the dependency, not for the value: a command replaced the
      // rendered tree, so whatever was marked is gone.
      void this.view()
      const on = this.enabled()
      untracked(() => {
        this.unmark()
        if (!on) return
        const root = this.surface().nativeElement
        this.marked = [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter(
          (element) => this.pathOfElement(element) !== undefined,
        )
        for (const element of this.marked) {
          element.draggable = true
          element.dataset['arrangeable'] = 'true'
        }
      })
    })
  }

  private unmark(): void {
    for (const element of this.marked) {
      element.draggable = false
      delete element.dataset['arrangeable']
      delete element.dataset['drop']
    }
    this.marked = []
  }

  /**
   * Which layout node each element on screen came from.
   *
   * A container says so itself. A field does not — it knows its data path, not
   * its position in the arrangement — so it is looked up, which is sound because
   * the validator forbids placing one field twice in a layout.
   */
  private pathOfElement(element: Element | null): readonly number[] | undefined {
    const found = element?.closest(SELECTOR)
    if (found === null || found === undefined) return undefined

    const declared = found.getAttribute(LAYOUT_ATTR)
    if (declared !== null) return declared.split('.').map(Number)

    const dataPath = found.getAttribute(FIELD_ATTR)
    if (dataPath === null || dataPath === '') return undefined
    const node = flattenLayout(this.view().document, this.layout(), this.session().text).find(
      (row) => row.node.kind === 'field' && row.node.path === dataPath,
    )
    return node?.path
  }

  protected clearIndicators(): void {
    for (const element of this.surface().nativeElement.querySelectorAll<HTMLElement>(
      '[data-drop]',
    )) {
      delete element.dataset['drop']
    }
  }

  private targetFor(event: MouseEvent): DropTarget | undefined {
    const dragged = this.dragging()
    if (dragged === null) return undefined
    const element = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR) ?? null
    if (element === null) return undefined

    const over = this.pathOfElement(element)
    if (over === undefined) return undefined

    const drop = arrangeDrop({
      document: this.view().document,
      layout: this.layout(),
      dragged,
      over,
      box: element.getBoundingClientRect(),
      pointer: { x: event.clientX, y: event.clientY },
      sideBySide: sitsSideBySide(element),
    })
    return drop === undefined ? undefined : { ...drop, element }
  }

  protected onDragStart(event: DragEvent): void {
    const path = this.pathOfElement(event.target as Element)
    if (path === undefined) return
    // The innermost arrangeable element wins, and the browser has already
    // decided that by dispatching from it.
    event.stopPropagation()
    this.dragging.set(path)
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', path.join('.'))
    }
  }

  protected onDragEnd(): void {
    this.dragging.set(null)
    this.clearIndicators()
  }

  protected onDragOver(event: DragEvent): void {
    const target = this.targetFor(event)
    this.clearIndicators()
    // Only a drop the session will accept gets an indicator. One over an illegal
    // target promises a move that will not happen.
    if (target === undefined) return
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
    // Distinct from before/after, so somebody aiming for a row does not see the
    // same line they get for a move. And a move names its axis: inside a row or
    // a table the drop lands beside the field, so the line goes down its side.
    target.element.dataset['drop'] =
      target.kind === 'wrap'
        ? `wrap-${target.side}`
        : target.axis === 'inline'
          ? `inline-${target.edge}`
          : target.edge
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault()
    const target = this.targetFor(event)
    const from = this.dragging()
    this.dragging.set(null)
    this.clearIndicators()
    if (target === undefined || from === null) return

    const session = this.session()

    // Announced through a live region either way, because a drag that changes
    // the document silently is a change somebody using a screen reader with a
    // pointer never hears about.
    if (target.kind === 'wrap') {
      const outcome = session.wrapLayoutNodes(
        this.layout(),
        // The side aimed at decides the order, which is the whole point of
        // having two zones rather than one.
        target.side === 'start' ? [from, target.over] : [target.over, from],
        { kind: 'row', children: [] },
        // And the row belongs where the thing dropped ON was, not where the
        // dragged node came from. Without this, dragging a field out of a row
        // onto a top-level field nests the new row inside the old one, which is
        // not what anybody aimed at.
        target.over,
      )
      this.announcement.set(
        outcome.ok
          ? 'Put them side by side in a row.'
          : `Cannot put them side by side: ${outcome.message}`,
      )
      return
    }

    const outcome = session.moveLayoutNode({ layout: this.layout(), path: from }, target.location)
    this.announcement.set(
      outcome.ok
        ? `Moved to ${describeLayoutTarget(this.view().document, target.location, from, this.session().text)}.`
        : `Cannot move: ${outcome.message}`,
    )
  }
}
