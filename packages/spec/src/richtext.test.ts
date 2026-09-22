import { describe, expect, test } from 'vitest'
import { isSafeHref, parseRichText, richTextToPlain } from './richtext.js'
import type { RichInline } from './richtext.js'

/**
 * The grammar a `richtext` answer is stored in.
 *
 * Half of these are about what the parser does NOT do. A form answer is
 * attacker-controlled text that an administrator will later open, so the
 * interesting cases are the ones where a looser parser would produce something
 * the reader did not type.
 */
const text = (value: string): RichInline => ({ kind: 'text', text: value })

describe('blocks', () => {
  test('a blank line separates paragraphs', () => {
    expect(parseRichText('one\n\ntwo')).toEqual([
      { kind: 'paragraph', children: [text('one')] },
      { kind: 'paragraph', children: [text('two')] },
    ])
  })

  test('consecutive lines are one paragraph, joined with a space', () => {
    expect(parseRichText('one\ntwo')).toEqual([
      { kind: 'paragraph', children: [text('one two')] },
    ])
  })

  test('a Windows paste is not a paragraph break plus a stray return', () => {
    expect(parseRichText('one\r\n\r\ntwo')).toHaveLength(2)
  })

  test('bullets become an unordered list', () => {
    expect(parseRichText('- milk\n- eggs')).toEqual([
      { kind: 'list', ordered: false, items: [[text('milk')], [text('eggs')]] },
    ])
  })

  test('numbers become an ordered list, whichever punctuation is used', () => {
    expect(parseRichText('1. first\n2) second')).toEqual([
      { kind: 'list', ordered: true, items: [[text('first')], [text('second')]] },
    ])
  })

  test('changing marker starts a new list rather than mixing two kinds of item', () => {
    const blocks = parseRichText('- one\n1. two')

    expect(blocks).toHaveLength(2)
    expect(blocks.map((block) => block.kind === 'list' && block.ordered)).toEqual([false, true])
  })

  test('an empty answer is no blocks, not one empty paragraph', () => {
    expect(parseRichText('')).toEqual([])
    expect(parseRichText('   \n\n  ')).toEqual([])
  })
})

describe('inline', () => {
  test('bold and italic', () => {
    expect(parseRichText('a **b** c *d*')).toEqual([
      {
        kind: 'paragraph',
        children: [
          text('a '),
          { kind: 'strong', children: [text('b')] },
          text(' c '),
          { kind: 'emphasis', children: [text('d')] },
        ],
      },
    ])
  })

  test('bold wins over italic, so ** is never read as two *', () => {
    const [block] = parseRichText('**both**')

    expect(block?.kind === 'paragraph' && block.children[0]?.kind).toBe('strong')
  })

  test('emphasis nests', () => {
    expect(parseRichText('**bold and *also italic***')).toEqual([
      {
        kind: 'paragraph',
        children: [
          {
            kind: 'strong',
            children: [text('bold and '), { kind: 'emphasis', children: [text('also italic')] }],
          },
        ],
      },
    ])
  })

  test('an unclosed marker is the character somebody typed', () => {
    // Degrading to the literal text is the only honest answer: the alternative
    // is swallowing the rest of the answer into an emphasis nobody opened.
    expect(parseRichText('2 * 3 = 6')).toEqual([
      { kind: 'paragraph', children: [text('2 * 3 = 6')] },
    ])
  })
})

describe('links', () => {
  test('an http link is a link', () => {
    expect(parseRichText('see [the docs](https://example.ch/x)')).toEqual([
      {
        kind: 'paragraph',
        children: [
          text('see '),
          { kind: 'link', href: 'https://example.ch/x', children: [text('the docs')] },
        ],
      },
    ])
  })

  test('mailto is allowed, because a form asking to be replied to is the point', () => {
    const [block] = parseRichText('[write](mailto:a@example.ch)')

    expect(block?.kind === 'paragraph' && block.children[0]?.kind).toBe('link')
  })

  test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('a %s link renders as the text somebody typed, and navigates nowhere', (href) => {
    const [block] = parseRichText(`[click](${href})`)
    const first = block?.kind === 'paragraph' ? block.children[0] : undefined

    // Not dropped: a reader can still see what was meant. Not a link: nothing
    // happens on their behalf when they touch it.
    expect(first?.kind).toBe('text')
    expect(first?.kind === 'text' && first.text).toContain('click')
  })

  test('isSafeHref is the whole rule, and says so for a caller that needs it', () => {
    expect(isSafeHref('https://example.ch')).toBe(true)
    expect(isSafeHref('  HTTPS://example.ch  ')).toBe(true)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('/relative')).toBe(false)
  })

  test('a malformed link is left alone rather than half-read', () => {
    expect(parseRichText('[no closing paren](https://example.ch')).toEqual([
      { kind: 'paragraph', children: [text('[no closing paren](https://example.ch')] },
    ])
  })
})

describe('what is deliberately not markup', () => {
  test('angle brackets are characters, not tags', () => {
    // The whole reason this grammar exists. Nothing downstream can turn this
    // into an element, because nothing downstream is ever handed a string.
    expect(parseRichText('<script>alert(1)</script>')).toEqual([
      { kind: 'paragraph', children: [text('<script>alert(1)</script>')] },
    ])
  })

  test('an ampersand is an ampersand', () => {
    expect(parseRichText('Tom &amp; Jerry &lt;b&gt;')).toEqual([
      { kind: 'paragraph', children: [text('Tom &amp; Jerry &lt;b&gt;')] },
    ])
  })

  test('headings and images are not in the grammar', () => {
    expect(parseRichText('# Heading')).toEqual([
      { kind: 'paragraph', children: [text('# Heading')] },
    ])
    expect(parseRichText('![alt](https://example.ch/x.png)')).toEqual([
      {
        kind: 'paragraph',
        children: [
          text('!'),
          { kind: 'link', href: 'https://example.ch/x.png', children: [text('alt')] },
        ],
      },
    ])
  })
})

describe('richTextToPlain', () => {
  test('strips the markup and keeps the words', () => {
    expect(richTextToPlain('**bold** and [a link](https://example.ch)')).toBe('bold and a link')
  })

  test('keeps blocks apart, so a CSV cell does not run two paragraphs together', () => {
    expect(richTextToPlain('one\n\ntwo')).toBe('one\n\ntwo')
    expect(richTextToPlain('- milk\n- eggs')).toBe('milk\neggs')
  })
})

describe('it terminates, on the shapes that make parsers hang', () => {
  test.each([
    ['*'.repeat(5000), 'unbalanced emphasis'],
    ['['.repeat(5000), 'unclosed links'],
    ['**a*'.repeat(2000), 'interleaved markers'],
    [`[a](${'('.repeat(5000)}`, 'a runaway href'],
  ])('%s survives (%s)', (source) => {
    const started = Date.now()
    parseRichText(source)

    // The scan is single-pass and cannot backtrack, which is the property
    // being pinned; the budget only has to be far below anything pathological.
    expect(Date.now() - started).toBeLessThan(500)
  })
})
