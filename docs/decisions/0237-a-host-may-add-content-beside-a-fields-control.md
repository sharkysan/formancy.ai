# 0237 — A host may add content of its own beside a select's or a typeahead's box, on the box's line

- **Status:** accepted
- **Date:** 2026-11-15
- **Deciders:** Daniel Bacher
- **Verified by:**
  - `packages/react/src/field-beside.test.tsx` and `packages/angular/src/field-beside.test.ts`,
    case for case: nothing drawn where the host gives nothing, every field's markup unchanged and
    the select and the typeahead drawn with the elements they had before; the box and the host's
    content in one row, the select's status and its error after the row, as rows of the field; the
    typeahead's anchor in the row, holding its box and its list alone, and its status outside;
    asked for by the select and the typeahead alone, never by a text field, a select whose source
    is missing or any of the four fieldsets; a row's select asked by the row's own path and drawn
    in that row; the field read by the content, through `useField` in React and the binding the
    template is given in Angular, which is live as the answer changes; no role, name or id on
    either part, and the controls' `aria-describedby` as it was; the host's button next in the
    keyboard's order after the select and after the typeahead; the place beside left empty, for a
    theme's `:empty`, where the host's content draws nothing; and the box kept, with the keyboard
    in it, while what is drawn beside it comes and goes. With the form providing no option every
    case but the unchanged one failed, nine in React and ten in Angular. Broken one at a time,
    measured 2026-11-16, the same in each renderer: a row drawn where the host gives nothing
    failed the unchanged case; the host's content drawn before the box, four (both rows, the row's
    select and the keyboard's order); a role on the row, the case that says it adds none. In React
    a space in the place beside failed the `:empty` case; in Angular the template given no binding
    failed four.
  - `apps/docs/src/themes.test.ts`, *every part the renderers emit is styled by every theme*: it
    failed once the renderers emitted `field-control-row` and `field-beside`, which no theme
    styled, and passed once all four did.
  - `apps/playground/src/two-renderers.test.tsx`, *what the playground, as a host, draws beside a
    field*, in both renderers: an Open beside the pickup point's typeahead and a Clear beside the
    country's select, each in the `field-beside` of a row whose first child is the box, unavailable
    with `aria-disabled` while its field is empty and the same button once it holds an answer; each
    doing what it says, the Clear keeping the keyboard as its field empties; the Clear unavailable
    beside a country that a rule added in the Schema view disables, and a press on it leaving the
    answer; and both named in the form's language. It failed before the demo, with no button named
    "Open the pickup point" in the React pane, and in the Angular pane with the React pane's demo in
    place and no `fieldBeside` given to the Angular preview (measured 2026-11-16); the language case
    before the names were the form's, with no "Abholort öffnen" in the React pane; and the disabled
    case while the Clear read its field's answer alone: available beside the disabled country in the
    React pane, then, with the React pane's Clear reading `disabled` too, in the Angular pane, and,
    with its press guarded by the answer alone, the country emptied.
  - `scripts/field-beside-browser-test.mjs`, in `pnpm test:browser`: on the playground in Chromium,
    with each theme on both sheets, left to right and right to left, at 1180 and at 390 pixels, and
    each row at rest, invalid and with the keyboard in it: the button is the box's height, at least
    44px wide, and touches the box at its inline end; the row is as wide as its field and casts what
    a lone text box casts, compared by the shadows each casts, nothing where a lone box casts nothing
    and Pop's hard shadow where it casts that, and neither the box nor the button casts one of its
    own; at rest and invalid the button's upper and lower edges, fill and shadow are the box's; and
    the pickup point's list, opened from the keyboard, lies within its box and is what the browser
    hits across it. Watched failing: with Dusk's row rules taken out, 32 checks, the height and the
    touching on every row; without the rules that carry an invalid field's mark across the button,
    64, in every theme; with Pop's row shadows named again for right to left, the row's shadow right
    to left, at rest (8 checks), with the keyboard in the row and invalid; with Pop's row shadow
    taken out, the row's shadow at rest, 16 checks, in both reading orders and at both widths (the
    check had passed any row that cast nothing until it compared what each casts); without the rule
    that keeps Pop's box from lifting inside its row, the box's own shadow and, with the keyboard in
    the row, the height and the touching; without a `z-index` on Pop's row with the keyboard in it,
    the tag picker's box drawn over the open list; with Blueprint's row positioned and its anchor not,
    the list outside its box; without Paper's button minimum, the 44px check, and with Paper's row
    narrowed to its content, the row's width (Dusk's button is 45px wide on its padding and icon
    alone, so taking its minimum away could not fail it); and without `fieldBeside` in the Angular
    preview, the check that both renderers draw their rows.

## Context

Formancy Data's host page draws, under every lookup of an open record, one text button for each
form the lookup's record opens in, "Open in Customers", through the field addition
([0233](0233-a-host-may-add-content-under-a-field.md)). Each takes a line of its own under the
field, after its error, and so reads as something of the form's rather than of that field's answer.
The shape a person reads as being about the answer in a box is an input group's button: on the
box's line, joined to it, sharing its edge and its height.

There was nowhere to draw one. The addition is a row of its own under the field. The host's browser
gate fails any rule of the host's own stylesheet that selects an element on the paper, so it cannot
lay a button out beside a box itself. And a component in the registry replaces a field's whole
component, so one that drew the built-in select and a button after it would put the button where no
theme joins it to the box.

## Decision

Each renderer takes `fieldBeside`, the sibling of `fieldAddition`: a function from a field's path to
the host's content, or to nothing; a React node in React, and in Angular a template, given the path
and the field's binding. The select, where it draws its box, and the typeahead draw what it gives
after the box, on the box's line: the box and the content are wrapped in
`data-formancy-part="field-control-row"`, and the content in `data-formancy-part="field-beside"`.
Only the box goes in the row. A field's status and error stay rows of the field, under it, and the
typeahead's anchor still holds its box and its list alone. No other control asks for it. Where it
gives nothing, nothing is wrapped and the field is drawn as without it. Every theme lays the row out
as one line and draws the box and what is beside it as one field.

## Consequences

**What it buys.** A host puts an action about a field's answer where the answer is, joined to its box,
without styling the paper: Formancy Data can draw a lookup's Open there, as an icon button, instead of
a line of text under the field. Each theme continues the control's own look across the button:
Blueprint's frame goes round both, Paper's underline runs under both, Dusk's fill covers both with a
hairline between them, and Pop's line and hard shadow go round the pair, the shadow cast by the row
and not between the two. Pop's row casts its shadow and lifts as a lone box in the theme does, in
both reading orders, and is not mirrored right to left: a shadow that is not inset is cast by the
theme's light, which does not move with the language, and `apps/docs/src/themes.test.ts` mirrors
only an inset one. An invalid field's mark runs across the button too. A button there is the
box's height and at least 44px wide; an `svg` in it is sized to the text and filled in the button's
colour, so a host's icon needs no styling of its own; and it is drawn unavailable alike as `:disabled`
and as `aria-disabled`, which a host uses to keep an unavailable button in the keyboard's order. On a
narrow screen the box shrinks and the button keeps its 44px. Content that draws nothing leaves the
place beside empty, which every theme hides, and the box keeps its own corners.

**What it costs.** Two controls draw it, the select and the typeahead, because a lookup is one or the
other. A text field, a select whose source the deployment lacks, which draws a sentence in the box's
place, the four fieldsets, which have no single box, and Angular Material draw none, and a host that
wants something beside one of those has nowhere to put it; the case that lists what asks holds the
text field, the missing source and the fieldsets to asking nothing. Each renderer writes the box once
and draws it either alone or first in the row, so a field the host gives nothing is drawn as before,
Angular's comments aside. But the two are different trees, so content for a path that had none, or
none for a path that had some, draws the box again and takes the keyboard from a person in it. A host
that has something to show only once the field holds an answer gives content that draws nothing until
then, which keeps the box; both bindings' documentation says so, and a case in each holds that this
keeps it. In React the function is called on every render of those two controls, so a host keeps it
constant. With the keyboard in it, Pop's row is lifted, which makes it a stacking context the
typeahead's list can rise only within, so the row is raised with it, or a later field's box is drawn
over the open list. The browser gate measures edges, fills, heights and shadows, which only approach
the judgement that matters, that the pair reads as one field; that is made by eye on the playground,
which is how Pop's right-to-left shadow and Blueprint's focus ring round three sides of its button
were found. It measures in Chromium alone, on the playground's form, and not a row under the pointer,
since a theme switched under a resting pointer is not reliably hovered again. And it draws no empty
place beside, so that every theme hides one, and the box then keeps its corners, is held by the rules
alone. Only a button there is dressed: a link or any other element a host puts beside the box is laid
out on its line and given none of the theme's look.

**What it does not do.** It is no part of the document: a form says nothing about it, and the spec and
the engine are untouched. It adds no role, no name and no id, and describes no control, for the
reasons the addition gives (0233): the content is the host's, and its buttons are named by the host,
an icon button by its `aria-label`. It disables nothing: the row is no fieldset, so a host's button
beside a field a rule disables stays operable, and one that changes the answer, as a Clear does, reads
the field's `disabled` first, as the playground's does, or changes a field the form has made read-only
(hazard B6a's residual: the engine accepts a value set on a disabled field).

## Alternatives considered

**Inside the box, at its end.** What was first asked for: a slot inside the control, every theme
keeping room for it at the end of the line in both reading orders. Rejected: a select's end is its
arrow, which each theme draws in the room it keeps there, and a typeahead's is where the person types
and where its list opens, so an icon there is crowded against either or drawn over it.

**A place beside every control, in the shared shell.** Rejected: the shell holds a field's label, its
control, its status and its error, so a row it drew round the control would put a status on the box's
line beside it, and every theme would join a button to every control's look, the fieldsets and the
multi-part controls among them, for no host that asks.

**A menu.** One button beside the box, opening the actions a host offers. Rejected: a menu part every
theme would dress, and a popup's keyboard model, for a host that has one action per field nearly
always; Formancy Data keeps the rarer second Opens of a lookup under the field, in the addition.

**The addition alone.** Already possible (0233), and the line of its own under the field that the
context describes.
