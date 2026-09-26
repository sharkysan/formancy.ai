import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import type { BuilderSession, LayoutLocation } from '@formancy/builder-core'
import type { LayoutNode } from '@formancy/spec'
import { layoutDropLocation } from './layout-drop.js'
import { describeLayoutTarget, flattenLayout, nameOfPath } from './layout-tree.js'
import type { LayoutTreeNode } from './layout-tree.js'
import { useBuilder } from './use-builder.js'

/**
 * The arrangement editor: rows, columns and sections, moved by keyboard first.
 *
 * Same shape and the same order of construction as the structure editor, for
 * the same reason — WCAG 2.2 SC 2.5.7 wants an equivalent alternative to every
 * dragging movement, and the way to get one is to write it before the drag
 * rather than after. Dragging here is a second route to commands that already
 * work without it.
 *
 * Why a separate pane rather than a mode of the structure tree: the model
 * answers "what does this form collect" and the layout answers "where does it
 * appear", and a field can be in the model without being in the layout. One
 * tree that showed both would have to pretend those are the same question.
 */

export interface LayoutPaneProps {
  session: BuilderSession
  /** Which arrangement to edit. Defaults to the first one the form has. */
  layout?: string
  label?: string
}

const KEY_HELP = [
  ['↑ ↓', 'move between items'],
  ['a', 'add a row, column, section or field'],
  ['m', 'move the focused item'],
  ['u', 'unwrap a row or column, keeping what is in it'],
  ['w', 'wrap it and another item into a row, side by side'],
  ['Delete', 'take it out of the arrangement'],
  ['Ctrl+Z / Ctrl+Y', 'undo / redo'],
] as const

type Adding = { what: '' } | { what: 'row' | 'column' | 'section' } | { what: 'field'; path: string }

/** Whether `outer` is `inner` or one of its ancestors. */
function enclosesPath(outer: readonly number[], inner: readonly number[]): boolean {
  return outer.length < inner.length && outer.every((step, at) => inner[at] === step)
}

export function FormancyLayoutPane({
  session,
  layout,
  label = 'Arrangement',
}: LayoutPaneProps): ReactElement {
  const view = useBuilder(session)
  const layouts = view.document.layouts ?? []
  const name = layout ?? layouts[0]?.name

  const [focusedIndex, setFocusedIndex] = useState(0)
  const [moving, setMoving] = useState<LayoutTreeNode | null>(null)
  /**
   * The item waiting to be paired into a row.
   *
   * The same two-step shape the move command uses — press the key, then choose
   * from a list — rather than a second idiom to learn. The focused item is the
   * one that ends up FIRST in the row, because a rule somebody can state beats
   * an order that depends on document position.
   */
  const [wrapping, setWrapping] = useState<LayoutTreeNode | null>(null)
  const [adding, setAdding] = useState<Adding | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [dragging, setDragging] = useState<readonly number[] | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: 'before' | 'after' } | null>(
    null,
  )

  const itemRefs = useRef<Array<HTMLLIElement | null>>([])
  const treeRef = useRef<HTMLUListElement | null>(null)
  // Set whenever a key is handled. Removing the focused row detaches it and
  // focus falls to <body>, so the "is focus inside" test below says no — and
  // without this the tree would stop answering the keyboard after a delete.
  const keepFocus = useRef(false)

  const rows = name === undefined ? [] : flattenLayout(view.document, name)
  const count = rows.length
  const index = count === 0 ? 0 : Math.min(focusedIndex, count - 1)
  const focused = rows[index]
  const unplaced = name === undefined ? [] : session.unplacedFields(name)

  // Move focus WITHIN the tree, never INTO it: a pane that grabs focus on
  // mount takes it from wherever the person actually was, which on this screen
  // is the structure tree or the preview.
  useEffect(() => {
    if (moving !== null || adding !== null || wrapping !== null) return
    const active = document.activeElement
    const inside = treeRef.current !== null && active !== null && treeRef.current.contains(active)
    if (inside || keepFocus.current) itemRefs.current[index]?.focus()
    keepFocus.current = false
  }, [index, moving, adding, wrapping, view.document])

  const announce = useCallback((message: string) => setAnnouncement(message), [])

  const targetsFor = (what: LayoutNode | readonly number[]): Array<{ location: LayoutLocation; label: string }> => {
    if (name === undefined) return []
    const from = Array.isArray(what) ? (what as readonly number[]) : undefined
    return session
      .validLayoutTargets(name, what)
      .map((location) => ({ location, label: describeLayoutTarget(view.document, location, from) }))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    if (name === undefined) return
    keepFocus.current = true

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

    // Escape closes an open dialog wherever focus happens to be. Pressing
    // `w` leaves focus on the tree item, so the dialog's own handler never
    // sees the key -- which is the whole reason this is here as well.
    if (event.key === 'Escape' && (wrapping !== null || moving !== null || adding !== null)) {
      event.preventDefault()
      cancelDialog()
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setFocusedIndex(Math.min(index + 1, count - 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        setFocusedIndex(Math.max(index - 1, 0))
        return
      case 'Home':
        event.preventDefault()
        setFocusedIndex(0)
        return
      case 'End':
        event.preventDefault()
        setFocusedIndex(count - 1)
        return
      case 'a':
      case 'A':
        event.preventDefault()
        setAdding({ what: '' })
        return
      default:
        break
    }

    if (focused === undefined) return

    switch (event.key) {
      case 'm':
      case 'M': {
        event.preventDefault()
        // An empty palette is a real answer — the only row in a layout has
        // nowhere else to be — and saying so beats opening an empty dialog.
        if (targetsFor(focused.path).length === 0) {
          announce(`${focused.name} cannot be moved anywhere else.`)
          return
        }
        setMoving(focused)
        return
      }
      case 'w':
      case 'W': {
        event.preventDefault()
        // Saying so beats opening an empty dialog: a form with one item in its
        // arrangement has nothing to pair with.
        if (wrapCandidates(focused).length === 0) {
          announce(`There is nothing to put beside ${focused.name}.`)
          return
        }
        setWrapping(focused)
        return
      }
      case 'u':
      case 'U': {
        event.preventDefault()
        const outcome = session.unwrapLayoutNode({ layout: name, path: focused.path })
        announce(
          outcome.ok
            ? `Unwrapped ${focused.name}. What was inside it stayed where it was.`
            : `Cannot unwrap ${focused.name}: ${outcome.message}`,
        )
        return
      }
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        const outcome = session.removeLayoutNode({ layout: name, path: focused.path })
        announce(
          outcome.ok
            ? // Said plainly: the field is still collected, it just has no
              // place in this arrangement. Anything else reads as a deletion.
              `Took ${focused.name} out of the arrangement. The form still collects it.`
            : `Cannot remove ${focused.name}: ${outcome.message}`,
        )
        return
      }
      default:
        return
    }
  }

  const cancelDialog = (): void => {
    setAdding(null)
    setMoving(null)
    setWrapping(null)
    keepFocus.current = true
    itemRefs.current[index]?.focus()
  }

  /**
   * Escape closes whichever dialog is open.
   *
   * It was not handled for any of them, which leaves the Cancel button as the
   * only way out — and Escape is the first thing somebody tries in a dialog.
   * Put on the dialog rather than on the document so it cannot swallow the key
   * from anything else on the page.
   */
  const onDialogKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    cancelDialog()
  }

  const nodeBeingAdded = (what: Adding): LayoutNode | undefined => {
    if (what.what === '') return undefined
    if (what.what === 'field') return { kind: 'field', path: what.path }
    return { kind: what.what, children: [] }
  }

  const describeAdding = (what: Adding): string =>
    what.what === '' ? '' : what.what === 'field' ? nameOfPath(view.document, what.path) : what.what

  const completeAdd = (what: Adding, target: { location: LayoutLocation; label: string }): void => {
    setAdding(null)
    const node = nodeBeingAdded(what)
    if (node === undefined || name === undefined) return

    const outcome = session.insertLayoutNode(target.location, node)
    announce(
      outcome.ok
        ? `Added ${describeAdding(what)} to ${target.label}.`
        : `Cannot add: ${outcome.message}`,
    )
    keepFocus.current = true
    itemRefs.current[index]?.focus()
  }

  /**
   * Which items the focused one may be put in a row with.
   *
   * Its own descendants and its own ancestors are left out: the session refuses
   * to wrap a container together with something inside it, and not offering a
   * choice beats offering it and explaining afterwards.
   */
  const wrapCandidates = (subject: LayoutTreeNode): LayoutTreeNode[] =>
    rows.filter(
      (candidate) =>
        !samePath(candidate.path, subject.path) &&
        !enclosesPath(subject.path, candidate.path) &&
        !enclosesPath(candidate.path, subject.path),
    )

  const completeWrap = (partner: LayoutTreeNode): void => {
    const subject = wrapping
    setWrapping(null)
    if (subject === null || name === undefined) return

    // The focused item first, so the order is the one the person chose rather
    // than the one the document happened to have.
    const outcome = session.wrapLayoutNodes(name, [subject.path, partner.path], {
      kind: 'row',
      children: [],
    })
    announce(
      outcome.ok
        ? `Put ${subject.name} and ${partner.name} side by side in a row.`
        : `Cannot wrap: ${outcome.message}`,
    )
    keepFocus.current = true
    treeRef.current?.focus()
  }

  const completeMove = (target: { location: LayoutLocation; label: string }): void => {
    const node = moving
    setMoving(null)
    if (node === undefined || node === null || name === undefined) return

    const outcome = session.moveLayoutNode({ layout: name, path: node.path }, target.location)
    announce(outcome.ok ? `Moved ${node.name} to ${target.label}.` : `Cannot move: ${outcome.message}`)
    keepFocus.current = true
    treeRef.current?.focus()
  }

  if (name === undefined) {
    return (
      <div data-formancy-part="layout-pane">
        <p data-formancy-part="layout-empty">
          This form has no arrangement. Without one the renderers show every field in the order the
          model lists them, one per line — which is a perfectly good form. Add an arrangement to put
          fields side by side.
        </p>
        <button
          type="button"
          onClick={() => {
            const outcome = session.addLayout('web')
            announce(outcome.ok ? 'Added a web arrangement.' : `Cannot add: ${outcome.message}`)
          }}
        >
          Add an arrangement
        </button>
        <p role="status" data-formancy-part="layout-status">
          {announcement}
        </p>
      </div>
    )
  }

  return (
    <div data-formancy-part="layout-pane">
      <ul
        ref={treeRef}
        role="tree"
        aria-label={`${label}: ${name}`}
        data-formancy-part="layout-tree"
        tabIndex={count === 0 ? 0 : -1}
        // Once, on the tree. Keys bubble from the focused item, and a handler
        // on both fires every command twice.
        onKeyDown={onKeyDown}
      >
        {rows.map((row, position) => (
          <li
            key={row.path.join('.')}
            ref={(element) => {
              itemRefs.current[position] = element
            }}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-selected={position === index}
            data-formancy-part="layout-node"
            data-kind={row.node.kind}
            tabIndex={position === index ? 0 : -1}
            onFocus={() => setFocusedIndex(position)}
            draggable
            data-dragging={dragging !== null && samePath(dragging, row.path) ? 'true' : undefined}
            data-drop={dropTarget?.index === position ? dropTarget.edge : undefined}
            onDragStart={(event) => {
              setDragging(row.path)
              event.dataTransfer.effectAllowed = 'move'
              // Some browsers refuse to start a drag without data set.
              event.dataTransfer.setData('text/plain', row.path.join('.'))
            }}
            onDragEnd={() => {
              setDragging(null)
              setDropTarget(null)
            }}
            onDragOver={(event) => {
              if (dragging === null) return
              const edge = edgeOf(event)
              // Only a legal drop shows an indicator and accepts one. Allowing
              // one the session will refuse means the row snaps back with no
              // explanation.
              if (layoutDropLocation(view.document, name, dragging, row.path, edge) === undefined) {
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

              const location = layoutDropLocation(view.document, name, from, row.path, edgeOf(event))
              if (location === undefined) return

              const outcome = session.moveLayoutNode({ layout: name, path: from }, location)
              // Through the same live region the keyboard path uses, so a drag
              // is not a silent command for somebody who uses both.
              announce(outcome.ok ? 'Moved.' : `Cannot move: ${outcome.message}`)
            }}
          >
            {row.name}
          </li>
        ))}
      </ul>

      {count === 0 ? (
        <p data-formancy-part="layout-empty">
          This arrangement places nothing yet, so the form falls back to the model's own order.
        </p>
      ) : null}

      {unplaced.length === 0 ? null : (
        <div data-formancy-part="layout-unplaced">
          {/* Named, not hidden. A field the only arrangement leaves out is
              collected by the form and invisible to everyone filling it in,
              and that is exactly the mistake this pane can prevent. */}
          <h3>Not in this arrangement</h3>
          <ul>
            {unplaced.map((path) => (
              <li key={path}>{nameOfPath(view.document, path)}</li>
            ))}
          </ul>
        </div>
      )}

      {adding === null ? null : adding.what === '' ? (
        <div role="dialog" aria-label="Add to the arrangement" data-formancy-part="layout-add" onKeyDown={onDialogKey}>
          <ul>
            <li>
              <button type="button" onClick={() => setAdding({ what: 'row' })}>
                Row
              </button>
              <span data-formancy-part="palette-hint">
                Puts what is inside it side by side, and back into one column when there is no width
                for two.
              </span>
            </li>
            <li>
              <button type="button" onClick={() => setAdding({ what: 'column' })}>
                Column
              </button>
              <span data-formancy-part="palette-hint">One side of a row.</span>
            </li>
            <li>
              <button type="button" onClick={() => setAdding({ what: 'section' })}>
                Section
              </button>
              <span data-formancy-part="palette-hint">
                A named group of items, announced as one.
              </span>
            </li>
            {unplaced.map((path) => (
              <li key={path}>
                <button type="button" onClick={() => setAdding({ what: 'field', path })}>
                  {nameOfPath(view.document, path)}
                </button>
                <span data-formancy-part="palette-hint">Not placed anywhere yet.</span>
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
          aria-label={`Where should the ${describeAdding(adding)} go?`}
          data-formancy-part="layout-add-where"
        >
          <ul>
            {targetsFor(nodeBeingAdded(adding)!).map((target) => (
              <li key={`${target.location.parent.join('.')}:${String(target.location.index)}`}>
                <button type="button" onClick={() => completeAdd(adding, target)}>
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

      {wrapping === null ? null : (
        <div role="dialog" aria-label={`Wrap ${wrapping.name}`} data-formancy-part="layout-wrap" onKeyDown={onDialogKey}>
          <p>
            Choose the item to put beside {wrapping.name}. Both go into a new row, with{' '}
            {wrapping.name} first.
          </p>
          <ul>
            {wrapCandidates(wrapping).map((candidate) => (
              <li key={candidate.path.join('.')}>
                <button type="button" onClick={() => completeWrap(candidate)}>
                  {candidate.name}
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
        <div role="dialog" aria-label={`Move ${moving.name}`} data-formancy-part="layout-move" onKeyDown={onDialogKey}>
          <ul>
            {targetsFor(moving.path).map((target) => (
              <li key={`${target.location.parent.join('.')}:${String(target.location.index)}`}>
                <button type="button" onClick={() => completeMove(target)}>
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

      {/* One polite region for this pane. role="status" already implies
          aria-live="polite"; setting both announces everything twice. */}
      <p role="status" data-formancy-part="layout-status">
        {announcement}
      </p>

      <dl data-formancy-part="layout-keys">
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

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, at) => b[at] === step)
}
