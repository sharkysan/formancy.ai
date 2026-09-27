import { describe, expect, test } from 'vitest'
import { foldForMatch, narrowOptionsByLabel } from './typeahead.js'

/**
 * Narrowing a list of options by what somebody typed.
 *
 * It lives in `@formancy/spec` for the same reason `applyRichCommand` does: two
 * renderers each folding text their own way would agree on the easy queries and
 * disagree on the interesting ones — `Zürich` under `zu` in React and not in
 * Angular — and nothing would fail, because each renderer's own tests would be
 * green against its own folding. One function, one answer, both renderers.
 *
 * Three rules, each with a reason a reader can check:
 *
 * **The LABEL only.** The value is not on the screen. A filter that also matched
 * it would behave on data the person cannot see: `CH` would keep Switzerland in
 * the list for a reason nothing on the screen explains.
 *
 * **The document's order, never the match quality.** Re-ranking moves the row
 * somebody is already aiming at while they type, which is how a person ends up
 * choosing the option that arrived under the pointer rather than the one they
 * wanted.
 *
 * **Folded on both sides.** Somebody typing `francais` on a keyboard without a
 * cedilla is looking for `Français`, and somebody who pasted `Français` is
 * looking for the same row.
 */
describe('foldForMatch', () => {
  test('folds case, because nobody types the capital letters of a list', () => {
    // The failure this prevents: a list that goes empty the moment somebody
    // types a lower-case letter.
    expect(foldForMatch('Switzerland')).toBe(foldForMatch('switzerland'))
  })

  test('folds the diacritics off, in both directions', () => {
    // The failure this prevents: `Zürich` unreachable from a keyboard with no
    // umlaut, which is most keyboards outside the German-speaking countries.
    expect(foldForMatch('Zürich')).toBe('zurich')
    expect(foldForMatch('Français')).toBe('francais')
    expect(foldForMatch('Ítalia')).toBe('italia')
  })

  test('folds a composed and a decomposed character to the same text', () => {
    // The failure this prevents: two labels that LOOK identical and match
    // differently, because one arrived as U+00FC and the other as u + U+0308.
    // A pasted label is regularly the second one.
    // Written as escapes, because the two spellings are indistinguishable on the
    // page -- which is the whole problem.
    expect(foldForMatch('\u00fcber')).toBe(foldForMatch('u\u0308ber'))
  })

  test('is not a collator: ß and ss stay different', () => {
    // Recorded as a test rather than as a sentence in a comment, because it is
    // a real limit somebody will hit. Folding is NFD plus dropping the combining
    // marks; a character that decomposes to nothing is left alone. Making
    // `strasse` find `Straße` needs case FOLDING rather than lowercasing, and a
    // locale-aware collator for the rest, which is a dependency this has not
    // spent.
    expect(foldForMatch('Stra\u00dfe')).not.toBe(foldForMatch('strasse'))
  })

  test('is not a collator either: the Turkish dotless \u0131 folds the Latin way', () => {
    // The second half of the same limit, and the record claimed both were recorded as
    // tests when only the one above was. Measured rather than reasoned about, because
    // the two Turkish capitals behave differently and only one of them is a problem.
    //
    // `toLowerCase()` is locale-independent, so capital `I` becomes `i` and never the
    // dotless `\u0131` Turkish asks for. A label spelled `I\u011fd\u0131r` folds to
    // `igd\u0131r`, so somebody typing it on a Turkish keyboard as `\u0131\u011fd\u0131r` folds to
    // `\u0131gd\u0131r` and finds NOTHING. That is the limit, as the failing pair.
    expect(foldForMatch('I\u011fd\u0131r')).toBe('igd\u0131r')
    expect(narrowOptionsByLabel([{ label: 'I\u011fd\u0131r' }], '\u0131\u011fd\u0131r')).toEqual([])

    // And the bound on how bad it is, so this is not read as "Turkish does not work":
    // `\u0130` DECOMPOSES to `I` plus a combining dot above, the dot is a mark and is
    // dropped, and what is left lowercases to `i` -- which is what Turkish asks for
    // there. The dotted capital is fine; only the dotless one is not.
    expect(narrowOptionsByLabel([{ label: '\u0130zmir' }], 'izmir')).toEqual([
      { label: '\u0130zmir' },
    ])
  })
})

const OPTIONS = [
  { value: 'CH', label: 'Switzerland' },
  { value: 'FR', label: 'Français' },
  { value: 'AT', label: 'Österreich' },
  { value: 'DE', label: 'Deutschland' },
]

const labelsOf = (options: readonly { label: string }[]): string[] =>
  options.map((option) => option.label)

describe('narrowOptionsByLabel', () => {
  test('an empty query narrows nothing', () => {
    // The failure this prevents: an empty list before the first keystroke, which
    // is a control that hides its own options until you guess one.
    expect(labelsOf(narrowOptionsByLabel(OPTIONS, ''))).toEqual(labelsOf(OPTIONS))
  })

  test('a query of nothing but spaces narrows nothing either', () => {
    // A fumbled space is not a filter. Without the trim the list empties on a
    // keystroke nobody meant to type, and the way back is not obvious.
    expect(labelsOf(narrowOptionsByLabel(OPTIONS, '   '))).toEqual(labelsOf(OPTIONS))
  })

  test('matches anywhere in the label, not only at the start', () => {
    // The failure this prevents: `land` finding nothing, while both Switzerland
    // and Deutschland are on the screen. A prefix filter reads as a broken one.
    expect(labelsOf(narrowOptionsByLabel(OPTIONS, 'land'))).toEqual([
      'Switzerland',
      'Deutschland',
    ])
  })

  test('matches with the accents left off', () => {
    expect(labelsOf(narrowOptionsByLabel(OPTIONS, 'osterreich'))).toEqual(['Österreich'])
    expect(labelsOf(narrowOptionsByLabel(OPTIONS, 'francais'))).toEqual(['Français'])
  })

  test('reads the label and never the value', () => {
    // A value appears nowhere on the screen. Matching it would keep a row in the
    // list for a reason the person cannot see — and would then also HIDE rows
    // for the same invisible reason.
    //
    // The first version of this asserted that `CH` matched nothing, and the code
    // was right: `Österreich` and `Deutschland` both contain "ch", so the query
    // matched two LABELS and the case proved nothing. A value token that cannot
    // occur in the labels is what actually separates the two.
    const coded = [{ value: 'q7', label: 'Switzerland' }]
    expect(labelsOf(narrowOptionsByLabel(coded, 'q7'))).toEqual([])
    expect(labelsOf(narrowOptionsByLabel(coded, 'switz'))).toEqual(['Switzerland'])
  })

  test('keeps the document order rather than ranking by where the match is', () => {
    // The failure this prevents, and the reason there is no scoring: `e` matches
    // Switzerland at index 8 and Österreich at index 2. Ranked, Österreich jumps
    // to the top and the row under the pointer changes on a keystroke. In order,
    // nothing moves that the person was not already moving past.
    expect(labelsOf(narrowOptionsByLabel(OPTIONS, 'e'))).toEqual([
      'Switzerland',
      'Österreich',
      'Deutschland',
    ])
  })

  test('returns the options themselves, so the caller keeps its own value', () => {
    // The filter is a view of the list, not a copy of the parts of it this
    // function happens to know about. Anything the caller hung on an option --
    // an id, a source -- survives the narrowing.
    const [only] = narrowOptionsByLabel(OPTIONS, 'francais')
    expect(only).toBe(OPTIONS[1])
  })
})
