# 0084 — Extraction is the command; an orphaned message is kept

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/session.test.ts`, the *'authoring
  translations'* block — eight cases, each observed failing with
  `session.extractText is not a function`. The pane is held by
  `packages/builder-react/src/translations-pane.test.tsx`, and its reachability
  separately by `apps/admin/src/workspace.test.tsx`, observed failing with the tab
  removed from the titlebar.

## Context

Translated form content was the oldest reservation in the format and the least usable
feature in the product. `label: { $t: "name" }` has been valid since version 1, the engine
resolves a reference against the catalogue and falls back to the default locale, and both
renderers have shown translated forms since the playground got a language switcher.

And nothing in the builder could produce a reference. Translated content was a thing a
developer could hand-write and an author could not reach — the same shape the wizard was
in, and the roadmap named it every time it was revised.

Two questions had to be settled before writing any of it.

**What is the command?** A catalogue editor is the obvious surface: rows of ids and
strings, add, edit, remove. It is also the surface that helps least, because it presumes
the document already refers to messages. The form somebody has in front of them contains
`label: "Work email"`, and the step that makes it translatable is turning *that* into a
reference without asking them to retype it.

**What happens to a message nothing refers to?** Rename a field, delete one, restructure a
page, and the catalogue keeps entries whose `$t` no longer appears anywhere. Every tidy
instinct says collect them.

## Decision

**`extractText(keyPath, property)` is the command.** It replaces a literal with a
reference and seeds the default locale's message with the words that were already there,
so the form reads exactly as it did a moment before. The pane offers it over every
labelled field at once, because doing it field by field is a chore people abandon halfway
and leave a half-referenced form behind.

It is **idempotent**: a property that is already a reference is left alone. An author
pressing the button twice has not made a mistake, and re-seeding would overwrite a
translation with the language it was translated from.

**The first extraction decides the default locale**, and takes it as an argument rather
than guessing. A default inferred from the authoring browser would make the document
depend on who happened to open it.

**An orphaned message is reported and never collected.** `orphanedMessages()` lists them
and the pane shows them with what they said. A field can come back; a key can be renamed
back. A builder that silently discards a year of somebody's translations is not one
anybody trusts with the next year's, and the cost of keeping them is a few hundred bytes
in a document that is already the size of its own schema.

**The default locale cannot be removed**, and the refusal says why: every other locale
falls back to it, so removing it would leave every untranslated message resolving to
nothing.

**An untranslated message is marked in the pane**, rather than shown as its fallback.
Falling back silently is correct when a form is rendered and wrong when somebody is
working through a language — "it looked fine in the preview" is exactly how a language
ships half-finished.

## Consequences

**A form can be translated in the product**, which is what this was for, and the European
self-hosting pitch stops having a hole in the middle of it.

**The translations tab holds its own session.** It opens one from the workspace's JSON on
mount and writes the document back, like the build tab, rather than sharing the build
tab's. Sharing would mean a translator's Ctrl+Z reaching back into somebody's field edits.

**Only labels are extracted by the one-press button.** Options, placeholders, help text and
a layout section's heading are all `Text` and all translatable, and the button names
labels because that is what it does. Extending it is a widening of one function; claiming
it already does more would be the documentation failure this repository keeps finding.

**Nothing imports or exports a catalogue.** A translator working in the pane is a
translator working in the product; a team with a translation memory and a vendor wants XLIFF
or JSON in and out, and that is a feature with a file format attached. Named here rather
than half-built.

**There is no per-locale preview.** The playground has a language switcher and the admin's
fill-in tab renders the default locale, so seeing a translated form means switching the
document's default. Worth fixing, and not in this change.

## Alternatives considered

**A catalogue editor and nothing else** — rows of ids and strings over `i18n.messages`.
Rejected as the surface that presumes the problem is already solved: it is useful only
once a document refers to messages, and nothing could make one refer to them.

**Extract automatically, on every field added.** Every label a reference from the moment
it is typed, and no button at all. Rejected because it makes every simple form carry a
catalogue, and a document whose labels are all indirections is harder to read, diff and
hand-write — which is a cost paid by everyone to benefit the minority who translate.

**Collect orphaned messages on publish**, with a warning. Rejected on the asymmetry: the
cost of keeping a stale message is bytes, and the cost of discarding a live one is
somebody's work. A warning that deletes is a warning people learn to click through.

**Derive message ids from the label's text** rather than from the field's key path, the way
gettext does. Rejected because the id would then change when the wording is corrected,
which orphans the translation exactly when it most needs to survive — a typo fix in English
should not silently untranslate eleven languages.
