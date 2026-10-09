# 0121 — The spec's words are translated beside it, keyed by the English it writes

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/builder-core/src/schema-words.test.ts` — every text the spec's
  JSON Schema gives a builder to show, derived from the schema rather than listed, has a
  German and a French translation; no translation is of words the schema no longer
  writes; and a translation keeps every token the English quotes as code. Both builders'
  `language.test` walks now refuse a property title or a field type's name shown in
  English: the allowance that let them through is gone, and putting back one call that
  does not pass the language (the React property panel, the Angular palette) names the
  titles that stayed English.
- **Deciders:** Daniel Bacher

## Context

The builder's own words moved into a catalogue
([0114](0114-the-builder-speaks-the-authors-language.md)), and one part of it stayed
English on purpose: a property's title and description, and each field type's name and
what it is for. Those come from the spec's JSON Schema, which is also what the reference
documentation is generated from — two readers, one source — and putting them in the
builder's catalogue would have made a second source that could disagree with the first.

The original ask was explicit that property labels are part of the editor's language.
A German builder whose panel says "Required", "Minimum length" and "Single-line text"
is a half-German builder; and the type's name is written into the document, as the
label a new field starts with, so a German author found "Single-line text" in their form.

## Decision

**The English stays in the schema, and a translation sits beside it, keyed by that
English.** `SCHEMA_WORDS_DE` and `SCHEMA_WORDS_FR` in `@formancy/builder-core` map each
text the schema writes to its translation. A builder's language carries them
(`createBuilderText({ …, schema })`) and `text.schema(english)` returns the translation or
the English. `editablePropertiesFor`, `editableLayoutPropertiesFor`, `paletteEntries`,
`typesNeedingUpgrade` and `newFieldOfType` take the language; both builders pass the
session's.

**Keyed by the English, not by where the text sits in the schema.** A JSON pointer into the
schema — `$defs/field/allOf/3/then/properties/minItems` — shifts when a branch is added,
and a translation would silently attach to the wrong property. The English is what a
translator translates anyway. The cost of the English as key is the one the builder's
catalogue avoids by using ids: rewording the schema orphans its translation. Here that is
not silent — **the set of texts is derived from the schema**, `schemaTexts()`, and the
test fails on a text with no translation and on a translation of a text that no longer
exists, which is exactly the rewording.

**The pseudo-language marks them too**, so the walks that hold the builders to the
catalogue now hold them to these words as well.

## Consequences

**Rewording a property's description in the schema fails a test until both translations
follow.** That is a cost on every schema edit, and the reason it is worth paying: the
alternative is a German panel that drifts back to English one reworded sentence at a
time, with nothing to say so.

**Keying by the English costs bytes.** Measured 2026-10-09: about 7 kB brotli per
language, and roughly half of that is the English keys — every description is carried
twice, once as the key. Both are named exports of a side-effect-free package, so an
application that imports neither ships neither.

**A host's own language needs schema words as well as messages** to be complete. A host
that supplies only `messages` gets the schema's English for properties and types, one text
at a time — the same fallback as everywhere else.

**What stays English**: the validator's messages, which are `@formancy/spec`'s to word
and do not yet carry codes a translation could key on; and a property's *choices*, which
are the format's tokens (`email`, `datagrid`), not words.

> **Amended by [0122](0122-a-validator-error-has-a-code.md).** The validator's messages carry
> codes now, and a language translates them as `errors`. The paragraph above is how it stood
> when this was decided.

## Alternatives considered

**Put the titles and descriptions into the builder's catalogue with ids.** Two sources for
one text, and the reference documentation and the panel could then say different things —
the drift [0091](0091-a-second-builder-is-a-binding.md) is about.

**Translate inside the JSON Schema** (`title` per language). JSON Schema has no such
construct; inventing one makes the schema the spec publishes carry the builder's concerns,
and every other reader of it would have to skip them.

**Key by JSON pointer.** Brittle in the way described above, and silent when it breaks.
