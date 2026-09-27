# 0066 — A widget may be configured, and `datagrid` stays one

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/datagrid.test.ts` (12 cases). Three of them
  guard the decision itself rather than the feature: `datagrid` must not appear in
  `FIELD_TYPES`, `CONTAINER_FIELD_TYPES` or `LIST_VALUED_FIELD_TYPES`, so promoting
  the widget to a type fails them. The rest cover the columns: optional, ordering a
  subset, refused when naming a field the grid does not have, refused when two
  columns claim one field, a width that is a ratio and not a CSS length, a width of
  zero refused, and `columns` refused on a repeater with no `datagrid` widget and on
  a type with no rows at all.

## Context

[0065](0065-a-widget-is-authored-not-registered.md) put `datagrid` in as a widget on
a repeater, because it stores exactly what a repeater stores. It also drew a line: a
widget is a single name, and anything that needs more than a name is a field type.

Then the columns needed configuring — which child fields appear, in what order, how
wide, aligned which way. By that line, `datagrid` had to become a type: a name cannot
carry an object.

**So it was built as a type, and the build is what refuted the argument.**

Two things came out of it. First, the premise is simply false: the document schema
gates a property on `widget: "datagrid"` exactly as readily as on `type: "datagrid"`,
using the same `if`/`then` branch and the same `unevaluatedProperties: false` that
refuses it everywhere else. The coupling is enforceable either way, so "a name cannot
carry an object" was never the real constraint.

Second, and this is the part that settled it, the type version **produced a defect
while being written**. `walkFields` opens a row scope so the nesting rule can refuse a
repeater inside a repeater — the engine has no answer for what a row index means two
levels of repetition deep. It opened that scope on `field.type === 'repeater'` alone.
Correct for every type that existed when it was written; wrong the moment a second
type held the same row model, and a `datagrid` nested inside a `repeater` walked
straight through it.

That defect was caught only because the four forbidden pairs had been written as a
test first. The class of it is unbounded: `CONTAINER_FIELD_TYPES`,
`LIST_VALUED_FIELD_TYPES`, the nesting guard, CSV column unioning across versions,
server-side replay — every one a place where two types holding one value shape can
quietly disagree, each needing both names named forever.

## Decision

**A widget may carry configuration. `datagrid` stays a widget on `repeater`, and a
`columns` array is gated to it.**

```json
{
  "key": "lines",
  "type": "repeater",
  "widget": "datagrid",
  "columns": [
    { "field": "item", "width": 3 },
    { "field": "qty", "width": 1, "align": "end" }
  ],
  "fields": [ "…" ]
}
```

**0065's line moves, and here is where it now sits.** Not "a widget is one name" —
that was a proxy. The real rule is the one 0065 gave in the same breath and is
unchanged: **a widget may change how a field looks and may not change what it
collects.** Columns decide which answers appear where. They never decide which
answers exist, which is why a field left out of the list is still collected and still
shown, appended after the configured columns. A column list is an ordering, not a
choice of which answers to keep.

**One row model, one type.** The repeater's semantics stay in one place, and every
rule about repeating rows keeps naming one type.

**Three assertions guard the reversal, not the feature.** `datagrid` absent from the
three type lists. Somebody promoting the widget later has to delete a test that says
why not, which is the cheapest available way to make the argument survive.

**`width` is a unitless ratio, and zero is refused.** A CSS length in a document is
the format deciding the consumer's design system for them — the thing this project
exists to avoid — and a fixed length is one no renderer can honour on a narrow
screen. Zero is refused rather than read as hidden, because a column nobody can see
still holds a field that is collected and required-checked, which is the same harm as
a field left out of the only layout a form uses.

**`header` shortens the heading without renaming the question.** The field's own
label remains what a screen reader announces for the control in the cell. A visible
column heading becoming the accessible name of every answer beneath it is the
failure this separation prevents.

## Consequences

**`columns` is refused without the widget**, by `unevaluatedProperties: false` rather
than by a rule of its own — the property is only evaluated inside the branch that
matches `widget: "datagrid"`, so it is unknown everywhere else. The type version
would have enforced that coupling structurally; this enforces it with no new
machinery, which is the same guarantee for less surface.

**Two rules the schema cannot express live in `validate.ts`**: a column naming a
field the grid does not have, and two columns claiming one field. Both compare a
column against its siblings, which a JSON Schema branch cannot do. The first is the
likeliest authoring mistake there is — rename or delete a child field and leave the
arrangement behind — and without the rule it shows an empty column, which reads as a
field that collects nothing.

**The renderers now have something real to do.** A `datagrid` widget with no grid
control is a repeater that ignores its columns, and a form is still correct while
that is true because the default control collects the right answer. It is not
cosmetic work: a table of inputs has to keep every cell reachable by role and
accessible name ([0034](0034-accessible-name-only.md)), and a row count must not
become part of the accessible name of every field inside it.

**Row reordering is still missing, and a grid makes it conspicuous.** The engine has
`addRow` and `removeRow` and no `moveRow`; `layout.tsx` says rows do not reorder while
a form is being filled in. Rows already carry a stable `_id`, so the data model is
ready. In a stacked repeater that absence is tolerable; in a table it is the first
thing somebody reaches for. Recorded here rather than fixed, because it is an engine
method plus a keyboard route in both renderers and belongs with the grid control.

**A stale message was fixed in passing.** The nesting error said "in version 0 of the
spec" long after the spec reached 2. It names no version now: which version forbids
it is not what the author needs, and a number in a message goes stale silently.

## Alternatives considered

**`datagrid` as a field type with `columns`.** Written, tested to 15 green cases, and
discarded. It reads better in a palette and makes the coupling structural, and it
costs a duplicated row model in perpetuity — the defect above is the evidence, not the
prediction. Kept as the runner-up because if a grid ever needs a *value* a repeater
does not have, this becomes the right answer immediately.

**`columns` on the repeater with no widget required**, treating the presence of
columns as the request for a grid. Rejected as a second way to say one thing: two
documents that mean the same arrangement, one of which no renderer can recognise as a
grid request without inspecting a property it may not understand.

**A `table` layout node over a repeater's rows**, which 0065 named as the thing to
revisit. Still the most principled home for arrangement, and still rejected for the
same reason: it needs `modelPathsForLayout` to offer `items[].*` under a row-scoped
node, which changes an invariant the layout code rests on, for a result an author
expresses identically either way. The difference now is that `columns` would move
there wholesale rather than being reinvented, so the revisit got cheaper rather than
more expensive.

**Per-column `footer: "sum"`.** Deliberately not included. A total is a computed value
shown to a person, and computing it belongs to the engine under a frozen clock and
CEL's rules, not to a presentation array — `computedValue` already exists for values
that are derived. Adding it here would put arithmetic in the arrangement.
