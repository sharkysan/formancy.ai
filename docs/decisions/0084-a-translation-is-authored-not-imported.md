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

**The one-press button reaches every `Text` the format has**: field labels, option labels,
a grid column's heading and a layout node's label. It did not, at first — and the sentence
recording that said it left "options, placeholders and help text", which named two
properties **the format does not have**. Written from a memory of other form builders
rather than from this schema, in a record whose whole subject is the format's own
vocabulary. `Text` appears in exactly four places, and the sweep now covers all four.

**A catalogue goes out and comes back as JSON, not as XLIFF.** A team with a vendor works
outside the product entirely, so the file is the feature rather than the table. It carries
the **source beside every target**: a list of ids and blanks tells a translator nothing,
and a translation memory matches on source text, so a file without it cannot be leveraged
at all.

Not XLIFF, which is what a vendor asks for. XLIFF has a specification, a namespace and
versions, and half of one is worse than none — a file that says `xliff` and is not one
fails inside somebody else's tool, where nothing here can explain it. This shape converts
to XLIFF in a script somebody writes in an afternoon, and the conversion is theirs to own.

**Coming back, three things are reported rather than done quietly.** An empty target never
erases a translation already there, because a partial file from a vendor is normal and
overwriting finished work is a loss nobody notices until the form is live. An id the form
no longer has is not written, because resurrecting one as an orphan makes the count of
what is left to translate wrong forever. A target whose source has changed since the
export **is** written and named — something is better than nothing and the translator may
be right, but it was translated from older wording and a reviewer has to see which.

**The preview builds its own engine.** An engine resolves text in one locale, fixed for
its lifetime, so showing a translation meant changing the document's `defaultLocale` — an
edit to the form in order to read it, published and diffed like any other. The pane
renders a second engine at the chosen locale instead and the document is not touched.
Untranslated messages fall back there exactly as they will for a visitor, because a
preview showing message ids would teach a translator that the fallback is broken when the
fallback is the feature.

**Adding it made both halves of the pane ambiguous to a test.** The table's inputs carry
the source text as their accessible name, and so does the preview's control for the same
question — so an unscoped `getByRole('textbox', { name: 'Work email' })` matched either
one. Two cases had been passing with no preview at all for that reason. Both regions are
named now and every case says which one it means, which is the repository's most frequent
guard failure caught in the act.

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
