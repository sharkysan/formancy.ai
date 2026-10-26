import { describe, expect, test } from 'vitest'
import type { FieldDef } from '@formancy/spec'
import { errorSentence } from './error-words.js'
import type { BuiltInErrorCode } from './error-codes.js'
import { createFormText } from './words.js'

/**
 * What a field says for each of its errors (0191).
 *
 * The renderers drew the engine's codes — `required, minLength` under a question somebody
 * is answering, in English under a German form, and in the error summary set into a German
 * sentence. The codes stay the engine's vocabulary and the API's; this is what a person
 * reads instead, from the same catalogue as the renderers' other words, so a host changes
 * or adds a language for errors exactly as it does for the buttons.
 */
const english = createFormText({ locale: 'en' })
const german = createFormText({ locale: 'de' })
const french = createFormText({ locale: 'fr' })

const text: FieldDef = { key: 'name', type: 'text', minLength: 5, maxLength: 40 }

/** Every code the engine reports of its own accord, with a field that could report it. */
const EVERY_CODE: Record<BuiltInErrorCode, FieldDef> = {
  required: text,
  invalid: text,
  check_unavailable: text,
  type: text,
  option: { key: 'c', type: 'select' },
  duplicate: { key: 'r', type: 'ranking' },
  row: { key: 'm', type: 'matrix' },
  min: { key: 'n', type: 'number', min: 1 },
  max: { key: 'n', type: 'number', max: 9 },
  step: { key: 'n', type: 'number', step: 5 },
  minLength: text,
  maxLength: text,
  pattern: { key: 'p', type: 'text', pattern: '[A-Z]{3}' },
  mask: { key: 'p', type: 'text', mask: '999' },
  email: { key: 'e', type: 'text', format: 'email' },
  url: { key: 'u', type: 'text', format: 'url' },
  uuid: { key: 'u', type: 'text', format: 'uuid' },
  shape: { key: 'd', type: 'date' },
  earliest: { key: 'd', type: 'date', earliest: '2027-05-03' },
  latest: { key: 'd', type: 'date', latest: '2027-05-03' },
  minItems: { key: 't', type: 'selectboxes', minItems: 2 },
  maxItems: { key: 't', type: 'selectboxes', maxItems: 2 },
  maxFileSize: { key: 'f', type: 'file', maxFileSize: 2_000_000 },
  accept: { key: 'f', type: 'file', accept: ['.pdf', 'image/*'] },
  box: { key: 's', type: 'signature', box: [100, 50] },
  maxPoints: { key: 's', type: 'signature', maxPoints: 500 },
}

describe('an error is said, not coded', () => {
  // A code with no sentence would be drawn as the code: the defect this exists to end, back
  // for one code in one language without anything noticing.
  test.each(['en', 'de', 'fr'])('every code the engine reports has a sentence in %s, with nothing left unfilled', (locale) => {
    const say = createFormText({ locale })
    for (const [code, def] of Object.entries(EVERY_CODE)) {
      const sentence = errorSentence(say, def, code)
      expect(sentence, `${code} in ${locale}`).not.toBe(code)
      expect(sentence, `${code} in ${locale}`).not.toMatch(/\{[a-z]+\}/i)
    }
  })

  test('in the reader’s language', () => {
    expect(errorSentence(english, text, 'required')).toBe('This question needs an answer.')
    expect(errorSentence(german, text, 'required')).toBe('Diese Frage braucht eine Antwort.')
    expect(errorSentence(french, text, 'required')).toBe('Cette question attend une réponse.')
  })

  // "Too short" says what is wrong and not what would be right; the field knows its bound.
  test('with the field’s own limit in it', () => {
    expect(errorSentence(english, text, 'minLength')).toBe('Enter at least 5 characters.')
    expect(errorSentence(english, { key: 'n', type: 'number', min: 1500 }, 'min')).toBe('Enter 1,500 or more.')
    expect(errorSentence(german, { key: 'n', type: 'number', min: 1500 }, 'min')).toBe('Geben Sie 1.500 oder mehr ein.')
    expect(errorSentence(english, EVERY_CODE.maxFileSize, 'maxFileSize')).toBe('A file can be at most 2 MB.')
    expect(errorSentence(english, EVERY_CODE.accept, 'accept')).toBe('Attach a file of one of these types: .pdf and image/*.')
  })

  test('counted by the language’s rules', () => {
    expect(errorSentence(english, { ...text, minLength: 1 }, 'minLength')).toBe('Enter at least 1 character.')
    expect(errorSentence(english, { key: 't', type: 'selectboxes', minItems: 1 }, 'minItems')).toBe('Choose at least 1.')
  })

  // "Choose at least 2" is wrong under a file field and under a repeater: what there must
  // be more of is files, or rows.
  test('a list says what it is a list of', () => {
    expect(errorSentence(english, { key: 'f', type: 'file', minItems: 2 }, 'minItems')).toBe('Attach at least 2 files.')
    expect(errorSentence(english, { key: 'r', type: 'repeater', maxItems: 3 }, 'maxItems')).toBe('Add at most 3 rows.')
  })

  // A required tick box is a consent gate: "needs an answer" is wrong when unticked IS an
  // answer, and only a tick satisfies it.
  test('a required tick box asks for the tick', () => {
    expect(errorSentence(english, { key: 'ok', type: 'checkbox' }, 'required')).toBe('Tick this box to continue.')
  })

  // "Needs an answer" under a list of rows, or under a file picker, asks for something the
  // person cannot type: what is missing is a row, or a file.
  test('a required repeater asks for a row, and a required file field for a file', () => {
    expect(errorSentence(english, { key: 'r', type: 'repeater' }, 'required')).toBe('Add at least one row.')
    expect(errorSentence(german, { key: 'f', type: 'file' }, 'required')).toBe('Hängen Sie eine Datei an.')
  })

  // A date bound is shown as a date in the reader's language, not in the stored form.
  test('a date is written as the reader writes one', () => {
    expect(errorSentence(english, EVERY_CODE.earliest, 'earliest')).toBe('Enter 3 May 2027 or later.')
    expect(errorSentence(german, EVERY_CODE.earliest, 'earliest')).toBe('Frühestens: 3. Mai 2027.')
  })

  // A validate rule's own code and its message are the author's words, and the catalogue
  // has nothing better to say than what the author wrote.
  test('a code the catalogue does not know is said as itself', () => {
    expect(errorSentence(english, text, 'tooEarly')).toBe('tooEarly')
    expect(errorSentence(english, text, 'Pick a date after your arrival.')).toBe('Pick a date after your arrival.')
  })

  test('a host words an error as it words a button', () => {
    const host = createFormText({ locale: 'en', words: { en: { 'error.required': 'Please answer this.' } } })
    expect(errorSentence(host, text, 'required')).toBe('Please answer this.')
  })
})
