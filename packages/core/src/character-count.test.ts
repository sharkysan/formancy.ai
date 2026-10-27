import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { countSentence } from './count-words.js'
import { createFormEngine } from './engine.js'
import { createFormText } from './words.js'

/**
 * A field with a `maxLength` says how much is left as somebody types, rather than only after
 * the answer is refused (0203) — counted exactly as the engine's check counts.
 */
const note: FieldDef = { key: 'note', type: 'textarea', label: 'Note', maxLength: 10 }
const form = (fields: FieldDef[]): FormSchema => ({ specVersion: '5', id: 'f', title: 'F', model: { fields } })
const english = createFormText({ locale: 'en' })

describe('a character count', () => {
  test('says the limit while the box is empty, what is left as it fills, and how many too many past it', () => {
    expect(countSentence(english, note, undefined)).toBe('You can enter up to 10 characters.')
    expect(countSentence(english, note, 'Hello')).toBe('You have 5 characters remaining.')
    expect(countSentence(english, note, 'Hello worl')).toBe('You have 0 characters remaining.')
    expect(countSentence(english, note, 'Hello world')).toBe('You have 1 character too many.')
  })

  test('is said in the form’s language, with its plurals', () => {
    const german = createFormText({ locale: 'de' })
    expect(countSentence(german, note, 'Hallo')).toBe('Sie haben noch 5 Zeichen.')
    expect(countSentence(createFormText({ locale: 'fr' }), note, 'Bonjour à')).toBe('Il vous reste 1 caractère.')
  })

  // Only text a person types into, and only with a limit. Rich text's length counts its markup,
  // so a count there would disagree with what the person sees.
  test('is said only for a text or a long text field with a limit', () => {
    expect(countSentence(english, { key: 'n', type: 'text', label: 'N' }, 'x')).toBeUndefined()
    expect(countSentence(english, { key: 'r', type: 'richtext', label: 'R', maxLength: 10 }, 'x')).toBeUndefined()
    expect(countSentence(english, { ...note, type: 'text' }, 'abc')).toBe('You have 7 characters remaining.')
  })

  // Two counts of one answer must agree, or the count says 0 left of an answer the engine
  // refuses. An emoji is two of what both count.
  test('counts as the engine’s maxLength check counts', () => {
    const emoji = '😀😀😀😀😀😀'
    const engine = createFormEngine({ schema: form([note]), initialValue: { note: emoji } })
    engine.submit()
    expect(engine.getFieldSnapshot(['note']).errors).toEqual(['maxLength'])
    expect(countSentence(english, note, emoji)).toBe('You have 2 characters too many.')
  })
})

describe('the count, as the control is described', () => {
  // Read with the control when it is reached, after its description and before its error.
  test('is named in aria-describedby where a count is shown, and nowhere else', () => {
    const engine = createFormEngine({
      schema: form([
        { ...note, description: 'Anything we should know.' },
        { key: 'plain', type: 'textarea', label: 'Plain' },
      ]),
    })
    const { ids, props } = engine.getFieldSnapshot(['note'])
    expect(props.control['aria-describedby']).toBe(`${ids.description} ${ids.count}`)
    expect(props.count.id).toBe(ids.count)
    expect(engine.getFieldSnapshot(['plain']).props.control['aria-describedby']).toBeUndefined()
  })
})
