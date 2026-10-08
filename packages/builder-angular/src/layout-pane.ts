import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core'
import {
  addLayoutAndSay,
  describeLayoutTarget,
  dropLayoutAndSay,
  flattenLayout,
  layoutDropLocation,
  layoutKeyHelp,
  moveLayoutAndSay,
  nameOfPath,
  redoAndSay,
  removeLayoutAndSay,
  undoAndSay,
  unwrapLayoutAndSay,
  wrapAndSay,
  wrapCandidates,
} from '@formancy/builder-core'
import type { BuilderSession, LayoutLocation, LayoutNode, LayoutTreeNode } from './types.js'
import { FormancyLayoutAdd } from './layout-add.js'
import { BuilderTextPipe } from './text.pipe.js'
import { injectBuilderView } from './view.js'

interface Target {
  location: LayoutLocation
  label: string
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, at) => b[at] === step)
}

/**
 * The arrangement editor for Angular: rows, columns, sections, codes and fields,
 * by keyboard.
 *
 * A separate pane rather than a mode of the structure tree, for the reason the
 * React one gives: the model answers *what does this form collect* and the
 * arrangement answers *where does it appear*, and a field can be in one without
 * being in the other. One tree showing both would have to pretend those are the
 * same question.
 *
 * What may be added, what a new node looks like, which destinations exist and how
 * each is described, what may be wrapped with what, and every sentence a command
 * produces come from `@formancy/builder-core` — shared with the React pane. This
 * pane used to answer the first of those itself, and its answer had drifted to
 * three containers: it listed the fields the arrangement leaves out and gave no way
 * to place one ([0116](../../../docs/decisions/0116-what-a-builder-says-is-decided-once.md)).
 */
@Component({
  selector: 'formancy-layout-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe, FormancyLayoutAdd],
  template: `
    <div data-formancy-part="layout-pane">
      @if (name() === undefined) {
        <p data-formancy-part="layout-empty">{{ 'layout.none' | builderText: text() }}</p>
        <button type="button" (click)="addLayout()">
          {{ 'layout.addLayout' | builderText: text() }}
        </button>
      } @else {
        <ul
          #tree
          role="tree"
          [attr.aria-label]="treeName()"
          data-formancy-part="layout-tree"
          [attr.tabindex]="count() === 0 ? 0 : -1"
          (keydown)="onKeyDown($event)"
        >
          @for (row of rows(); track row.path.join('.'); let position = $index) {
            <!-- A second route to commands that already work without it. -->
            <li
              #item
              role="treeitem"
              [attr.aria-level]="row.depth + 1"
              [attr.aria-selected]="position === index()"
              data-formancy-part="layout-node"
              [attr.data-kind]="row.node.kind"
              [attr.tabindex]="position === index() ? 0 : -1"
              (focus)="focusedIndex.set(position)"
              draggable="true"
              [attr.data-dragging]="isDragging(row) ? 'true' : null"
              [attr.data-drop]="dropEdgeFor(position)"
              (dragstart)="onDragStart(row, $event)"
              (dragend)="onDragEnd()"
              (dragover)="onDragOver(row, position, $event)"
              (dragleave)="dropTarget.set(null)"
              (drop)="onDrop(row, $event)"
            >
              {{ row.name }}
            </li>
          }
        </ul>

        @if (count() === 0) {
          <p data-formancy-part="layout-empty">
            {{ 'layout.placesNothing' | builderText: text() }}
          </p>
        }

        @if (unplaced().length > 0) {
          <!-- Named, not hidden. A field the only arrangement leaves out is
               collected by the form and invisible to everyone filling it in, and
               that is exactly the mistake this pane can prevent. -->
          <div data-formancy-part="layout-unplaced">
            <h3>{{ 'layout.unplaced' | builderText: text() }}</h3>
            <ul>
              @for (path of unplaced(); track path) {
                <li>{{ nameOf(path) }}</li>
              }
            </ul>
          </div>
        }

        @if (adding()) {
          <formancy-layout-add
            [session]="session()"
            [layout]="name()!"
            (said)="announcement.set($event)"
            (closed)="cancelDialog()"
          />
        }
      }

      @if (moving() !== null) {
        <div
          role="dialog"
          [attr.aria-label]="'tree.moveTitle' | builderText: text() : { name: moving()!.name }"
          data-formancy-part="layout-move"
          (keydown.escape)="onDialogEscape($event)"
        >
          <ul>
            @for (target of moveTargets(); track targetKey(target)) {
              <li>
                <button type="button" (click)="completeMove(target)">{{ target.label }}</button>
              </li>
            }
          </ul>
          <button type="button" (click)="cancelDialog()">
            {{ 'dialog.cancel' | builderText: text() }}
          </button>
        </div>
      }

      @if (wrapping() !== null) {
        <div
          role="dialog"
          [attr.aria-label]="'layout.wrapTitle' | builderText: text() : { name: wrapping()!.name }"
          data-formancy-part="layout-wrap"
          (keydown.escape)="onDialogEscape($event)"
        >
          <p>{{ 'layout.wrapHelp' | builderText: text() : { name: wrapping()!.name } }}</p>
          <ul>
            @for (candidate of wrapChoices(); track candidate.path.join('.')) {
              <li>
                <button type="button" (click)="completeWrap(candidate)">
                  {{ candidate.name }}
                </button>
              </li>
            }
          </ul>
          <button type="button" (click)="cancelDialog()">
            {{ 'dialog.cancel' | builderText: text() }}
          </button>
        </div>
      }

      <!-- One polite region for this pane. role="status" already implies
           aria-live="polite"; setting both announces everything twice. -->
      <p role="status" data-formancy-part="layout-status">{{ announcement() }}</p>

      @if (name() !== undefined) {
        <dl data-formancy-part="layout-keys">
          @for (entry of keyHelp(); track entry[0]) {
            <div>
              <dt>{{ entry[0] }}</dt>
              <dd>{{ entry[1] }}</dd>
            </div>
          }
        </dl>
      }
    </div>
  `,
})
export class FormancyLayoutPane {
  readonly session = input.required<BuilderSession>()
  /** Which arrangement to edit. Defaults to the first one the form has. */
  readonly layout = input<string | undefined>(undefined)
  /** The tree's accessible name, before the arrangement's own. The session's words by default. */
  readonly label = input<string | undefined>(undefined)
  /**
   * The node the person is on, as its index path, or `null` when the
   * arrangement is empty. Keyed on the PATH rather than the position: an edit
   * that reorders the arrangement leaves a position pointing at another node.
   */
  readonly selected = output<readonly number[] | null>()

  protected readonly view = injectBuilderView(this.session)
  /** Every word this pane shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)
  protected readonly keyHelp = computed(() => layoutKeyHelp(this.session()))

  protected readonly focusedIndex = signal(0)
  /** Whether the add conversation is open. Its three steps are `FormancyLayoutAdd`'s. */
  protected readonly adding = signal(false)
  protected readonly moving = signal<LayoutTreeNode | null>(null)
  /**
   * The item waiting to be paired into a row.
   *
   * The same two-step shape the move command uses — press the key, then choose
   * from a list — rather than a second idiom to learn. The focused item ends up
   * FIRST in the row, because a rule somebody can state beats an order that
   * depends on document position.
   */
  protected readonly wrapping = signal<LayoutTreeNode | null>(null)
  protected readonly announcement = signal('')
  protected readonly dragging = signal<readonly number[] | null>(null)
  protected readonly dropTarget = signal<{ index: number; edge: 'before' | 'after' } | null>(null)

  private readonly tree = viewChild<ElementRef<HTMLElement>>('tree')
  private readonly items = viewChildren<ElementRef<HTMLElement>>('item')
  private keepFocus = false
  private listed = ''
  private focusedPath: string | null = null

  protected readonly name = computed(
    () => this.layout() ?? (this.view().document.layouts ?? [])[0]?.name,
  )
  protected readonly treeName = computed(() =>
    this.text()('layout.treeName', {
      label: this.label() ?? this.text()('layout.label'),
      name: this.name() ?? '',
    }),
  )
  protected readonly rows = computed((): LayoutTreeNode[] => {
    const name = this.name()
    return name === undefined ? [] : flattenLayout(this.view().document, name, this.text())
  })
  protected readonly count = computed(() => this.rows().length)
  protected readonly index = computed(() =>
    this.count() === 0 ? 0 : Math.min(this.focusedIndex(), this.count() - 1),
  )
  protected readonly focused = computed((): LayoutTreeNode | undefined => this.rows()[this.index()])
  protected readonly selectedPath = computed((): string | null => {
    const node = this.focused()
    return node === undefined ? null : node.path.join('.')
  })
  protected readonly unplaced = computed((): string[] => {
    const name = this.name()
    // Read through the view so it follows the document, not through the session
    // directly — which would be a value nothing tells this component to refresh.
    void this.view()
    return name === undefined ? [] : this.session().unplacedFields(name)
  })
  protected readonly moveTargets = computed((): Target[] => {
    const node = this.moving()
    return node === null ? [] : this.targetsFor(node.path)
  })
  protected readonly wrapChoices = computed((): LayoutTreeNode[] => {
    const subject = this.wrapping()
    return subject === null ? [] : wrapCandidates(this.rows(), subject)
  })

  constructor() {
    // Keep focus on the NODE across an edit, not on the number. Guarded on the
    // list changing, and the position read and written inside `untracked`: an
    // Angular effect that reads the signal it writes is a cycle, and Angular
    // answers one by not scheduling any further change detection — silently
    // ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
    effect(() => {
      const rows = this.rows()
      untracked(() => {
        const listing = rows.map((row) => row.path.join('.')).join('|')
        if (listing === this.listed) return
        this.listed = listing
        const wanted = this.focusedPath
        const at = wanted === null ? -1 : rows.findIndex((row) => row.path.join('.') === wanted)
        if (at !== -1 && at !== this.focusedIndex()) this.focusedIndex.set(at)
      })
    })

    effect(() => {
      const path = this.selectedPath()
      untracked(() => {
        this.focusedPath = path
        this.selected.emit(path === null ? null : path.split('.').map(Number))
      })
    })

    // Move focus WITHIN the tree, never INTO it: a pane that grabs focus on
    // mount takes it from wherever the person actually was, which on this screen
    // is the structure tree or the preview.
    effect(() => {
      const at = this.index()
      const items = this.items()
      const root = this.tree()?.nativeElement
      untracked(() => {
        if (this.anyDialogOpen()) return
        const active = document.activeElement
        const inside = root !== undefined && active !== null && root.contains(active)
        if (inside || this.keepFocus) items[at]?.nativeElement.focus()
        this.keepFocus = false
      })
    })
  }

  protected isDragging(row: LayoutTreeNode): boolean {
    const from = this.dragging()
    return from !== null && samePath(from, row.path)
  }

  protected dropEdgeFor(position: number): string | null {
    const target = this.dropTarget()
    return target?.index === position ? target.edge : null
  }

  protected onDragStart(row: LayoutTreeNode, event: DragEvent): void {
    this.dragging.set(row.path)
    if (event.dataTransfer === null) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', row.path.join('.'))
  }

  protected onDragEnd(): void {
    this.dragging.set(null)
    this.dropTarget.set(null)
  }

  protected onDragOver(row: LayoutTreeNode, position: number, event: DragEvent): void {
    const from = this.dragging()
    const name = this.name()
    if (from === null || name === undefined) return
    const edge = edgeOf(event)
    // Only a legal drop shows an indicator and accepts one: an indicator over an
    // illegal target promises a move that will not happen.
    if (layoutDropLocation(this.view().document, name, from, row.path, edge) === undefined) {
      this.dropTarget.set(null)
      return
    }
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
    this.dropTarget.set({ index: position, edge })
  }

  protected onDrop(row: LayoutTreeNode, event: DragEvent): void {
    event.preventDefault()
    const from = this.dragging()
    const name = this.name()
    this.dragging.set(null)
    this.dropTarget.set(null)
    if (from === null || name === undefined) return

    const location = layoutDropLocation(this.view().document, name, from, row.path, edgeOf(event))
    if (location === undefined) return

    // Naming what moved, which "Moved." did not.
    this.announcement.set(dropLayoutAndSay(this.session(), { layout: name, path: from }, location))
  }

  protected nameOf(path: string): string {
    return nameOfPath(this.view().document, path)
  }

  protected targetKey(target: Target): string {
    return `${target.location.parent.join('.')}:${String(target.location.index)}`
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const name = this.name()
    if (name === undefined) return
    this.keepFocus = true

    if (event.altKey || event.metaKey) return

    if (event.ctrlKey) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        this.announcement.set(undoAndSay(this.session()))
      } else if (key === 'y') {
        event.preventDefault()
        this.announcement.set(redoAndSay(this.session()))
      }
      return
    }

    // Escape closes an open dialog wherever focus happens to be. Pressing `w`
    // leaves focus on the tree item, so the dialog's own handler never sees the
    // key — which is the whole reason this is here as well.
    if (event.key === 'Escape' && this.anyDialogOpen()) {
      event.preventDefault()
      this.cancelDialog()
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.focusedIndex.set(Math.min(this.index() + 1, this.count() - 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        this.focusedIndex.set(Math.max(this.index() - 1, 0))
        return
      case 'Home':
        event.preventDefault()
        this.focusedIndex.set(0)
        return
      case 'End':
        event.preventDefault()
        this.focusedIndex.set(this.count() - 1)
        return
      case 'a':
      case 'A':
        event.preventDefault()
        this.adding.set(true)
        return
      default:
        break
    }

    const focused = this.focused()
    if (focused === undefined) return

    switch (event.key) {
      case 'm':
      case 'M': {
        event.preventDefault()
        // An empty palette is a real answer — the only row in a layout has
        // nowhere else to be — and saying so beats opening an empty dialog.
        if (this.targetsFor(focused.path).length === 0) {
          this.announcement.set(this.text()('said.nowhereToMove', { name: focused.name }))
          return
        }
        this.moving.set(focused)
        return
      }
      case 'w':
      case 'W': {
        event.preventDefault()
        if (wrapCandidates(this.rows(), focused).length === 0) {
          this.announcement.set(this.text()('said.nothingBeside', { name: focused.name }))
          return
        }
        this.wrapping.set(focused)
        return
      }
      case 'u':
      case 'U': {
        event.preventDefault()
        this.announcement.set(
          unwrapLayoutAndSay(this.session(), { layout: name, path: focused.path }),
        )
        return
      }
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        // Said plainly by builder-core: the field is still collected, it only has
        // no place in this arrangement. Anything else reads as a deletion.
        this.announcement.set(
          removeLayoutAndSay(this.session(), { layout: name, path: focused.path }),
        )
        return
      }
      default:
        return
    }
  }

  protected addLayout(): void {
    this.announcement.set(addLayoutAndSay(this.session()))
  }

  protected completeMove(target: Target): void {
    const node = this.moving()
    const name = this.name()
    this.moving.set(null)
    if (node === null || name === undefined) return
    this.announcement.set(
      moveLayoutAndSay(this.session(), { layout: name, path: node.path }, target),
    )
    this.keepFocus = true
  }

  protected completeWrap(partner: LayoutTreeNode): void {
    const subject = this.wrapping()
    const name = this.name()
    this.wrapping.set(null)
    if (subject === null || name === undefined) return
    // The focused item first, so the order is the one the person chose rather
    // than the one the document happened to have.
    this.announcement.set(wrapAndSay(this.session(), name, subject.path, partner.path))
    this.keepFocus = true
  }

  /**
   * Escape inside a dialog closes it. On the dialog rather than the document, so
   * it cannot swallow the key from anything else on the page — the React pane's
   * shape, which this one lacked: its dialogs could only be left by Cancel.
   */
  protected onDialogEscape(event: Event): void {
    event.preventDefault()
    event.stopPropagation()
    this.cancelDialog()
  }

  protected cancelDialog(): void {
    this.adding.set(false)
    this.moving.set(null)
    this.wrapping.set(null)
    this.keepFocus = true
    this.items()[this.index()]?.nativeElement.focus()
  }

  private anyDialogOpen(): boolean {
    return this.adding() || this.moving() !== null || this.wrapping() !== null
  }

  private targetsFor(what: LayoutNode | readonly number[]): Target[] {
    const name = this.name()
    if (name === undefined) return []
    const from = Array.isArray(what) ? (what as readonly number[]) : undefined
    return this.session()
      .validLayoutTargets(name, what)
      .map((location) => ({
        location,
        label: describeLayoutTarget(this.view().document, location, from, this.text()),
      }))
  }
}

/** Which half of the row the pointer is over. */
function edgeOf(event: DragEvent): 'before' | 'after' {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after'
}
