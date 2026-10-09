# 0143 — The workbench dresses every part a builder draws

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/workbench.test.ts` — reads both builders' sources for every
  part they emit, in both spellings they use, and fails for any part no rule in
  `packages/themes/workbench.css` selects. Watched failing before the rules were written,
  naming thirty-three parts.

## Context

The playground's prompt pane — describing a change in words — was called "really ugly", and
it was: a textarea at the browser's default size, in the browser's default monospace, pale
grey on a dark bench, beside a grey native button. Nothing styled it. `workbench.css`
dressed the tree, the palettes and the inspector it was written for; the parts that arrived
after it — the prompt and its review, the scenarios, blocks, a datagrid's columns, a group
inside a condition, a layout node's properties, two layout dialogs and the translations —
had no rule anywhere, except that the admin's own stylesheet dressed the translations for
the admin and for nobody else.

Every builder part is a `data-formancy-part` hook, the builders ship no CSS, and nothing
compared the two lists. A new pane was finished when it worked, and it worked unstyled.

## Decision

**`workbench.css` dresses every part either builder draws**, and a test holds it to that.
The parts are derived from the builders' sources rather than listed, so a part added to
either builder fails the test until the workbench says how it looks.

**An application recolours the workbench through its `--wb-*` tokens and does not dress
builder parts itself.** The admin's translation rules moved into the workbench, written in
its tokens; what stays in the admin is the one thing that is the admin's own, the white sheet
its translation preview renders a light-themed form on.

**One token more, `--wb-caution`**, for what costs something but not everything: a change
held for review that loses some answers already collected, and a translation still missing.
It had been the admin's hard-coded amber.

## Consequences

**A new pane arrives dressed or does not pass.** The person writing it writes the rules too,
in the workbench, in tokens.

**The test says a part is selected, not that it looks right.** A rule that selects a part
and gives it the wrong spacing passes. What it closes is the gap that produced this: a part
nobody had written any rule for.

**The admin's translations look slightly different.** Its colours were hard-coded and are
now the admin's tokens: the report on the panel colour rather than its own blue-grey, a
problem in `--wb-invalid` rather than a pink of its own.

**Applications that set the tokens get the new rules for free**, and one that does not set
`--wb-caution` gets the workbench's default amber, which is chosen for a light bench.

## Alternatives considered

**Each application dresses what it shows.** What the admin did for the translations, and why
the playground never had them: two copies of one pane's look, kept apart by nothing.

**Ship component styles inside the builders.** Rejected for the reason the renderers ship
none: the markup belongs to the host's design system, and the Angular starter recolours the
same workbench with Material's tokens
([0142](0142-the-angular-starter-is-dressed-in-materials-tokens.md)).

**Allow a part to go undressed with a reason in the test.** No part needed it: every one is
something a person reads or operates.
