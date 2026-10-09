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
  addPageAndSay,
  blockTargets,
  describeTarget,
  dropAndSay,
  insertAndSay,
  insertBlockAndSay,
  moveAndSay,
  nameOf,
  newFieldOfType,
  nextSpecVersion,
  paletteEntries,
  redoAndSay,
  removeAndSay,
  saveBlockAndSay,
  treeKeyHelp,
  typesNeedingUpgrade,
  undoAndSay,
  unwrapAndSay,
  upgradeAndSay,
} from '@formancy/builder-core'
import type { BuilderBlock } from '@formancy/builder-core'
import type {
  BuilderSession,
  FieldDef,
  Location,
  MoveTarget,
  PaletteEntry,
  TreeNode,
} from './types.js'
import { dropLocation } from '@formancy/builder-core'
import { FormancyPaletteBlocks, FormancySaveBlock } from './blocks.js'
import { BuilderTextPipe } from './text.pipe.js'
import { injectBuilderView } from './view.js'

/** The add palette's two steps: which type — or which block — then where it goes. */
interface Adding {
  type: string
  block?: BuilderBlock
}

interface Moving {
  node: TreeNode
  targets: MoveTarget[]
}

/**
 * The form's structure, as a tree somebody can edit with the keyboard.
 *
 * The Angular half of `@formancy/builder-react`'s `FormancyBuilder`, over the
 * same session and the same view. Zoneless and `OnPush`: the session is read
 * through one signal that changes exactly once per accepted command, so a
 * keystroke that the session refuses costs no render at all.
 *
 * **Keyboard first, and not as a courtesy.** WCAG 2.2 SC 2.5.7 requires a
 * complete keyboard path for every drag operation, and a builder that grows one
 * afterwards never quite gets it — so every command here is a key, every
 * destination is a sentence rather than an index, and the drag surface is an
 * addition for people who prefer it rather than the way the thing works
 * ([0046](../../../docs/decisions/0046-keyboard-before-drag.md)).
 */
@Component({
  selector: 'formancy-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe, FormancyPaletteBlocks, FormancySaveBlock],
  template: `
    <div data-formancy-part="builder">
      <ul
        #tree
        role="tree"
        [attr.aria-label]="label() ?? ('tree.label' | builderText: text())"
        data-formancy-part="builder-tree"
        [attr.tabindex]="count() === 0 ? 0 : -1"
        (keydown)="onKeyDown($event)"
      >
        @for (node of view().nodes; track node.keyPath.join('.'); let position = $index) {
          <!-- 2.5.7 is satisfied by the keyboard path existing, not by the drag.
               Dragging is an addition for people who prefer it. -->
          <li
            #item
            role="treeitem"
            [attr.aria-level]="node.depth + 1"
            [attr.aria-selected]="position === index()"
            data-formancy-part="builder-node"
            [attr.data-container]="node.isContainer ? 'true' : null"
            [attr.tabindex]="position === index() ? 0 : -1"
            (focus)="focusedIndex.set(position)"
            draggable="true"
            [attr.data-dragging]="isDragging(node) ? 'true' : null"
            [attr.data-drop]="dropEdgeFor(position)"
            (dragstart)="onDragStart(node, $event)"
            (dragend)="onDragEnd()"
            (dragover)="onDragOver(node, position, $event)"
            (dragleave)="dropTarget.set(null)"
            (drop)="onDrop(node, $event)"
          >
            {{ nameOfNode(node) }}
          </li>
        }
      </ul>

      @if (count() === 0) {
        <p data-formancy-part="builder-empty">{{ 'tree.empty' | builderText: text() }}</p>
      }

      @if (adding() !== null) {
        @if (adding()!.type === '' && adding()!.block === undefined) {
          <div
            role="dialog"
            [attr.aria-label]="'palette.title' | builderText: text()"
            data-formancy-part="add-palette"
          >
            <ul>
              @for (entry of palette(); track entry.type) {
                <li>
                  <button type="button" (click)="chooseType(entry.type)">{{ entry.title }}</button>
                  <span data-formancy-part="palette-hint">{{ entry.description }}</span>
                </li>
              }
            </ul>
            @if (blocks(); as blocks) {
              <formancy-palette-blocks [blocks]="blocks" [text]="text()" (chosen)="adding.set({ type: '', block: $event })" />
            }
            @if (locked().length > 0) {
              <!-- Said rather than silently omitted: a shorter palette with no
                   explanation reads as a broken builder, when what is true is
                   that the document is written against an older version of the
                   spec and can be moved forward in one step. -->
              <p data-formancy-part="palette-locked">
                {{
                  'tree.locked'
                    | builderText
                      : text()
                      : { types: lockedNames(), version: view().document.specVersion, count: locked().length }
                }}
                <button type="button" (click)="upgrade()">
                  {{ 'tree.upgrade' | builderText: text() : { version: nextVersion() } }}
                </button>
              </p>
            }
            <button type="button" (click)="cancelDialog()">{{ 'dialog.cancel' | builderText: text() }}</button>
          </div>
        } @else {
          <div
            role="dialog"
            [attr.aria-label]="whereLabel()"
            data-formancy-part="add-where"
          >
            <ul>
              @for (target of insertTargets(); track targetKey(target)) {
                <li>
                  <button type="button" (click)="completeAdd(target)">{{ target.label }}</button>
                </li>
              }
            </ul>
            <button type="button" (click)="cancelDialog()">{{ 'dialog.cancel' | builderText: text() }}</button>
          </div>
        }
      }

      @if (moving() !== null) {
        <div
          role="dialog"
          [attr.aria-label]="'tree.moveTitle' | builderText: text() : { name: nameOfNode(moving()!.node) }"
          data-formancy-part="move-palette"
        >
          <ul>
            @for (target of moving()!.targets; track targetKey(target)) {
              <li>
                <button type="button" (click)="completeMove(target)">{{ target.label }}</button>
              </li>
            }
          </ul>
          <button type="button" (click)="cancelDialog()">{{ 'dialog.cancel' | builderText: text() }}</button>
        </div>
      }

      @if (saving(); as node) {
        <formancy-save-block [text]="text()" [initialName]="nameOfNode(node)" (save)="completeSave(node, $event)" (cancel)="cancelDialog()" />
      }

      <!-- One polite region for the whole builder, as in the renderers: a
           command's result is announced once, by the thing that knows it.
           role="status" already implies aria-live="polite"; setting both is the
           classic way to get an announcement twice. -->
      <p role="status" data-formancy-part="builder-status">{{ announcement() }}</p>

      <dl data-formancy-part="builder-keys">
        @for (entry of keyHelp(); track entry[0]) {
          <div>
            <dt>{{ entry[0] }}</dt>
            <dd>{{ entry[1] }}</dd>
          </div>
        }
      </dl>
    </div>
  `,
})
export class FormancyBuilder {
  readonly session = input.required<BuilderSession>()
  /** The tree's accessible name. The session's own words by default. */
  readonly label = input<string | undefined>(undefined)
  /**
   * The focused field's key path, for a consumer showing a property panel beside
   * the tree without reading our DOM.
   *
   * Keyed on the key path rather than the position, because an edit that
   * reorders the list leaves a position pointing at a different field and would
   * announce a selection nobody made.
   */
  readonly selected = output<readonly string[] | null>()
  /**
   * Blocks to offer beside the field types: pieces of a form saved to use again. Binding
   * this is how a host says it keeps blocks — only then is `b` a command — and
   * `blockSaved` hands it each one saved (0135).
   */
  readonly blocks = input<readonly BuilderBlock[] | undefined>(undefined)
  readonly blockSaved = output<BuilderBlock>()

  protected readonly view = injectBuilderView(this.session)
  /**
   * Every word this tree shows, in the language the session was opened in. What
   * a command SAYS afterwards is not worded here at all: builder-core decides it,
   * once, for this builder and the React one (0114).
   */
  protected readonly text = computed(() => this.session().text)
  /** The same legend the React builder shows, from the same place. */
  protected readonly keyHelp = computed(() =>
    treeKeyHelp(this.session(), { blocks: this.blocks() !== undefined }),
  )

  /** The position the arrow keys move. */
  protected readonly focusedIndex = signal(0)
  protected readonly adding = signal<Adding | null>(null)
  protected readonly moving = signal<Moving | null>(null)
  /** The field being saved as a block. */
  protected readonly saving = signal<TreeNode | null>(null)
  protected readonly announcement = signal('')
  protected readonly dragging = signal<readonly string[] | null>(null)
  protected readonly dropTarget = signal<{ index: number; edge: 'before' | 'after' } | null>(null)

  private readonly tree = viewChild<ElementRef<HTMLElement>>('tree')
  private readonly items = viewChildren<ElementRef<HTMLElement>>('item')

  /**
   * Whether the next render should put focus back on the tree.
   *
   * Set whenever a key is handled, which can only happen while the tree has
   * focus. Removing the focused row detaches it from the document and focus
   * falls to `<body>`, so by the time the effect runs the "is focus inside"
   * test says no — and without this the tree silently stops responding to the
   * keyboard after every delete.
   */
  private keepFocus = false
  /** The key path focus was on, so an edit hands the position back to the field. */
  private focusedKey: string | null = null
  /** The list as it was, so a correction happens on an edit and not on a keystroke. */
  private listed = ''

  protected readonly count = computed(() => this.view().nodes.length)
  protected readonly index = computed(() =>
    this.count() === 0 ? 0 : Math.min(this.focusedIndex(), this.count() - 1),
  )
  protected readonly focused = computed((): TreeNode | undefined => this.view().nodes[this.index()])
  protected readonly selectedKey = computed((): string | null => {
    const node = this.focused()
    return node === undefined ? null : node.keyPath.join('.')
  })
  protected readonly palette = computed((): PaletteEntry[] =>
    paletteEntries(this.view().document.specVersion, this.text()),
  )
  protected readonly locked = computed((): PaletteEntry[] =>
    typesNeedingUpgrade(this.view().document.specVersion, this.text()),
  )
  protected readonly lockedNames = computed(() =>
    this.text().list(this.locked().map((entry) => entry.title)),
  )
  protected readonly nextVersion = computed(
    () => nextSpecVersion(this.view().document.specVersion) ?? '',
  )
  /** Where the new field or block may go — a block asked with its words and rules too. */
  protected readonly insertTargets = computed((): MoveTarget[] => {
    const adding = this.adding()
    if (adding?.block !== undefined) {
      return blockTargets(this.view().document, adding.block, this.session().text)
    }
    if (adding === null || adding.type === '') return []
    return this.view().insertTargetsFor(this.newField(adding.type))
  })
  protected readonly whereLabel = computed(() => {
    const adding = this.adding()
    return adding?.block !== undefined
      ? this.text()('blocks.addWhere', { name: adding.block.name })
      : this.text()('tree.addWhere', { type: this.labelForType(adding?.type ?? '') })
  })

  constructor() {
    /*
     * Keep focus on the FIELD across an edit, not on the number.
     *
     * Only when the LIST itself changed, which is the whole subtlety: correcting
     * on every pass would override the arrow keys, because the key remembered a
     * moment ago is the key the arrows just moved away from. The arrows own the
     * position between edits; an edit hands it back to the field.
     *
     * `untracked` around everything this reads about the position, and that is
     * not a detail either. Written as an ordinary effect it both READ
     * `focusedIndex` and wrote it, which Angular treats as a cycle and answers
     * by not scheduling any further change detection — measured, and it looked
     * exactly like a component whose bindings had frozen: the key handler ran,
     * the signal changed, and the DOM kept the value from the first render.
     */
    effect(() => {
      const nodes = this.view().nodes
      untracked(() => {
        const listing = nodes.map((node) => node.keyPath.join('.')).join('|')
        if (listing !== this.listed) {
          this.listed = listing
          const wanted = this.focusedKey
          const at =
            wanted === null ? -1 : nodes.findIndex((node) => node.keyPath.join('.') === wanted)
          // Gone — deleted — and the clamped index is then the right answer.
          if (at !== -1 && at !== this.focusedIndex()) this.focusedIndex.set(at)
        }
      })
    })

    // Report the focused field outward, so a consumer can show a property panel
    // beside the tree without reading our DOM. Keyed on the key path rather than
    // the position, because an edit that reorders the list leaves a position
    // pointing at a different field and would announce a selection nobody made.
    effect(() => {
      const key = this.selectedKey()
      untracked(() => {
        this.focusedKey = key
        this.selected.emit(key === null ? null : key.split('.'))
      })
    })

    // Move focus WITHIN the tree, never INTO it. A component that grabs focus on
    // mount takes it from wherever the person actually was, which on a page with
    // a builder and a preview side by side is the preview.
    effect(() => {
      const at = this.index()
      const items = this.items()
      const root = this.tree()?.nativeElement
      untracked(() => {
        if (this.adding() !== null || this.moving() !== null || this.saving() !== null) return
        const active = document.activeElement
        const inside = root !== undefined && active !== null && root.contains(active)
        if (inside || this.keepFocus) items[at]?.nativeElement.focus()
        this.keepFocus = false
      })
    })
  }


  protected isDragging(node: TreeNode): boolean {
    const from = this.dragging()
    return from !== null && from.join('.') === node.keyPath.join('.')
  }

  protected dropEdgeFor(position: number): string | null {
    const target = this.dropTarget()
    return target?.index === position ? target.edge : null
  }

  protected onDragStart(node: TreeNode, event: DragEvent): void {
    this.dragging.set(node.keyPath)
    if (event.dataTransfer === null) return
    event.dataTransfer.effectAllowed = 'move'
    // Some browsers refuse to start a drag without data set.
    event.dataTransfer.setData('text/plain', node.keyPath.join('.'))
  }

  protected onDragEnd(): void {
    this.dragging.set(null)
    this.dropTarget.set(null)
  }

  protected onDragOver(node: TreeNode, position: number, event: DragEvent): void {
    const from = this.dragging()
    if (from === null) return
    const edge = edgeOf(event)
    // Only a legal drop shows an indicator and accepts one. Allowing a drop the
    // session will refuse means the field snaps back with no explanation.
    if (dropLocation(this.view().document, from, node.keyPath, edge) === undefined) {
      this.dropTarget.set(null)
      return
    }
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
    this.dropTarget.set({ index: position, edge })
  }

  protected onDrop(node: TreeNode, event: DragEvent): void {
    event.preventDefault()
    const from = this.dragging()
    this.dragging.set(null)
    this.dropTarget.set(null)
    if (from === null) return

    const location = dropLocation(this.view().document, from, node.keyPath, edgeOf(event))
    if (location === undefined) return

    // Through the same live region the keyboard path uses, so a drag is not a
    // silent command for somebody using both — and naming the field that moved,
    // not the row it landed on.
    this.announce(dropAndSay(this.session(), from, location))
  }

  protected nameOfNode(node: TreeNode): string {
    return nameOf(this.view().document, node.def)
  }

  protected targetKey(target: MoveTarget): string {
    return `${target.location.parent.join('.')}:${String(target.location.index)}`
  }

  protected labelForType(type: string): string {
    return paletteEntries(undefined, this.text()).find((entry) => entry.type === type)?.title ?? type
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const focused = this.focused()
    if (focused === undefined) return
    // A key reached us, so the tree has focus and must still have it after
    // whatever this does to the document.
    this.keepFocus = true

    // Let the browser have its own shortcuts.
    if (event.altKey || event.metaKey) return

    if (event.ctrlKey) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        this.announce(undoAndSay(this.session()))
      } else if (key === 'y') {
        event.preventDefault()
        this.announce(redoAndSay(this.session()))
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.focusedIndex.set(Math.min(this.index() + 1, this.count() - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        this.focusedIndex.set(Math.max(this.index() - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        this.focusedIndex.set(0)
        break
      case 'End':
        event.preventDefault()
        this.focusedIndex.set(this.count() - 1)
        break
      case 'Escape':
        event.preventDefault()
        this.cancelDialog()
        break
      case 'a':
      case 'A':
        event.preventDefault()
        this.adding.set({ type: '' })
        break
      case 'm':
      case 'M': {
        event.preventDefault()
        const targets = this.view().moveTargetsFor(focused.keyPath)
        // An empty palette is a real answer — a page cannot go inside a group —
        // and saying so beats opening an empty dialog.
        if (targets.length === 0) {
          this.announce(this.text()('said.nowhereToMove', { name: this.nameOfNode(focused) }))
          return
        }
        this.moving.set({ node: focused, targets })
        break
      }
      case 'p':
      case 'P':
        event.preventDefault()
        this.announce(addPageAndSay(this.session()))
        break
      case 'b':
      case 'B':
        // Only where a host keeps blocks; otherwise the key is nobody's.
        if (this.blocks() === undefined) break
        event.preventDefault()
        this.saving.set(focused)
        break
      case 'u':
      case 'U':
        event.preventDefault()
        this.announce(unwrapAndSay(this.session(), focused.keyPath))
        break
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        this.announce(removeAndSay(this.session(), focused.keyPath))
        break
      }
      default:
        break
    }
  }

  protected chooseType(type: string): void {
    this.adding.set({ type })
  }

  protected completeAdd(target: MoveTarget): void {
    const adding = this.adding()
    this.adding.set(null)
    this.announce(
      adding?.block !== undefined
        ? insertBlockAndSay(this.session(), adding.block, target)
        : insertAndSay(this.session(), this.newField(adding?.type ?? ''), target),
    )
    this.keepFocus = true
  }

  protected completeSave(node: TreeNode, name: string): void {
    this.saving.set(null)
    const { block, said } = saveBlockAndSay(this.session(), node.keyPath, {
      id: crypto.randomUUID(),
      name: name.trim() === '' ? this.nameOfNode(node) : name.trim(),
    })
    if (block !== undefined) this.blockSaved.emit(block)
    this.announce(said)
    this.keepFocus = true
    this.items()[this.index()]?.nativeElement.focus()
  }

  protected completeMove(target: MoveTarget): void {
    const node = this.moving()?.node
    this.moving.set(null)
    if (node === undefined) return
    this.announce(moveAndSay(this.session(), node.keyPath, target))
    this.keepFocus = true
  }

  protected cancelDialog(): void {
    this.adding.set(null)
    this.moving.set(null)
    this.saving.set(null)
    this.keepFocus = true
    this.items()[this.index()]?.nativeElement.focus()
  }

  protected upgrade(): void {
    this.announce(upgradeAndSay(this.session()))
  }

  private newField(type: string): FieldDef {
    const existing = new Set(
      this.view().nodes.map((node) => node.keyPath[node.keyPath.length - 1] ?? ''),
    )
    return newFieldOfType(type, existing, this.session().text)
  }

  private announce(message: string): void {
    this.announcement.set(message)
  }
}

export type { Location }

/** Which half of the row the pointer is over. */
function edgeOf(event: DragEvent): 'before' | 'after' {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after'
}
