import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import { dropLocation } from './drop.js'
import { newFieldOfType, paletteEntries } from './palette.js'
import { useBuilder } from './use-builder.js'
import type { MoveTarget } from './use-builder.js'
import { nameOf } from './tree.js'
import type { TreeNode } from './tree.js'

/**
 * The structure editor, driven entirely from the keyboard.
 *
 * Built in this order on purpose. WCAG 2.2 SC 2.5.7 requires every drag
 * operation to have a single-pointer or keyboard alternative, and the reliable
 * way to get one is to build it first — a drag surface written first is a drag
 * surface shipped first, with the keyboard path filed as a follow-up that
 * competes with features. There is no drag here yet, and when there is, it will
 * be a second way to reach these same commands rather than the only way.
 *
 * Follows the ARIA tree pattern: one tab stop for the whole tree (roving
 * tabindex), arrows to move within it, and commands on the focused item.
 */

export interface BuilderProps {
  session: BuilderSession
  /** Announced as the tree's accessible name. */
  label?: string
}

const KEY_HELP = [
  ['↑ ↓', 'move between fields'],
  ['a', 'add a field'],
  ['m', 'move the focused field'],
  ['Delete', 'remove it'],
  ['Ctrl+Z / Ctrl+Y', 'undo / redo'],
] as const

export function FormancyBuilder({ session, label = 'Form structure' }: BuilderProps): ReactElement {
  const view = useBuilder(session)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [moving, setMoving] = useState<{ node: TreeNode; targets: MoveTarget[] } | null>(null)
  // Adding is two choices: what, then where. Kept as one piece of state so the
  // second question cannot be asked without an answer to the first.
  const [adding, setAdding] = useState<{ type: string } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  /**
   * The drag in progress, if any.
   *
   * A second way to reach the same commands — never the only way. WCAG 2.2
   * SC 2.5.7 requires an equivalent alternative to every dragging movement,
   * and the alternative here is the whole keyboard interface, which was built
   * first and does not depend on this.
   */
  const [dragging, setDragging] = useState<readonly string[] | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: 'before' | 'after' } | null>(
    null,
  )

  const itemRefs = useRef<Array<HTMLLIElement | null>>([])
  const treeRef = useRef<HTMLUListElement | null>(null)

  // A command can remove the focused row, or the document can change under it.
  // Clamping here rather than at each call site means there is one place where
  // focus cannot end up past the end of the list.
  const count = view.nodes.length
  const index = count === 0 ? 0 : Math.min(focusedIndex, count - 1)
  const focused = view.nodes[index]

  // Move focus WITHIN the tree, never INTO it. A component that grabs focus
  // when it mounts takes it from wherever the person actually was, and on a
  // page with a builder and a preview side by side that is the preview. So
  // this only acts when focus is already somewhere in the tree — which is true
  // after any arrow key, and false on first render.
  // Set whenever a key is handled, which can only happen while the tree has
  // focus. Removing the focused row detaches it from the document and focus
  // falls to <body>, so by the time this effect runs the "is focus inside"
  // test says no — and without this flag the tree would silently stop
  // responding to the keyboard after every delete.
  const keepFocus = useRef(false)

  useEffect(() => {
    if (moving !== null || adding !== null) return
    const active = document.activeElement
    const inside = treeRef.current !== null && active !== null && treeRef.current.contains(active)
    if (inside || keepFocus.current) itemRefs.current[index]?.focus()
    keepFocus.current = false
  }, [index, moving, adding, view.document])

  const announce = useCallback((message: string) => {
    setAnnouncement(message)
  }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    if (focused === undefined) return
    // A key reached us, so the tree has focus and must still have it after
    // whatever this does to the document.
    keepFocus.current = true

    // Let the browser have its own shortcuts.
    if (event.altKey || event.metaKey) return

    if (event.ctrlKey) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        announce(session.undo() ? 'Undone.' : 'Nothing to undo.')
      } else if (key === 'y') {
        event.preventDefault()
        announce(session.redo() ? 'Redone.' : 'Nothing to redo.')
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setFocusedIndex(Math.min(index + 1, count - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setFocusedIndex(Math.max(index - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setFocusedIndex(0)
        break
      case 'End':
        event.preventDefault()
        setFocusedIndex(count - 1)
        break
      case 'm':
      case 'M': {
        event.preventDefault()
        const targets = view.moveTargetsFor(focused.keyPath)
        // An empty palette is a real answer — a page cannot go inside a group —
        // and saying so is better than opening an empty dialog.
        if (targets.length === 0) {
          announce(`${nameOf(view.document, focused.def)} cannot be moved anywhere else.`)
          return
        }
        setMoving({ node: focused, targets })
        break
      }
      case 'a':
      case 'A':
        event.preventDefault()
        setAdding({ type: '' })
        break
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        const outcome = session.removeField(focused.keyPath)
        announce(
          outcome.ok
            ? `Removed ${nameOf(view.document, focused.def)}.`
            : `Cannot remove ${nameOf(view.document, focused.def)}: ${outcome.message}`,
        )
        break
      }
      default:
        break
    }
  }

  const existingKeys = new Set(view.nodes.map((node) => node.keyPath[node.keyPath.length - 1]!))

  const insertTargets = (type: string): MoveTarget[] =>
    view.insertTargetsFor(newFieldOfType(type, existingKeys))

  const cancelDialog = (): void => {
    setAdding(null)
    setMoving(null)
    keepFocus.current = true
    treeRef.current?.focus()
    itemRefs.current[index]?.focus()
  }

  const completeAdd = (type: string, target: MoveTarget): void => {
    setAdding(null)
    const def = newFieldOfType(type, existingKeys)
    const outcome = session.insertField(target.location, def)
    announce(
      outcome.ok
        ? `Added ${labelForType(type)} to ${target.label}.`
        : `Cannot add: ${outcome.message}`,
    )
    keepFocus.current = true
    itemRefs.current[index]?.focus()
  }

  const completeMove = (target: MoveTarget): void => {
    const node = moving?.node
    setMoving(null)
    if (node === undefined) return

    const outcome = session.moveField(node.keyPath, target.location)
    announce(
      outcome.ok ? `Moved ${nameOf(view.document, node.def)} to ${target.label}.` : `Cannot move: ${outcome.message}`,
    )
    treeRef.current?.focus()
  }

  return (
    <div data-formancy-part="builder">
      <ul
        ref={treeRef}
        role="tree"
        aria-label={label}
        data-formancy-part="builder-tree"
        tabIndex={count === 0 ? 0 : -1}
        // Once, on the tree. Keys bubble from the focused item, and a handler
        // on both fires every command twice — which for Delete means removing
        // a field and then failing to remove it again.
        onKeyDown={onKeyDown}
      >
        {view.nodes.map((node, position) => (
          <li
            key={node.keyPath.join('.')}
            ref={(element) => {
              itemRefs.current[position] = element
            }}
            role="treeitem"
            aria-level={node.depth + 1}
            aria-selected={position === index}
            data-formancy-part="builder-node"
            data-container={node.isContainer ? 'true' : undefined}
            // Roving tabindex: the tree is one stop, not one per field. A
            // hundred-field form should not cost a hundred tabs to get past.
            tabIndex={position === index ? 0 : -1}
            onFocus={() => setFocusedIndex(position)}
            // 2.5.7 is satisfied by the keyboard path existing, not by this.
            // Dragging is an addition for people who prefer it.
            draggable
            data-dragging={dragging !== null && samePath(dragging, node.keyPath) ? 'true' : undefined}
            data-drop={dropTarget?.index === position ? dropTarget.edge : undefined}
            onDragStart={(event) => {
              setDragging(node.keyPath)
              event.dataTransfer.effectAllowed = 'move'
              // Some browsers refuse to start a drag without data set.
              event.dataTransfer.setData('text/plain', node.keyPath.join('.'))
            }}
            onDragEnd={() => {
              setDragging(null)
              setDropTarget(null)
            }}
            onDragOver={(event) => {
              if (dragging === null) return
              const edge = edgeOf(event)
              // Only a legal drop shows an indicator and accepts. Allowing one
              // the session will refuse means the field snaps back with no
              // explanation.
              if (dropLocation(view.document, dragging, node.keyPath, edge) === undefined) {
                setDropTarget(null)
                return
              }
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropTarget({ index: position, edge })
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => {
              event.preventDefault()
              const from = dragging
              setDragging(null)
              setDropTarget(null)
              if (from === null) return

              const location = dropLocation(view.document, from, node.keyPath, edgeOf(event))
              if (location === undefined) return

              const outcome = session.moveField(from, location)
              // Announced through the same live region the keyboard path uses,
              // so a drag is not a silent command for somebody using both.
              announce(
                outcome.ok
                  ? `Moved ${nameOf(view.document, node.def)}.`
                  : `Cannot move: ${outcome.message}`,
              )
            }}
          >
            {nameOf(view.document, node.def)}
          </li>
        ))}
      </ul>

      {count === 0 ? <p data-formancy-part="builder-empty">This form has no fields yet.</p> : null}

      {adding === null ? null : adding.type === '' ? (
        <div role="dialog" aria-label="Add a field" data-formancy-part="add-palette">
          <ul>
            {paletteEntries().map((entry) => (
              <li key={entry.type}>
                <button type="button" onClick={() => setAdding({ type: entry.type })}>
                  {entry.title}
                </button>
                <span data-formancy-part="palette-hint">{entry.description}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => cancelDialog()}>
            Cancel
          </button>
        </div>
      ) : (
        <div
          role="dialog"
          aria-label={`Where should the ${labelForType(adding.type)} go?`}
          data-formancy-part="add-where"
        >
          <ul>
            {insertTargets(adding.type).map((target) => (
              <li key={`${target.location.parent.join('.')}:${String(target.location.index)}`}>
                <button type="button" onClick={() => completeAdd(adding.type, target)}>
                  {target.label}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => cancelDialog()}>
            Cancel
          </button>
        </div>
      )}

      {moving === null ? null : (
        <div role="dialog" aria-label={`Move ${nameOf(view.document, moving.node.def)}`} data-formancy-part="move-palette">
          <ul>
            {moving.targets.map((target) => (
              <li key={`${target.location.parent.join('.')}:${String(target.location.index)}`}>
                <button type="button" onClick={() => completeMove(target)}>
                  {target.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setMoving(null)
              treeRef.current?.focus()
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* One polite region for the whole builder, as in the renderers: a
          command's result is announced once, by the thing that knows it.
          role="status" already implies aria-live="polite"; setting both is the
          classic way to get an announcement twice. */}
      <p role="status" data-formancy-part="builder-status">
        {announcement}
      </p>

      <dl data-formancy-part="builder-keys">
        {KEY_HELP.map(([keys, what]) => (
          <div key={keys}>
            <dt>{keys}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Which half of the row the pointer is over. */
function edgeOf(event: React.DragEvent<HTMLElement>): 'before' | 'after' {
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after'
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, at) => key === b[at])
}

function labelForType(type: string): string {
  return paletteEntries().find((entry) => entry.type === type)?.title ?? type
}


