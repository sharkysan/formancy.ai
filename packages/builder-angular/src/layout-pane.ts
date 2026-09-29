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
import { describeLayoutTarget, flattenLayout, nameOfPath } from '@formancy/builder-core'
import type {
  BuilderSession,
  LayoutLocation,
  LayoutNode,
  LayoutTreeNode,
} from './types.js'
import { injectBuilderView } from './view.js'

/** What the legend lists. Same spelling as the React pane's, deliberately. */
const KEY_HELP: ReadonlyArray<readonly [string, string]> = [
  ['↑ ↓', 'move between items'],
  ['a', 'add a row, column or section'],
  ['m', 'move the focused item'],
  ['u', 'unwrap a row or column, keeping what is in it'],
  ['w', 'wrap it and another item into a row, side by side'],
  ['Delete', 'take it out of the arrangement'],
  ['Ctrl+Z / Ctrl+Y', 'undo / redo'],
]

/** The containers this pane can add. A field placement comes from the unplaced list. */
const CONTAINERS = ['row', 'column', 'section'] as const

interface Target {
  location: LayoutLocation
  label: string
}

/** Whether `outer` is `inner` or one of its ancestors. */
function enclosesPath(outer: readonly number[], inner: readonly number[]): boolean {
  return outer.length < inner.length && outer.every((step, at) => inner[at] === step)
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, at) => b[at] === step)
}

/**
 * The arrangement editor for Angular: rows, columns and sections, by keyboard.
 *
 * A separate pane rather than a mode of the structure tree, for the reason the
 * React one gives: the model answers *what does this form collect* and the
 * arrangement answers *where does it appear*, and a field can be in one without
 * being in the other. One tree showing both would have to pretend those are the
 * same question.
 *
 * Which destinations exist, how each is described, and what may be wrapped with
 * what all come from `@formancy/builder-core` — shared with the React pane, so
 * the two cannot offer different answers about one document.
 */
@Component({
  selector: 'formancy-layout-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-formancy-part="layout-pane">
      <ul
        #tree
        role="tree"
        [attr.aria-label]="label()"
        data-formancy-part="layout-tree"
        [attr.tabindex]="count() === 0 ? 0 : -1"
        (keydown)="onKeyDown($event)"
      >
        @for (row of rows(); track row.path.join('.'); let position = $index) {
          <li
            #item
            role="treeitem"
            [attr.aria-level]="row.depth + 1"
            [attr.aria-selected]="position === index()"
            data-formancy-part="layout-node"
            [attr.data-kind]="row.node.kind"
            [attr.tabindex]="position === index() ? 0 : -1"
            (focus)="focusedIndex.set(position)"
          >
            {{ row.name }}
          </li>
        }
      </ul>

      @if (count() === 0) {
        <p data-formancy-part="layout-empty">
          This arrangement places nothing yet, so the form falls back to the model's own order.
        </p>
      }

      @if (unplaced().length > 0) {
        <!-- Named, not hidden. A field the only arrangement leaves out is
             collected by the form and invisible to everyone filling it in, and
             that is exactly the mistake this pane can prevent. -->
        <div data-formancy-part="layout-unplaced">
          <h3>Not in this arrangement</h3>
          <ul>
            @for (path of unplaced(); track path) {
              <li>{{ nameOf(path) }}</li>
            }
          </ul>
        </div>
      }

      @if (adding()) {
        <div role="dialog" aria-label="Add to the arrangement" data-formancy-part="layout-add">
          <ul>
            @for (kind of containers; track kind) {
              <li><button type="button" (click)="chooseContainer(kind)">{{ kind }}</button></li>
            }
          </ul>
          <button type="button" (click)="cancelDialog()">Cancel</button>
        </div>
      }

      @if (addingWhere() !== null) {
        <div
          role="dialog"
          [attr.aria-label]="'Where should the ' + addingWhere() + ' go?'"
          data-formancy-part="layout-add-where"
        >
          <ul>
            @for (target of addTargets(); track targetKey(target)) {
              <li><button type="button" (click)="completeAdd(target)">{{ target.label }}</button></li>
            }
          </ul>
          <button type="button" (click)="cancelDialog()">Cancel</button>
        </div>
      }

      @if (moving() !== null) {
        <div
          role="dialog"
          [attr.aria-label]="'Move ' + moving()!.name"
          data-formancy-part="layout-move"
        >
          <ul>
            @for (target of moveTargets(); track targetKey(target)) {
              <li><button type="button" (click)="completeMove(target)">{{ target.label }}</button></li>
            }
          </ul>
          <button type="button" (click)="cancelDialog()">Cancel</button>
        </div>
      }

      @if (wrapping() !== null) {
        <div
          role="dialog"
          [attr.aria-label]="'What should go beside ' + wrapping()!.name + ' in a row?'"
          data-formancy-part="layout-wrap"
        >
          <ul>
            @for (candidate of wrapCandidates(); track candidate.path.join('.')) {
              <li>
                <button type="button" (click)="completeWrap(candidate)">{{ candidate.name }}</button>
              </li>
            }
          </ul>
          <button type="button" (click)="cancelDialog()">Cancel</button>
        </div>
      }

      <p role="status" data-formancy-part="layout-status">{{ announcement() }}</p>

      <dl data-formancy-part="layout-keys">
        @for (entry of keyHelp; track entry[0]) {
          <div>
            <dt>{{ entry[0] }}</dt>
            <dd>{{ entry[1] }}</dd>
          </div>
        }
      </dl>
    </div>
  `,
})
export class FormancyLayoutPane {
  readonly session = input.required<BuilderSession>()
  /** Which arrangement to edit. Defaults to the first one the form has. */
  readonly layout = input<string | undefined>(undefined)
  readonly label = input('Arrangement')
  /**
   * The node the person is on, as its index path, or `null` when the
   * arrangement is empty. Keyed on the PATH rather than the position: an edit
   * that reorders the arrangement leaves a position pointing at another node.
   */
  readonly selected = output<readonly number[] | null>()

  protected readonly keyHelp = KEY_HELP
  protected readonly containers = CONTAINERS
  protected readonly view = injectBuilderView(this.session)

  protected readonly focusedIndex = signal(0)
  protected readonly adding = signal(false)
  protected readonly addingWhere = signal<string | null>(null)
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

  private readonly tree = viewChild<ElementRef<HTMLElement>>('tree')
  private readonly items = viewChildren<ElementRef<HTMLElement>>('item')
  private keepFocus = false
  private listed = ''
  private focusedPath: string | null = null

  protected readonly name = computed(
    () => this.layout() ?? (this.view().document.layouts ?? [])[0]?.name,
  )
  protected readonly rows = computed((): LayoutTreeNode[] => {
    const name = this.name()
    return name === undefined ? [] : flattenLayout(this.view().document, name)
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
  protected readonly addTargets = computed((): Target[] => {
    const kind = this.addingWhere()
    if (kind === null) return []
    return this.targetsFor({ kind, children: [] } as unknown as LayoutNode)
  })
  protected readonly moveTargets = computed((): Target[] => {
    const node = this.moving()
    return node === undefined || node === null ? [] : this.targetsFor(node.path)
  })
  /**
   * Which items the focused one may be put in a row with.
   *
   * Its own descendants and its own ancestors are left out: the session refuses
   * to wrap a container together with something inside it, and not offering a
   * choice beats offering it and explaining afterwards.
   */
  protected readonly wrapCandidates = computed((): LayoutTreeNode[] => {
    const subject = this.wrapping()
    if (subject === null) return []
    return this.candidatesFor(subject)
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
        if (this.adding() || this.addingWhere() !== null) return
        if (this.moving() !== null || this.wrapping() !== null) return
        const active = document.activeElement
        const inside = root !== undefined && active !== null && root.contains(active)
        if (inside || this.keepFocus) items[at]?.nativeElement.focus()
        this.keepFocus = false
      })
    })
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
        this.announcement.set(this.session().undo() ? 'Undone.' : 'Nothing to undo.')
      } else if (key === 'y') {
        event.preventDefault()
        this.announcement.set(this.session().redo() ? 'Redone.' : 'Nothing to redo.')
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
          this.announcement.set(`${focused.name} cannot be moved anywhere else.`)
          return
        }
        this.moving.set(focused)
        return
      }
      case 'w':
      case 'W': {
        event.preventDefault()
        if (this.candidatesFor(focused).length === 0) {
          this.announcement.set(`There is nothing to put beside ${focused.name}.`)
          return
        }
        this.wrapping.set(focused)
        return
      }
      case 'u':
      case 'U': {
        event.preventDefault()
        const outcome = this.session().unwrapLayoutNode({ layout: name, path: focused.path })
        this.announcement.set(
          outcome.ok
            ? `Unwrapped ${focused.name}. What was inside it stayed where it was.`
            : `Cannot unwrap ${focused.name}: ${outcome.message}`,
        )
        return
      }
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        const outcome = this.session().removeLayoutNode({ layout: name, path: focused.path })
        this.announcement.set(
          outcome.ok
            ? // Said plainly: the field is still collected, it just has no place
              // in this arrangement. Anything else reads as a deletion.
              `Took ${focused.name} out of the arrangement. The form still collects it.`
            : `Cannot remove ${focused.name}: ${outcome.message}`,
        )
        return
      }
      default:
        return
    }
  }

  protected chooseContainer(kind: string): void {
    this.adding.set(false)
    this.addingWhere.set(kind)
  }

  protected completeAdd(target: Target): void {
    const kind = this.addingWhere()
    this.addingWhere.set(null)
    const name = this.name()
    if (kind === null || name === undefined) return
    const outcome = this.session().insertLayoutNode(target.location, {
      kind,
      children: [],
    } as unknown as LayoutNode)
    this.announcement.set(
      outcome.ok ? `Added ${kind} to ${target.label}.` : `Cannot add: ${outcome.message}`,
    )
    this.keepFocus = true
  }

  protected completeMove(target: Target): void {
    const node = this.moving()
    const name = this.name()
    this.moving.set(null)
    if (node === null || name === undefined) return
    const outcome = this.session().moveLayoutNode(
      { layout: name, path: node.path },
      target.location,
    )
    this.announcement.set(
      outcome.ok ? `Moved ${node.name} to ${target.label}.` : `Cannot move: ${outcome.message}`,
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
    const outcome = this.session().wrapLayoutNodes(name, [subject.path, partner.path], {
      kind: 'row',
      children: [],
    })
    this.announcement.set(
      outcome.ok
        ? `Put ${subject.name} and ${partner.name} side by side in a row.`
        : `Cannot wrap: ${outcome.message}`,
    )
    this.keepFocus = true
  }

  protected cancelDialog(): void {
    this.adding.set(false)
    this.addingWhere.set(null)
    this.moving.set(null)
    this.wrapping.set(null)
    this.keepFocus = true
    this.items()[this.index()]?.nativeElement.focus()
  }

  private anyDialogOpen(): boolean {
    return (
      this.adding() ||
      this.addingWhere() !== null ||
      this.moving() !== null ||
      this.wrapping() !== null
    )
  }

  private targetsFor(what: LayoutNode | readonly number[]): Target[] {
    const name = this.name()
    if (name === undefined) return []
    const from = Array.isArray(what) ? (what as readonly number[]) : undefined
    return this.session()
      .validLayoutTargets(name, what)
      .map((location) => ({
        location,
        label: describeLayoutTarget(this.view().document, location, from),
      }))
  }

  private candidatesFor(subject: LayoutTreeNode): LayoutTreeNode[] {
    return this.rows().filter(
      (candidate) =>
        !samePath(candidate.path, subject.path) &&
        !enclosesPath(subject.path, candidate.path) &&
        !enclosesPath(candidate.path, subject.path),
    )
  }
}
