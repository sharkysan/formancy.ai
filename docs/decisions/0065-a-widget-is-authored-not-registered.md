# 0065 — A widget is authored, not registered

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/widget.test.ts` (10 cases: each widget on the
  type it belongs to, a widget on a type that has no such presentation refused, an
  unknown name refused, a widget in a version 1 document refused *by name with the
  fix in the message*, a field with no widget exactly as valid as before, and two
  guards on the list itself — every name accepted by some type, and the set matching
  what was decided). `packages/spec/src/schema.test.ts` derives the widget gating
  from `formancy.schema.json` and compares it to `WIDGETS_BY_FIELD_TYPE`; adding a
  widget to one and not the other fails it, observed.

## Context

Three requests arrived as field types: a **toggle** (a switch rather than a
tick-box), a **datagrid** (a repeater shown as a table), and **autocomplete** (a
select you can type into). A fourth, **qrcode**, turns out to be two things, one of
which is a camera route to a string somebody could otherwise type.

None of them changes what is collected. A toggle stores `true | false | null` like
the checkbox it is; a datagrid stores rows carrying `_id` like the repeater it is; a
type-ahead stores one offered option value like the select it is. Adding them to
`FIELD_TYPES` would put four types in the format whose data is indistinguishable
from four that are already there.

**And a developer could already do all of it.** `registry.byType` and
`registry.byPath` swap the component for any field, per deployment, at no cost to
the format whatsoever.

So the first draft of this decision was that nothing needed to change, and it was
wrong twice.

**Wrong once about the reader contract.** The reasoning was that a presentation hint
is safely ignorable, so it could be added with no version move: an older reader
drops the property and renders the default control. Measured against the actual
validator, that is false. `formancy.schema.json` is closed at every level —
`additionalProperties: false` at the root, `unevaluatedProperties: false` on a field
— so a reader that has never heard of `widget` answers `Unknown property "widget"`
and refuses the **whole document**. Nothing renders and nothing is collected. That
is [0051](0051-spec-2-adds-types.md)'s loud failure rather than its silent one,
which is the better of the two, but a document carrying a widget is still not a
document of the older version.

**Wrong twice about who is choosing.** The registry answer solves this for anybody
who writes code, and the builder exists for people who do not. An author picking a
switch over a tick-box cannot register a component, and a choice only a developer
can make is not an authoring feature — it is a theming feature wearing one's
clothes.

## Decision

**`widget` on `FieldDef`: the author's statement of intent, in the document, with a
closed set of names gated per field type.**

```json
{ "key": "agree", "type": "checkbox", "widget": "toggle" }
```

Four names to begin with: `toggle` on `checkbox`, `datagrid` on `repeater`,
`typeahead` on `select`, `scanner` on `text`.

> **Amended by [0066](0066-a-widget-may-be-configured.md).** This record says below
> that a hint is a single name and anything needing more is a field type. The second
> half of that is wrong: a widget can carry configuration, and `datagrid` gained a
> `columns` array without becoming a type. The rule immediately following survives
> unchanged and is the one that mattered all along.

**The line, and it is the whole decision: a widget may change how a field looks and
may not change what it collects.** The moment a hint alters the stored value, the
validation, or what somebody is allowed to enter, it is a field type and belongs in
`FIELD_TYPES` with all the cost that carries. Every name above sits on a type whose
value shape it leaves exactly alone, and a test asserts the set rather than trusting
it.

**Closed, not an open string.** An open one would cost nothing to extend and would
be worth nothing: two renderers would guess differently at `widget: "togle"`, one
falling back silently and the other not, so a form would look right in the build
that knew the name and wrong everywhere else — with nothing failing anywhere.
Closed makes a typo an authoring-time error, and makes each new name a format
change. That is the price of the guarantee, paid deliberately.

**Gated per type through the mechanism that already existed.** The JSON Schema's
`if`/`then` branches already carry per-type properties, and
`unevaluatedProperties: false` already refuses a property no branch evaluated. So
`widget: "datagrid"` on a text field is refused with no new machinery — an author
who set it believes they configured a grid, and a document that validates is a
document nobody tells them about.

**`autocomplete` is deliberately not the name.** That word is owed to the HTML
autofill token, which WCAG 1.3.5 asks for and the spec still does not have. Spending
it on presentation would leave nothing to call the real thing, so the type-ahead is
`typeahead`.

**It lands in version 2, not version 3.** Version 2 has never been released: at tag
`v0.1.0` there is no `SPEC_VERSIONS` constant at all and `formancy.schema.json` pins
`"specVersion"` to `{ "const": "1" }`, so the published package refuses a version 2
document outright. There is therefore no pinned version 2 reader in existence, and a
construct added to version 2 before it ships costs nobody anything — no bump, no
`MIGRATIONS.md` entry, no reader locked out. Spending a version 3 on this would have
been paying a price that only exists after a release.

## Consequences

**`versionErrors` now gates a property, not only a type and a layout kind.** It was
described as one function long on purpose, and it stays one function, but the axis is
new. It had to be: `widget` is neither a type nor a kind, and a version 1 document
carrying one would otherwise validate here and be refused by every conforming
version 1 reader — which is the exact confusion the version line exists to prevent.
The message names the widget and says which version to move to, because the author
cannot see the reader that would refuse it.

**Two closed lists now describe one rule**, in `types.ts` and in
`formancy.schema.json`. That is the drift this repository keeps finding, so the
schema test derives the gating from the document and compares it to the code's map
rather than restating it. The dangerous direction is a widget the types allow and the
schema refuses — no, the reverse: one the schema allows and no renderer honours,
which validates and does nothing.

**A renderer that ignores `widget` is still correct.** Nothing breaks while the
renderers catch up, because the default control collects the right answer — which is
what makes this landable as spec work ahead of the React and Angular halves. It also
means the guarantee is weaker than it looks until both renderers honour each name,
and the conformance suite is where that gets settled: a `toggle` rendered as
`role="switch"` changes the accessible role, so it is not invisible to a suite that
queries by role and accessible name
([0034](0034-accessible-name-only.md)). That is renderer work with its own decision
to make, and it is deliberately not made here.

**The builder has to offer these.** Its property panel is generated from the spec's
JSON Schema, so the `enum` and its descriptions arrive there automatically — which is
why the descriptions in the schema are written for an author rather than for an
implementer.

## Alternatives considered

**Four new field types.** Rejected: four types whose data is indistinguishable from
four existing ones, and every one of them a permanent entry in a format that
[0051](0051-spec-2-adds-types.md) deliberately makes hard to add to, so that the type
list stays "something to think about rather than somewhere to put every idea".

**The registry alone, with nothing in the document.** The honest runner-up, and what
the format would do if the builder did not exist. Rejected because it makes a purely
visual choice available only to people who can write and deploy code, which is the
opposite of what a form builder is for.

**A document hint that a registry entry may override.** Rejected as two mechanisms
that can disagree: the same form would look different in two deployments by design,
and neither the author nor the operator could tell from the document which one won.
The registry still overrides the *component*; what it does not do is contradict the
author's stated intent silently.

**An open `widget` string.** Rejected above: it buys extensibility at the cost of the
only thing a hint is worth, which is that two readers agree what it means.

**`datagrid` as a layout construct instead**, extending the `table` layout node to a
repeater's rows. A real alternative, and better in one respect: layout is where
arrangement belongs, and it would let a print layout show a table while the web
layout shows blocks. Rejected for now because it needs `modelPathsForLayout` to offer
`items[].*` under a row-scoped node, which is a change to an invariant the layout
code rests on, for a result an author expresses identically either way. Worth
revisiting if a second row-arrangement request arrives.
