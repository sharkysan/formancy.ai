import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { BUILDER_MESSAGES, createBuilderText } from './messages.js'
import { pseudoLanguage, untranslated } from './pseudo.js'
import { createBuilderSession } from './session.js'

/**
 * The judgement both builders' language guards share.
 *
 * Each case is a way the guard could pass a builder that still has English in
 * it, or fail one that does not.
 */
/** One field called `email`, so that adding a second is refused by the validator. */
const contact: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: { fields: [{ key: 'email', type: 'text' }] },
}

describe('the pseudo-language', () => {
  test('marks every message, plural forms included, so nothing from the catalogue reads as code', () => {
    const text = createBuilderText(pseudoLanguage())

    expect(text('tree.empty')).toBe(`⟦${BUILDER_MESSAGES['tree.empty']}⟧`)
    expect(text('tree.fieldCount', { count: 1 })).toBe('⟦1 field⟧')
    expect(text('tree.fieldCount', { count: 2 })).toBe('⟦2 fields⟧')
  })

  test('marks the validator’s sentences too, so a refusal shown in English is seen', () => {
    // The refusal an author meets most comes from the validator; a walk that met
    // one unmarked could not tell it from a sentence written into a component.
    const text = createBuilderText(pseudoLanguage())
    const refusal = createBuilderSession(contact, { text }).insertField(
      { parent: [], index: 0 },
      { key: 'email', type: 'text' },
    )

    expect(refusal.ok ? '' : untranslated([refusal.message], [])).toEqual([])
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

  test('knows a document’s word with the punctuation a renderer set beside it', () => {
    // Angular renders `<code>{{ id }}</code>: {{ source }}` as one text node,
    // ": Gone"; React as two. Both are the document's word.
    expect(untranslated([': Gone', '— Added as optional.'], ['Gone', 'Added as optional.'])).toEqual([])
    // And only the edges: an English word inside is still found.
    expect(untranslated([': Gone away'], ['Gone'])).toEqual([': Gone away'])
  })

  test('lets punctuation, digits and symbols through, which are nobody’s language', () => {
    expect(untranslated(['↑ ↓', '—', '3', '⟦Page 2⟧, '], [])).toEqual([])
  })
})
