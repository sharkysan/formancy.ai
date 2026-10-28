# 0210 — A field a rule disables has nothing in it a person can operate, over every type and widget

- **Status:** accepted
- **Date:** 2026-10-28
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/react/src/control-id.test.tsx`, `packages/angular/src/control-id.test.ts` and
    `packages/angular/material/src/controls.test.ts`**, *under a rule that disables it, has nothing in
    it a person can operate*: every type the spec has, as its default control and as each widget
    it allows, drawn alone under a `disabled` rule, has no form control inside it that is not
    `:disabled`, no editable region, and nothing else a keyboard reaches that does not say
    `aria-disabled`; and drawn under the same rule's `false`, has something, so the check cannot
    pass by finding nothing. Watched failing before the change for React's radio group, rating
    and signature, Angular's radio group and signature, and the signature under Material, which
    hands it back to the default control — exactly the controls hazard B6a named, and no other.
  - **`packages/react/src/signature.test.tsx` and `packages/angular/src/new-types.test.ts`**, *a
    signature a rule disables*: a stroke on the surface stores nothing over a typed name, the box
    and Clear are disabled, and a rule landing mid-stroke keeps what was drawn before it and none
    of the rest. Each case watched failing in both renderers before the change.

## Context

The spec says a `disabled` rule "greys the field out while the expression is true. A disabled
field keeps its answer and stays visible." Nothing in the engine refuses a value set on a disabled
field — a host's `setValue` writes one — so what keeps the answer in a browser is the renderer
disabling everything it draws for that field.

Two renderers and Material each bind that by hand, element by element, and three controls missed
it. Found while making `0.7.0`, measured on 2026-10-20 in jsdom, and shipped knowingly in `0.7.0`
and `0.8.0` (hazard B6a):

- **A radio group** set `disabled` on none of its radios, in either renderer, so a click stored
  a choice on a field the form had made read-only. Material's radio group was disabled.
- **React's rating** is a radio group too, and put `disabled` on its `role="radiogroup"` element,
  a `div`, where the attribute disables nothing.
- **A signature's** typed box and Clear button were not disabled, and its drawing surface, which
  is not a form control, had pointer handlers that never asked: a stroke stored over a typed name,
  and Clear erased it — in both renderers and under Material.

The typeahead had been fixed the same way
([0177](0177-a-source-may-say-its-list-goes-on.md)), and the tag picker after it, each by a case of
its own. 0186 had already
shown the shape of the problem with the control id: a property every control must have, bound by
hand, missed by the ones nobody wrote a case for, and held for good only by a rule over the spec's
own list of types and widgets
([0186](0186-a-fields-control-id-names-its-group-or-its-control.md)).

## Decision

Every control disables everything it draws with its field, and a test in each renderer holds it
over every type and widget the spec has: under a `disabled` rule nothing inside the field is
operable — a form control not `:disabled`, an editable region, or anything else a keyboard reaches
without `aria-disabled`. Each radio and each rating radio carries `disabled`; the signature's box
and Clear carry it, its surface says `aria-disabled`, and its pointer handlers take no stroke on a
disabled field and no more of one already under way.

## Consequences

A type or a widget added later is held to `disabled` without anybody remembering to write its case,
in React, in Angular and under Material, as 0186 holds it to the control id.

**What it costs.** The check is copied into three test files, the same function each time, because
the packages share no test helper and adding one to `@formancy/conformance` would make it public
API; each copy names the others, and nothing compares them. And a host whose own test clicked a
disabled radio group and found the answer changed now finds it unchanged, which is the point.

**What it does not do.**

- **It sees what a keyboard reaches, not what only a pointer does.** A surface with no tab stop —
  the signature's — is invisible to it; the signature's own cases hold the surface, and a control
  added later that draws one is held by whoever writes its tests.
- **It sees what is drawn, not what is drawn later.** A list a typeahead or a tag picker opens is
  not drawn when the field is mounted disabled; their own cases hold a list open when the rule
  lands — the typeahead's in each renderer's `options-source` test (0177), the tag picker's in
  React's `tagpicker.test.tsx` and Angular's `new-types.test.ts`.
- **The engine still takes a value set on a disabled field**, so a host's `setValue` changes one.
  That is the spec's meaning — greyed out, keeping its answer — and the renderer is the guard for
  the person, not for the host.
- **jsdom dispatches a click to a disabled button's listener**, which no browser does, so the
  Angular cases assert the disabled elements and do not click them, as the tag picker's do.

## Alternatives considered

- **The engine refuses `setValue` on a disabled field.** One guard instead of one per control,
  and a host could not get it wrong either. Lost because the spec describes `disabled` as greying a
  field out, not as making it unwritable: a host filling a field it has locked — from its own
  records, say — would be refused, and every consumer's engine would change for a defect in three
  controls.
- **`disabled` on each radio group's `<fieldset>`**, as the matrix does, which disables everything
  inside it at once. Kept for the matrix; not used for the radio group or the rating, because the
  tick boxes already disable each box and the rating's group is a `div`, which a `fieldset` would
  change for every stylesheet written against it.
- **A case per control, as before.** It is how the three were missed.
