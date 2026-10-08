import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import type { BuilderSession, LayoutLocation } from '@formancy/builder-core'
import type { LayoutNode } from '@formancy/spec'
import { layoutDropLocation } from '@formancy/builder-core'
import { describeLayoutTarget, flattenLayout, nameOfPath } from '@formancy/builder-core'
import {
  addLayoutAndSay,
  dropLayoutAndSay,
  layoutKeyHelp,
  moveLayoutAndSay,
  redoAndSay,
  removeLayoutAndSay,
  undoAndSay,
  unwrapLayoutAndSay,
  wrapAndSay,
  wrapCandidates,
} from '@formancy/builder-core'
import type { LayoutTreeNode } from '@formancy/builder-core'
import { LayoutAdd } from './layout-add.js'
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
  /** The tree's accessible name, before the arrangement's own. The session's words by default. */
  label?: string
  /**
   * The node the person is on, whenever that changes, as its index path — or `null`
   * when the arrangement is empty.
   *
   * The pane keeps owning its own focus; this only reports it. A consumer uses it to
   * show a property panel beside the tree, which is how a layout node's `span`,
   * `columns` and `label` became settable at all.
   */
  onSelect?: (path: readonly number[] | null) => void
}

export function FormancyLayoutPane({
  session,
  layout,
  label,
  onSelect,
}: LayoutPaneProps): ReactElement {
  const view = useBuilder(session)
  // The words, the offer and every sentence a command produces come from
  // builder-core, shared with the Angular pane: the two had drifted into offering
  // different things for one document (0116).
  const { text } = session
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
  /** Whether the add conversation is open. Its three steps are `LayoutAdd`'s. */
  const [adding, setAdding] = useState(false)
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

  const rows = name === undefined ? [] : flattenLayout(view.document, name, session.text)
  const count = rows.length
  const index = count === 0 ? 0 : Math.min(focusedIndex, count - 1)
  const focused = rows[index]
  // Report the focused node outward, so a consumer can show a property panel beside
  // the tree without reading our DOM. Keyed on the PATH rather than the index: an edit
  // that reorders the arrangement leaves the index pointing at a different node.
  const selectedPath = focused === undefined ? null : focused.path.join('.')
  useEffect(() => {
    onSelect?.(selectedPath === null ? null : selectedPath.split('.').map(Number))
    // `onSelect` is deliberately absent: a consumer passing an inline arrow would
    // otherwise make this fire on every render of theirs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath])

  const unplaced = name === undefined ? [] : session.unplacedFields(name)

  // Move focus WITHIN the tree, never INTO it: a pane that grabs focus on
  // mount takes it from wherever the person actually was, which on this screen
  // is the structure tree or the preview.
  useEffect(() => {
    if (moving !== null || adding || wrapping !== null) return
    const active = document.activeElement
    const inside = treeRef.current !== null && active !== null && treeRef.current.contains(active)
    if (inside || keepFocus.current) itemRefs.current[index]?.focus()
    keepFocus.current = false
  }, [index, moving, adding, wrapping, view.document])

  const announce = useCallback((message: string) => setAnnouncement(message), [])

  const targetsFor = (
    what: LayoutNode | readonly number[],
  ): Array<{ location: LayoutLocation; label: string }> => {
    if (name === undefined) return []
    const from = Array.isArray(what) ? (what as readonly number[]) : undefined
    return session.validLayoutTargets(name, what).map((location) => ({
      location,
      label: describeLayoutTarget(view.document, location, from, session.text),
    }))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    if (name === undefined) return
    keepFocus.current = true

    if (event.altKey || event.metaKey) return

    if (event.ctrlKey) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        announce(undoAndSay(session))
      } else if (key === 'y') {
        event.preventDefault()
        announce(redoAndSay(session))
      }
      return
    }

    // Escape closes an open dialog wherever focus happens to be. Pressing
    // `w` leaves focus on the tree item, so the dialog's own handler never
    // sees the key -- which is the whole reason this is here as well.
    if (event.key === 'Escape' && (wrapping !== null || moving !== null || adding)) {
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
        setAdding(true)
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
          announce(text('said.nowhereToMove', { name: focused.name }))
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
        if (wrapCandidates(rows, focused).length === 0) {
          announce(text('said.nothingBeside', { name: focused.name }))
          return
        }
        setWrapping(focused)
        return
      }
      case 'u':
      case 'U': {
        event.preventDefault()
        announce(unwrapLayoutAndSay(session, { layout: name, path: focused.path }))
        return
      }
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        // Said plainly by builder-core: the field is still collected, it only has
        // no place in this arrangement. Anything else reads as a deletion.
        announce(removeLayoutAndSay(session, { layout: name, path: focused.path }))
        return
      }
      default:
        return
    }
  }

  const cancelDialog = (): void => {
    setAdding(false)
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

  const completeWrap = (partner: LayoutTreeNode): void => {
    const subject = wrapping
    setWrapping(null)
    if (subject === null || name === undefined) return

    // The focused item first, so the order is the one the person chose rather
    // than the one the document happened to have.
    announce(wrapAndSay(session, name, subject.path, partner.path))
    keepFocus.current = true
    treeRef.current?.focus()
  }

  const completeMove = (target: { location: LayoutLocation; label: string }): void => {
    const node = moving
    setMoving(null)
    if (node === undefined || node === null || name === undefined) return

    announce(moveLayoutAndSay(session, { layout: name, path: node.path }, target))
    keepFocus.current = true
    treeRef.current?.focus()
  }

  if (name === undefined) {
    return (
      <div data-formancy-part="layout-pane">
        <p data-formancy-part="layout-empty">{text('layout.none')}</p>
        <button type="button" onClick={() => announce(addLayoutAndSay(session))}>
          {text('layout.addLayout')}
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
        aria-label={text('layout.treeName', { label: label ?? text('layout.label'), name })}
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

              const location = layoutDropLocation(
                view.document,
                name,
                from,
                row.path,
                edgeOf(event),
              )
              if (location === undefined) return

              // Through the same live region the keyboard path uses, so a drag
              // is not a silent command for somebody who uses both — and naming
              // what moved, which "Moved." did not.
              announce(dropLayoutAndSay(session, { layout: name, path: from }, location))
            }}
          >
            {row.name}
          </li>
        ))}
      </ul>

      {count === 0 ? <p data-formancy-part="layout-empty">{text('layout.placesNothing')}</p> : null}

      {unplaced.length === 0 ? null : (
        <div data-formancy-part="layout-unplaced">
          {/* Named, not hidden. A field the only arrangement leaves out is
              collected by the form and invisible to everyone filling it in,
              and that is exactly the mistake this pane can prevent. */}
          <h3>{text('layout.unplaced')}</h3>
          <ul>
            {unplaced.map((path) => (
              <li key={path}>{nameOfPath(view.document, path)}</li>
            ))}
          </ul>
        </div>
      )}

      {adding ? (
        <LayoutAdd session={session} layout={name} onSaid={announce} onClose={cancelDialog} />
      ) : null}

      {wrapping === null ? null : (
        <div
          role="dialog"
          aria-label={text('layout.wrapTitle', { name: wrapping.name })}
          data-formancy-part="layout-wrap"
          onKeyDown={onDialogKey}
        >
          <p>{text('layout.wrapHelp', { name: wrapping.name })}</p>
          <ul>
            {wrapCandidates(rows, wrapping).map((candidate) => (
              <li key={candidate.path.join('.')}>
                <button type="button" onClick={() => completeWrap(candidate)}>
                  {candidate.name}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => cancelDialog()}>
            {text('dialog.cancel')}
          </button>
        </div>
      )}

      {moving === null ? null : (
        <div
          role="dialog"
          aria-label={text('tree.moveTitle', { name: moving.name })}
          data-formancy-part="layout-move"
          onKeyDown={onDialogKey}
        >
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
            {text('dialog.cancel')}
          </button>
        </div>
      )}

      {/* One polite region for this pane. role="status" already implies
          aria-live="polite"; setting both announces everything twice. */}
      <p role="status" data-formancy-part="layout-status">
        {announcement}
      </p>

      <dl data-formancy-part="layout-keys">
        {layoutKeyHelp(session).map(([keys, what]) => (
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
