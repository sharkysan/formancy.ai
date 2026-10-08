# 0117 — The arrangement pane offers the same things in both builders

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/arrangement.test.ts` — what the add palette
  lists for a document, a code locked in version 1 with the version it needs, what a new
  code is labelled, what every arrangement command says, and what may be wrapped with
  what. `packages/builder-angular/src/layout-pane.test.ts` — placing a field the
  arrangement leaves out, adding a code, the version 1 upgrade, the form with no
  arrangement, Escape inside a dialog, and a drop named by what moved: six cases, each
  failing on the pane as it was. Both builders' `language.test` walk the pane in a
  pseudo-language and name anything not from the catalogue; proved by writing English back
  into six places across the two panes. `packages/builder-core/src/language.test.ts`
  holds the German dative.

## Context

The arrangement pane edits where a form's fields appear — rows, columns, sections, codes —
and both builders have one. Moving its words into the catalogue
([0114](0114-the-builder-speaks-the-authors-language.md)) meant reading both panes side
by side, and they did not offer the same things:

- **The Angular pane could not place a field.** It listed the fields the arrangement
  leaves out, under "Not in this arrangement", and its add palette offered three
  containers. The mistake the heading pointed at was one it gave no way to fix.
- It had **no code** in its palette, **no state for a form with no arrangement** — the
  React pane explains what that means and offers one — and its dialogs could be left only
  by Cancel.
- The two named the same dialog differently ("Wrap Email" against "What should go beside
  Email in a row?"), and the React pane announced a drop as "Moved." without saying what.

Each was a decision made twice, which is what
[0091](0091-a-second-builder-is-a-binding.md) says not to do, and nothing compared them.

## Decision

**What the pane offers, what a new node is, and what every command says are made once in
`@formancy/builder-core`** (`arrangement.ts`): `layoutAdditions` is the palette — the
containers, a code (locked, with the version it needs, where the document's spec has
none), and every unplaced field; `codeAnswers` is what a code can show; `layoutNodeFor`
builds the node, giving a code a label after its answer in the author's language;
`wrapCandidates` is what may be wrapped with what; and `addLayoutAndSay`,
`insertLayoutAndSay`, `moveLayoutAndSay`, `dropLayoutAndSay`, `unwrapLayoutAndSay`,
`removeLayoutAndSay` and `wrapAndSay` run each command and return its sentence, in the
manner of [0116](0116-what-a-builder-says-is-decided-once.md). Both panes render that and
nothing of their own.

**Adding is its own component in both builders** — `LayoutAdd` and `FormancyLayoutAdd`:
three dialogs with a state nothing else in the pane reads. The Angular pane crossed the
size budget the day it learned to offer what the React pane does, and the React one was
on the allow-list at 678 lines; split at the same seam, both are under it and the React
entry is gone.

**A node about to be added has its own words, apart from the list form a container's name
uses.** German needs two cases there: "Wohin soll **eine** Zeile kommen?" takes the
nominative, and "Abschnitt mit **einer** Zeile" takes the dative after *mit*. The first
German catalogue used one form for both and shipped "Abschnitt mit eine Zeile"; the list
forms are dative now and the new-node forms are separate.

## Consequences

**The Angular builder gains what it lacked**: placing an unplaced field, adding a code, a
form with no arrangement, and Escape in every dialog. Its tests for those fail on the pane
as it was.

**The React pane says more than it did.** "Moved." became "Moved Last name.", and the wrap
dialog's name is the question rather than "Wrap Email". A host or a test that looked for
the old wording finds the new one.

**The German catalogue is its own file**, `messages-de.ts`, because the catalogue crossed
the size budget with the arrangement's words — and because a translation changes for a
different reason from the English it translates, and a translator works down one file.

**A third surface is still to come.** The property and logic panels, the translations pane,
the prompt and scenario panes and the two list editors still word their own text.

## Alternatives considered

**Bring the Angular pane up to the React one by hand.** It is what produced the drift: a
second implementation is correct on the day it is written and nothing says when it stops
being.

**One form per node for every sentence.** It is how "Abschnitt mit eine Zeile" shipped:
the form that is right in one sentence is wrong in the other, and only a language with
cases shows it.
