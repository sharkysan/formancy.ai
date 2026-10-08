import { describe, expect, test } from 'vitest'
import { BUILDER_MESSAGES, createBuilderText } from './messages.js'
import { pseudoLanguage, untranslated } from './pseudo.js'

/**
 * The judgement both builders' language guards share.
 *
 * Each case is a way the guard could pass a builder that still has English in
 * it, or fail one that does not.
 */
describe('the pseudo-language', () => {
  test('marks every message, plural forms included, so nothing from the catalogue reads as code', () => {
    const text = createBuilderText(pseudoLanguage())

    expect(text('tree.empty')).toBe(`⟦${BUILDER_MESSAGES['tree.empty']}⟧`)
    expect(text('tree.fieldCount', { count: 1 })).toBe('⟦1 field⟧')
    expect(text('tree.fieldCount', { count: 2 })).toBe('⟦2 fields⟧')
  })
})

describe('what is untranslated', () => {
  test('is nothing when everything shown is marked', () => {
    expect(untranslated(['⟦Cancel⟧', '⟦Add a field⟧'], [])).toEqual([])
  })

  test('is a sentence the code wrote, which is the defect', () => {
    expect(untranslated(['⟦Cancel⟧', 'Nothing to undo.'], [])).toEqual(['Nothing to undo.'])
  })

  test('is not the document’s own words, which are not the builder’s to translate', () => {
    expect(
      untranslated(['Billing address', '⟦Move Billing address⟧'], ['Billing address']),
    ).toEqual([])
  })

  test('sees English beside a marked message in the same text, not only on its own', () => {
    // "⟦Section⟧ with A and B" — a template half-moved to the catalogue would
    // pass a check that only looked at whole strings.
    expect(untranslated(['⟦Row⟧ with First name'], ['First name'])).toEqual(['with First name'])
  })

  test('takes a message carried inside another apart from the inside out', () => {
    expect(untranslated(['⟦⟦Removed intro.⟧ The form is not a wizard any more.⟧'], [])).toEqual([])
    expect(untranslated(['⟦⟦Removed intro.⟧ and⟧ also'], [])).toEqual(['also'])
  })

  test('lets punctuation, digits and symbols through, which are nobody’s language', () => {
    expect(untranslated(['↑ ↓', '—', '3', '⟦Page 2⟧, '], [])).toEqual([])
  })
})
