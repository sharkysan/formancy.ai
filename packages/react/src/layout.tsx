import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { FormSchema, LayoutNode } from '@formancy/spec'
import { resolveText } from '@formancy/spec'

/**
 * Rendering a named `layouts` entry: fields side by side, in sections, in the
 * arrangement the document asks for rather than model order.
 *
 * Four WCAG criteria decide how this is built, and all four point the same way
 * — the DOM is the arrangement, and CSS only decides how wide things are.
 *
 * **1.3.2 Meaningful Sequence** and **2.4.3 Focus Order.** Children are emitted
 * in the order the layout declares, and the stylesheet places them by source
 * order alone. No `order`, no explicit `grid-column`, nothing that lets the
 * visual order and the DOM order disagree — because when they do, a screen
 * reader and a keyboard meet the form in one order and an eye meets it in
 * another.
 *
 * **1.4.10 Reflow.** A row must become a single column when there is no space
 * for two, with no horizontal scrolling at 320 CSS pixels. That is a media
 * query in the stylesheet, not a measurement here: a layout that reflows only
 * when JavaScript has run is a layout that does not reflow.
 *
 * **1.3.1 Info and Relationships.** A row is presentation and gets no
 * semantics. A *section* with a heading is visibly grouping fields, so it says
 * so programmatically too — `role="group"` with `aria-labelledby`. Marking up
 * the row instead would invent a relationship the author did not describe, and
 * leaving the section bare would hide one they did.
 *
 * Every container also carries `data-formancy-layout-path`, the index path of
 * the node that produced it. It is inert here — nothing in this package reads
 * it — and exists so a tool outside the renderer, such as the builder's
 * arrange-on-the-preview surface, can say which node an element came from
 * without the renderer knowing anything about editing.
 */

export interface LayoutTreeProps {
  schema: FormSchema
  nodes: readonly LayoutNode[]
  locale: string
  /** Renders one field, given its data path. */
  renderField: (path: string) => ReactElement | null
  /** Index path of the container these nodes are the children of. */
  at?: readonly number[]
}

export function LayoutTree({
  schema,
  nodes,
  locale,
  renderField,
  at = [],
}: LayoutTreeProps): ReactElement {
  return (
    <>
      {nodes.map((node, index) => (
        <LayoutNodeView
          // Position is the only identity a layout node has, and a layout does
          // not reorder while a form is being filled in.
          key={index}
          schema={schema}
          node={node}
          locale={locale}
          renderField={renderField}
          at={[...at, index]}
        />
      ))}
    </>
  )
}

function LayoutNodeView({
  schema,
  node,
  locale,
  renderField,
  at,
}: {
  schema: FormSchema
  node: LayoutNode
  locale: string
  renderField: (path: string) => ReactElement | null
  at: readonly number[]
}): ReactElement | null {
  const headingId = useId()

  if (node.kind === 'field') return renderField(node.path)

  const label = resolveText(schema, node.label, locale)
  const here = at.join('.')
  const children = (
    <LayoutTree
      schema={schema}
      nodes={node.children}
      locale={locale}
      renderField={renderField}
      at={at}
    />
  )

  if (node.kind === 'row') {
    // Presentation only. A row carries no meaning a screen reader needs, and
    // announcing "group" around every pair of fields is noise.
    return (
      <div
        data-formancy-part="layout-row"
        data-formancy-layout-path={here}
        data-columns={String(node.children.length)}
      >
        {children}
      </div>
    )
  }

  if (node.kind === 'column') {
    return (
      <div data-formancy-part="layout-column" data-formancy-layout-path={here}>
        {children}
      </div>
    )
  }

  if (node.kind === 'tabs') {
    return (
      <Tabs
        schema={schema}
        node={node}
        locale={locale}
        renderField={renderField}
        at={at}
        here={here}
      />
    )
  }

  if (node.kind === 'table') {
    return (
      <div
        data-formancy-part="layout-table"
        data-formancy-layout-path={here}
        data-columns={String(node.columns)}
        {...(label === undefined ? {} : { role: 'group', 'aria-labelledby': headingId })}
      >
        {label === undefined ? null : (
          <p id={headingId} data-formancy-part="layout-section-heading">
            {label}
          </p>
        )}
        {children}
      </div>
    )
  }

  // A section. Labelled, it is a real grouping and says so; unlabelled, it is
  // a box and stays one.
  if (label === undefined) {
    return (
      <div data-formancy-part="layout-section" data-formancy-layout-path={here}>
        {children}
      </div>
    )
  }

  return (
    <div
      data-formancy-part="layout-section"
      data-formancy-layout-path={here}
      role="group"
      aria-labelledby={headingId}
    >
      <p id={headingId} data-formancy-part="layout-section-heading">
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * One panel at a time, behind a row of tabs.
 *
 * The ARIA tabs pattern, and the reason it is written out rather than reached
 * for from a library: the keyboard behaviour is the specification. Arrows move
 * between tabs, Home and End reach the ends, and the tab strip is ONE tab stop
 * — a roving tabindex — so a form with twelve tabs does not cost twelve
 * presses to get past.
 *
 * **Every panel stays in the DOM.** A closed tab is hidden, not unmounted,
 * which is the decision the rest of this component follows from. Tabs are
 * presentation, unlike pages: a field in a closed tab is still validated and
 * still submitted, so it has to exist to be validated, and the browser's own
 * find-in-page finds it. Unmounting would also throw away what somebody had
 * typed the moment they looked at another tab.
 *
 * **A tab opens when an error is in it.** An error summary focuses the first
 * invalid control, and focusing something inside a hidden panel does nothing
 * at all — the reader is told the form has an error and sent nowhere. So the
 * strip listens for focus moving into a panel it is hiding and opens it.
 */
function Tabs({
  schema,
  node,
  locale,
  renderField,
  at,
  here,
}: {
  schema: FormSchema
  node: Extract<LayoutNode, { kind: 'tabs' }>
  locale: string
  renderField: (path: string) => ReactElement | null
  at: readonly number[]
  here: string
}): ReactElement {
  const base = useId()
  const [open, setOpen] = useState(0)
  const strip = useRef<HTMLDivElement | null>(null)
  const panels = useRef<Array<HTMLDivElement | null>>([])
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  /** Set only by a key press, so focus is never taken from elsewhere. */
  const moveFocus = useRef(false)

  const names = node.children.map((child) =>
    child.kind === 'field' ? undefined : resolveText(schema, child.label, locale),
  )

  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    tabs.current[open]?.focus()
  }, [open])

  // Focus landing in a hidden panel is the error-summary case. `focusin`
  // rather than React's onFocus because the focus may be moved imperatively by
  // something outside this subtree entirely.
  useEffect(() => {
    const listeners = panels.current.map((panel, index) => {
      if (panel === null) return undefined
      const onFocusIn = (): void => setOpen(index)
      panel.addEventListener('focusin', onFocusIn)
      return () => panel.removeEventListener('focusin', onFocusIn)
    })
    return () => {
      for (const off of listeners) off?.()
    }
  }, [node.children.length])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const last = node.children.length - 1
    const next =
      event.key === 'ArrowRight'
        ? Math.min(open + 1, last)
        : event.key === 'ArrowLeft'
          ? Math.max(open - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined
    if (next === undefined) return
    event.preventDefault()
    moveFocus.current = true
    setOpen(next)
  }

  const stripName = resolveText(schema, node.label, locale)

  return (
    <div data-formancy-part="layout-tabs" data-formancy-layout-path={here}>
      <div
        ref={strip}
        role="tablist"
        {...(stripName === undefined ? {} : { 'aria-label': stripName })}
        data-formancy-part="tablist"
        onKeyDown={onKeyDown}
      >
        {node.children.map((child, index) => (
          <button
            key={index}
            ref={(element) => {
              tabs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${String(index)}`}
            aria-controls={`${base}-panel-${String(index)}`}
            aria-selected={index === open}
            // Roving tabindex: the strip is one stop, not one per tab.
            tabIndex={index === open ? 0 : -1}
            data-formancy-part="tab"
            onClick={() => setOpen(index)}
          >
            {names[index] ?? `Tab ${String(index + 1)}`}
          </button>
        ))}
      </div>

      {node.children.map((child, index) => (
        <div
          key={index}
          ref={(element) => {
            panels.current[index] = element
          }}
          role="tabpanel"
          id={`${base}-panel-${String(index)}`}
          aria-labelledby={`${base}-tab-${String(index)}`}
          data-formancy-part="tabpanel"
          // `hidden` rather than unmounting, and rather than CSS: a panel
          // hidden with display:none by a stylesheet that failed to load is a
          // panel that is not hidden at all.
          hidden={index !== open}
          // Not focusable itself. The pattern allows it when a panel has no
          // focusable content; every panel here holds form fields, and a
          // panel that also takes focus makes a person tab through it twice.
        >
          <LayoutTree
            schema={schema}
            nodes={child.kind === 'field' ? [child] : child.children}
            locale={locale}
            renderField={renderField}
            at={[...at, index]}
          />
        </div>
      ))}
    </div>
  )
}

/** Every data path a layout places, in the order it places them. */
export function placedPaths(nodes: readonly LayoutNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === 'field') into.push(node.path)
    else placedPaths(node.children, into)
  }
  return into
}
