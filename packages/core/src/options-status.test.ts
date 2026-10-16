import { describe, expect, test } from 'vitest'
import { FORM_WORDS, createFormText, optionsStatus } from './words.js'
import type { FormText, FormWordId, FormWordValues, OptionsStatusState } from './words.js'

/**
 * What a sourced control says, decided once for both renderers
 * ([0177](../../../docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).
 *
 * React and Angular each wrote this order by hand, and on 0.5.0 both said "keep typing to
 * narrow" under a plain select nobody can type into, under a typeahead whose list was
 * closed, and under a field a rule had disabled. Read through a FormText that records the
 * id and its values, so each case holds the decision and not the wording.
 */
const recorded: FormText = Object.assign(
  (id: FormWordId, values?: FormWordValues): string =>
    values === undefined ? id : `${id} ${JSON.stringify(values)}`,
  { locale: 'en-GB' },
)

const settled: OptionsStatusState = {
  control: 'typeahead',
  open: true,
  disabled: false,
  failed: false,
  busy: false,
  needs: 0,
  query: '',
  completeness: { kind: 'complete' },
}
const status = (change: Partial<OptionsStatusState>): string =>
  optionsStatus(recorded, { ...settled, ...change })

const more = { kind: 'more', shown: 6 } as const
const capped = { kind: 'capped', shown: 50, total: 120 } as const
const withheld = { kind: 'withheld', withheld: 2 } as const

describe('what a sourced control says', () => {
  test('nothing while it is disabled, however its last search ended', () => {
    // A form that opens a saved record read-only said "keep typing to narrow" under every
    // long lookup: words about acting, on a field nobody can act on.
    for (const control of ['typeahead', 'select'] as const) {
      expect(status({ control, disabled: true, failed: true })).toBe('')
      expect(status({ control, disabled: true, completeness: capped })).toBe('')
      expect(status({ control, disabled: true, needs: 3 })).toBe('')
      expect(status({ control, disabled: true, busy: true })).toBe('')
    }
  })

  test('a failure first, in the words of the control it is under', () => {
    // A plain select said "Type to try again." — and nobody can type into a select. A
    // failure goes before everything, since nothing else it could say is true of a list
    // that did not arrive.
    const everything = { failed: true, busy: true, needs: 3, query: 'a', completeness: more }
    expect(status({ ...everything, control: 'typeahead' })).toBe('options.failed')
    expect(status({ ...everything, control: 'select' })).toBe('options.failedListed')
  })

  test('below the source’s minimum, how many to type, or for a select that it cannot search', () => {
    // The typeahead says how many characters, trimmed as the search is; a select has
    // nowhere to type, so "type at least 3 characters" is advice it cannot take.
    expect(status({ needs: 3, query: ' ab ' })).toBe('options.tooShort {"count":3}')
    expect(status({ control: 'select', needs: 2 })).toBe('options.searchOnly')
    // And before what the last answer left out: the rows on screen are not that answer's.
    expect(status({ needs: 3, query: 'ab', completeness: more })).toBe('options.tooShort {"count":3}')
  })

  test('a closed typeahead says only what typing fixes', () => {
    // A typeahead searches on mount, and its status stood under the field after a choice
    // and while its list was closed: "there are more" about a list nobody is looking at.
    const closed = { open: false }
    expect(status({ ...closed, failed: true })).toBe('options.failed')
    expect(status({ ...closed, needs: 2 })).toBe('options.tooShort {"count":2}')
    expect(status({ ...closed, completeness: more })).toBe('')
    expect(status({ ...closed, completeness: capped })).toBe('')
    expect(status({ ...closed, busy: true })).toBe('')
  })

  test('and a plain select says what its list leaves out while it is enabled', () => {
    // A native select has no "list opened" a renderer could listen for, so its sentence
    // stands while it can be used; `open` is the typeahead's alone.
    expect(status({ control: 'select', open: false, completeness: capped })).toBe(
      'options.cappedListed {"count":50,"total":120}',
    )
  })

  test('what the list leaves out, in the words of the control, and "more" with no number that matches', () => {
    // A select told "keep typing to narrow" has nowhere to type; a page that goes on has
    // no total, so none is said.
    expect(status({ completeness: more })).toBe('options.more {"count":6}')
    expect(status({ control: 'select', completeness: more })).toBe('options.moreListed {"count":6}')
    expect(status({ completeness: capped })).toBe('options.capped {"shown":50,"total":120}')
    expect(status({ control: 'select', completeness: capped })).toBe(
      'options.cappedListed {"count":50,"total":120}',
    )
    expect(status({ completeness: withheld })).toBe('options.withheld {"count":2}')
    expect(status({ control: 'select', completeness: withheld })).toBe('options.withheld {"count":2}')
  })

  test('a search in flight keeps a sentence that stands, and says Searching… only when none does', () => {
    // The repetition measured on 0.5.0: over a database nearly every short query has more
    // rows, and a region going "Searching…", then the same sentence again, re-announced it
    // after every debounced search. Held, the region does not change, so nothing is said.
    expect(status({ busy: true, completeness: more })).toBe('options.more {"count":6}')
    expect(status({ busy: true, completeness: withheld })).toBe('options.withheld {"count":2}')
    expect(status({ busy: true })).toBe('options.searching')
    expect(status({ control: 'select', busy: true })).toBe('options.searching')
  })

  test('a settled answer that leaves nothing out says nothing', () => {
    // Success announces nothing: the listbox and the active option are the feedback, and a
    // region that spoke on every answer would talk over them.
    expect(status({})).toBe('')
    expect(status({ control: 'select' })).toBe('')
  })

  test('and every sentence it chooses is filled, in every shipped language', () => {
    // The values are named here and the placeholders in the catalogue: a `{shown}` handed
    // to a message that says `{count}` would put the brace on screen.
    const states: Array<Partial<OptionsStatusState>> = [
      { failed: true },
      { control: 'select', failed: true },
      { needs: 3 },
      { control: 'select', needs: 3 },
      { busy: true },
      ...(['typeahead', 'select'] as const).flatMap((control) =>
        [more, capped, withheld, { kind: 'more', shown: 1 } as const].map((completeness) => ({
          control,
          completeness,
        })),
      ),
    ]
    for (const locale of ['', 'de', 'fr']) {
      const text = createFormText({ locale })
      for (const state of states) {
        const said = optionsStatus(text, { ...settled, ...state })
        expect(said, `${locale} ${JSON.stringify(state)}`).not.toBe('')
        expect(said, `${locale} ${JSON.stringify(state)}`).not.toMatch(/[{}]/)
      }
    }
  })

  test('and a page of none that goes on says none, in a language that counts 0 as one', () => {
    // A page may hand over no rows and say there are more — every row of it withheld, say.
    // French counts 0 with 1, so a `one` form written for 1 ("the first") told a French
    // reader one row was shown over an empty list. The number is said instead.
    for (const locale of ['', 'de', 'fr']) {
      const text = createFormText({ locale })
      for (const control of ['typeahead', 'select'] as const) {
        const said = optionsStatus(text, { ...settled, control, completeness: { kind: 'more', shown: 0 } })
        expect(said, `${locale} ${control}`).toMatch(/\b0\b/)
      }
    }
  })

  test('and each new sentence is the catalogue’s, not the typeahead’s said again', () => {
    // A select whose words were the typeahead's would tell its reader to type.
    const english = createFormText({ locale: '' })
    expect(optionsStatus(english, { ...settled, control: 'select', completeness: capped })).toBe(
      'Showing the first 50 of 120.',
    )
    expect(optionsStatus(english, { ...settled, control: 'select', completeness: capped })).not.toBe(
      optionsStatus(english, { ...settled, completeness: capped }),
    )
    expect(FORM_WORDS['options.failedListed']).not.toMatch(/type/i)
  })
})
