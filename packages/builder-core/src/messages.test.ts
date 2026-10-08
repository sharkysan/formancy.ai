import { describe, expect, test } from 'vitest'
import { BUILDER_MESSAGES, BUILDER_MESSAGES_DE, createBuilderText } from './messages.js'
import type { BuilderMessageId } from './messages.js'

/**
 * The builder's own words, in the language of the person using it.
 *
 * Both builders' interfaces were English and written inline, every string of
 * them. A button called one thing in one builder and another in the other is the drift `@formancy/builder-core` exists to prevent
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)),
 * and nobody would have found it, because nothing compared them.
 *
 * So there is one catalogue, here, and both builders read it
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
describe('a message', () => {
  test('is the English text when no catalogue is given', () => {
    const text = createBuilderText()

    expect(text('tree.empty')).toBe(BUILDER_MESSAGES['tree.empty'] as string)
  })

  test('is the catalogue’s text when one is', () => {
    const text = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })

    expect(text('tree.empty')).toBe(BUILDER_MESSAGES_DE['tree.empty'] as string)
    expect(text('tree.empty')).not.toBe(BUILDER_MESSAGES['tree.empty'] as string)
  })

  test('falls back to English one message at a time, so a partial catalogue is still usable', () => {
    /*
     * A host translating the builder into a language this package does not
     * ship will do it incrementally. A catalogue with a gap must show English
     * for the gap and the translation everywhere else — never an id, and never
     * an empty button.
     */
    const text = createBuilderText({ locale: 'xx', messages: { 'tree.empty': 'Leer.' } })

    expect(text('tree.empty')).toBe('Leer.')
    expect(text('palette.title')).toBe(BUILDER_MESSAGES['palette.title'] as string)
  })

  test('fills its placeholders from the values given', () => {
    const text = createBuilderText()

    expect(text('refuse.noField', { path: 'contact.email' })).toContain('contact.email')
  })

  test('and leaves a placeholder it was not given visible rather than empty', () => {
    /*
     * Loud on purpose. "No field at ." reads as a sentence and hides that a
     * value never arrived; "No field at {path}." is obviously wrong, and is
     * the kind of wrong somebody reports.
     */
    const text = createBuilderText()

    expect(text('refuse.noField')).toContain('{path}')
  })
})

describe('a count', () => {
  test('chooses the form the language uses for that number', () => {
    // German and English agree on one and other; the point is that the
    // choice is the language's, through `Intl.PluralRules`, not an `=== 1`.
    const en = createBuilderText()
    const de = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })

    expect(en('tree.fieldCount', { count: 1 })).toMatch(/^1 field\b/)
    expect(en('tree.fieldCount', { count: 3 })).toMatch(/^3 fields\b/)
    expect(de('tree.fieldCount', { count: 1 })).toMatch(/^1 Feld\b/)
    expect(de('tree.fieldCount', { count: 3 })).toMatch(/^3 Felder\b/)
  })
})

describe('a list', () => {
  test('is joined the way the language joins one', () => {
    expect(createBuilderText().list(['A', 'B', 'C'])).toBe('A, B and C')
    expect(
      createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE }).list(['A', 'B', 'C']),
    ).toBe('A, B und C')
  })

  test('in English, not in the machine’s language, when the runtime has no data for the one asked for', () => {
    /*
     * ECMA-402 resolves a locale it has no data for to the runtime's own default.
     * Measured on a machine set to Swiss German: `xx` became `gsw-CH`, and a
     * builder joined "Row with A und B" there and "A and B" in CI — the same
     * document described differently by where it was opened. English instead,
     * because English is what every message a catalogue lacks falls back to.
     *
     * `locale` is the assertion that fails on every machine; the list is the
     * one a reader recognises, and fails only where the default is not English.
     */
    const text = createBuilderText({ locale: 'xx', messages: {} })

    expect(text.locale).toBe('en-GB')
    expect(text.list(['A', 'B'])).toBe('A and B')
  })

  test('in the language asked for when the runtime has it, region and all', () => {
    expect(createBuilderText({ locale: 'de-CH', messages: BUILDER_MESSAGES_DE }).locale).toBe(
      'de-CH',
    )
  })
})

describe('the catalogues', () => {
  const ids = Object.keys(BUILDER_MESSAGES) as BuilderMessageId[]

  test('German says everything English says', () => {
    // Shipped means complete. A shipped catalogue with a gap is a builder
    // that is half German, which reads worse than one that is all English.
    const missing = ids.filter(
      (id) => (BUILDER_MESSAGES_DE as Record<string, unknown>)[id] === undefined,
    )

    expect(missing).toEqual([])
  })

  test('and nothing English does not', () => {
    // A key only one catalogue has is a message nobody can show — usually one
    // that was renamed in English and left behind in the translation.
    const extra = Object.keys(BUILDER_MESSAGES_DE).filter((id) => !(id in BUILDER_MESSAGES))

    expect(extra).toEqual([])
  })

  test('and every translation takes the same placeholders as its English', () => {
    /*
     * A translation that drops `{path}` silently loses the one part of the
     * sentence that says where; one that invents `{pfad}` shows it raw.
     * Both read as fine until the message is shown.
     */
    const placeholders = (message: unknown): string => {
      // A plural message is an object of forms; every form takes the same set.
      const texts = typeof message === 'string' ? [message] : Object.values(message as object)
      return [
        ...new Set(
          texts.flatMap((text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1])),
        ),
      ]
        .sort()
        .join(',')
    }

    const differ = ids.filter(
      (id) =>
        placeholders(BUILDER_MESSAGES[id]) !==
        placeholders((BUILDER_MESSAGES_DE as Record<string, unknown>)[id] ?? ''),
    )

    expect(differ).toEqual([])
  })

  test('and no message is empty, which would be a button with no name', () => {
    const blank = (message: unknown): boolean =>
      typeof message === 'string'
        ? message.trim() === ''
        : Object.values(message as object).some((form) => String(form).trim() === '')

    const empty = [
      ...ids.filter((id) => blank(BUILDER_MESSAGES[id])),
      ...Object.entries(BUILDER_MESSAGES_DE)
        .filter(([, message]) => blank(message))
        .map(([id]) => `de:${id}`),
    ]

    expect(empty).toEqual([])
  })

  test('and a plural message always has the form every language falls back to', () => {
    // `other` is the category `Intl.PluralRules` can always return. A plural
    // message without it has a number it cannot say.
    const withoutOther = [
      ...Object.entries(BUILDER_MESSAGES),
      ...Object.entries(BUILDER_MESSAGES_DE).map(([id, message]) => [`de:${id}`, message] as const),
    ]
      .filter(([, message]) => typeof message === 'object' && !('other' in (message as object)))
      .map(([id]) => id)

    expect(withoutOther).toEqual([])
  })
})
