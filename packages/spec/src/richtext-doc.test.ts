import { describe, expect, test } from 'vitest'
import { fromEditorDoc, serialiseRichText, toEditorDoc } from './richtext-doc.js'
import { parseRichText } from './richtext.js'
import type { RichBlock } from './richtext.js'

/**
 * The bridge between the stored grammar and an editor that speaks trees.
 *
 * A contenteditable editor — TipTap, or anything else built on ProseMirror —
 * holds its document as a JSON tree and hands one back. The stored answer is a
 * string in a small closed grammar, and
 * [0052](../../../docs/decisions/0052-richtext-is-not-html.md) says nothing may
 * parse it as markup. Both of those stay true if the conversion is a pure
 * function over JSON, which is what is tested here.
 *
 * Two asymmetries make this more than a rename, and they are where the bugs
 * will be:
 *
 * 1. **Marks are flat in an editor tree and nested in the grammar.** ProseMirror
 *    hangs `bold` and `italic` off a text node as a list; the grammar wraps
 *    `strong` around `emphasis` around text. Going one way flattens, going the
 *    other rebuilds the nesting — and the rebuilt nesting has to be stable, or
 *    a round trip through the editor rewrites an answer nobody edited.
 * 2. **A list item holds a block in an editor tree and inline runs in the
 *    grammar.** ProseMirror requires `listItem > paragraph > text`; the grammar
 *    has `items: RichInline[][]`. An item with two paragraphs, or a nested
 *    list, is a shape the grammar cannot hold, and the conversion has to decide
 *    rather than throw — an editor that refuses a paste is worse than one that
 *    flattens it.
 */
const SOURCES = [
  'Plain text.',
  '**Bold** and *italic*.',
  'A [link](https://example.ch) in a sentence.',
  '- one\n- two',
  '1. first\n2. second',
  'First paragraph.\n\nSecond paragraph.',
  '**Bold with *italic* inside**.',
  'A [**bold link**](https://example.ch).',
  '- item with **bold**\n- item with [a link](mailto:a@b.ch)',
  'Text, then a list:\n\n- one\n\nand after.',
]

describe('serialising blocks back to the grammar', () => {
  test.each(SOURCES)('round-trips %j through parse and serialise', (source) => {
    // The property that matters: an answer opened in an editor and saved
    // without being touched must be the same answer. Parse-serialise-parse
    // settling on the same tree is what makes that true, and it is weaker than
    // string equality on purpose — `1) x` and `1. x` are the same list.
    const once = parseRichText(source)
    const twice = parseRichText(serialiseRichText(once))

    expect(twice).toEqual(once)
  })

  test('emits the markers the parser actually reads', () => {
    const blocks: RichBlock[] = [
      { kind: 'paragraph', children: [{ kind: 'strong', children: [{ kind: 'text', text: 'hi' }] }] },
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'a' }]] },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'b' }]] },
    ]

    // Spelled out rather than only round-tripped, because a serialiser that
    // agreed with a broken parser would round-trip perfectly.
    expect(serialiseRichText(blocks)).toBe('**hi**\n\n- a\n\n1. b')
  })

  test('separates blocks by a blank line, because that is what ends one', () => {
    const blocks: RichBlock[] = [
      { kind: 'paragraph', children: [{ kind: 'text', text: 'one' }] },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'two' }] },
    ]

    expect(serialiseRichText(blocks)).toBe('one\n\ntwo')
  })

  test('leaves an unsafe href out rather than writing it back', () => {
    // The parser already refuses `javascript:` and renders it as text, so a
    // link node carrying one can only come from a caller building blocks by
    // hand. Writing it into the source would put it one parser change away
    // from being live.
    const blocks: RichBlock[] = [
      {
        kind: 'paragraph',
        children: [
          { kind: 'link', href: 'javascript:alert(1)', children: [{ kind: 'text', text: 'x' }] },
        ],
      },
    ]

    const source = serialiseRichText(blocks)

    expect(source).not.toContain('javascript:')
    expect(source).toBe('x')
  })
})

describe('to an editor document', () => {
  test('nested marks become a flat list on the text node', () => {
    const blocks = parseRichText('**Bold with *italic* inside**.')

    const doc = toEditorDoc(blocks)

    // What an editor expects: one text node carrying both marks, not a bold
    // node wrapping an italic node.
    const json = JSON.stringify(doc)
    expect(json).toContain('"bold"')
    expect(json).toContain('"italic"')
    expect(doc.type).toBe('doc')
  })

  test('a list item is wrapped in a paragraph, as the editor schema requires', () => {
    const doc = toEditorDoc(parseRichText('- one'))

    const list = doc.content?.[0]
    expect(list && 'type' in list ? list.type : undefined).toBe('bulletList')
    const item = list && 'content' in list ? list.content?.[0] : undefined
    expect(item && 'type' in item ? item.type : undefined).toBe('listItem')
    const paragraph = item && 'content' in item ? item.content?.[0] : undefined
    // Without this an editor rejects the document outright, which presents as
    // an empty box rather than as an error.
    expect(paragraph && 'type' in paragraph ? paragraph.type : undefined).toBe('paragraph')
  })

  test('a link becomes a mark with its href in attrs', () => {
    const doc = toEditorDoc(parseRichText('a [link](https://example.ch) here'))

    expect(JSON.stringify(doc)).toContain('"href":"https://example.ch"')
  })
})

describe('back from an editor document', () => {
  test.each(SOURCES)('round-trips %j through the editor shape', (source) => {
    // The whole point. An answer converted for editing and converted back,
    // untouched, is the same answer.
    const blocks = parseRichText(source)

    expect(fromEditorDoc(toEditorDoc(blocks))).toEqual(blocks)
  })

  test('rebuilds nested marks in one fixed order', () => {
    // Two marks can nest two ways and only one can be produced, or an answer
    // saved twice differs from itself. Strong outside emphasis, chosen because
    // it is what the serialiser writes and what a reader typing `**a *b* **`
    // produces.
    const doc = toEditorDoc([
      {
        kind: 'paragraph',
        children: [
          {
            kind: 'emphasis',
            children: [{ kind: 'strong', children: [{ kind: 'text', text: 'both' }] }],
          },
        ],
      },
    ])

    expect(fromEditorDoc(doc)).toEqual([
      {
        kind: 'paragraph',
        children: [
          {
            kind: 'strong',
            children: [{ kind: 'emphasis', children: [{ kind: 'text', text: 'both' }] }],
          },
        ],
      },
    ])
  })

  test('a list item with two paragraphs is joined rather than truncated', () => {
    // A shape the grammar cannot hold, arriving from a paste. Joining loses the
    // break; dropping loses the words, and somebody would have to notice that
    // the second half of their answer is gone.
    const blocks = fromEditorDoc({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
              ],
            },
          ],
        },
      ],
    })

    expect(blocks).toEqual([
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'first second' }]] },
    ])
  })

  test('a nested list is flattened into its parent, keeping the words', () => {
    // The grammar has no nested lists and validateSchema rejects them
    // elsewhere. A paste can still produce one, and the text is the part
    // somebody would miss.
    const blocks = fromEditorDoc({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'outer' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inner' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(blocks).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'outer' }], [{ kind: 'text', text: 'inner' }]],
      },
    ])
  })

  test('a node type the grammar does not have keeps its text', () => {
    // An editor configured with an extension we did not ask for, or a paste
    // that brought a heading. The heading is not expressible; the words are.
    const blocks = fromEditorDoc({
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'A heading' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] },
      ],
    })

    expect(blocks).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', text: 'A heading' }] },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'Body.' }] },
    ])
  })

  test('a mark the grammar does not have is dropped, not the text under it', () => {
    const blocks = fromEditorDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'struck', marks: [{ type: 'strike' }] }],
        },
      ],
    })

    expect(blocks).toEqual([{ kind: 'paragraph', children: [{ kind: 'text', text: 'struck' }] }])
  })

  test('an unsafe href arriving from the editor does not become a link', () => {
    // The editor is in the browser, so its output is as untrusted as the
    // submission it ends up in. This is the same refusal the parser makes, at
    // the other door.
    const blocks = fromEditorDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    })

    expect(blocks).toEqual([{ kind: 'paragraph', children: [{ kind: 'text', text: 'click' }] }])
  })

  test('an empty document is no blocks, not one empty paragraph', () => {
    // An empty answer and an answer containing a blank paragraph must not be
    // the same stored value, or every untouched form field grows one.
    expect(fromEditorDoc({ type: 'doc', content: [] })).toEqual([])
    expect(fromEditorDoc({ type: 'doc' })).toEqual([])
    expect(
      fromEditorDoc({ type: 'doc', content: [{ type: 'paragraph', content: [] }] }),
    ).toEqual([])
  })
})
