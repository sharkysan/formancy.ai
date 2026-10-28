# 0186 — A field's control id names its group or its control, and focus moves into the group

- **Status:** accepted; the signature's typed box carrying the id alone and keeping its own name,
  superseded in part by [0212](0212-a-signatures-box-says-what-its-field-says.md); the way to a field it
  left unexported, decided by [0213](0213-a-host-can-take-a-person-to-a-question.md)
- **Date:** 2026-10-20
- **Extends:** [0021](0021-engine-owns-aria.md), which fixed a real `fieldset` and `legend` for a
  radio group in both renderers and left which element carries the field's id to each, and
  [0132](0132-material-draws-what-it-has-an-equivalent-for.md), whose `focusControl` moves focus
  into a host that cannot take it
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/react/src/control-id.test.tsx` and
  `packages/angular/src/control-id.test.ts`, near-copies with the same case names, nine of them
  on the three fields: the element `ids.control` names is the radio group's group and the tick boxes' group, each found by
  its legend, while each option keeps `<control id>:<value>`, and a signature's box its name is
  typed into, which the field's label points at; the error summary's link to each of the three,
  required and left empty, takes focus to the first radio, the first box and the typed box; and
  a failed submit without a summary does the same when that field is the first invalid one.
  `packages/angular/material/src/controls.test.ts`, *a group of radios and a group of ticks,
  under the engine's control id*, holds Material's two groups to the same in five cases. Every
  one of the twenty-three failed before the change, on `null` where the group or the box
  belonged, or on focus left on the link, the summary or Submit. Eleven mutations were each
  caught by the cases meant for them: the id taken off each of the eight elements that carry it
  across the two renderers and Material; moved to React's first radio, which only the case on
  the radios' own ids catches; and the radio group's fieldset made focusable with
  `tabindex="-1"` in each renderer.
  The rule itself is held beyond the three, over the spec's own lists: *every field drawn with a
  control* in each renderer's `control-id.test`, and *every field, under Material, under the
  engine's control id* in Material's `controls.test.ts`, draw each type in `FIELD_TYPES` that has
  a control, as its default control and as each widget `WIDGETS_BY_FIELD_TYPE` allows it, and
  hold that exactly one element carries the id and that `focusControl`, given that element, puts
  focus inside the field. A type added without an entry in their tables does not compile, and a
  widget added to the spec is drawn with no edit. With the change taken out they failed on the
  radio group, the tick boxes and the signature in each renderer and on the two groups under
  Material, and on nothing else; the radio group's id moved to its legend, or given to its first
  radio as well, each failed its case in React.
  `packages/{angular,react}/src/focus-control.test.ts` hold the move into a host that cannot
  take focus, as 0132 records.

## Context

The engine mints `ids.control` for every field ([0021](0021-engine-owns-aria.md)), and three
things move focus by it: each link in the error summary, a failed submit when the page has no
summary (`useSubmit`, `injectSubmit`), and a host holding a field's snapshot. A field drawn as
one control carries the id on that control. A field answered by several carries it on the group
around them — the rating's `role="radiogroup"`, the ranking's and the matrix's fieldsets, and
since [0184](0184-a-repeater-is-validated-as-a-field-is.md) the repeater's — and `focusControl`,
finding that the group did not take focus, moves it to the first control inside
([0132](0132-material-draws-what-it-has-an-equivalent-for.md)).

Three fields were left out, in both renderers and, for the two groups, in Material. The radio
group and the set of tick boxes drew their fieldset with no id and each option with
`<control id>:<value>`; the signature drew the box a name is typed into with no id. So no
element had the field's id. The summary's link named the field and did nothing: its handler
prevents the browser's own jump to the anchor and found nothing to focus, so focus stayed on
the link and the page did not even scroll. A failed submit whose first invalid field was one of
them left focus on Submit. A host's lookup by the id returned `null`, and the signature's label,
whose `for` is the control id, named nothing. Found on 2026-10-20 while building a page that
moves focus to a field by its id; measured in React against the published `0.6.0`, and in all
three renderers by this record's tests, before the change, on source that is `0.6.0`'s.

No record left them out on purpose. Each group that had the id put it on itself without a
record saying so, which is how three were missed: the next group had nothing to be held to.

## Decision

**Every field drawn with a control has an element carrying its control id**: the control, when
it is one; the group, when the field is answered by several. The radio group's and the tick
boxes' fieldsets carry it, in both renderers and in Material, and every option keeps the id it
had, `<control id>:<value>`. A signature carries it on the box its name is typed into, the one
part of it a keyboard can use; the field's label, which already pointed at the id, now labels
that box, and the box's name stays its own words, since `aria-label` outranks a label.

Focus into a group goes through `focusControl`, unchanged: a group takes no focus, so focus
moves to the first control inside. For a `required` error, which means nothing is chosen, that
is the first option — where GOV.UK's error summary sends a radio or checkbox question.

## Consequences

**What it buys.** The error summary's link and a failed submit land in all three fields, in
both renderers and in Material, as they did in every other. One rule now covers every field
drawn with a control, and a test holds it rather than a memory: in each renderer and under
Material it draws every type the spec has and every widget it allows each, and fails one that
draws no element with the id, draws two, or puts the id where focus cannot follow. It draws each
once, in its smallest shape and in a deployment that takes uploads, so a field drawn otherwise
only under a property — options from a source — is held only where a case of its own draws it.

**What it costs.** A host's own `focus()` on a group's id does nothing, because a fieldset takes
no focus. A host moving focus by the id has to do what `focusControl` does — focus the element,
and if focus did not land, the first control inside — and `focusControl` is not exported, nor
the `formancy-reveal` event it sends so that a layout's tab opens first. Exporting a way to a
field is a separate decision about the packages' API, and no record calls for it yet; until
one does, the id names the field and the host finds the control.

Focus lands on the first option whatever the error. A group that holds an answer and is
refused by a `validate` rule takes focus to its first option, where Tab would have entered at
the chosen one.

The signature's box is named by its own words, *Type your name*, and not by the field's
label: the visible label now labels a box whose name does not contain it, which WCAG 2.5.3,
Label in Name, counts as a failure (F96). Before, the label labelled nothing and the box had the
same name; what changed is that the markup now says the label is the box's. No axe rule reports
it, measured in React: not the set formancy runs, and not axe's experimental
`label-content-name-mismatch`, which finds nothing on the page it applies to. Naming
the box after the field is a change of accessible name that the tests and the conformance
drivers find it by, and is left for a change of its own. A host's tests meet it too:
`getByLabelText('Signature')` found the drawing surface, by its `aria-label`, and now finds the
box as well and throws on two, measured in both renderers.

**What it does not do.** The typed box still carries only its id: not `aria-required`, not
`aria-invalid`, and not the error in `aria-describedby`, so a screen reader landing there from
the summary hears the box and not the problem; and it is not disabled with the field, so a
signature a rule disables still takes a typed name, measured in both renderers and under
Material, which draws the default signature. Spreading the field's `controlProps` on it would do
all four, and the last changes what a disabled field takes, which is a fix of its own. And a
field drawn with no control — a file field in a deployment that takes no uploads, a select whose
options come from a source the deployment does not have — draws a sentence in its place, so its
id names nothing and its summary link still does nothing; measured in both renderers and under
Material on 2026-10-20, and outside the test that holds the rule, which supplies an uploader and
gives every list its options.

## Alternatives considered

**The first option carries the control id.** A host's plain `focus()` would then work. Rejected:
one option's id would differ from its siblings', the ids hosts may already hold would change
([0021](0021-engine-owns-aria.md) makes them a public surface), and it breaks the shape the
rating, the ranking, the matrix and the repeater already have.

**The chosen option carries it.** Rejected: the id would move from one element to another as
the answer changes, which is the opposite of a stable public surface.

**`tabindex="-1"` on the fieldset.** Focus would land on the group and its legend would be
announced. Rejected: the person then needs one more Tab to reach an option, a click on the
group's padding would focus it, and no other group in either renderer does it.

**The signature's id on its drawing surface or on the element around it.** Rejected: the
surface is a named picture, not a control, and a keyboard cannot draw; the element around both
takes no focus, so a host's `focus()` would reach nothing, and a label's `for` may only name a
control.

**Exporting `focusControl`, or a `focusField(path)`, in this change.** Left out rather than
rejected: it is an API with questions of its own — the reveal event, what a hidden or
not-drawn field answers — and this change is the markup that any such call needs first.
