# 0211 — A tag picker is one control, and every id a field names is drawn

- **Status:** accepted
- **Date:** 2026-10-28
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/core/src/props.test.ts`**, *a list of ticks drawn as a tag picker*: required, it
    carries `aria-required` and names no hint; drawn as boxes, it is a group, and names its hint
    instead. The first case failed before the change.
  - **`packages/react/src/tagpicker.test.tsx` and `packages/angular/src/new-types.test.ts`**, *a
    required tag picker*: sent empty, its box says `aria-required="true"` and every id its
    `aria-describedby` names is on the page. Each failed against the engine before the change.
  - **`packages/react/src/control-id.test.tsx`, `packages/angular/src/control-id.test.ts` and
    `packages/angular/material/src/controls.test.ts`**, *required, described and sent empty, names
    no id that is not drawn*: every type the spec has, as its default control and as each widget
    it allows, made required, given a description and sent empty, has no element inside it whose
    `aria-describedby`, `aria-labelledby`, `aria-controls`, `aria-errormessage`,
    `aria-activedescendant`, `aria-owns` or `for` names an id no element carries. Watched failing
    before the change on the tag picker in React, in Angular and under Material, and on eight
    controls under Material — the text, the paragraph, the number, the date, the time, the select,
    the checkbox and the toggle — and on nothing else.

## Context

The engine composes every id a control points at — the hint, the description, the count, the
error — and the renderer draws the elements that carry them
([0021](0021-engine-owns-aria.md)). Two of those had come apart.

**A required tag picker said nowhere that it was required.** The engine decided whether a field is
a group from its type alone, and a `selectboxes` is one: several boxes answering one question,
where `aria-required` is not supported, so a group says it is required through a hint its renderer
draws inside its fieldset. A tag picker is a `selectboxes` drawn as one combobox, with no fieldset
and no hint. So its box carried no `aria-required` and pointed at a hint nothing drew: neither a
screen reader nor a theme, which marks a required single control by `aria-required`, said the field
was required. Measured on 2026-10-20 in both renderers; every release since `0.3.0` drew it so, and
`0.7.0` and `0.8.0` shipped it as a known defect (hazard D4).

**Under Material, eight controls drew no description.** Spec 5's `description` is drawn under the
question by the default controls, and by Material's radio group and list of ticks; Material's form
field controls and its checkbox pointed `aria-describedby` at the description's id and drew no
element carrying it. The help text was not on the page, and a screen reader was told to read an
element that did not exist. `0.8.0`'s changelog said the description was "drawn under the question
by both renderers and Material". Found by the rule below, on 2026-10-28, after `0.8.0` was
published.

Nothing held a control to drawing what its ARIA names. 0186 and 0210 had each shown that a property
every control must have, bound by hand, is missed by the controls nobody writes a case for.

## Decision

A `selectboxes` drawn as a `tagpicker` is one control: `buildFieldProps` does not count it as a
group, so a required one carries `aria-required` on its box and names no hint — decided in the
engine, once, for every renderer. Material draws the description under each of its form field
controls and its checkbox, as a paragraph at the engine's id outside the form field, where it draws
the character count.

And a test in each renderer, and under Material, holds every type and widget to it: made required,
described and sent empty, nothing inside a field names an id that is not drawn.

## Consequences

A control added later, or a design system's, that names an element it does not draw fails a test
in the renderer it is added to.

**What it costs.** The check is copied into three test files beside 0210's, the same function each
time, for 0210's reason: the packages share no test helper, and a shared one would be public API of
`@formancy/conformance`. A host's own test that found a required tag picker's hint by its id finds
nothing now, and one asking for `aria-required` on it finds it.

**What it does not do.**

- **It checks that a named id exists, not that it is the right one.** A control naming another
  field's description passes. The engine composes the ids, and each renderer's own cases hold what
  they say.
- **It checks what is named, not what should be.** A signature's typed box carries the control id
  and `disabled` and names nothing, so the field's error is not read with it; that is recorded in
  arc42 §11 and is a change of its own.
- **Material's description sits outside its form field**, so it is not inside the element carrying
  the field's path, as the count is not. A tool that reads a field by that element misses it.

## Alternatives considered

- **Draw a required hint in the tag picker.** The box would point at something, but it would say it
  is required the way a group does, in its description, where a combobox says it with
  `aria-required` — and a theme marks a single control by that attribute. It is one control.
- **Material's `mat-hint` for the description.** It is what Material offers for help text, and
  Material adds a hint's id to the box itself. Lost because Material hides a hint while an error
  shows, where the default controls keep both, and because the engine already names the
  description — the reason the count is drawn outside the form field too (0203).
- **A case per control, as before.** It is how both were missed.
