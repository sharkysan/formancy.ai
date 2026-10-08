# 0114 — The builder speaks the author's language, from one catalogue both builders read

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/messages.test.ts` — the German catalogue says
  everything English says and nothing more, every translation takes the same
  placeholders, no message is empty, every plural message has `other`, a missing
  placeholder stays visible, and a locale the runtime has no data for is English rather
  than the machine's language. `packages/builder-core/src/language.test.ts` — a session
  opened in German refuses, describes move targets, names layout nodes, starts new fields
  and refuses a stale proposal in German, each compared with the German catalogue and
  with English. Proved by ten mutations, one for each path a word takes from the
  catalogue to the screen, all caught by assertions; and by the compiler, which refuses a
  rule kind, operator or layout kind with no message, because the ids are template
  literal types.

## Context

Both builders' interfaces were English and written inline, every string of them. That is
two problems, and the second is the one this repository exists to prevent.

The first is plain: a German team building a German form reads a builder that says
"Cannot move this inside itself", "Row with First name and Last name" and "between Email
and Summary". The form they build can be in any language
([0107](0107-layout-text-is-read-in-the-engines-locale.md)); the tool they build it with
could not.

The second is drift. The React and Angular builders are one product with two bindings
([0091](0091-a-second-builder-is-a-binding.md)), and a sentence written inline in each
is two implementations of the same words. Nothing compared them, so nothing would notice
a button called one thing in one builder and another thing in the other.

And some of the English was not in the builders at all. `builder-core` itself assembled
sentences — every refusal a session issues, the move palette's "Section with A and B,
between C and D", the starter label a new field is given — and the list join was `', '`
plus a final `" and "`, English grammar spelled in code, with the one word nobody could
translate.

## Decision

**One catalogue, in `@formancy/builder-core`, which both builders read.** Every message
has an id; English is `BUILDER_MESSAGES` and is the source every translation translates;
German is `BUILDER_MESSAGES_DE`, shipped and complete. `createBuilderText({ locale,
messages })` returns the function a builder calls for every word, with English as the
fallback **one message at a time**, so a host translating incrementally has a usable
builder at every step rather than an id or an empty button.

**A session carries its language.** `createBuilderSession(document, { text })` refuses in
it, and exposes it as `session.text`, so everything holding a session — both builders,
`applyProposal` — says the same thing the same way. The functions that name things
(`describeTarget`, `describeLayoutTarget`, `flattenLayout`, `describeLayoutNode`,
`newFieldOfType`) take a `text` argument that defaults to English, so nothing that never
asked for a language changes.

**Whole sentences per noun, not a noun slotted into a template.** "Empty {kind}" has no
correct German: an adjective and an article agree with the noun — "Leerer Abschnitt",
"Leere Zeile", "Leere Tabelle". So each layout kind has its own message for each way it
is named. Wordier, and the only shape a translator can actually translate.

**The language decides counts and lists.** `Intl.PluralRules` chooses a plural form,
never an `=== 1`; `Intl.ListFormat` joins a list, so "A, B und C" is German's join and
not the code's. `en-GB` is the default English, because `en` uses an Oxford comma and
would have changed every list the layout tree has ever shown.

**A locale the runtime has no data for is English.** ECMA-402 resolves one to the
runtime's own default, and the default is the machine's: measured, `xx` became `gsw-CH`
on a machine set to Swiss German, so the same document's tree joined "A und B" there and
"A and B" in CI. English instead, because English is what every message a catalogue
lacks falls back to. A tag that is not BCP 47 at all throws a `RangeError` at
construction — a host's mistake, loud once.

**A missing placeholder value stays visible.** "No field at {path}." is obviously wrong;
"No field at ." reads as a sentence and hides that a value never arrived.

**The words a new field starts with are in the author's language**, because they are
written into the document: "Neues Feld", "Erste Option". These are the only messages that
leave the builder.

**The rule-kind and operator labels are read from the catalogue**, not copied beside it.
`RULE_KIND_CHOICES` and `OPERATORS` keep their English `label` for existing callers, built
from `` BUILDER_MESSAGES[`rule.${id}.label`] ``; a localised builder reads the same id
through `text`. A kind the format grows without a message does not compile.

Finding things in a document — a field by key path, a container, a layout node by
position — moved from `session.ts` into `navigate.ts` on the way. None of it is a
command, and the size budget would have refused the catalogue's arrival otherwise; the
ceiling went down with it.

## Consequences

**This is the core, and the builders' own chrome is not done.** As of this record a
German session refuses, describes, names and starts fields in German, and both builders
show those words wherever they display them. The builders' buttons, headings and pane
titles are still English and inline; they move to `session.text` next, React and Angular
separately, and a builder that is half German is the state between. This record does not
claim a German builder.

**What the catalogue costs, measured 2026-10-09**: 83 messages per language; as JSON,
English is 1.6 kB and German 2.1 kB brotli. `BUILDER_MESSAGES_DE` is a named export from a
side-effect-free package, so a bundler drops it from an application that never imports
it. `builder-core` has no size budget of its own to move.

**`builder-core` now needs ECMA-402.** It is the first isomorphic package to use `Intl`;
the required environment in the SOUP declaration says so. Every current browser and the
official Node builds carry full locale data; a Node built with `small-icu` carries
English only, and a German builder there joins its lists in English.

**A function that names something and is not given a language speaks English,
silently.** That is the price of the default that keeps existing callers unchanged. It is
contained by passing `session.text` everywhere a builder already holds a session, and
held by the tests above for every path that exists today; a new naming function added
without the parameter would be English until somebody looks.

**The starter words follow the builder, not the form.** A German author building an
English form gets "Neues Feld" written into it. They are placeholders the author replaces,
and the language the author reads is the one they are most likely to notice and replace.

**Not in this catalogue, deliberately**:

- The palette's titles and the property panel's labels come from the spec's own JSON
  Schema `title` and `description` — two readers, one source — and translating those is
  a different mechanism with a different owner.
- The validator's messages belong to `@formancy/spec`.
- The authoring prompt is instructions to a model, not words to a person.
- The form's own text is the document's catalogue, translated in the translations pane
  for the people who fill the form in. The builder's words are for the person building
  it, who may well work in a different language from the form.

## Alternatives considered

**An i18n library — i18next, FormatJS.** ICU MessageFormat would carry plural and select
inside the message. It would also give `builder-core`, which has no runtime dependencies,
its first one, and add it to the SOUP declaration for two plural categories and a list
join `Intl` already does. Whole sentences per noun make `select` unnecessary.

**A catalogue per builder.** The drift this record exists to end, with a translation
file to keep in step as well.

**English strings as the keys, gettext-style.** Rewording an English message would
silently orphan every translation of it, and the English here is reworded often — the
voice of this repository is edited.

**Translating through the document's own message catalogue.** It is the form's, for
respondents, published with the form. The builder's words would end up in every form
document, and an author would have to translate the tool to translate the form.
