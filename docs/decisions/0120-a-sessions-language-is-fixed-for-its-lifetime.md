# 0120 — A session's language is fixed for its lifetime, as an engine's locale is

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/playground/src/two-builders.test.tsx` — choosing German in the
  playground's Language switch shows both builders' trees as "Formularstruktur", and
  fails with the session opened without the language. Every pane of both builders is
  walked in a pseudo-language by `packages/builder-react/src/language.test.tsx` and
  `packages/builder-angular/src/language.test.ts`, each proved by writing English back.
  The drop surface over the rendered form is not walked: its one sentence is
  `arrangeDropAndSay`'s, held by `packages/builder-core/src/arrangement.test.ts`.

## Context

With the translations, prompt and scenario panes and the drop surface on the rendered
form moved, every surface of both builders reads the session's language
([0114](0114-the-builder-speaks-the-authors-language.md),
[0116](0116-what-a-builder-says-is-decided-once.md)). The playground already had a
Language switch for the form, and a builder whose language cannot be chosen anywhere a
visitor can reach is a feature only documented — the failure this repository has already
shipped once.

So the switch has to change the builder too, and the session had no way to change its
language: `text` is given when it is opened.

## Decision

**A session's language is fixed for its lifetime.** Changing it means opening a session
again over the same document, which is what the playground does: the Language switch,
which the form already followed, opens the same text again in the builder's new words.
The same shape as an engine's locale, which is fixed when the engine is constructed and
changed by constructing another
([0107](0107-layout-text-is-read-in-the-engines-locale.md)).

## Consequences

**Switching language drops the undo history.** A new session starts with an empty one.
For a person who changes the tool's language once, if ever, that is a cost nobody pays;
for a host that switches languages mid-edit it is a real one, and the place to pay it is
a session that can change language, not a builder that remembers two.

**Nothing has to notice a language change.** A builder reads `session.text` while it
renders and subscribes to the document's revision; a language that could change under it
would need a second subscription, or a revision bump that is not a document change, and
both builders would have to agree which.

## Alternatives considered

**`session.setLanguage(text)`, notifying subscribers.** Keeps the undo history. It also
makes the language a second piece of changing state with its own notification, which
every builder and every panel then has to subscribe to correctly — and a panel that
forgot would show two languages at once with nothing failing. Worth doing when a host
needs it; not before.

**A second Language switch for the builder.** Truer to the model — the author's language
and the reader's are different questions — and one more control on a page whose job is to
show the product, where one switch that changes both says the thing faster.
