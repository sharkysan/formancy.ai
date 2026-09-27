import { describe, expect, test } from 'vitest'
import { acceptRemoteOptions, capRemoteOptions } from './options-source.js'

/**
 * A list that arrives at runtime is unchecked input.
 *
 * A form document is validated before it is published. A list from a deployment's
 * own source is validated by nothing, and it comes from a system nobody in this
 * repository has seen — so it is checked in the one place both renderers read.
 */
describe('acceptRemoteOptions', () => {
  test('takes a list of value and label pairs', () => {
    expect(acceptRemoteOptions([{ value: 'ZH', label: 'Zürich' }])).toEqual([
      { value: 'ZH', label: 'Zürich' },
    ])
  })

  test('keeps only value and label, so nothing else a source sends reaches a renderer', () => {
    // A source that returns its whole row would otherwise hand the control an object
    // with a `disabled`, an `href` or a `__proto__`, and some renderer would eventually
    // spread it into markup.
    expect(
      acceptRemoteOptions([{ value: 'ZH', label: 'Zürich', extra: 'ignored', disabled: true }]),
    ).toEqual([{ value: 'ZH', label: 'Zürich' }])
  })

  test('refuses the WHOLE list when one row is unusable, rather than dropping it', () => {
    // A partial list silently lacks the row somebody came for, and they cannot tell
    // "your source does not have it" from "we dropped it". The scanner refuses a
    // non-string from a plain-JavaScript host the same way.
    expect(acceptRemoteOptions([{ value: 'ZH', label: 'Zürich' }, { value: 'BE' }])).toBeUndefined()
    expect(
      acceptRemoteOptions([{ value: 'ZH', label: 'Zürich' }, { label: 'Bern' }]),
    ).toBeUndefined()
  })

  test('refuses a label that is a message reference rather than showing it raw', () => {
    // `presentationErrors` checks every `{$t}` in a document against the default
    // catalogue by walking the document, and can never see a row that arrives at
    // runtime. An unchecked reference resolves to undefined and both renderers fall
    // back to the raw value, so a missing translation would show an opaque identifier.
    expect(acceptRemoteOptions([{ value: 'ZH', label: { $t: 'canton.zh' } }])).toBeUndefined()
  })

  test('refuses a duplicate value, which is a runtime error and not a cosmetic one', () => {
    // Two rows sharing a value are two DOM elements wanting one id — and in Angular a
    // duplicate `track` key throws.
    expect(
      acceptRemoteOptions([
        { value: 'ZH', label: 'Zürich' },
        { value: 'ZH', label: 'Zurich' },
      ]),
    ).toBeUndefined()
  })

  test('holds a remote value to the same length the format holds an authored one', () => {
    // Derived from the schema rather than retyped, so a change there cannot leave this
    // behind. A value longer than the format allows could be stored by a source and
    // then refused by the validator on the way back in.
    const longest = 'x'.repeat(200)
    expect(acceptRemoteOptions([{ value: longest, label: 'Long' }])).toHaveLength(1)
    expect(acceptRemoteOptions([{ value: `${longest}x`, label: 'Too long' }])).toBeUndefined()
  })

  test('refuses an empty value, which is the "nothing chosen" answer', () => {
    // A select's empty option means un-answered. A source offering one would make
    // "chose nothing" indistinguishable from "chose the row that means nothing".
    expect(acceptRemoteOptions([{ value: '', label: 'None' }])).toBeUndefined()
  })

  test('refuses anything that is not a list of objects at all', () => {
    // A host written in plain JavaScript can resolve with anything.
    for (const nonsense of [undefined, null, 'rows', 42, { value: 'ZH' }, [null], ['ZH']]) {
      expect(acceptRemoteOptions(nonsense), JSON.stringify(nonsense) ?? 'undefined').toBeUndefined()
    }
  })

  test('an empty list is a legal answer, and not the same as a refusal', () => {
    // "My source has nothing matching that" is information. Conflating it with "your
    // source is broken" would tell somebody to retype a query that was fine.
    expect(acceptRemoteOptions([])).toEqual([])
  })
})

describe('capRemoteOptions', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    value: `v${String(index)}`,
    label: `Row ${String(index)}`,
  }))

  test('shows the first N and says there were more', () => {
    // Saying so is what keeps the narrowing honest: a list silently cut at fifty looks
    // like a source that does not have the fifty-first row.
    expect(capRemoteOptions(rows, 3)).toEqual({
      shown: rows.slice(0, 3),
      total: 10,
      capped: true,
    })
  })

  test('says nothing was cut when nothing was', () => {
    expect(capRemoteOptions(rows, 10).capped).toBe(false)
    expect(capRemoteOptions(rows, 99).shown).toHaveLength(10)
  })

  test('a limit that is not a limit shows everything rather than nothing', () => {
    // The failure this prevents: a host passing 0 or NaN and the control showing an
    // empty list over a source that answered perfectly well.
    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(capRemoteOptions(rows, limit).shown, String(limit)).toHaveLength(10)
    }
  })
})
