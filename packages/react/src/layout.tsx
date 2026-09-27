
import { flushSync } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { FormSchema, LayoutNode } from '@formancy/spec'
import { resolveText, LAYOUT_LEAF_KINDS, layoutChildren } from '@formancy/spec'
import { encode } from 'uqr'
import { useField } from './use-field.js'

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
      {nodes.map((node, index) => {
        const view = (
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
        )

        // A node that spans gets a cell to span WITH, and one that does not is left
        // exactly as it was -- a direct child of the container, so nothing about the
        // markup of a form that uses no span changes at all.
        //
        // The cell is the grid item rather than the node itself, because the node's own
        // element is produced further down (a field's control, a nested table, a code)
        // and a renderer cannot reach into a component a consumer registered.
        //
        // Two channels for one fact, and the reason is arithmetic: `data-span` is the
        // authored value, which a selector can match; `--fm-span` is the same number
        // where CSS can COUNT with it, because `grid-column: span attr(data-span)` is not
        // a thing. `all` needs no number -- it is `1 / -1`, whatever the column count --
        // so it carries no property, and the theme's fallback covers the rest.
        if (node.span === undefined) return view
        return (
          <div
            key={index}
            data-formancy-part="layout-cell"
            data-span={String(node.span)}
            {...(node.span === 'all'
              ? {}
              : { style: { '--fm-span': String(node.span) } as CSSProperties })}
          >
            {view}
          </div>
        )
      })}
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
  if (node.kind === 'qrcode') {
    return <CodeNode schema={schema} node={node} locale={locale} />
  }

  const label = resolveText(schema, node.label, locale)
  const here = at.join('.')
  const children = (
    <LayoutTree
      schema={schema}
      nodes={layoutChildren(node)}
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
 * strip handles an explicit reveal request before the control receives focus.
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

  // Commit the tab change before focusControl calls focus(). The reveal event
  // bubbles through all enclosing panels, including nested tab strips.
  useEffect(() => {
    const listeners = panels.current.map((panel, index) => {
      if (panel === null) return undefined
      const reveal = (): void => flushSync(() => setOpen(index))
      panel.addEventListener('formancy-reveal', reveal)
      return () => panel.removeEventListener('formancy-reveal', reveal)
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
            nodes={LAYOUT_LEAF_KINDS.has(child.kind) ? [child] : layoutChildren(child)}
            locale={locale}
            renderField={renderField}
            at={[...at, index]}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * A machine-readable code drawn from an answer the form already holds.
 *
 * ── THE ACCESSIBLE CONTENT IS THE VALUE, NOT THE PICTURE ────────────────────
 *
 * A picture of a code says nothing to a screen reader, and an `alt` describing it ("QR
 * code") says nothing either — what somebody needs is the value it encodes, which they
 * can then read, copy or dictate. So the value is real text in the document and the
 * drawing, when there is one, is decorative.
 *
 * ── AND THERE IS NO DRAWING, DELIBERATELY ───────────────────────────────────
 *
 * Encoding a QR code is a dependency: a matrix, four mask patterns, Reed–Solomon error
 * correction, and about 10 kB minified for the smallest honest implementation. That is a
 * row in `SOUP-DECLARATION.md` for every consumer including the Node engine, in a package
 * whose budget is 4 kB brotli, to draw something the consumer's design system may want to
 * draw its own way.
 *
 * So the renderer emits the value and the hooks, and a consumer who wants the picture
 * registers a component for it — the registry already replaces any part of the form. What
 * this costs is stated rather than hidden: **out of the box a `qrcode` node shows the
 * value as text and no code.** That is a usable form and a visible gap, which is the right
 * way round; drawing a broken picture would be neither.
 */
function CodeNode({
  schema,
  node,
  locale,
}: {
  schema: FormSchema
  node: Extract<LayoutNode, { kind: 'qrcode' }>
  locale: string
}): ReactElement {
  const label = resolveText(schema, node.label, locale)
  // `useField`, not `engine.getFieldSnapshot`. Reading the snapshot directly renders the
  // value once and never again: measured, the code stayed `data-state="empty"` after the
  // answer was typed. A code is a live view of an answer, so it subscribes like any other
  // reader of one.
  const field = useField(node.path)
  const value = field.value
  const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)

  return (
    <div data-formancy-part="code" data-state={text === '' ? 'empty' : 'ready'}>
      {label === undefined ? null : <span data-formancy-part="code-label">{label}</span>}
      {/* The drawing. Decorative: `aria-hidden`, because a picture of a code says nothing
          to a screen reader and an `alt` of "QR code" says nothing either — the value
          below is the content.

          Built here rather than with `uqr.renderSVG`, which emits `fill="white"` and
          `fill="black"`. A renderer shipping colours is the thing this project exists to
          avoid, so the modules are drawn with `currentColor` and the light ones are simply
          absent: a theme sets `color` and whatever is behind shows through.

          Nothing is drawn for an empty answer. An empty string encodes to a perfectly
          valid code, and a scannable picture of nothing is worse than no picture because
          somebody would scan it. */}
      {text === '' ? null : <CodeDrawing value={text} />}
      {/* The value, as text, always. A reader who cannot see the code reads this; a
          reader who can see one still has something to copy. */}
      <output data-formancy-part="code-value">{text}</output>
    </div>
  )
}

/**
 * The modules of a QR code as one SVG.
 *
 * `viewBox` in module units with a one-module quiet zone — four is the specification's
 * recommendation and is drawn by the theme's padding instead, because a quiet zone baked
 * into the picture is whitespace a design system cannot remove.
 *
 * One `<rect>` per dark module rather than one path: a rect carries its own `fill`, so a
 * theme can address them, and the node count is bounded by the version (a version 1 code is
 * 23×23).
 */
function CodeDrawing({ value }: { value: string }): ReactElement {
  const { size, data } = encode(value)
  const modules: ReactElement[] = []
  for (const [row, cells] of data.entries()) {
    for (const [column, dark] of cells.entries()) {
      if (!dark) continue
      modules.push(
        <rect key={`${String(row)}.${String(column)}`} x={column} y={row} width={1} height={1} fill="currentColor" />,
      )
    }
  }

  return (
    <svg
      data-formancy-part="code-drawing"
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      // Decoration. The value beside it is the content.
      aria-hidden="true"
      focusable="false"
      // `shape-rendering` because a code scaled to a non-integer size gets antialiased
      // seams between modules, and a scanner reads those as noise.
      shapeRendering="crispEdges"
    >
      {modules}
    </svg>
  )
}

/** Every data path a layout places, in the order it places them. */
export function placedPaths(nodes: readonly LayoutNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    // A `qrcode` node is deliberately NOT a placement: it draws a second view of an
    // answer that a field node places elsewhere, so counting it here would report a
    // field as placed when no control for it exists.
    if (node.kind === 'field') into.push(node.path)
    else placedPaths(layoutChildren(node), into)
  }
  return into
}
