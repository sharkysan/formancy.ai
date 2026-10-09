# 0122 — A validator error has a code, and a builder translates it by that code

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/spec/src/schema-errors.test.ts` — an error carries its code and
  the values its sentence names, from the hand-written checks and from the JSON Schema
  alike, and its English is that sentence with those values. That every call names exactly
  the values its sentence needs is the compiler's check (`pnpm typecheck`): `schemaError`
  reads the placeholders off the sentence's literal type, and dropping `{ key }` from the
  duplicate-key call, adding a value no placeholder names, or giving values to a sentence
  that has none each fail to compile. `packages/builder-core/src/schema-errors.test.ts` —
  German and French say every sentence, with the English's placeholders and the format's
  own words (`renamedFrom`, `span`, `specVersion`) kept; a German session refuses a
  duplicate key in German, a French one refuses to open a broken document in French, and a
  host's partial language falls back to the English one sentence at a time.
  `pseudo.test.ts` — the pseudo-language marks a validator refusal, so the builders' walks
  can see one left in English. Each was seen to fail with what it guards put back.
- **Deciders:** Daniel Bacher

## Context

The localisation item asked for the builder's buttons, its property labels and its
validation messages in the author's language. The first two shipped
([0114](0114-the-builder-speaks-the-authors-language.md),
[0121](0121-the-specs-words-are-translated-beside-it.md)). The third could not, because the
validator said everything as one English string, `{ path, message }`. A German builder
refusing a duplicate key read *Another field already uses the key "email"* — the refusal an
author meets most, in the one language the rest of the builder no longer spoke.

To translate it, the builder would have had to recognise the English — match "Another field
already uses the key" and pull `email` back out of the quotes. That is parsing prose, and
the first rewording in the spec would have broken it with nothing to say so. The sentences
were written inline where each rule is checked, thirty-odd of them, and the JSON Schema half
rewrote ajv's messages in a `switch`.

## Decision

**Every error carries a code and the values its sentence names**, beside the English it
always had: `{ path, message, code, values }`. The English for every code is one table,
`SCHEMA_ERRORS` in `@formancy/spec`, and `message` is rendered from it — so nothing that read
`message` before reads anything different now, and the tests that pinned the English pass
unchanged.

**One code per sentence, never a sentence assembled from parts.** The spec-version refusals
were one function, `needs(what, version)`, setting an English noun phrase — `A "rating"
widget` — into an English template; a translated template would still have carried the
English noun. So each construct has its own code (`version.widget`, `version.fieldType`, …),
and each JSON type its own sentence (`shape.string`: "Must be text.") where there was "Must
be" plus a readable type name.

**The compiler holds every call to its sentence.** `schemaError(path, code, values)` is
generic over the code, and `values` is typed as exactly the placeholders that code's
sentence contains, read off its literal type. A forgotten value would show the author
`{key}` and nothing would notice; it is a compile error instead.

**The translations live in `@formancy/builder-core`, beside the builder's own words:**
`SCHEMA_ERRORS_DE` and `SCHEMA_ERRORS_FR`, typed as every code (`SchemaErrorSentences`), so a
sentence the validator gains does not compile there until it is translated. A language
carries them as `errors`; `text.error(found)` says an error in that language, or in the
validator's English for a code the language does not have. The session's refusals — a
command the validator would not accept, a document it will not open — are said through it.

**The table is exported from `@formancy/spec`'s main entry**, not only from
`@formancy/spec/validate`, so translating an error does not mean loading the compiled
validator.

## Consequences

**Codes are a contract now.** The server's 422 for an invalid schema carries them, the MCP
tools return them, and a host may translate by them. Rewording an English sentence is free —
that is the point. Renaming or removing a code, or changing which values a sentence names,
is a change a host notices, and goes in the changelog. What enforces that is narrower than
it sounds: the shipped translations stop compiling, and so does a host's own translation
typed as `SchemaErrorWords`; one that is not typed silently falls back to English for the
code it no longer matches.

**A new validator rule costs four edits where it cost one**: the English sentence, the call,
and a German and a French sentence. The types make the last two impossible to forget, which
is why they are worth it. Measured 2026-10-09, the English table is about 1.9 kB brotli —
moved, not added — and each translation about 2.6 kB; both translations are named exports of
a side-effect-free package, so a host that imports neither ships neither.

**What stays English.** `shape.other`, the sentence for a JSON Schema keyword this repository
has no wording of its own for, is ajv's message carried as a value; a pattern that does not
compile reports the JavaScript engine's own reason. A value is the document's word or the
format's token (`"email"`, `rating`) and is not translated. And the admin app, whose interface
is English, shows the English it always showed.

## Alternatives considered

**Recognise the English in the builder.** Parsing prose, broken silently by the first
rewording — the failure this record exists to remove.

**Translate inside `@formancy/spec`, with a locale passed to `validateSchema`.** The server,
the MCP server and the conformance runner would carry translations they never show, and a
builder's language would be configured in two places. The spec words the rules; the builder
is what speaks to a person.

**`ajv-i18n` for the structural half.** It translates ajv's raw messages, which this
repository already replaces because they tell an author nothing ("must NOT have additional
properties"); it would translate the wording that was thrown away, add a dependency, and
cover half the sentences.

**A code without values.** A translation could then not place the field's key in its own
word order; it would have to parse the value back out of the English, which is the first
alternative again.
