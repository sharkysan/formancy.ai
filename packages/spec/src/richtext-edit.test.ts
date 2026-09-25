import { describe, expect, test } from 'vitest'
import { applyRichCommand } from './richtext-edit.js'
import type { RichCommand, TextSelection } from './richtext-edit.js'
import { parseRichText } from './richtext.js'

/**
 * The toolbar's behaviour, as arithmetic on a string.
 *
 * Pure functions rather than a widget, which is the point: React and Angular
 * both call these, so a Bold button cannot mean one thing in one renderer and
 * something else in the other. Testing them here tests both.
 *
 * `|` marks a caret and `[...]` a selection in the fixtures below, because
 * off-by-one errors in selection maths are invisible in a diff and obvious in
 * a marked string.
 */
const at = (marked: string): TextSelection => {
  if (marked.includes('[')) {
    const start = marked.indexOf('[')
    const end = marked.indexOf(']') - 1
    return { value: marked.replace('[', '').replace(']', ''), start, end }
  }
  const start = marked.indexOf('|')
  return { value: marked.replace('|', ''), start, end: start }
}

const show = (result: { value: string; start: number; end: number }): string =>
  result.start === result.end
    ? `${result.value.slice(0, result.start)}|${result.value.slice(result.start)}`
    : `${result.value.slice(0, result.start)}[${result.value.slice(result.start, result.end)}]${result.value.slice(result.end)}`

const run = (command: RichCommand, marked: string, href?: string): string =>
  show(applyRichCommand(command, at(marked), href === undefined ? {} : { href }))

describe('bold and italic', () => {
  test('wrap the selection and keep it selected', () => {
    // Still selected, so pressing Bold then Italic does what it looks like.
    expect(run('strong', 'say [hello] there')).toBe('say **[hello]** there')
    expect(run('emphasis', 'say [hello] there')).toBe('say *[hello]* there')
  })

  test('with nothing selected, the caret lands between the markers', () => {
    // Not after them. The next keystroke has to be inside the emphasis, or
    // the button did nothing a person can use.
    expect(run('strong', 'say |')).toBe('say **|**')
  })

  test('pressing it again removes the markers', () => {
    expect(run('strong', 'say [**hello**] there')).toBe('say [hello] there')
    expect(run('emphasis', 'say [*hello*] there')).toBe('say [hello] there')
  })

  test('and removes them when only the word inside is selected', () => {
    // The same gesture to the person doing it: they selected the bold word,
    // and whether the stars fell inside the selection is not something they
    // were thinking about.
    expect(run('strong', 'say **[hello]** there')).toBe('say [hello] there')
  })

  test('bold inside italic nests rather than fighting', () => {
    const once = applyRichCommand('emphasis', at('say [hello] there'))
    const twice = applyRichCommand('strong', { value: once.value, start: once.start, end: once.end })

    expect(twice.value).toBe('say ***hello*** there')
    // And the parser agrees it is both, which is the part a naive
    // implementation gets wrong.
    const blocks = parseRichText(twice.value)
    expect(JSON.stringify(blocks)).toContain('strong')
    expect(JSON.stringify(blocks)).toContain('emphasis')
  })
})

describe('links', () => {
  test('wrap the selection and select the href, which is what is missing', () => {
    expect(run('link', 'see [the docs] now', 'https://formancy.ai')).toBe(
      'see [the docs]([https://formancy.ai]) now',
    )
  })

  test('with nothing selected, the caret goes where the label belongs', () => {
    expect(run('link', 'see | now', 'https://formancy.ai')).toBe('see [|](https://formancy.ai) now')
  })

  test('an empty href still produces a well-formed link to fill in', () => {
    expect(run('link', '[here]')).toBe('[here](|)')
  })
})

describe('lists', () => {
  test('prefix every line the selection touches', () => {
    const result = applyRichCommand('bulletList', at('[one\ntwo\nthree]'))
    expect(result.value).toBe('- one\n- two\n- three')
  })

  test('whole lines, even when the selection covers part of one', () => {
    // A marker belongs to a line. Applied to the selection's exact bounds it
    // would produce `wo- rd`.
    const result = applyRichCommand('bulletList', at('on[e\ntw]o'))
    expect(result.value).toBe('- one\n- two')
  })

  test('pressing it again strips the prefixes', () => {
    const result = applyRichCommand('bulletList', at('[- one\n- two]'))
    expect(result.value).toBe('one\ntwo')
  })

  test('numbered lists count from one', () => {
    const result = applyRichCommand('orderedList', at('[one\ntwo]'))
    expect(result.value).toBe('1. one\n2. two')
  })

  test('blank lines are left alone', () => {
    // A blank line ends a list in the grammar. Marking it would join two
    // lists that the writer separated on purpose.
    const result = applyRichCommand('bulletList', at('[one\n\ntwo]'))
    expect(result.value).toBe('- one\n\n- two')
  })

  test('a bullet list is not stripped by the numbered button', () => {
    const result = applyRichCommand('orderedList', at('[- one]'))
    expect(result.value).toBe('1. - one')
  })

  test('what comes out parses as a list', () => {
    const result = applyRichCommand('bulletList', at('[one\ntwo]'))
    const blocks = parseRichText(result.value)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false })
  })
})
