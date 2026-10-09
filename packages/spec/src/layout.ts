/**
 * How a form is arranged, as distinct from what it collects.
 *
 * Its own module because it is its own reason to change: a new layout kind
 * changes this file and a new field type changes `types.ts`. The split was
 * forced by the size budget — that file was 736 lines against a ceiling of 695
 * when spec 4 landed — and the budget found a boundary rather than an
 * inconvenience.
 *
 * **Only types cross back.** `types.ts` reads `FormLayout` as a type and this
 * reads `Text` as one, so nothing imports anything at runtime in either
 * direction and there is no cycle to reason about.
 */
import type { Text } from './types.js'

/** Layout node kinds version 1 defines. */
export const SPEC_1_LAYOUT_KINDS = ['field', 'section', 'row', 'column'] as const

/**
 * How many of a table's columns a node takes.
 *
 * **Only inside a `table`**, and `validateSchema` refuses it anywhere else rather than
 * ignoring it.
 *
 * `'all'` rather than the column count, for the common case: `span: 2` in a table later
 * made three columns wide has silently lost the full width, and `'all'` survives the
 * edit. A number is still there for "two of three", and one wider than the table is
 * refused ([0074](../../../docs/decisions/0074-a-table-child-may-span.md)).
 *
 * A renderer that ignores this is still correct: every answer is collected and placed.
 * The narrow-screen collapse overrides it anyway, because WCAG 1.4.10 is a media query
 * rather than a property of the document.
 */
export interface LayoutPlacement {
  span?: number | 'all'
}

/**
 * One arrangement of a model. A form may have several — `web`, `print`,
 * `mobile` — over the same data, which is the point of keeping layout out of
 * the model in the first place.
 */
export interface FormLayout {
  name: string
  nodes: LayoutNode[]
}

export type LayoutNode =
  | ({ kind: 'field'; path: string } & LayoutPlacement)
  | ({ kind: 'section' | 'row' | 'column'; label?: Text; children: LayoutNode[] } & LayoutPlacement)
  /**
   * One panel shown at a time, each child section supplying a tab and its
   * label supplying the tab's name.
   *
   * Reusing `section` rather than inventing a panel node keeps the union small
   * and makes the rule obvious: a tab needs a name, and a section is the node
   * that has one.
   *
   * Tabs are **presentation**, unlike `page`. Every field in every tab is
   * validated and submitted whether its tab is open or not, because hiding a
   * field behind a tab is not the same as saying it does not apply
   * ([0012](../../../docs/decisions/0012-pages-scope-nothing.md) draws the
   * same line for pages). A renderer therefore has to be able to open the tab
   * an error is in.
   *
   * A `label` here names the tab strip itself, not a tab. Two tab strips in
   * one form are otherwise both announced as "tab list" and a screen-reader
   * user cannot tell which is which.
   */
  | ({ kind: 'tabs'; label?: Text; children: LayoutNode[] } & LayoutPlacement)
  /**
   * A grid whose columns line up across rows, which is the one thing stacked
   * `row` nodes cannot do — each row sizes itself independently.
   *
   * `columns` is the count at full width. Narrower than that and it collapses,
   * like every other container here, because WCAG 1.4.10 is a media query and
   * not a measurement.
   */
  | ({ kind: 'table'; columns: number; label?: Text; children: LayoutNode[] } & LayoutPlacement)
  /**
   * A machine-readable code drawn from a value the form already holds.
   *
   * **Collects nothing**, which is why it is here and not a field type. A field type
   * would put a non-answering entry in the model: a key that is an identity forever, a
   * path in the data, a row in every diff, a column in an exported CSV nobody filled
   * in, and a target a computed rule could aim at.
   *
   * It is not a widget either. A widget sits on a field that collects, and
   * `widget: "qrcode"` on a text field would replace the input with a picture — which
   * changes what somebody may enter, and is over the line
   * [0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md) draws.
   * The scanning half of the request IS a widget, for the opposite reason: reading a
   * code writes an answer.
   *
   * `path` names the field whose answer is encoded. `label` is what a reader is told
   * the code is — a picture says nothing to a screen reader, so the label and the
   * value behind it are the accessible content.
   */
  | ({ kind: 'qrcode'; path: string; label?: Text } & LayoutPlacement)

/**
 * The layout kinds that hold no children.
 *
 * `LayoutNode` had exactly two shapes — `field`, with a path and no children, and
 * everything else, with children — and fourteen places in this repository encoded that
 * as `node.kind === 'field' ? … : node.children`. `qrcode` is the first childless node
 * that is not a field, so every one of those was about to be wrong: most as a compile
 * error, which is the good case, and some as a silent walk into `undefined`.
 *
 * So the assumption lives here, once. The next childless node is a one-line change.
 */
export const LAYOUT_LEAF_KINDS = new Set<LayoutNode['kind']>(['field', 'qrcode'])

/**
 * A layout node's children, or none if it has none.
 *
 * The safe replacement for `node.kind === 'field' ? [] : node.children`. Use it rather
 * than testing the kind: a walker written against the kind is a walker that has to be
 * found again next time a leaf is added.
 */
export function layoutChildren(node: LayoutNode): readonly LayoutNode[] {
  return LAYOUT_LEAF_KINDS.has(node.kind) ? [] : (node as { children: LayoutNode[] }).children
}

/**
 * Whether a layout node has anything to show, given which answers are shown: a leaf when
 * its own answer is, a container while anything inside it is.
 *
 * This is how a paged form's layout is drawn one page at a time — the arrangement the
 * author made, holding the fields of the page somebody is on, and no section heading over
 * nothing for a page they are not on. Decided here so both renderers ask the same question:
 * they had each answered it differently, one drawing every page's fields on every step and
 * the other dropping the layout altogether
 * ([0137](../../../docs/decisions/0137-a-paged-forms-layout-is-drawn-a-page-at-a-time.md)).
 * A renderer skips a node this says no to and keeps its position, which is the address the
 * builder's drop surface reads.
 */
export function layoutNodeShows(node: LayoutNode, shows: (path: string) => boolean): boolean {
  if (LAYOUT_LEAF_KINDS.has(node.kind)) return shows((node as { path: string }).path)
  return layoutChildren(node).some((child) => layoutNodeShows(child, shows))
}
