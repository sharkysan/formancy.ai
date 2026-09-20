import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { BuilderSession, LayoutLocation } from '@formancy/builder-core'
import { layoutDropLocation } from './layout-drop.js'
import { describeLayoutTarget, flattenLayout } from './layout-tree.js'
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
      const node = flattenLayout(view.document, layout).find(
        (row) => row.node.kind === 'field' && row.node.path === dataPath,
      )
      return node?.path
    },
    [view.document, layout],
  )

  /**
   * Marking what can be picked up.
   *
   * Done to the DOM rather than in the markup because the markup belongs to
   * the renderer — the whole point of the project is that it does. Re-run on
   * every accepted command, since the rendered tree is replaced.
   */
  useEffect(() => {
    const root = surface.current
    if (root === null) return undefined
    if (!enabled) return undefined

    const marked = [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter(
      (element) => pathOfElement(element) !== undefined,
    )
    for (const element of marked) {
      element.draggable = true
      element.dataset['arrangeable'] = 'true'
    }

    return () => {
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

  const targetFor = (
    event: React.DragEvent<HTMLDivElement>,
  ): { location: LayoutLocation; element: HTMLElement; edge: 'before' | 'after' } | undefined => {
    if (dragging === null) return undefined
    const element = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR) ?? null
    if (element === null) return undefined

    const over = pathOfElement(element)
    if (over === undefined) return undefined

    const box = element.getBoundingClientRect()
    // Horizontal for a field already inside a row: the two halves a person
    // aims at there are left and right, not top and bottom.
    const horizontal = element.parentElement?.dataset['formancyPart'] === 'layout-row'
    const edge = horizontal
      ? event.clientX < box.left + box.width / 2
        ? 'before'
        : 'after'
      : event.clientY < box.top + box.height / 2
        ? 'before'
        : 'after'

    const location = layoutDropLocation(view.document, layout, dragging, over, edge)
    return location === undefined ? undefined : { location, element, edge }
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
        target.element.dataset['drop'] = target.edge
      }}
      onDragLeave={() => clearIndicators()}
      onDrop={(event) => {
        event.preventDefault()
        const target = targetFor(event)
        const from = dragging
        setDragging(null)
        clearIndicators()
        if (target === undefined || from === null) return

        const outcome = session.moveLayoutNode({ layout, path: from }, target.location)
        // Announced through a live region, because a drag that changes the
        // document silently is a change somebody using a screen reader with a
        // pointer never hears about.
        setAnnouncement(
          outcome.ok
            ? `Moved to ${describeLayoutTarget(view.document, target.location, from)}.`
            : `Cannot move: ${outcome.message}`,
        )
      }}
    >
      {children}
      <p role="status" data-formancy-part="arrange-status">
        {announcement}
      </p>
    </div>
  )
}
