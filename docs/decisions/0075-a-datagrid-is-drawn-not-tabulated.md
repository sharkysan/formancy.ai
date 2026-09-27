# 0075 — A datagrid is drawn, not tabulated

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/react/src/datagrid-widget.test.tsx` and
  `packages/angular/src/datagrid-widget.test.ts` (9 cases each, deliberate near-copies).
  The first is the one that matters: every control's accessible name, computed by
  `dom-accessibility-api`, equals its name in the same schema rendered **without** the
  widget, element for element. Shown to fail by turning a column heading into a label —
  `"Item name"` became `"Item name Item name"`. The rest cover the six parts, the ratio
  channel, a column for every answer, a heading that names nothing, alignment on the
  cell, a constant cell count per row, and a tab-stop count identical to the block
  rendering. `packages/spec/src/datagrid.test.ts` holds the shared column plan.
  `apps/docs/src/themes.test.ts` fails until every theme styles all six parts, and
  `apps/playground/src/starter.test.ts` fails until the demo shows the widget — its
  exception list is now **empty**.

## Context

`widget: "datagrid"` was named in [0065](0065-a-widget-is-authored-not-registered.md) and
configured in [0066](0066-a-widget-may-be-configured.md), and no renderer honoured it: a
repeater carrying it rendered as stacked blocks, exactly as if the widget were absent. It
was the last widget in that state, and the playground recorded it as such.

The question a grid of form controls turns on is **what the container should be**, and it
is an accessibility question rather than a styling one.

## Decision

**Generic elements and CSS grid. Not a `<table>`, and not `role="grid"`.**

**Not a table, and the reason is measured rather than argued.** Against the
accessible-name implementation this repository installs:

| markup | the control's accessible name |
|---|---|
| `<th scope="col">Qty</th>` over a `<td>` holding an unlabelled input | `""` |
| the same, with `headers="h1"` on the cell | `""` |
| a `<label>` clipped with `position: absolute; clip-path: inset(50%)` | the label's text |
| a label hidden with `display: none` or `visibility: hidden` | `""` |

**A column heading names nothing.** So every cell control keeps its own `<label>`
whatever the container is — at which point the table has earned nothing and still owes
`td-has-header`, `th-has-data-cells` and a header echo on every cell. What it would have
bought is table-reading mode: coordinates, and the heading announced on cell navigation.
That is a real loss and it is recorded below rather than waved away.

**Not `role="grid"`, for the reason `toggle` is not `role="switch"`: a role is not
paint.** Beyond that it takes the arrow keys, and the arrow keys are already owned cell by
cell — Up and Down change a `<select>`'s answer, Left and Right are the caret, and a
`select` with `widget: "typeahead"` claims Up, Down, Home, End, Enter and Escape inside a
cell ([0072](0072-a-typeahead-is-a-combobox-over-the-same-answer.md)). Two keyboard owners
in one element is not a contract anybody can write down. It would also replace twenty tab
stops with one, and a composite that keeps Tab needs a discoverable exit (WCAG 2.1.2)
which Escape and Enter are not free to be.

**Six parts**, and the container emits the cells rather than the children: `datagrid`,
`datagrid-head`, `datagrid-heading`, `datagrid-row`, `datagrid-cell`, `datagrid-actions`.
A cell is emitted **even when everything in it renders nothing**, because a rule that
hides one answer must not shift that row's remaining columns out of line with the heading
strip and with every other row. The buttons share one cell, because a row has two at the
ends and three in between, and no column track can hold a varying count without
announcing a blank.

**The ratios travel as one custom property**, `--fm-datagrid-columns`, and the count as
`data-columns`. A property rather than an enumerated attribute because `width` is a
`number` with `exclusiveMinimum: 0` — `1.5` is legal and nothing bounds it from above, so
no attribute could enumerate the value space. A property rather than
`grid-template-columns` because a property lays nothing out on its own, so the theme's
narrow-screen media query replaces its own declaration and wins.

**The column plan is one function in `@formancy/spec`.** A grid that ordered its columns
one way in React and another in Angular would be two forms from one document, and nothing
would fail — each renderer's tests would be green against its own ordering. Same
reasoning as `narrowOptionsByLabel`.

## Consequences

**What it costs a screen reader user, stated rather than hidden.** They hear the same
sequence as in the block rendering and learn a row's position on reaching that row's
buttons, where [0068](0068-a-row-keeps-its-own-state.md) put it as a sentence. A real
table would front-load "row 4, column 2" instead. That trade is why the table loses; it is
not a reason the table was free.

**The labels are clipped, and every theme has to keep clipping them.** `display: none`
and `visibility: hidden` both compute the name to `""` — measured — so a theme that tidies
the labels away that way silently unnames every control in the grid. The narrow-screen
reflow then un-clips them, which is only possible because the headings never named
anything: the strip can be deleted at phone width without changing what any control
announces.

**`subgrid` is the theme contract.** Rows and the heading strip take the container's own
tracks, which is what keeps the columns true. Verified in the browser Playwright drives
here (Chrome 153): the heading strip's columns and a row's columns at identical positions,
and again in the running playground. **Support in Firefox and Safari is not verified in
this repository**, and a theme using `display: contents` instead would lose alignment on
the actions track.

**axe is not the guard, and this repository's audit gives the table shape no protection at
all.** `td-has-header` and `table-fake-caption` are tagged `experimental` in axe-core, and
a tag-based run excludes experimental rules unless `experimental` is in the list —
`ACCESSIBILITY_TAGS` is not. Measured four ways: the rule does not run under the
repository's own tags, and does under `['wcag2a','experimental']`. A `<table>` datagrid
with an empty actions `<th>`, and one with no actions `<th>` at all, both pass clean.

**Neither is the conformance driver.** `@testing-library/dom` tests each label source
separately, so `queryAllByLabelText('Quantity')` still matches an element whose computed
name is `"Qty Quantity"`. "Every fixture still passes" is therefore not evidence that no
name changed, which is exactly why the first case in each renderer file computes the name
directly.

**A test-only dependency**, `dom-accessibility-api`, in two packages' `devDependencies`.
It is already in the tree as `@testing-library/dom`'s own, nothing ships it, and it needs
a three-line ambient declaration because the package carries `.d.ts` files it does not
advertise in `types` or in its `exports` map.

## Alternatives considered

**A `<table>` with `<th scope="col">`.** The honest runner-up and the intuitive answer.
Rejected on the measurement above: the headings name nothing, so it adds an announcement
rather than replacing one, and it brings table obligations this repository's audit does
not even check. What it would have bought — coordinates, and a `<caption>` — is named as a
gap rather than fixed.

**`role="grid"` with arrow-key cell navigation.** Rejected on the keyboard conflict above,
and on 0065's line: a widget may change how a field looks, never what it claims to be.

**Reusing the existing `row` part for a grid row.** It would have shipped with zero new
CSS — and the parts guard would never have fired, which is the documented-but-inert shape
that guard exists for. It also breaks the four themes' `[part='row'] > button` refinements
once the buttons sit in `datagrid-actions`.

**Rounded integer column spans instead of a ratio property.** Rejected: `width: 1.5` is
schema-valid, and rounding it would make `1.5` and `2` render identically — silently
discarding an authored, validated value, which is the failure 0065 names.

**Shipping the widget and deferring one renderer.** Rejected on the same grounds as every
widget before it: a construct one renderer honours is a document that means two things.
