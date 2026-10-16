import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import schema from '../formancy.schema.json' with { type: 'json' }
import {
  acceptRemoteAnswer,
  acceptRemoteOptions,
  capRemoteAnswer,
  capRemoteOptions,
} from './options-source.js'

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

/**
 * A source that pages: it reads one row past what it hands over to know there is more,
 * and never counts, because a count reads every matching row on every keystroke — the
 * scan paging exists to avoid ([0177](../../../docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).
 */
describe('acceptRemoteAnswer', () => {
  const zurich = { value: 'ZH', label: 'Zürich' }
  const bern = { value: 'BE', label: 'Bern' }

  test('reads a list of rows as every row there is: nothing more, nothing withheld', () => {
    // A source that has always returned everything must mean what it meant before a page
    // could be answered. Read any other way, its true total would stop being said.
    expect(acceptRemoteAnswer([zurich, bern])).toEqual({
      options: [zurich, bern],
      more: false,
      withheld: 0,
    })
    expect(acceptRemoteAnswer([])).toEqual({ options: [], more: false, withheld: 0 })
    // And refused exactly where the rows alone are refused, one unusable row included.
    expect(acceptRemoteAnswer([zurich, { value: 'BE' }])).toBeUndefined()
    expect(acceptRemoteAnswer([zurich, zurich])).toBeUndefined()
  })

  test('reads a page that says its list goes on, and one that withholds rows it cannot hand over', () => {
    // The two things a paging source knows without counting. A page read as rows alone
    // would show a cut list as complete — the silently partial list 0077 refuses.
    expect(acceptRemoteAnswer({ options: [zurich], more: true })).toEqual({
      options: [zurich],
      more: true,
      withheld: 0,
    })
    expect(acceptRemoteAnswer({ options: [zurich], more: false, withheld: 2 })).toEqual({
      options: [zurich],
      more: false,
      withheld: 2,
    })
    // `undefined` is how a plain-JavaScript host writes "none" as often as leaving it out.
    expect(acceptRemoteAnswer({ options: [zurich], more: false, withheld: undefined })).toEqual({
      options: [zurich],
      more: false,
      withheld: 0,
    })
  })

  test('keeps only value and label from a page’s rows, as from a list’s', () => {
    // The rows are the same unchecked input whichever envelope they arrive in.
    expect(
      acceptRemoteAnswer({ options: [{ ...zurich, disabled: true }], more: false })?.options,
    ).toEqual([zurich])
  })

  test('refuses the WHOLE answer when a page does not say plainly whether it goes on', () => {
    // A page that does not say is a guess, and the guess that shows nothing is "complete".
    // `'true'` and `1` are what a host serialising through a query string or a database
    // driver hands over, and neither is a yes anybody checked.
    expect(acceptRemoteAnswer({ options: [zurich] })).toBeUndefined()
    for (const more of ['true', 1, 0, null, undefined]) {
      expect(acceptRemoteAnswer({ options: [zurich], more }), String(more)).toBeUndefined()
    }
  })

  test('refuses the whole answer when what it withholds is not a count', () => {
    // A count that is not a whole number of rows cannot be said honestly, and one past
    // the safe integers cannot be said exactly.
    for (const withheld of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null, 2 ** 53]) {
      expect(
        acceptRemoteAnswer({ options: [zurich], more: false, withheld }),
        String(withheld),
      ).toBeUndefined()
    }
  })

  test('refuses the whole answer for a key it does not know, a misspelling among them', () => {
    // `moer: true` beside `more: false` is a host that meant "there are more", and a
    // `total` nobody reads is a count the person is never told: either, read as nothing,
    // shows a cut list as complete. Refused, the field says its source failed instead.
    expect(acceptRemoteAnswer({ options: [zurich], more: false, moer: true })).toBeUndefined()
    expect(acceptRemoteAnswer({ options: [zurich], more: false, total: 120 })).toBeUndefined()
  })

  test('refuses a page whose rows would be refused as a list', () => {
    // One rule for the rows, whichever shape carries them: a duplicate is still two DOM
    // elements wanting one id.
    expect(acceptRemoteAnswer({ options: [zurich, zurich], more: false })).toBeUndefined()
    expect(acceptRemoteAnswer({ options: [{ value: 'BE' }], more: true })).toBeUndefined()
    expect(acceptRemoteAnswer({ options: 'rows', more: false })).toBeUndefined()
    expect(acceptRemoteAnswer({ more: true })).toBeUndefined()
  })

  test('refuses anything that is neither a list nor a page', () => {
    // A host written in plain JavaScript can resolve with anything.
    for (const nonsense of [undefined, null, 'rows', 42, true]) {
      expect(acceptRemoteAnswer(nonsense), String(nonsense)).toBeUndefined()
    }
  })
})

describe('capRemoteAnswer', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    value: `v${String(index)}`,
    label: `Row ${String(index)}`,
  }))
  const page = (more: boolean, withheld = 0, options = rows) => ({ options, more, withheld })

  test('a list of every row, cut by the control, is capped with its true total', () => {
    // What 0.5.0 said for a source that returned everything, and still says.
    expect(capRemoteAnswer(page(false), 3)).toEqual({
      shown: rows.slice(0, 3),
      completeness: { kind: 'capped', shown: 3, total: 10 },
    })
  })

  test('a page that goes on says how many are shown and never a total', () => {
    // A total would be the page's own length — the `limit + 1` a paging source reads —
    // claimed as the number of rows that match.
    expect(capRemoteAnswer(page(true), 10)).toEqual({
      shown: rows,
      completeness: { kind: 'more', shown: 10 },
    })
    // Cut by the control as well, it is still "more": nothing past the page was counted.
    expect(capRemoteAnswer(page(true), 4).completeness).toEqual({ kind: 'more', shown: 4 })
  })

  test('and says it goes on even when it also withholds rows, so a lower bound is never said', () => {
    // While more rows match, the count withheld covers only this page: "2 more cannot be
    // chosen" would be a number the source does not know.
    expect(capRemoteAnswer(page(true, 2), 10).completeness).toEqual({ kind: 'more', shown: 10 })
  })

  test('a page that withholds rows, and leaves out nothing else, says how many', () => {
    // A source never filters silently: rows it matched and cannot hand over are counted.
    expect(capRemoteAnswer(page(false, 2), 10)).toEqual({
      shown: rows,
      completeness: { kind: 'withheld', withheld: 2 },
    })
  })

  test('a page the control cuts is capped by what the page handed over', () => {
    // A source that ignores `limit` sends more than the control shows; the total is what
    // arrived, which is every row that matched, since the page did not say there were more.
    expect(capRemoteAnswer(page(false), 4).completeness).toEqual({ kind: 'capped', shown: 4, total: 10 })
  })

  test('an answer that leaves nothing out is complete', () => {
    // Success announces nothing: a control that said "complete" would talk over the list.
    expect(capRemoteAnswer(page(false), 10)).toEqual({ shown: rows, completeness: { kind: 'complete' } })
  })

  test('and is one value however often it is answered, so storing it again changes nothing', () => {
    // React's state and Angular's signals compare by identity: a fresh "complete" per
    // answer would render every control again on every search that found everything.
    expect(capRemoteAnswer(page(false), 10).completeness).toBe(
      capRemoteAnswer(page(false, 0, rows.slice(0, 2)), 10).completeness,
    )
  })

  test('a limit that is not a limit shows everything and still says what the source left out', () => {
    // A host passing 0 or NaN must not empty the list, nor lose the source's own "more".
    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(capRemoteAnswer(page(false), limit), String(limit)).toEqual({
        shown: rows,
        completeness: { kind: 'complete' },
      })
      expect(capRemoteAnswer(page(true), limit).completeness, String(limit)).toEqual({
        kind: 'more',
        shown: 10,
      })
    }
  })

  test('a list is never silently partial', () => {
    // The property the rest exists for, over every answer and limit: no more is shown than
    // fits, and "complete" is said only when nothing was cut by the control, nothing more
    // matches, and nothing was withheld.
    fc.assert(
      fc.property(
        fc.nat(30),
        fc.boolean(),
        fc.nat(5),
        fc.oneof(
          fc.integer({ min: 1, max: 40 }),
          fc.constantFrom(0, -1, Number.NaN, Number.POSITIVE_INFINITY),
        ),
        (length, more, withheld, limit) => {
          const options = Array.from({ length }, (_, index) => ({
            value: `v${String(index)}`,
            label: `Row ${String(index)}`,
          }))
          const { shown, completeness } = capRemoteAnswer({ options, more, withheld }, limit)

          const bounded = Number.isFinite(limit) && limit >= 1
          expect(shown.length).toBe(bounded ? Math.min(length, limit) : length)
          const nothingLeftOut = shown.length === length && !more && withheld === 0
          expect(completeness.kind === 'complete').toBe(nothingLeftOut)
          if (completeness.kind === 'capped') expect(completeness.total).toBe(length)
          if (more) expect(completeness).toEqual({ kind: 'more', shown: shown.length })
        },
      ),
    )
  })
})

describe('the length bound is the format’s own', () => {
  test('matches what the schema declares for an authored option value', () => {
    // The derivation, moved to where it is free. Reading the schema at RUNTIME for this
    // one integer made the bundler inline all 40.6 kB of it: `@formancy/spec` went from
    // 8.7 kB brotli to 16.4 — the package nearly doubled for one number.
    //
    // So the constant is written in the module and checked here. If the schema ever
    // allows a longer option value, this fails and names the new number.
    const declared = (schema as unknown as {
      $defs: { fieldOption: { properties: { value: { maxLength: number } } } }
    }).$defs.fieldOption.properties.value.maxLength

    // The longest value the module accepts, probed rather than exported: a constant
    // exported only for its test is a constant the test cannot be wrong about.
    const longest = 'x'.repeat(declared)
    expect(acceptRemoteOptions([{ value: longest, label: 'Longest' }])).toHaveLength(1)
    expect(acceptRemoteOptions([{ value: `${longest}x`, label: 'Too long' }])).toBeUndefined()
  })
})
