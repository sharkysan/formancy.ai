import { isSafeHref } from './richtext.js'
import type { RichBlock, RichInline } from './richtext.js'

/**
 * The stored grammar, in the shape a tree-based editor wants, and back.
 *
 * A contenteditable editor — TipTap, or anything else on ProseMirror — holds
 * its document as JSON and hands JSON back. That is compatible with
 * [0052](../../../docs/decisions/0052-richtext-is-not-html.md) in a way an
 * HTML-producing editor is not: nothing here parses markup, and nothing here
 * produces any. The conversion is a pure function between two JSON trees, so
 * the editor never sees the stored string and the stored string never sees the
 * editor's DOM.
 *
 * **Why the editor cannot widen the grammar.** A ProseMirror schema is closed
 * by construction: the editor is configured with exactly the nodes and marks
 * below, so there is no toolbar button, keyboard shortcut or paste that can
 * produce something `fromEditorDoc` has to invent a representation for. That is
 * the same discipline as the closed grammar, enforced by a different mechanism,
 * which is why an editor is allowed here at all.
 *
 * **But it is still untrusted.** The editor runs in the browser, so its output
 * is exactly as trustworthy as the submission it ends up inside. Everything
 * arriving from it is checked again here — an href against the same scheme list
 * the parser uses, an unknown node for the text underneath it — and the server
 * re-parses the stored string regardless. A conversion that assumed a
 * well-configured editor would be a validation hole with a comment explaining
 * why it was safe.
 *
 * **Nothing is ever refused.** Every function here is total. A shape the
 * grammar cannot hold degrades to the closest one that keeps the words: two
 * paragraphs in a list item are joined, a nested list is flattened into its
 * parent, an unknown node becomes a paragraph. An editor that rejects a paste
 * is worse than one that flattens it, because the person pasting cannot tell
 * which part offended it.
 */

/** A mark an editor hangs off a text node. The grammar's whole mark surface. */
export interface EditorMark {
  readonly type: string
  readonly attrs?: { readonly href?: string }
}

/** A run of text with its marks, flat, as an editor holds it. */
export interface EditorText {
  readonly type: 'text'
  readonly text: string
  readonly marks?: readonly EditorMark[]
}

/** A node in the editor's document. */
export interface EditorNode {
  readonly type: string
  readonly content?: readonly (EditorNode | EditorText)[]
}

/**
 * The node and mark names this grammar maps to, for configuring an editor.
 *
 * Exported so the editor package cannot drift from the grammar by naming its
 * extensions independently: the list an editor is built with and the list this
 * file understands are the same list.
 */
export const EDITOR_NODES = [
  'doc',
  'paragraph',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
] as const

export const EDITOR_MARKS = ['bold', 'italic', 'link'] as const

const isText = (node: EditorNode | EditorText): node is EditorText => node.type === 'text'

// ── The grammar, written out ────────────────────────────────────────────────

/**
 * Blocks back to the stored string.
 *
 * The counterpart `parseRichText` never had, because until there was an editor
 * nothing needed to produce the grammar — the textarea *was* the grammar. It is
 * not a general Markdown writer: it emits only what `parseRichText` reads, and
 * the test that matters is that parse-serialise-parse settles.
 */
export function serialiseRichText(blocks: readonly RichBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'paragraph') return inlineToSource(block.children)
      return block.items
        .map(
          (item, index) =>
            `${block.ordered ? `${String(index + 1)}.` : '-'} ${inlineToSource(item)}`,
        )
        .join('\n')
    })
    // A blank line is what ends a block, so it is what separates two.
    .join('\n\n')
}

function inlineToSource(runs: readonly RichInline[]): string {
  return runs
    .map((run) => {
      if (run.kind === 'text') return run.text
      if (run.kind === 'strong') return `**${inlineToSource(run.children)}**`
      if (run.kind === 'emphasis') return `*${inlineToSource(run.children)}*`
      // An unsafe href is not written back. Putting one into the stored string
      // would leave it a single parser change away from being live. `textToInline`
      // checks this too; see the note there for why both are kept.
      const text = inlineToSource(run.children)
      return isSafeHref(run.href) ? `[${text}](${run.href})` : text
    })
    .join('')
}

// ── Grammar → editor ────────────────────────────────────────────────────────

export function toEditorDoc(blocks: readonly RichBlock[]): EditorNode {
  return { type: 'doc', content: blocks.map(blockToNode) }
}

function blockToNode(block: RichBlock): EditorNode {
  if (block.kind === 'paragraph') {
    return { type: 'paragraph', content: inlineToText(block.children, []) }
  }

  return {
    type: block.ordered ? 'orderedList' : 'bulletList',
    content: block.items.map((item) => ({
      type: 'listItem',
      // The paragraph is not decoration: a ProseMirror schema requires a block
      // inside a list item, and a document without it is rejected outright,
      // which presents to somebody as an empty editor rather than as an error.
      content: [{ type: 'paragraph', content: inlineToText(item, []) }],
    })),
  }
}

/**
 * Nested inline runs to flat text nodes, accumulating marks on the way down.
 *
 * This is the first of the two asymmetries: the grammar nests `strong` around
 * `emphasis` around text, and an editor wants one text node carrying both.
 */
function inlineToText(runs: readonly RichInline[], marks: readonly EditorMark[]): EditorText[] {
  const out: EditorText[] = []

  for (const run of runs) {
    if (run.kind === 'text') {
      if (run.text === '') continue
      out.push(marks.length === 0 ? { type: 'text', text: run.text } : { type: 'text', text: run.text, marks })
      continue
    }

    const added: EditorMark =
      run.kind === 'strong'
        ? { type: 'bold' }
        : run.kind === 'emphasis'
          ? { type: 'italic' }
          : { type: 'link', attrs: { href: run.href } }

    out.push(...inlineToText(run.children, [...marks, added]))
  }

  return out
}

// ── Editor → grammar ────────────────────────────────────────────────────────

export function fromEditorDoc(doc: EditorNode): RichBlock[] {
  const blocks: RichBlock[] = []

  for (const node of doc.content ?? []) {
    if (isText(node)) {
      // Text directly under the document: not a shape an editor produces, but
      // the words are still the answer.
      const children = textToInline([node])
      if (children.length > 0) blocks.push({ kind: 'paragraph', children })
      continue
    }
    blocks.push(...nodeToBlocks(node))
  }

  return blocks
}

function nodeToBlocks(node: EditorNode): RichBlock[] {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const items = listItems(node)
    return items.length === 0 ? [] : [{ kind: 'list', ordered: node.type === 'orderedList', items }]
  }

  // Everything else is a paragraph: `paragraph` itself, and any node the
  // grammar has no name for. A heading is not expressible; its words are, and
  // losing them is the one outcome nobody would forgive.
  const children = collectInline(node)
  return children.length === 0 ? [] : [{ kind: 'paragraph', children }]
}

/**
 * The items of one list, with the shapes the grammar cannot hold folded in.
 *
 * The second asymmetry. An editor's item holds blocks; the grammar's holds
 * inline runs. Two paragraphs in an item are joined with a space, and a nested
 * list is flattened into this list — both keep every word, which is what
 * somebody would notice was missing.
 */
function listItems(list: EditorNode): RichInline[][] {
  const items: RichInline[][] = []

  for (const child of list.content ?? []) {
    if (isText(child)) {
      const runs = textToInline([child])
      if (runs.length > 0) items.push(runs)
      continue
    }

    if (child.type === 'bulletList' || child.type === 'orderedList') {
      items.push(...listItems(child))
      continue
    }

    const own: RichInline[] = []
    const nested: RichInline[][] = []

    for (const part of child.content ?? []) {
      if (!isText(part) && (part.type === 'bulletList' || part.type === 'orderedList')) {
        nested.push(...listItems(part))
        continue
      }
      const runs = isText(part) ? textToInline([part]) : collectInline(part)
      if (runs.length === 0) continue
      // Joined with a space rather than concatenated, so `first` and `second`
      // do not become `firstsecond` where a paragraph break used to be.
      if (own.length > 0) own.push({ kind: 'text', text: ' ' })
      own.push(...runs)
    }

    if (own.length > 0) items.push(mergeAdjacentText(own))
    items.push(...nested)
  }

  return items
}

/** Every text run under a node, however deeply an editor nested it. */
function collectInline(node: EditorNode): RichInline[] {
  const texts: EditorText[] = []

  const walk = (current: EditorNode | EditorText): void => {
    if (isText(current)) {
      texts.push(current)
      return
    }
    for (const child of current.content ?? []) walk(child)
  }

  walk(node)
  return textToInline(texts)
}

/**
 * Flat text nodes back to nested runs, in one fixed order.
 *
 * The order is not cosmetic. Two marks can nest two ways and only one may ever
 * be produced, or an answer opened and saved without being touched differs from
 * itself — which would show up as a spurious revision on every form somebody
 * merely looked at.
 */
const MARK_ORDER = ['link', 'bold', 'italic'] as const

function textToInline(texts: readonly EditorText[]): RichInline[] {
  const runs = texts
    .filter((text) => text.text !== '')
    .map((text) => ({
      text: text.text,
      marks: [...(text.marks ?? [])]
        // An unknown mark is dropped and its text kept: the editor may carry an
        // extension we did not configure, and a strikethrough is not worth
        // losing a sentence over.
        .filter((mark) => (EDITOR_MARKS as readonly string[]).includes(mark.type))
        // The same refusal the parser makes, at the other door. The editor
        // runs in the browser, so this href is as untrusted as the submission —
        // a document really does arrive carrying a `javascript:` mark, which was
        // measured rather than assumed.
        //
        // `inlineToSource` checks this again on the way to the stored string,
        // and the redundancy is deliberate: removing either one alone still
        // stops an unsafe href, so NEITHER is dead code and the test only fails
        // when both are gone. Two doors because the two are reachable
        // independently — a caller can serialise blocks it built itself without
        // ever passing through here.
        .filter((mark) => mark.type !== 'link' || isSafeHref(mark.attrs?.href ?? ''))
        .sort((a, b) => MARK_ORDER.indexOf(a.type as never) - MARK_ORDER.indexOf(b.type as never)),
    }))

  return group(runs)
}

interface FlatRun {
  readonly text: string
  readonly marks: readonly EditorMark[]
}

const sameMark = (a: EditorMark, b: EditorMark): boolean =>
  a.type === b.type && (a.attrs?.href ?? '') === (b.attrs?.href ?? '')

/**
 * Wrap the LONGEST adjacent stretch that shares a mark, then recurse inside it.
 *
 * Wrapping each run on its own would be simpler and wrong. `**a *b* c**`
 * flattens to three runs all carrying `bold`, and wrapping them individually
 * rebuilds `strong{a}, strong{em{b}}, strong{c}` — the same meaning, a
 * different tree, and a different stored string. An answer opened in the editor
 * and saved untouched would come back rewritten, which presents as a revision
 * on every form somebody merely looked at.
 *
 * Grouping is also what makes the round trip an equality rather than an
 * equivalence, so the test can be `toEqual` and actually mean something.
 */
function group(runs: readonly FlatRun[]): RichInline[] {
  const out: RichInline[] = []
  let at = 0

  while (at < runs.length) {
    const run = runs[at]!
    const outermost = run.marks[0]

    if (outermost === undefined) {
      out.push({ kind: 'text', text: run.text })
      at += 1
      continue
    }

    // How far the same outermost mark continues. Compared by value, so two
    // links to different places do not merge into one.
    let end = at + 1
    while (end < runs.length) {
      const next = runs[end]!.marks[0]
      if (next === undefined || !sameMark(next, outermost)) break
      end += 1
    }

    const inner = group(runs.slice(at, end).map((each) => ({ ...each, marks: each.marks.slice(1) })))

    out.push(
      outermost.type === 'bold'
        ? { kind: 'strong', children: inner }
        : outermost.type === 'italic'
          ? { kind: 'emphasis', children: inner }
          : { kind: 'link', href: outermost.attrs?.href ?? '', children: inner },
    )
    at = end
  }

  return mergeAdjacentText(out)
}

/**
 * Two adjacent plain-text runs become one.
 *
 * An editor splits text at every mark boundary, so dropping an unknown mark
 * leaves two runs the grammar would write as one. Without this, a round trip
 * produces a tree that is equal in meaning and unequal in shape, and the
 * round-trip test is the thing protecting against spurious revisions.
 */
function mergeAdjacentText(runs: readonly RichInline[]): RichInline[] {
  const out: RichInline[] = []

  for (const run of runs) {
    const last = out[out.length - 1]
    if (run.kind === 'text' && last?.kind === 'text') {
      out[out.length - 1] = { kind: 'text', text: last.text + run.text }
      continue
    }
    out.push(run)
  }

  return out
}
