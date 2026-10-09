import { SCHEMA_ERRORS } from '@formancy/spec'
import type { FormSchema, SchemaErrorCode } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { BUILDER_MESSAGES_FR } from './messages-fr.js'
import { createBuilderText } from './messages.js'
import { SCHEMA_ERRORS_DE } from './schema-errors-de.js'
import { SCHEMA_ERRORS_FR } from './schema-errors-fr.js'
import { createBuilderSession } from './session.js'

/**
 * The validator's sentences in the author's language.
 *
 * The refusal an author meets most — "Another field already uses the key" — came
 * from the validator, in English, in a builder that otherwise spoke German. The
 * English stays the spec's; each error now carries a code and its values, and a
 * translation says the same sentence by that code
 * ([0122](../../../docs/decisions/0122-a-validator-error-has-a-code.md)).
 */
const SHIPPED: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  ['de', SCHEMA_ERRORS_DE],
  ['fr', SCHEMA_ERRORS_FR],
]
const codes = Object.keys(SCHEMA_ERRORS) as SchemaErrorCode[]

/** One field called `email`, so that adding a second is refused by the validator. */
const contact: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: { fields: [{ key: 'email', type: 'text' }] },
}

describe('a translation of the validator', () => {
  test('says every sentence the validator says, and nothing it does not', () => {
    // The type says so as well. This says it if the type is ever loosened — to the
    // partial one a host's language uses, say — which would still compile.
    for (const [locale, sentences] of SHIPPED) {
      expect(Object.keys(sentences).sort(), locale).toEqual([...codes].sort())
    }
  })

  test('and takes the same placeholders as the English', () => {
    // A translation that drops `{key}` loses the one word saying which field; one
    // that invents `{schlüssel}` shows it raw. Both read as fine until shown.
    const placeholders = (sentence: string): string =>
      [...new Set([...sentence.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',')
    const differ = SHIPPED.flatMap(([locale, sentences]) =>
      codes
        .filter((code) => placeholders(SCHEMA_ERRORS[code]) !== placeholders(sentences[code] ?? ''))
        .map((code) => `${locale}:${code}`),
    )

    expect(differ).toEqual([])
  })

  test('and keeps the words the format owns, because those are what the author types', () => {
    // `renamedFrom`, `span`, `all`, `specVersion`: a quoted word that is not a
    // placeholder, or a property name in camel case. Translated, it would tell an
    // author to write something the validator refuses.
    const owned = (english: string): string[] => [
      // Quotes paired left to right, then placeholders dropped: excluding braces
      // inside the pattern instead pairs the close of "{version}" with the next open.
      ...[...english.matchAll(/"([^"]*)"/g)]
        .map((m) => m[1]!)
        .filter((word) => !word.includes('{')),
      ...[...english.matchAll(/\b[a-z]+[A-Z]\w*\b/g)].map((m) => m[0]),
    ]
    const lost = SHIPPED.flatMap(([locale, sentences]) =>
      codes.flatMap((code) =>
        owned(SCHEMA_ERRORS[code])
          .filter((word) => !(sentences[code] ?? '').includes(word))
          .map((word) => `${locale}:${code} ${word}`),
      ),
    )

    expect(owned(SCHEMA_ERRORS['rename.self'])).toContain('renamedFrom')
    expect(owned(SCHEMA_ERRORS['version.step'])).toEqual(['step', 'specVersion'])
    expect(lost).toEqual([])
  })
})

describe('a builder session says it in its own language', () => {
  const german = createBuilderText({
    locale: 'de',
    messages: BUILDER_MESSAGES_DE,
    errors: SCHEMA_ERRORS_DE,
  })

  test('when it refuses a command the validator would not accept', () => {
    const session = createBuilderSession(contact, { text: german })

    const outcome = session.insertField({ parent: [], index: 0 }, { key: 'email', type: 'text' })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).toBe(
      'Ein anderes Feld verwendet bereits den Schlüssel „email“. Ein Schlüssel bezeichnet eine Antwort, zwei Felder können ihn also nicht teilen.',
    )
  })

  test('and when it refuses to open a document, giving every reason in that language', () => {
    const broken: FormSchema = {
      ...contact,
      model: { fields: [...contact.model.fields, { key: 'email', type: 'text' }] },
    }
    const french = createBuilderText({
      locale: 'fr',
      messages: BUILDER_MESSAGES_FR,
      errors: SCHEMA_ERRORS_FR,
    })

    expect(() => createBuilderSession(broken, { text: french })).toThrowError(
      /Un autre champ utilise déjà la clé « email »/,
    )
  })

  test('and in the validator’s English for a sentence its language does not have', () => {
    // A host translating incrementally gets the English sentence, never a code.
    const partial = createBuilderText({
      locale: 'de',
      messages: {},
      errors: { 'key.reserved': 'reserviert' },
    })
    const session = createBuilderSession(contact, { text: partial })

    const outcome = session.insertField({ parent: [], index: 0 }, { key: 'email', type: 'text' })

    expect(outcome.ok ? '' : outcome.message).toBe(
      'Another field already uses the key "email". A key identifies one answer, so two fields cannot share one.',
    )
  })
})
