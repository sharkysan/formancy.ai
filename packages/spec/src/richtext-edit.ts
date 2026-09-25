/**
 * Turning a toolbar button into an edit, without either renderer knowing how
 * the grammar is spelled.
 *
 * A rich text editor is where a form platform usually reaches for a
 * contenteditable surface and a sanitiser. formancy does not, for the reason
 * in [0052](../../../docs/decisions/0052-richtext-is-not-html.md): the stored
 * answer is a closed grammar and nothing ever parses it as markup. So the
 * editor is a textarea with a toolbar over it, and pressing **Bold** does what
 * somebody typing the grammar by hand would have done.
 *
 * That has three consequences worth wanting. The control is a `<textarea>`, so
 * every assistive technology already knows it, and none of the caret,
 * selection and focus problems of a contenteditable exist to get wrong. The
 * value cannot express anything the grammar cannot, so there is no gap between
 * what the editor produces and what the parser accepts. And it works the same
 * in React and in Angular, because the transformation lives here rather than
 * in either of them: a button that behaved differently in two renderers would
 * be the exact drift this package exists to prevent.
 *
 * Everything below is a pure function of a string and a selection. No DOM.
 */

/** What is in the box, and what part of it is selected. */
export interface TextSelection {
  readonly value: string
  readonly start: number
  readonly end: number
}

/**
 * The new value, and where the selection should sit afterwards.
 *
 * The selection is part of the answer rather than an afterthought: an editor
 * that drops the caret to the end after every button is an editor nobody can
 * use for a second word.
 */
export interface EditResult {
  readonly value: string
  readonly start: number
  readonly end: number
}

/** What a toolbar can do. Deliberately the grammar's whole surface, no more. */
export type RichCommand = 'strong' | 'emphasis' | 'link' | 'bulletList' | 'orderedList'

const WRAPPERS: Readonly<Record<'strong' | 'emphasis', string>> = {
  strong: '**',
  emphasis: '*',
}

/**
 * Apply a command to a selection.
 *
 * Toggling is the behaviour people expect and the one that is easy to get
 * subtly wrong: pressing Bold on text that is already bold has to REMOVE the
 * markers, whether the reader selected the word inside them or the whole
 * `**word**` including them. Both are the same gesture to the person doing it.
 */
export function applyRichCommand(
  command: RichCommand,
  selection: TextSelection,
  options: { readonly href?: string } = {},
): EditResult {
  if (command === 'link') return applyLink(selection, options.href ?? '')
  if (command === 'bulletList' || command === 'orderedList') {
    return applyList(selection, command === 'orderedList')
  }
  return applyWrapper(selection, WRAPPERS[command])
}

function applyWrapper(selection: TextSelection, marker: string): EditResult {
  const { value, start, end } = selection
  const selected = value.slice(start, end)
  const width = marker.length

  // Selected the markers as well: `**word**` with the stars inside the
  // selection.
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= width * 2) {
    const inner = selected.slice(width, -width)
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    }
  }

  // Selected only the text, with the markers sitting just outside it.
  const before = value.slice(Math.max(0, start - width), start)
  const after = value.slice(end, end + width)
  if (before === marker && after === marker) {
    return {
      value: value.slice(0, start - width) + selected + value.slice(end + width),
      start: start - width,
      end: start - width + selected.length,
    }
  }

  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    // Empty selection: the caret lands BETWEEN the markers, so the next
    // keystroke is inside the emphasis rather than after it.
    start: start + width,
    end: start + width + selected.length,
  }
}

function applyLink(selection: TextSelection, href: string): EditResult {
  const { value, start, end } = selection
  const text = value.slice(start, end)
  const inserted = `[${text}](${href})`
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    // With no text selected the caret goes where the label belongs; with text
    // selected it goes to the href, which is the part still missing.
    ...(text === ''
      ? { start: start + 1, end: start + 1 }
      : { start: start + text.length + 3, end: start + text.length + 3 + href.length }),
  }
}

/**
 * Prefix every line the selection touches, or strip the prefix if they all
 * have it.
 *
 * Whole lines, not the selection's exact bounds: a list marker belongs to a
 * line, and applying it to half of one would produce `wo- rd`.
 */
function applyList(selection: TextSelection, ordered: boolean): EditResult {
  const { value, start, end } = selection
  const from = value.lastIndexOf('\n', start - 1) + 1
  const toIndex = value.indexOf('\n', end)
  const to = toIndex === -1 ? value.length : toIndex

  const lines = value.slice(from, to).split('\n')
  const marked = lines.every((line) => line.trim() === '' || isListItem(line, ordered))

  const next = lines
    .map((line, index) => {
      if (line.trim() === '') return line
      if (marked) return line.replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, '')
      // Numbered from one each time rather than continuing a previous list:
      // the parser renumbers anyway, and guessing wrong is worse than
      // counting from the top.
      return `${ordered ? `${String(index + 1)}.` : '-'} ${line}`
    })
    .join('\n')

  return {
    value: value.slice(0, from) + next + value.slice(to),
    start: from,
    end: from + next.length,
  }
}

function isListItem(line: string, ordered: boolean): boolean {
  return ordered ? /^\s*\d+[.)]\s+/.test(line) : /^\s*[-*]\s+/.test(line)
}

/*
 * NOT HERE: which marks the caret is inside, for a pressed state on the
 * toolbar.
 *
 * It needs a source offset, and the parser reports a tree — the caret is at
 * index 11 of `say ***hel|lo***`, and the tree knows only that "hello" is the
 * fifth through tenth characters of the text it produced. Bridging the two
 * means either a second scanner that re-implements the grammar's rules, which
 * would drift from `parseInline` the first time either changed, or source
 * spans on every node, which is a change to the parser for the sake of a
 * button's appearance.
 *
 * So the buttons carry no pressed state. They still do the right thing when
 * pressed — bold on bold text removes it — and the preview under the box
 * shows the truth either way. Worth revisiting only if the parser grows source
 * spans for another reason.
 */
