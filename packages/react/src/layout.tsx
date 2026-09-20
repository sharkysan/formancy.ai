import { useId } from 'react'
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

/** Every data path a layout places, in the order it places them. */
export function placedPaths(nodes: readonly LayoutNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === 'field') into.push(node.path)
    else placedPaths(node.children, into)
  }
  return into
}
