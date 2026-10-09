import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { ArrangeDrop, BuilderSession, DrawnNode } from '@formancy/builder-core'
import { arrangeDrop, gapNeighbour } from '@formancy/builder-core'
import { arrangeDropAndSay, flattenLayout } from '@formancy/builder-core'
import { useBuilder } from './use-builder.js'

/**
 * Arranging the form on the form itself, rather than on a tree beside it.
 *
 * Two rules keep this from turning the renderer into an editor.
 *
 * **The renderer knows nothing about this.** It emits
 * `data-formancy-layout-path` on every container it renders and
 * `data-formancy-field-path` on every field, both inert. This surface reads
 * them from the outside. Nothing in `@formancy/react` imports anything from
 * here, and a form in production carries two attributes nobody reads.
 *
 * **It is a second route to commands that already work.** Every move here goes
 * through `session.moveLayoutNode`, the same call the arrangement tree makes
 * and the same call the keyboard makes. WCAG 2.2 SC 2.5.7 is satisfied by that
 * keyboard path existing, not by anything in this file — which is also why
 * this is off unless a caller turns it on: a preview somebody is typing into
 * should not be picking up drags.
 */

export interface ArrangeSurfaceProps {
  session: BuilderSession
  /** Which arrangement the preview inside is rendering. */
  layout: string
  /**
   * Off by default. The form is a form until an editor says otherwise, and a
   * draggable input is a form you cannot select text in.
   */
  enabled?: boolean
  /** The rendered form. */
  children: ReactNode
}

const LAYOUT_ATTR = 'data-formancy-layout-path'
const FIELD_ATTR = 'data-formancy-field-path'
const SELECTOR = `[${LAYOUT_ATTR}],[${FIELD_ATTR}]`

/**
 * A drop, plus the element to draw the indicator on.
 *
 * Where the drop LANDS is `arrangeDrop` in `@formancy/builder-core`, shared with
 * the Angular surface; what stays here is reading a pointer and marking the DOM.
 */
type DropTarget = ArrangeDrop & { element: HTMLElement }

/** A node on screen, with the element it was drawn as. */
type Drawn = DrawnNode & { element: HTMLElement }

/**
 * Whether an element already sits side by side with its siblings: a child of a
 * row, or of a table, which lays its children out in columns.
 *
 * A table child that spans is wrapped in a `layout-cell`, so its parent is the
 * cell and the table is one step further up. Missing that step, or the table
 * altogether, offered side zones on a field in a two-column table -- and a drop
 * there built a new row inside a half-width cell, where the dropped field landed
 * below its target rather than beside it.
 */
function sitsSideBySide(element: HTMLElement): boolean {
  let parent = element.parentElement
  if (parent?.dataset['formancyPart'] === 'layout-cell') parent = parent.parentElement
  const part = parent?.dataset['formancyPart']
  return part === 'layout-row' || part === 'layout-table'
}

export function FormancyArrangeSurface({
  session,
  layout,
  enabled = false,
  children,
}: ArrangeSurfaceProps): ReactElement {
  const view = useBuilder(session)
  const surface = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<readonly number[] | null>(null)
  const [announcement, setAnnouncement] = useState('')

  /**
   * The layout node each field is placed at, by its data path.
   *
   * Once per document rather than once per element: a pointer between two nodes
   * asks it of everything drawn there, on every `dragover`.
   */
  const fieldNodes = useMemo(
    () =>
      new Map(
        flattenLayout(view.document, layout, session.text).flatMap((row) =>
          row.node.kind === 'field' ? [[row.node.path, row.path] as const] : [],
        ),
      ),
    [view.document, layout, session],
  )

  /**
   * Which layout node each element on screen came from.
   *
   * A container says so itself. A field does not — it knows its data path, not
   * its position in the arrangement — so it is looked up, which is sound
   * because the validator forbids placing one field twice in a layout.
   */
  const pathOfElement = useCallback(
    (element: Element | null): readonly number[] | undefined => {
      const found = element?.closest(SELECTOR)
      if (found === null || found === undefined) return undefined

      const declared = found.getAttribute(LAYOUT_ATTR)
      if (declared !== null) return declared.split('.').map(Number)

      const dataPath = found.getAttribute(FIELD_ATTR)
      if (dataPath === null || dataPath === '') return undefined
      return fieldNodes.get(dataPath)
    },
    [fieldNodes],
  )

  /**
   * Marking what can be picked up.
   *
   * Done to the DOM rather than in the markup because the markup belongs to
   * the renderer — the whole point of the project is that it does. And kept up
   * with the DOM rather than with this component's renders, for the same reason:
   * what is inside is redrawn by whoever drew it, when they choose. A field a rule
   * shows is mounted by its own slot without this surface rendering, and the
   * playground's Angular preview, held inside it, replaces its markup after a drop
   * on Angular's schedule — before this observed the tree, the field arrived
   * unmarked and nothing in that preview could be picked up a second time. Only elements arriving are observed; the marks themselves are
   * attributes, so putting them on does not call this again.
   */
  useEffect(() => {
    const root = surface.current
    if (root === null) return undefined
    if (!enabled) return undefined

    const marked = new Set<HTMLElement>()
    const mark = (): void => {
      for (const element of marked) if (!element.isConnected) marked.delete(element)
      for (const element of root.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (marked.has(element) || pathOfElement(element) === undefined) continue
        element.draggable = true
        element.dataset['arrangeable'] = 'true'
        marked.add(element)
      }
    }
    mark()
    const arriving = new MutationObserver(mark)
    arriving.observe(root, { childList: true, subtree: true })

    return () => {
      arriving.disconnect()
      for (const element of marked) {
        element.draggable = false
        delete element.dataset['arrangeable']
        delete element.dataset['drop']
        delete element.dataset['dragging']
      }
    }
  }, [enabled, pathOfElement, view.document, children])

  const clearIndicators = (): void => {
    const root = surface.current
    if (root === null) return
    for (const element of root.querySelectorAll<HTMLElement>('[data-drop]')) {
      delete element.dataset['drop']
    }
  }

  if (!enabled) {
    return <div ref={surface}>{children}</div>
  }

  /** Every node drawn inside `scope`, and where. */
  const drawnIn = (scope: Element): Drawn[] =>
    [...scope.querySelectorAll<HTMLElement>(SELECTOR)].flatMap((element) => {
      const path = pathOfElement(element)
      return path === undefined ? [] : [{ element, path, box: element.getBoundingClientRect() }]
    })

  const targetFor = (event: React.DragEvent<HTMLDivElement>): DropTarget | undefined => {
    if (dragging === null) return undefined
    const under = event.target as Element | null
    if (under === null) return undefined
    const element = under.closest<HTMLElement>(SELECTOR)

    // Under nothing that names a node, the pointer is over the form itself, and the
    // form's children are the top-level nodes.
    const over = element === null ? [] : pathOfElement(element)
    if (over === undefined) return undefined
    const pointer = { x: event.clientX, y: event.clientY }

    // Between two children of what is under the pointer, the nearer child is aimed at;
    // anywhere else, what is under it is.
    const aimed =
      gapNeighbour(over, drawnIn(element ?? under), pointer) ??
      (element === null ? undefined : { element, path: over, box: element.getBoundingClientRect() })
    if (aimed === undefined) return undefined

    const drop = arrangeDrop({
      document: view.document,
      layout,
      dragged: dragging,
      over: aimed.path,
      box: aimed.box,
      pointer,
      sideBySide: sitsSideBySide(aimed.element),
      direction: getComputedStyle(aimed.element).direction === 'rtl' ? 'rtl' : 'ltr',
    })
    return drop === undefined ? undefined : { ...drop, element: aimed.element }
  }

  return (
    <div
      ref={surface}
      data-formancy-part="arrange-surface"
      data-arranging="true"
      onDragStart={(event) => {
        const path = pathOfElement(event.target as Element)
        if (path === undefined) return
        // The innermost arrangeable element wins, and the browser has already
        // decided that by dispatching from it.
        event.stopPropagation()
        setDragging(path)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', path.join('.'))
      }}
      onDragEnd={() => {
        setDragging(null)
        clearIndicators()
      }}
      onDragOver={(event) => {
        const target = targetFor(event)
        clearIndicators()
        // Only a drop the session will accept gets an indicator. One over an
        // illegal target promises a move that will not happen.
        if (target === undefined) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        // Distinct from before/after, so somebody aiming for a row does not see
        // the same line they get for a move. And a move names its axis: inside a
        // row or a table the drop lands beside the field, so the line goes down
        // its side. That was left to the stylesheet to infer, and a rule of equal
        // weight drew it across the top instead.
        target.element.dataset['drop'] =
          target.kind === 'wrap'
            ? `wrap-${target.side}`
            : target.axis === 'inline'
              ? `inline-${target.edge}`
              : target.edge
      }}
      onDragLeave={() => clearIndicators()}
      onDrop={(event) => {
        event.preventDefault()
        const target = targetFor(event)
        const from = dragging
        setDragging(null)
        clearIndicators()
        if (target === undefined || from === null) return

        // Announced through a live region either way, because a drag that
        // changes the document silently is a change somebody using a screen
        // reader with a pointer never hears about. What it does and says is
        // builder-core's: the side aimed at decides the order, and a new row goes
        // where the thing dropped ON was — the same decision the Angular surface
        // reads (0117).
        setAnnouncement(arrangeDropAndSay(session, layout, from, target))
      }}
    >
      {children}
      <p role="status" data-formancy-part="arrange-status">
        {announcement}
      </p>
    </div>
  )
}
