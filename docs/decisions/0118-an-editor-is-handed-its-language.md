# 0118 — An editor is handed its language, and the two list editors have one shape

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** both builders' `language.test` walk the field and layout property
  panels and the two list editors — including the empty states and a column over a
  missing answer, which a valid document cannot reach — in a pseudo-language and name
  anything not from the catalogue; proved by seven mutations across the two builders,
  among them a panel that does not pass its language on. `packages/builder-core/src/editors.test.ts`
  holds the shared decisions. `packages/builder-angular/src/property-panel.test.ts` holds
  the options editor's name and parts, and failed on the editor as it was.

## Context

The property panels are generated from the spec's JSON Schema, so most of what they show
is the schema's own words — a property's title, its description, its choices — and not the
builder's to translate ([0114](0114-the-builder-speaks-the-authors-language.md)). What is the
builder's is in the two editors the schema cannot generate, the choices of a select and the
columns of a grid, and in what the layout panel calls the node it edits.

Those editors are also published on their own (`OptionsEditor`, `ColumnsEditor`,
`FormancyOptionsEditor`, `FormancyColumnsEditor`) and have no session. And reading the two
options editors side by side found them different: the Angular one called each choice's
text box "Label" — the panel's own Label for the field is a second control with that name,
so a screen reader asked for "Label" cannot tell which — it had no words for an empty list,
and its parts were named so that the workbench theme, written against the React editor,
left it unstyled.

## Decision

**An editor is handed its language** — a `text` property or input, which the panel passes
from its session and which defaults to English. Not a React context or an Angular injection
token: the language belongs to the session a panel was given, and two builders on one page
can speak two languages; something ambient would make that a question of which provider is
nearer. And an editor used on its own, with no session at all, keeps working unchanged.

**What both editors decided separately is decided once**, in `builder-core`'s `editors.ts`:
the choice "Add a choice" adds — a value nothing uses, and a label in the author's language
because it is written into the document — and what the layout panel calls a node.

**The Angular options editor takes the React one's shape**: "Choice label", the label
before the value, the same empty state, and the same parts — `options-heading`,
`options-list`, `option-row` — so a theme styles both.

## Consequences

**A panel that forgets to pass its language shows its editors in English**, silently —
the cost of the English default. Held by the walk, which fails with every editor word
listed when a panel stops passing it.

**The words the schema gives are not translated**, and the panels are still mostly English
in a German builder for that reason. Translating property titles and descriptions is a
different mechanism with a different owner — the schema is the single source both the
reference documentation and the panel read — and is not attempted here.

**The empty states and a column over a missing answer cannot be reached through a panel**,
because the session refuses a document holding them. They are checked by rendering the
editors directly, which is how an editor used on its own would show them.

## Alternatives considered

**A context or injection token for the language.** Ambient state for something that
belongs to one session, and a second way for a builder to learn its language beside
`session.text`. Two ways would be two answers.

**Leave the Angular editor's layout as it was and translate it.** Its "Label" would then be
ambiguous in two languages.
