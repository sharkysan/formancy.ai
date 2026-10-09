import { describe, expect, test } from 'vitest'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { createBuilderText } from './messages.js'
import { newFieldOfType, paletteEntries } from './palette.js'
import { editableLayoutPropertiesFor, editablePropertiesFor } from './properties.js'
import { SCHEMA_WORDS_DE } from './schema-words-de.js'
import { SCHEMA_WORDS_FR } from './schema-words-fr.js'
import { schemaTexts } from './schema-words.js'

/**
 * The spec's own words in the author's language.
 *
 * A property's title and description, and a field type's name, were the one part
 * of the builder still English in German: they come from the spec's JSON Schema,
 * which the reference documentation reads too, and so they stayed out of the
 * builder's catalogue. They stay in the schema — in English, the one source —
 * and a translation sits beside it, keyed by that English
 * ([0121](../../../docs/decisions/0121-the-specs-words-are-translated-beside-it.md)).
 */
const SHIPPED: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  ['de', SCHEMA_WORDS_DE],
  ['fr', SCHEMA_WORDS_FR],
]

describe('a translation of the spec’s words', () => {
  test('covers every text the schema gives a builder to show', () => {
    // Derived from the schema, so a property added there, or a description
    // reworded, fails here until it is translated — rather than appearing in
    // English in a German builder with nothing to say so.
    const texts = schemaTexts()
    const missing = SHIPPED.flatMap(([locale, words]) =>
      texts
        .filter((text) => words[text] === undefined)
        .map((text) => `${locale}: ${text.slice(0, 60)}`),
    )

    expect(texts.length).toBeGreaterThan(100)
    expect(missing).toEqual([])
  })

  test('and holds nothing the schema no longer says', () => {
    // A key the schema stopped writing is a translation of words nobody shows —
    // usually the old wording of something that was reworded.
    const texts = new Set(schemaTexts())
    const stale = SHIPPED.flatMap(([locale, words]) =>
      Object.keys(words)
        .filter((key) => !texts.has(key))
        .map((key) => `${locale}: ${key.slice(0, 60)}`),
    )

    expect(stale).toEqual([])
  })

  test('and keeps what the schema quotes as code, because that is not language', () => {
    // `required`, `application/pdf`, `.png` and a date written as an answer are
    // the format's own tokens; a translation that "translated" one would tell an
    // author to type something the validator refuses.
    const quoted = (text: string): string[] =>
      [...text.matchAll(/`[^`]+`|\d{4}-\d{2}-\d{2}T?[\d:]*Z?|\d{2}:\d{2}/g)].map((m) => m[0])
    const lost = SHIPPED.flatMap(([locale, words]) =>
      Object.entries(words).flatMap(([english, translated]) =>
        quoted(english)
          .filter((token) => !translated.includes(token))
          .map((token) => `${locale}: ${token}`),
      ),
    )

    expect(lost).toEqual([])
  })
})

describe('the builder shows them in the session’s language', () => {
  const german = createBuilderText({
    locale: 'de',
    messages: BUILDER_MESSAGES_DE,
    schema: SCHEMA_WORDS_DE,
  })
  const english = createBuilderText()

  test('in a property panel', () => {
    const required = editablePropertiesFor('text', undefined, german).find(
      (p) => p.name === 'required',
    )

    expect(required?.title).toBe('Pflichtfeld')
    expect(
      editablePropertiesFor('text', undefined, english).find((p) => p.name === 'required')?.title,
    ).toBe('Required')
  })

  test('in a layout property panel', () => {
    const span = editableLayoutPropertiesFor('field', german).find((p) => p.name === 'span')

    expect(span?.title).toBe(SCHEMA_WORDS_DE['Column span'])
  })

  test('in the palette, and in the label a new field is given, because that is written into the form', () => {
    const text = paletteEntries(undefined, german).find((entry) => entry.type === 'text')

    expect(text?.title).toBe('Einzeiliger Text')
    expect(newFieldOfType('text', new Set(), german).label).toBe('Einzeiliger Text')
  })

  test('and falls back to the schema’s English where a language has no translation', () => {
    const partial = createBuilderText({ locale: 'xx', messages: {}, schema: { Required: 'R' } })

    expect(
      editablePropertiesFor('text', undefined, partial).find((p) => p.name === 'label')?.title,
    ).toBe('Label')
  })
})
