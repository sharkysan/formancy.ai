# 0116 — What a builder says after a command is decided once, and checked for English left behind

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/spoken.test.ts` — every structure-tree command
  and the sentence it produces, against the document before and after; proved by six
  mutations (a group looked up as a page, the wizard state inferred rather than counted,
  the first page decided by every field rather than the loose ones, a removed field named
  after it is gone, a drop named by its destination, undo announced either way).
  `packages/builder-react/src/language.test.tsx` and
  `packages/builder-angular/src/language.test.ts` — each builder's structure tree walked
  through every state it can show in a pseudo-language, with anything on screen that
  came from neither the catalogue nor the document named; proved by writing English back
  into six places in React and four in Angular, each named in the failure. The drop
  announcement in both builders' own tests, which said "Moved City." for the field
  Customer before this.

## Context

Every command on the structure tree is announced through one polite live region. For
somebody building a form by keyboard with a screen reader, that sentence is the only
evidence of what happened — the tree changing is not something they can see.

Both builders worked those sentences out by hand, and not only the wording: the count of
top-level fields taken *before* adding a page, the search for the page that took a
container's questions, the check for whether the form is still a wizard. Character for
character the same code, twice. Moving the words into the catalogue
([0114](0114-the-builder-speaks-the-authors-language.md)) would have meant translating it
twice, and consolidating it found that the copies had been wrong together:

- **A drag named the wrong field.** Both drop handlers announced their own argument — the
  row under the pointer — so dragging Customer onto City said "Moved City."
- **Unwrapping a group in a paged form called it a page.** The search for the page now
  holding the questions ran whatever was unwrapped, found the page the group sat on, and
  said "Removed the page Billing address" — in every form that has pages.
- "Added Page 1, holding the 1 fields that were at the top level": the count was
  pluralised by hand and the verb was not.

## Decision

**A command and the sentence that reports it live together in `@formancy/builder-core`**
(`spoken.ts`): `undoAndSay`, `addPageAndSay`, `unwrapAndSay`, `removeAndSay`,
`insertAndSay`, `moveAndSay`, `dropAndSay`, `upgradeAndSay`. Each runs the command and
returns what to announce, in the session's language. Running the command there rather than
taking its outcome is the point: the sentence needs what was true before the command — a
container's name and contents are gone afterwards — and a caller handed that job does it
twice. The keyboard legend is `treeKeyHelp`, for the same reason.

**A builder's language is checked by pseudo-localisation.** `pseudoLanguage()` wraps every
catalogue message in `⟦ ⟧`; each builder walks its structure tree through every state it
can show — an announcement, the add palette with its locked types, the destination list,
the move list, a page added — and `untranslated()` names whatever is on screen outside the
marks that is neither the document's own words nor the spec's type names. Both functions
are in builder-core because what counts as untranslated is a judgement, and the two
builders must not hold two of it. They are published, because a host writing its own
catalogue or its own chrome has the same question.

**Angular reads its words through a pure pipe**, `'tree.empty' | builderText: text()`,
rather than a method the template calls: Angular runs template method calls on every
change detection pass and memoises a pure pipe on its arguments. The language is an
argument, not something the pipe injects, because it belongs to the session a component
was given.

## Consequences

**The structure tree is in the author's language in both builders, and the other surfaces
are not yet.** The layout pane, the property and logic panels, the translations pane, the
prompt and scenario panes and the two list editors still word their own text — and the
layout pane still works out its own announcements, twice. Each moves the same way, one
surface per change in both builders at once, so neither builder is ever ahead of the
other on a surface.

**The walk covers the states it names, not every state.** A refusal that only an unusual
document produces, or a dialog the walk does not open, could still carry English, and the
guard would not see it. The walk asserts that it reached each state it claims, so it
cannot silently shrink; it cannot grow by itself.

**`label` on both builders now defaults to the session's words** rather than to a literal.
A host passing its own label is unaffected; a host relying on the default English gets it
in the session's language, which is the point.

**The legend's key names are translated, the letters are not.** A German keyboard says
`Entf` and `Strg`; the commands are still `a`, `p`, `u`, `m`, because they are bindings
and translating them would change what the keys do.

## Alternatives considered

**Translate each builder's sentences in place.** Four strings per sentence instead of two,
and the three defects above would have been translated faithfully into German.

**Let each command return its sentence from the session itself.** The session would then
know about live regions and keyboard legends — the interface's concerns inside the
document engine. A function beside it that uses its public commands keeps the session a
document engine and still gives both builders one answer.

**A lint rule against string literals in components.** It cannot tell a CSS class or a
`data-formancy-part` value from a sentence, and it would pass a sentence assembled from a
translated half and an English half — which the rendered check catches, because it reads
what a person sees rather than what the source contains.
