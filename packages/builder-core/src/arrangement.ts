import { SPEC_1_LAYOUT_KINDS, modelDataPaths } from '@formancy/spec'
import type { LayoutNode } from '@formancy/spec'
import { describeLayoutTarget, flattenLayout, nameOfPath } from './layout-tree.js'
import type { LayoutTreeNode } from './layout-tree.js'
import type { LayoutAddress, LayoutLocation } from './layout.js'
import type { ArrangeDrop } from './arrange.js'
import { nextSpecVersion } from './palette.js'
import type { BuilderSession } from './session.js'

/**
 * What the arrangement pane offers, and what it says after each command.
 *
 * Both builders had their own answer, and the answers had drifted apart in the
 * way [0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md) is
 * about: the React pane offered the unplaced fields and a scannable code in its
 * add palette, and the Angular pane offered three containers — it listed the
 * fields the arrangement leaves out under "Not in this arrangement" and gave no
 * way to place one. The decision of what can be added, what a new node looks like,
 * what may be wrapped with what, and every sentence a command produces, is made
 * here once, in the session's language
 * ([0116](../../../docs/decisions/0116-what-a-builder-says-is-decided-once.md)).
 */

/** The containers the arrangement pane can add. A field comes from the unplaced list. */
export const LAYOUT_CONTAINERS = ['row', 'column', 'section'] as const

export type LayoutAddition =
  | {
      readonly what: 'container'
      readonly kind: (typeof LAYOUT_CONTAINERS)[number]
      readonly label: string
      readonly hint: string
    }
  | {
      readonly what: 'code'
      readonly label: string
      readonly hint: string
      /**
       * The document's spec version has no code, and choosing it moves the document
       * forward one version instead. Offered rather than hidden: without it, the
       * chooser and the answer list both worked and the final step had no valid
       * destination, because legality is decided by trying the edit against the
       * validator — three clicks to nothing.
       */
      readonly locked: boolean
    }
  | { readonly what: 'field'; readonly path: string; readonly label: string; readonly hint: string }

/** What the add palette lists for one arrangement, in the order it lists it. */
export function layoutAdditions(session: BuilderSession, layout: string): LayoutAddition[] {
  const { text } = session
  const document = session.document()
  const locked =
    document.specVersion === '1' && !(SPEC_1_LAYOUT_KINDS as readonly string[]).includes('qrcode')

  return [
    ...LAYOUT_CONTAINERS.map((kind): LayoutAddition => ({
      what: 'container',
      kind,
      label: text(`layout.kind.${kind}`),
      hint: text(`layout.hint.${kind}`),
    })),
    {
      what: 'code',
      label: text('layout.kind.qrcode'),
      hint: locked
        ? text('layout.codeLocked', {
            version: nextSpecVersion(document.specVersion) ?? '',
            current: document.specVersion,
          })
        : text('layout.hint.qrcode'),
      locked,
    },
    ...session.unplacedFields(layout).map((path): LayoutAddition => ({
      what: 'field',
      path,
      label: nameOfPath(document, path),
      hint: text('layout.hint.unplaced'),
    })),
  ]
}

/**
 * The answers a code can show: every one, not only the unplaced.
 *
 * A code is a second view of an answer rather than the placement of it, so the
 * ordinary case is a code beside the field it encodes.
 */
export function codeAnswers(session: BuilderSession): Array<{ path: string; label: string }> {
  const document = session.document()
  return modelDataPaths(document.model).map((path) => ({ path, label: nameOfPath(document, path) }))
}

/**
 * The node an addition inserts.
 *
 * A code gets a label, because a code's label IS its accessible content: the
 * picture cannot be read aloud, so an unlabelled code announces a bare string from
 * nowhere. Named after the answer it shows, in the author's language, because it
 * is written into the document; an author who wants better words changes them in
 * the panel.
 */
export function layoutNodeFor(
  session: BuilderSession,
  addition:
    | { what: 'container'; kind: string }
    | { what: 'field'; path: string }
    | { what: 'code'; path: string },
): LayoutNode {
  if (addition.what === 'field') return { kind: 'field', path: addition.path }
  if (addition.what === 'code') {
    const name = nameOfPath(session.document(), addition.path)
    return { kind: 'qrcode', path: addition.path, label: session.text('layout.newCode', { name }) }
  }
  return { kind: addition.kind, children: [] } as LayoutNode
}

/**
 * How a node about to be added is named on its own in a sentence: "a row",
 * "Email", "the code for Email". Not the list form a container's name uses —
 * German puts that one in the dative, after "mit".
 */
export function nameOfAddition(session: BuilderSession, node: LayoutNode): string {
  const document = session.document()
  if (node.kind === 'field') return nameOfPath(document, node.path)
  if (node.kind === 'qrcode') {
    return session.text('layout.new.qrcode', { name: nameOfPath(document, node.path) })
  }
  return session.text(`layout.new.${node.kind}`)
}

/**
 * Which items the subject may be put in a row with.
 *
 * Its own descendants and its own ancestors are left out: the session refuses to
 * wrap a container together with something inside it, and not offering a choice
 * beats offering it and explaining afterwards.
 */
export function wrapCandidates(
  rows: readonly LayoutTreeNode[],
  subject: LayoutTreeNode,
): LayoutTreeNode[] {
  return rows.filter(
    (candidate) =>
      !samePath(candidate.path, subject.path) &&
      !encloses(subject.path, candidate.path) &&
      !encloses(candidate.path, subject.path),
  )
}

export function addLayoutAndSay(session: BuilderSession, name = 'web'): string {
  const outcome = session.addLayout(name)
  return outcome.ok
    ? session.text('said.layoutAdded', { name })
    : session.text('said.cannotAdd', { reason: outcome.message })
}

export function insertLayoutAndSay(
  session: BuilderSession,
  node: LayoutNode,
  target: { location: LayoutLocation; label: string },
): string {
  const what = nameOfAddition(session, node)
  const outcome = session.insertLayoutNode(target.location, node)
  return outcome.ok
    ? session.text('said.added', { what, where: target.label })
    : session.text('said.cannotAdd', { reason: outcome.message })
}

export function moveLayoutAndSay(
  session: BuilderSession,
  address: LayoutAddress,
  target: { location: LayoutLocation; label: string },
): string {
  const name = nodeName(session, address)
  const outcome = session.moveLayoutNode(address, target.location)
  return outcome.ok
    ? session.text('said.moved', { name, where: target.label })
    : session.text('said.cannotMove', { reason: outcome.message })
}

/** A drop, named by the node that moved. The React pane said only "Moved." */
export function dropLayoutAndSay(
  session: BuilderSession,
  address: LayoutAddress,
  location: LayoutLocation,
): string {
  const name = nodeName(session, address)
  const outcome = session.moveLayoutNode(address, location)
  return outcome.ok
    ? session.text('said.dropped', { name })
    : session.text('said.cannotMove', { reason: outcome.message })
}

export function unwrapLayoutAndSay(session: BuilderSession, address: LayoutAddress): string {
  const name = nodeName(session, address)
  const outcome = session.unwrapLayoutNode(address)
  return outcome.ok
    ? session.text('said.layoutUnwrapped', { name })
    : session.text('said.cannotUnwrap', { name, reason: outcome.message })
}

/**
 * Take a node out of the arrangement. Said plainly: the field is still collected,
 * it only has no place in this arrangement, and anything else reads as a deletion.
 */
export function removeLayoutAndSay(session: BuilderSession, address: LayoutAddress): string {
  const name = nodeName(session, address)
  const outcome = session.removeLayoutNode(address)
  return outcome.ok
    ? session.text('said.layoutRemoved', { name })
    : session.text('said.cannotRemove', { name, reason: outcome.message })
}

/**
 * Put two items side by side in a new row, the first one chosen first. `at` is
 * where the row goes when it is not where the first of them was.
 */
export function wrapAndSay(
  session: BuilderSession,
  layout: string,
  first: readonly number[],
  second: readonly number[],
  at?: readonly number[],
): string {
  const one = nodeName(session, { layout, path: first })
  const other = nodeName(session, { layout, path: second })
  const row: LayoutNode = { kind: 'row', children: [] }
  const outcome =
    at === undefined
      ? session.wrapLayoutNodes(layout, [first, second], row)
      : session.wrapLayoutNodes(layout, [first, second], row, at)
  return outcome.ok
    ? session.text('said.wrapped', { first: one, second: other })
    : session.text('said.cannotWrap', { reason: outcome.message })
}

/** What the arrangement pane's legend lists, in the session's language. */
export function layoutKeyHelp(session: BuilderSession): ReadonlyArray<readonly [string, string]> {
  const { text } = session
  return [
    ['↑ ↓', text('keys.layout.arrows.what')],
    ['a', text('keys.layout.add.what')],
    ['m', text('keys.layout.move.what')],
    ['u', text('keys.layout.unwrap.what')],
    ['w', text('keys.layout.wrap.what')],
    [text('keys.delete.key'), text('keys.layout.delete.what')],
    [text('keys.undo.key'), text('keys.undo.what')],
  ]
}

function nodeName(session: BuilderSession, address: LayoutAddress): string {
  const row = flattenLayout(session.document(), address.layout, session.text).find((candidate) =>
    samePath(candidate.path, address.path),
  )
  return row?.name ?? address.path.join('.')
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, at) => b[at] === step)
}

/** Whether `outer` is a strict ancestor of `inner`. */
function encloses(outer: readonly number[], inner: readonly number[]): boolean {
  return outer.length < inner.length && outer.every((step, at) => inner[at] === step)
}

/**
 * A drop on the rendered form, done and said.
 *
 * Both builders' drag surfaces made these two decisions by hand. The side aimed
 * at decides the order, which is the point of having two zones rather than one;
 * and the row belongs where the thing dropped ON was — without that, dragging a
 * field out of a row onto a top-level field nested the new row inside the old one,
 * which is not what anybody aimed at. The sentence names both items, where the
 * surfaces said "Put them side by side".
 */
export function arrangeDropAndSay(
  session: BuilderSession,
  layout: string,
  from: readonly number[],
  drop: ArrangeDrop,
): string {
  if (drop.kind === 'wrap') {
    const [first, second] = drop.side === 'start' ? [from, drop.over] : [drop.over, from]
    return wrapAndSay(session, layout, first, second, drop.over)
  }
  // Described against the document before the move, excluding the traveller,
  // which is what makes the sentence true.
  const where = describeLayoutTarget(session.document(), drop.location, from, session.text)
  const outcome = session.moveLayoutNode({ layout, path: from }, drop.location)
  return outcome.ok
    ? session.text('said.movedTo', { where })
    : session.text('said.cannotMove', { reason: outcome.message })
}
