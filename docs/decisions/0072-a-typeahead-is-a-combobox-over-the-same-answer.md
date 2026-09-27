# 0072 — A typeahead is a combobox over the same answer

> **Numbered 0072, not 0071.** Two changes were built in parallel worktrees and both claimed
> 0071; the scanner merged first, so this one moved. Recorded because a decision record's
> number is cited from other documents, and a silently renumbered record is a broken link
> somebody has to chase.

> **One paragraph of this record was wrong, and it shipped.** The *Consequences* section
> said the popup takes its static position, "where the list would have been in the flow".
> That is true inside a block container and false inside a grid one, and every theme lays a
> field out with `display: grid` — where the static position of an absolutely positioned
> child is the container's own content-box origin. So the list opened **over its own label
> and box**, which is what it did in the playground until somebody looked at it.
>
> Measured there before the fix: the field's top edge 457px, an in-flow child would have sat
> at 537px, the popup sat at 459px. The control now renders a `typeahead-anchor` that wraps
> the box and the list and nothing else, and every theme positions the popup against it with
> an explicit offset.
>
> Recorded rather than edited away, because the mistake is the useful part: the claim was
> plausible, it was about CSS rather than about this repository, and **nothing could have
> failed on it** — jsdom has no layout, so no renderer test can see where a box lands. What
> replaced it is a structural contract that a test *can* hold: the anchor wraps the control
> (both renderer test files) and every theme positions that anchor and gives the popup an
> explicit offset (`apps/docs/src/themes.test.ts`). The decision itself — an editable
> combobox, no combobox library, no positioning library — is untouched.

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/react/src/typeahead-widget.test.tsx` and
  `packages/angular/src/typeahead-widget.test.ts` (24 cases each, deliberate
  near-copies): the plain select answering to role `combobox`, the required role
  properties while collapsed, `aria-activedescendant` absent rather than empty, no
  `aria-haspopup`, `aria-selected` on the chosen option and not on the arrowed-over
  one, the full keyboard route, blur with an unmatched query storing nothing, an
  emptied box clearing the answer, a byte-identical submission against the default
  control, and axe over all three states of the popup. The filter is
  `packages/spec/src/typeahead.test.ts` (12 cases), where both folding limits are a
  failing pair rather than a sentence: ß not folding to `ss`, and the Turkish dotless
  ı -- the second of those was claimed here as a test before it was one.
  `apps/docs/src/themes.test.ts` fails until every theme styles the four new parts
  and resolves every custom property it uses; `apps/playground/src/starter.test.ts`
  fails until the demo shows the widget.

## Context

[0065](0065-a-widget-is-authored-not-registered.md) named `typeahead` on a `select`
and deliberately did not build it: "a renderer that ignores `widget` is still
correct", because the default control collects the right answer. That is landable
spec work and it leaves the guarantee weaker than it looks — the property validated
and nothing happened, which is the documented-but-inert shape this repository has
shipped once already.

Two things had to be settled before a control could be written.

**Whether the accessible role changes.** Conformance may find an element only by role
and accessible name ([0034](0034-accessible-name-only.md)), so a widget that changes
the role changes every fixture holding that field. Measured in the `aria-query` this
repository already installs (5.3.2): `comboboxRole.relatedConcepts` lists `select`
with *the multiple attribute not set and the size attribute not greater than 1*, and
`elementRoles` maps that element to `combobox`. So a plain `<select>` already IS a
combobox, and an `<input role="combobox">` is found by the same query. No fixture
changes, and the first case in each renderer's test file asserts it rather than
trusting it.

**What it may do with what somebody types.** A select cannot hold `ital`. An editable
text box can, and the obvious implementation of "leave the field with a partial
query" is to keep the text — which would make the widget change what the field
collects, the one thing 0065 forbids.

## Decision

**An ARIA 1.2 editable combobox over a listbox popup, in both renderers, with no
combobox library and no positioning library.**

`<input role="combobox">` plus a `<ul role="listbox">` of `<li role="option">`. DOM
focus never leaves the text box; the arrowed-over option is named by
`aria-activedescendant`. The listbox element exists while the popup is collapsed,
because `aria-expanded` and `aria-controls` are required properties of the role and an
`aria-controls` pointing at nothing is an unresolvable IDREF.

`aria-autocomplete="list"` and not `"both"` — nothing is written into the box on the
person's behalf. No `aria-haspopup`, which `listbox` already is implicitly.
`aria-activedescendant` **absent** rather than empty when nothing is active, and
`aria-selected` on the **chosen** option only: where the person is looking and what
the form holds are two facts, and a control that conflated them would tell a screen
reader the answer had changed on every press of Down.

**Nothing the person types can be stored.** `setValue` is reached from two places in
each control, with an option's own value or with `null`. So: Escape abandons the query
and keeps the answer; blur with a partial or unmatched query stores nothing and the
box goes back to showing the answer; and an emptied box clears the answer to `null`,
because a select's empty first option means un-answering is always available and a
widget may not take that away.

**The filter is one function in `@formancy/spec`**, `narrowOptionsByLabel`, folded
with `normalize('NFD')` and `\p{M}` stripping. It reads the **label only**, because
the value is not on the screen and matching it would behave on data the person cannot
see; it matches anywhere in the label; and it returns the **document's order**, never
a ranking, because re-ranking moves the row somebody is already reaching for.

## Consequences

**What it buys.** The widget is honoured rather than merely valid, in both renderers,
with no change to what any form collects and no change to any conformance fixture. An
author picking a type-ahead in the builder gets one, and a select with thirty options
stops being a scroll. The filter cannot agree in React and disagree in Angular,
because there is one of it.

**What it costs.** Measured on this change: 225 added lines in
`packages/react/src/form.tsx` and 243 in `packages/angular/src/fields.ts` — keyboard
handling, ARIA and markup written twice — plus a block in each of the four themes, for
a control every component library ships. That is the standing cost of the headless
claim, paid again here. The two test files are near-copies on purpose: a shared helper
would report that both renderers implemented this when one had not, and a renderer's
markup is exactly the thing that must not be shared.

~~The popup is positioned in CSS with `top: auto`, so it lands where the list would have
been in the flow and overlays rather than pushing the form down.~~ **Wrong, and see the
note at the top.** The popup is positioned against an anchor that wraps the box and the
list, with an explicit `top: 100%`. With no positioning library there is still **no
collision detection**: a list opened near the bottom of the
window runs past it and the page scrolls instead of the popup flipping above the box.
The active option is **not scrolled into view**, so a long narrowed list can hold the
active row outside the visible part of the popup — the popup's own `max-height` limits
how badly, and it is a real gap.

**What it forecloses.** Nothing in the format. It does not deliver `optionsSource`
(remote options) or a multi-answer tag picker; both are still absent from the spec, and
this control renders a list the document already carries. The filter is folding and not
collation, so `strasse` does not find `Straße` and the Turkish dotless `ı` folds the
Latin way — recorded as passing tests rather than as a sentence, because a limit with
no case attached is a limit somebody removes by accident.

And one thing it does not cover: a component registered through `registry.byType` can
store whatever it likes. The structural guarantee here is about the controls this
repository ships, not about the mechanism.

## Alternatives considered

**A combobox library** — Downshift, Headless UI, an ARIA pattern package. The honest
runner-up, and rejected on the same grounds as the QR encoder in
[0070](0070-a-code-is-an-arrangement-not-a-field.md): it is a runtime dependency in
both renderers, a SOUP row for every consumer, and two different libraries for the two
renderers, which is two behaviours to keep in step rather than one. The ARIA pattern is
also the thing being claimed, so buying it would mean the claim rests on somebody else's
release notes.

**A floating-element library** for the popup (Floating UI). Rejected for now: it buys
collision detection and nothing else here, and a `position: absolute` list inside the
field is correct until the viewport runs out. Worth revisiting when somebody reports the
list running off a short window, which is the report this paragraph exists to be
answered by.

**`role="switch"`-shaped thinking — changing the role to `listbox` or a custom
pattern.** Rejected exactly as in 0065: the role is what conformance finds a field by,
and a widget that changes it changes the fixtures. Staying a combobox is what keeps the
suite untouched.

**Ranking matches by quality**, or matching prefixes only. Both rejected: prefix-only
makes `land` find nothing while Switzerland and Deutschland are on the screen, and
ranking moves the row under the pointer between keystrokes.

**Storing the typed text when it matches nothing**, or refusing to leave the field until
it does. The first breaks 0065 and produces submissions no reader can validate; the
second is a keyboard trap (WCAG 2.1.2) and would be worse.

**One shared control in a package both renderers import.** Rejected: the markup is the
renderer. A shared component would be a third renderer, and the agreement it reported
would be agreement with itself.
