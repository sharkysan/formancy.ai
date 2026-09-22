/**
 * The markup a `richtext` answer is stored in, and the only thing that reads it.
 *
 * **Why not HTML.** Stored cross-site scripting is the most commonly exploited
 * vulnerability in this product category, and a rich-text field is the obvious
 * way in: somebody types into a public form, an administrator opens the
 * submission, and whatever they typed runs. Storing HTML means every consumer
 * of the data — this renderer, the other renderer, a CSV export, a PDF, an
 * email, somebody's own dashboard — has to sanitise correctly and forever, and
 * one of them will not.
 *
 * So the stored answer is never parsed as markup by anything. It is parsed
 * HERE, once, into the typed tree below, and each renderer builds elements
 * from that tree. There is no path from an answer to `innerHTML`, no
 * sanitiser to keep up to date, and no way for a new consumer to get it wrong
 * by default — the shape it receives is already safe
 * ([0052](../../../docs/decisions/0052-richtext-is-not-html.md)).
 *
 * **Why so little of it.** Bold, italic, links, lists, paragraphs. A form
 * answer is not a document: every construct beyond these is another thing two
 * renderers can disagree about, another row in the accessibility audit, and
 * another thing to migrate if the grammar ever changes. The grammar lives in
 * this package rather than in a renderer because the two renderers agreeing
 * about what an answer *means* is the same promise as the engine agreeing with
 * itself across browser and server.
 */

/** A run of text, possibly emphasised, possibly a link. */
export type RichInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: RichInline[] }
  | { kind: 'emphasis'; children: RichInline[] }
  | { kind: 'link'; href: string; children: RichInline[] }

export type RichBlock =
  | { kind: 'paragraph'; children: RichInline[] }
  | { kind: 'list'; ordered: boolean; items: RichInline[][] }

/**
 * Schemes a link may use.
 *
 * `javascript:` is the reason this list exists, and `data:` is the reason it
 * is a list rather than one exclusion. Anything else renders as the literal
 * text somebody typed, which is visible, harmless and honest — silently
 * dropping it would leave a reader wondering where their link went.
 */
const SAFE_SCHEMES = ['http://', 'https://', 'mailto:']

export function isSafeHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase()
  return SAFE_SCHEMES.some((scheme) => trimmed.startsWith(scheme))
}

/**
 * Parse a stored answer into blocks.
 *
 * Total: every input produces a tree, because an answer someone typed is not
 * a program and refusing to display it is not an option. Malformed markup
 * degrades to the characters that were typed.
 */
export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = []
  // Blank lines separate blocks; \r\n first so a Windows paste is not a
  // paragraph break followed by a stray carriage return.
  const lines = source.replace(/\r\n?/g, '\n').split('\n')

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | undefined

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) })
    paragraph = []
  }

  const flushList = (): void => {
    if (list === undefined) return
    blocks.push({
      kind: 'list',
      ordered: list.ordered,
      items: list.items.map((item) => parseInline(item)),
    })
    list = undefined
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '') {
      flushParagraph()
      flushList()
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)

    if (bullet !== null || numbered !== null) {
      const ordered = bullet === null
      const text = (bullet?.[1] ?? numbered?.[1]) ?? ''
      flushParagraph()
      // A list that changes marker starts a new list rather than mixing two
      // kinds of item under one, which no renderer can show coherently.
      if (list !== undefined && list.ordered !== ordered) flushList()
      list = list ?? { ordered, items: [] }
      list.items.push(text)
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  return blocks
}

/**
 * Inline runs, left to right, innermost-first.
 *
 * Hand-written rather than regular-expression-driven: the patterns for nested
 * emphasis are exactly the shape `recheck` rejects elsewhere in this codebase,
 * and a form author's answer is attacker-controlled text run by the server.
 * This scans once and cannot backtrack.
 */
function parseInline(source: string): RichInline[] {
  const out: RichInline[] = []
  let text = ''

  const flush = (): void => {
    if (text !== '') {
      out.push({ kind: 'text', text })
      text = ''
    }
  }

  let at = 0
  while (at < source.length) {
    const rest = source.slice(at)

    if (rest.startsWith('**')) {
      let end = source.indexOf('**', at + 2)
      if (end !== -1) {
        // `***` is three stars, not "close the bold then a stray one". The
        // closer is the LAST two of a run, which leaves the odd star inside
        // for the italic that opened it: `**bold *and italic***` reads the
        // way somebody typing it expects, and taking the first two does not.
        while (source[end + 2] === '*') end += 1
        flush()
        out.push({ kind: 'strong', children: parseInline(source.slice(at + 2, end)) })
        at = end + 2
        continue
      }
    }

    if (rest.startsWith('*')) {
      const end = source.indexOf('*', at + 1)
      if (end !== -1) {
        flush()
        out.push({ kind: 'emphasis', children: parseInline(source.slice(at + 1, end)) })
        at = end + 1
        continue
      }
    }

    if (rest.startsWith('[')) {
      const link = readLink(source, at)
      if (link !== undefined) {
        flush()
        out.push(
          isSafeHref(link.href)
            ? { kind: 'link', href: link.href.trim(), children: parseInline(link.text) }
            : // Shown as typed. A reader can see what was meant, and nothing
              // navigates anywhere on their behalf.
              { kind: 'text', text: source.slice(at, link.next) },
        )
        at = link.next
        continue
      }
    }

    text += source[at]
    at += 1
  }

  flush()
  return out
}

/** `[text](href)` starting at `at`, or undefined if it is not one. */
function readLink(
  source: string,
  at: number,
): { text: string; href: string; next: number } | undefined {
  const closeText = source.indexOf(']', at + 1)
  if (closeText === -1) return undefined
  if (source[closeText + 1] !== '(') return undefined
  const closeHref = source.indexOf(')', closeText + 2)
  if (closeHref === -1) return undefined

  return {
    text: source.slice(at + 1, closeText),
    href: source.slice(closeText + 2, closeHref),
    next: closeHref + 1,
  }
}

/**
 * The plain text of an answer, for a CSV cell, a search index or a summary.
 *
 * Exported because the alternative is every consumer writing its own, and one
 * of them writing it with a regular expression over the source.
 */
export function richTextToPlain(source: string): string {
  const fromInline = (nodes: readonly RichInline[]): string =>
    nodes
      .map((node) => (node.kind === 'text' ? node.text : fromInline(node.children)))
      .join('')

  return parseRichText(source)
    .map((block) =>
      block.kind === 'paragraph'
        ? fromInline(block.children)
        : block.items.map((item) => fromInline(item)).join('\n'),
    )
    .join('\n\n')
}
