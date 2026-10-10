import { afterEach, describe, expect, test, vi } from 'vitest'
import { FORM_WORDS, createFormText } from './words.js'
import type { FormWordId, Message } from './words.js'
import { FORM_WORDS_DE } from './words-de.js'
import { FORM_WORDS_FR } from './words-fr.js'

/**
 * The renderers' own words — Next, Back, Submit, a row's buttons, every live region —
 * in the language the reader chose for the form.
 *
 * They were English literals in each binding, so a form in German asked its questions in
 * German around English buttons, and React, Angular and Material each wrote theirs
 * separately. One catalogue, read in the engine's locale, is what both renderers draw now
 * ([0171](../../../docs/decisions/0171-the-renderers-words-are-the-forms-language.md)).
 */
const english = (id: FormWordId): string => FORM_WORDS[id] as string

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a form word', () => {
  test('is English when the engine has no locale', () => {
    // An engine over a document with no `i18n` section reports the empty locale.
    const text = createFormText({ locale: '' })

    expect(text('form.next')).toBe('Next')
    expect(text.locale).toBe('en-GB')
  })

  test('is in the engine’s locale, which chooses the shipped language', () => {
    // The defect: the reader chose German for the form and was handed English buttons.
    expect(createFormText({ locale: 'de' })('form.next')).toBe(FORM_WORDS_DE['form.next'])
    expect(createFormText({ locale: 'fr' })('form.next')).toBe(FORM_WORDS_FR['form.next'])
    expect(FORM_WORDS_DE['form.next']).not.toBe(english('form.next'))
  })

  test('and a regional locale is read in its language', () => {
    // A document whose catalogue is keyed `de-CH` would otherwise get English buttons.
    expect(createFormText({ locale: 'de-CH' })('form.submit')).toBe(FORM_WORDS_DE['form.submit'])
  })

  test('is never the browser’s language, nor the machine’s', () => {
    // The form's language is what the reader chose, not what their browser is set to:
    // a German speaker filling an English form on a French laptop reads English.
    vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR'] })

    expect(createFormText({ locale: '' })('form.back')).toBe(english('form.back'))
    expect(createFormText({ locale: 'de' })('form.back')).toBe(FORM_WORDS_DE['form.back'])
  })

  test('a host adds a language a message at a time, and the rest is English', () => {
    // A host translating into a language not shipped here does it incrementally; a gap
    // shows English, never an id and never an empty button.
    const text = createFormText({ locale: 'it', words: { it: { 'form.next': 'Avanti' } } })

    expect(text('form.next')).toBe('Avanti')
    expect(text('form.back')).toBe(english('form.back'))
    expect(text.locale).toBe('it')
  })

  test('a host overrides one word of a shipped language and keeps the others', () => {
    const text = createFormText({ locale: 'de', words: { de: { 'form.submit': 'Senden' } } })

    expect(text('form.submit')).toBe('Senden')
    expect(text('form.next')).toBe(FORM_WORDS_DE['form.next'])
  })

  test('a host’s word for the region wins over its word for the language', () => {
    const text = createFormText({
      locale: 'de-CH',
      words: { 'de-CH': { 'form.submit': 'Abschicken' }, de: { 'form.submit': 'Senden', 'form.next': 'Vor' } },
    })

    expect(text('form.submit')).toBe('Abschicken')
    expect(text('form.next')).toBe('Vor')
  })

  test('fills its placeholders, and leaves one it was not given visible', () => {
    const text = createFormText({ locale: 'de' })

    expect(text('repeater.add', { label: 'Kontakt' })).toContain('Kontakt')
    // "Add ." reads as a word and hides that a value never arrived.
    expect(text('repeater.add')).toContain('{label}')
  })

  test('is counted by the rules of the language it is written in', () => {
    const en = createFormText({ locale: '' })
    const de = createFormText({ locale: 'de' })
    const fr = createFormText({ locale: 'fr' })

    expect(en('errors.heading', { count: 1 })).toBe('There is 1 problem to fix')
    expect(en('errors.heading', { count: 3 })).toBe('There are 3 problems to fix')
    expect(de('errors.heading', { count: 1 })).not.toBe(de('errors.heading', { count: 2 }))
    // French counts 0 like 1; English does not.
    expect(fr('resume.setAside', { count: 0 })).toBe(fr('resume.setAside', { count: 1 }).replace('1', '0'))
  })

  test('and a message a language lacks is counted by English’s rules, not that language’s', () => {
    // Portuguese counts 0 as `one`. Its English fallback chosen by Portuguese rules said
    // "One question is no longer on this form" about none.
    const text = createFormText({ locale: 'pt', words: { pt: { 'form.next': 'Seguinte' } } })

    expect(text('resume.setAside', { count: 0 })).toContain('0 questions')
  })

  test('joins a list the way its language does', () => {
    expect(createFormText({ locale: 'de' }).list(['a.pdf', 'b.pdf', 'c.pdf'])).toBe('a.pdf, b.pdf und c.pdf')
    expect(createFormText({ locale: '' }).list(['a.pdf', 'b.pdf', 'c.pdf'])).toBe('a.pdf, b.pdf and c.pdf')
  })

  test('is read for a locale the runtime cannot parse, rather than failing the form', () => {
    // A document's catalogue may be keyed by anything, `de_CH` included, and `Intl` throws
    // on a tag that is not BCP 47. A respondent's form must still draw: the host's words
    // for that key, then its language's, counted and joined by the language's rules.
    const text = createFormText({ locale: 'de_CH', words: { de_CH: { 'form.submit': 'Abschicken' } } })

    expect(text('form.submit')).toBe('Abschicken')
    expect(text('form.next')).toBe(FORM_WORDS_DE['form.next'])
    expect(text.list(['a', 'b'])).toBe('a und b')
    expect(text.locale).toBe('de')
  })
})

describe('a shipped language', () => {
  const shipped: ReadonlyArray<[string, Readonly<Record<FormWordId, Message>>]> = [
    ['German', FORM_WORDS_DE],
    ['French', FORM_WORDS_FR],
  ]
  const ids = Object.keys(FORM_WORDS).sort()
  const placeholders = (message: Message): string[] => {
    const all = typeof message === 'string' ? [message] : Object.values(message)
    return [...new Set(all.flatMap((form) => [...form.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!)))].sort()
  }

  test.each(shipped)('%s says everything English says, and nothing more', (_, words) => {
    // A shipped language with a gap is a form half in it, which reads worse than one in
    // English; the compiler holds this too, and this holds a cast that would get past it.
    expect(Object.keys(words).sort()).toEqual(ids)
  })

  test.each(shipped)('%s takes the placeholders English takes, in the same kind of message', (_, words) => {
    // A translation that drops `{label}` says "Remove" without saying which.
    for (const id of ids as FormWordId[]) {
      const translated = words[id]
      expect(typeof translated, id).toBe(typeof FORM_WORDS[id])
      expect(placeholders(translated), id).toEqual(placeholders(FORM_WORDS[id]))
    }
  })

  test.each(shipped)('%s has no empty message, and every count has `other`', (_, words) => {
    for (const [id, message] of Object.entries(words)) {
      if (typeof message === 'string') expect(message.trim(), id).not.toBe('')
      else expect(message.other.trim(), id).not.toBe('')
    }
  })
})
