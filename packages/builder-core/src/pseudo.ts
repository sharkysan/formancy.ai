import { SCHEMA_ERRORS } from '@formancy/spec'
import { BUILDER_MESSAGES } from './messages.js'
import { schemaTexts } from './schema-words.js'
import type { BuilderCatalogue, BuilderLanguage, BuilderMessageId, Message } from './messages.js'

/**
 * Pseudo-localisation: how a builder proves it has no English left in it.
 *
 * A builder in a language nobody reads — every catalogue message wrapped in
 * `⟦ ⟧` — shows two kinds of text. What came from the catalogue is marked; what
 * did not is either the document's own words (a field's label, a scenario's name)
 * or a sentence still written in the code. The spec's own words — a property's
 * title, a field type's name — are marked too, through the language's `schema`, and
 * so are the validator's sentences, through its `errors`. The first kind is fine
 * and the second is the defect, and `untranslated` tells them apart.
 *
 * Here rather than in each builder's tests because it is a judgement — what
 * counts as untranslated — and two copies of a judgement are two answers
 * waiting to differ ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 * Published, because a host writing a catalogue of its own, or chrome of its
 * own around a builder, has the same question to ask.
 */

const OPEN = '⟦'
const CLOSE = '⟧'

/** Every builder message, marked so that anything unmarked on screen came from elsewhere. */
export function pseudoLanguage(): BuilderLanguage {
  const mark = (message: Message): Message =>
    typeof message === 'string'
      ? `${OPEN}${message}${CLOSE}`
      : (Object.fromEntries(
          Object.entries(message).map(([form, text]) => [form, `${OPEN}${String(text)}${CLOSE}`]),
        ) as unknown as Message)

  const ids = Object.keys(BUILDER_MESSAGES) as BuilderMessageId[]
  const messages = Object.fromEntries(
    ids.map((id) => [id, mark(BUILDER_MESSAGES[id])]),
  ) as BuilderCatalogue
  // The spec's own words too: a property's title is the builder's to show in the
  // author's language, so a walk has to be able to see one that was not (0121).
  const schema = Object.fromEntries(
    schemaTexts().map((english) => [english, `${OPEN}${english}${CLOSE}`]),
  )
  // And the validator's sentences, by code, so a refusal shown in English is seen (0122).
  const errors = Object.fromEntries(
    Object.entries(SCHEMA_ERRORS).map(([code, sentence]) => [code, `${OPEN}${sentence}${CLOSE}`]),
  )
  // English plural and list rules: the marks are what is under test, not the grammar.
  return { locale: 'en-GB', messages, schema, errors }
}

/**
 * What was shown that came neither from the catalogue nor from `ownWords`.
 *
 * `shown` is every piece of text a person could read or hear — text nodes and
 * the attributes that name things. `ownWords` are the words that are not the
 * builder's to translate: the document's labels, a host's names, a parser's message. A
 * fragment that is only punctuation, digits or symbols ("↑ ↓", "—") is nobody's
 * language and passes.
 *
 * Marks are removed innermost first, because a message can carry another as a
 * value: "⟦⟦Removed intro.⟧ The form is not a wizard any more.⟧".
 */
export function untranslated(shown: Iterable<string>, ownWords: Iterable<string>): string[] {
  const allowed = new Set([...ownWords].map(bare))
  const found = new Set<string>()
  const innermost = new RegExp(`${OPEN}[^${OPEN}${CLOSE}]*${CLOSE}`, 'g')

  for (const text of shown) {
    let rest = text
    for (let before = ''; before !== rest;) {
      before = rest
      rest = rest.replace(innermost, '\u0000')
    }
    for (const fragment of rest.split('\u0000')) {
      const word = fragment.trim()
      if (word === '' || /^[\p{P}\p{S}\p{N}\s]+$/u.test(word) || allowed.has(bare(word))) continue
      found.add(word)
    }
  }
  return [...found].sort()
}

/**
 * A fragment without the punctuation at its edges.
 *
 * A renderer may set a document's word and the punctuation beside it into one
 * text node — Angular's `<code>{{ id }}</code>: {{ source }}` is the text ": Gone",
 * where React makes two — and ": Gone" is the document's word all the same.
 * Compared bare on both sides, so a word allowed with its full stop is still
 * allowed without one.
 */
function bare(text: string): string {
  // Two scans rather than `/[…]+$/`, which backtracks polynomially on a long run
  // of whitespace that does not reach the end — and what reaches this is whatever
  // a page shows.
  const chars = [...text]
  let start = 0
  let end = chars.length
  while (start < end && EDGE.test(chars[start]!)) start += 1
  while (end > start && EDGE.test(chars[end - 1]!)) end -= 1
  return chars.slice(start, end).join('')
}

const EDGE = /^[\p{P}\p{S}\s]$/u
