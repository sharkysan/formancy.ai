import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import { useBuilder } from './use-builder.js'
import type { MoveTarget } from './use-builder.js'
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
  ['m', 'move the focused field'],
  ['Delete', 'remove it'],
  ['Ctrl+Z / Ctrl+Y', 'undo / redo'],
] as const

export function FormancyBuilder({ session, label = 'Form structure' }: BuilderProps): ReactElement {
  const view = useBuilder(session)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [moving, setMoving] = useState<{ node: TreeNode; targets: MoveTarget[] } | null>(null)
  const [announcement, setAnnouncement] = useState('')

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
    if (moving !== null) return
    const active = document.activeElement
    const inside = treeRef.current !== null && active !== null && treeRef.current.contains(active)
    if (inside || keepFocus.current) itemRefs.current[index]?.focus()
    keepFocus.current = false
  }, [index, moving, view.document])

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
          announce(`${nameOf(focused)} cannot be moved anywhere else.`)
          return
        }
        setMoving({ node: focused, targets })
        break
      }
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        const outcome = session.removeField(focused.keyPath)
        announce(
          outcome.ok
            ? `Removed ${nameOf(focused)}.`
            : `Cannot remove ${nameOf(focused)}: ${outcome.message}`,
        )
        break
      }
      default:
        break
    }
  }

  const completeMove = (target: MoveTarget): void => {
    const node = moving?.node
    setMoving(null)
    if (node === undefined) return

    const outcome = session.moveField(node.keyPath, target.location)
    announce(
      outcome.ok ? `Moved ${nameOf(node)} to ${target.label}.` : `Cannot move: ${outcome.message}`,
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
          >
            {nameOf(node)}
          </li>
        ))}
      </ul>

      {count === 0 ? <p data-formancy-part="builder-empty">This form has no fields yet.</p> : null}

      {moving === null ? null : (
        <div role="dialog" aria-label={`Move ${nameOf(moving.node)}`} data-formancy-part="move-palette">
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

function nameOf(node: TreeNode): string {
  const label = node.def.label
  return typeof label === 'string' && label !== '' ? label : node.def.key
}
