# 0074 — A table child may span

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/validate.test.ts` (6 cases: `all` and a number
  accepted, a span wider than the table refused *naming the count*, a span outside a table
  refused, a nested table spanning its parent accepted, and a document with no span exactly
  as valid as before). `packages/react/src/layout.test.tsx` and
  `packages/angular/src/layout.test.ts` (3 cases each: only the spanning node is wrapped,
  the number reaches `--fm-span` and `all` carries none, and no control's accessible name
  changes). `apps/docs/src/themes.test.ts` fails if a theme leaves `layout-cell` unstyled,
  and separately if its narrow-screen reset comes before the rule it has to beat —
  inverted and observed, because that was the bug.

## Context

A rich text editor and a file dropzone sat in a two-column `table` layout in the
playground, and somebody looking at the running page asked whether they should be full
width. Measured: **266px, against 548px for a field in the flow** — an editor with a
toolbar, and a drop target, in half a column.

The first answer was to move them out of the table, and that answer was wrong. Not because
it looks bad — it looks fine — but because **a `table` node carries its own `label`, and
that label names a real group.** A field placed outside the table to get the width is
outside that group too. "Put the wide thing outside" is not a workaround with a cost; it
is a layout the format could not express at all.

Every grid system anybody arrives from — CSS grid itself, Bootstrap, Material — has
spanning. Its absence reads as an omission, and it was one.

**The window is open and closes at the first release.** The schema is closed
(`unevaluatedProperties: false`), so a new property is a spec change. Spec 2 has never been
released: at tag `v0.1.0` there is no `SPEC_VERSIONS` constant and the schema pins
`specVersion` to `{ "const": "1" }`. So this lands in version 2 now, or in version 3 later
— the argument [0065](0065-a-widget-is-authored-not-registered.md) made for widgets.

## Decision

**`span?: number | 'all'` on a layout node, meaningful only inside a `table`.**

**On the node, not on the table.** The alternative was a parallel array on the table,
index-aligned with its children. Rejected for the reason [0066](0066-a-widget-may-be-configured.md)
gives for naming a field rather than counting positions: an index-aligned array is a second
list to keep in step, and the thing it describes is a property of the child.

**`'all'` as well as a number, and `'all'` is the one to reach for.** An author who writes
`span: 2` in a two-column table and later makes it three columns has silently lost the full
width. `'all'` is what they meant and it survives the edit. It is also the same `1 / -1`
the table's own heading already uses.

**Refused outside a table, and refused wider than the table.** A `span` that validated and
did nothing is the documented-but-inert shape this format has shipped once already, and an
author who writes 4 in a two-column table believes they configured something. The message
names the actual column count and points at `'all'`.

**A cell only where one is needed.** The renderers wrap a spanning node in
`data-formancy-part="layout-cell"` and leave every other node exactly where it was — a
direct child of the container. A form that uses no span has the markup it had before this
existed. The cell is the grid item because the node's own element is produced further down
(a control, a nested table, a code) and a renderer cannot reach into a component a consumer
registered.

**Two channels for one fact**, and the reason is arithmetic: `data-span` is the authored
value, which a selector can match, and `--fm-span` is the same number where CSS can *count*
with it, because `grid-column: span attr(data-span)` is not a thing. `'all'` needs no
number.

## Consequences

**The reflow has to win, and the cascade decides that by order.** At one column a numeric
span must stop spanning, or it creates an implicit second column and the page scrolls
sideways — the WCAG 1.4.10 reflow the media query exists for, undone by a feature written
after it. The reset and the rule it beats weigh the same, so the reset must come **later**
in the file. The first version of this had it earlier and the reset was dead. Measured at
320px before and after: `span 2` computed `span 2`, then `auto`. There is now a guard on
the order, and it was inverted and watched to fail.

**`'all'` deliberately keeps its own rule through the reflow.** `1 / -1` is one column when
there is one column, so it needs no reset and does not get one.

**An inline `style` attribute, for the first time in either renderer.** It carries
`--fm-span` and nothing else. Under a strict `style-src` a consumer loses the numeric span
and keeps `'all'`, because `'all'` is a selector — so the common case degrades to correct
rather than to broken. Noted here rather than discovered.

**It does not reach `row`.** A `row` node has no column count to span, and giving it one
would make it a table under a second name. A `span` on a row's child is refused like any
other span outside a table.

## Alternatives considered

**A `cell` layout kind holding the span.** One new union member instead of a property on
five, and the "only in a table" rule becomes structural rather than validated. Rejected on
authoring cost: `{kind:'cell',span:'all',children:[{kind:'field',path:'message'}]}` says in
three nodes what `span: 'all'` says in one property, and the builder's generated panel
would edit a wrapper rather than the thing somebody selected.

**Leaving it out and telling authors to place wide fields outside the table.** The status
quo, and the answer this record was written to retract. It cannot express a wide field
under a table's own heading, which is the case that prompted it.

**`span` as a CSS length or a percentage.** Rejected on the same ground `DataGridColumn.width`
was: a length in a document is the format choosing the consumer's design system for them,
and no renderer can honour it on a narrow screen.

**A `full: true` boolean instead of `'all'`.** Simpler to read and strictly less
expressive: it cannot say "two of three", so a second property would follow it within a
release.
