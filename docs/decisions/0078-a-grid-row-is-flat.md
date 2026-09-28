# 0078 — A grid row is flat

- **Status:** accepted
- **Date:** 2026-09-28
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/datagrid.test.ts`, `describe('a grid’s row is
  flat')` — three cases: a group child refused and named, the same repeater without the
  widget accepted, and every type in `CONTAINER_FIELD_TYPES` refused whatever the reason.
  Written before the rule and observed failing on the first and third; the second passed
  from the start, which is what makes it worth keeping — it is the assertion that the
  restriction costs only the arrangement.

## Context

A `datagrid` column names one of the grid's own child fields. Nothing said the child had
to be a leaf, so a `group` was legal — and a review asked what a group in a column
actually renders. Measured, in both renderers, on the same document:

```
cell 1: [label "Item name"]
cell 2: [label "From"] [label "To"]        heading strip: "Item name" | "Period"
```

Both renderers build a cell from the **leaves** under the row, because a column names a
direct child while `fieldPaths()` returns leaves. So the group is flattened: its own name
never reaches the page at all, and its two controls land in one cell under one heading
that names the group and neither of them.

Then the themes make it worse. A theme clips a cell's `label` on the grounds that the
heading strip above already says it — which is right for a column that holds one answer,
and the reason the heading exists. Applied to that cell it clips **both** labels, so the
person gets two date controls side by side with nothing to tell them apart. It does not
look broken. It looks finished.

The first attempt was a CSS fix: restore a label nested a second `field` deep, in all four
themes, guarded by `apps/docs/src/themes.test.ts`. The guard failed on all four themes
before the fix and passed after it — and it was still wrong, because **no such markup
exists**. The renderers flatten the group, so there is no second level to select. The
guard would have passed forever while asserting nothing, which is the failure mode
[0060](0060-documentation-is-checked.md) is about, arrived at from the other direction.

## Decision

**A repeater arranged as a grid may not have a child that holds fields of its own**, and
`validateSchema` refuses the document when it does, naming the child and saying what to do
instead.

**In the validator, not in the schema.** JSON Schema can express it, and the message it
produces is `must NOT be valid`. The rule next to it — a repeater inside a repeater —
already sits here for the same reason: an author who nested something needs a sentence,
not a keyword.

**Conditioned on what the child HOLDS, not on the type it is.** `group` is the only type
this has to catch today: a repeater child is already refused as a nested repeater, and a
page child as a page inside a repeater. Writing it against the name `group` would miss the
next type that comes to hold fields — which is not hypothetical here, because the nesting
guard broke exactly once, when a second type came to hold the same row model
([0066](0066-a-widget-may-be-configured.md)).

**Now, while version 2 is unreleased.** Refusing something costs nobody anything today and
would be a breaking change the moment a beta freezes the version. Relaxing it later is a
version's worth of work and is allowed; tightening it later is not.

## Consequences

**A column is one answer, everywhere.** That is worth more than the arrangement it costs.
`belongsToColumn` existed in `@formancy/spec` to decide which leaves of a row belonged to
which column — three clauses, one for a child key swallowing a longer sibling, one for a
grouped child owning everything beneath it, one for a neighbouring row. Two of the three
were for nesting this record refuses, and with it gone the answer is an equality. The
function is deleted and both renderers compare a wire; the shared helper was paying to
share a rule that no longer needs sharing.

**An author who wants "Period: from–to" writes two columns.** They get two headings, two
labelled controls, and columns that line up with every other row — which is what a grid is
for. Nothing is lost except the fieldset boundary, and that boundary was already being
dropped silently.

**A stacked repeater is untouched.** A group in a repeater with no widget renders as a
fieldset with its own legend and is a perfectly good form. The restriction is on the
arrangement, which is the only thing that cannot express it, and a test asserts exactly
that — otherwise this record would be paying for a grid nobody asked for.

**A published form cannot hit this**, because publishing validates. A document held
somewhere unvalidated and rendered directly will show an empty cell where the group was:
the renderers filter the paths that exist rather than trusting the path a column implies.
That is a degradation, not a crash, and the validator is the contract.

## Alternatives considered

**Render the group properly in the cell** — a real `fieldset` with its `legend`, so the
nesting exists and the CSS fix has something to select. This is the feature-complete
answer and it was rejected on what the cell then looks like: the heading strip says
"Period" and the legend inside the cell says "Period", one above the other, in every row.
The heading would have to be suppressed for grouped columns, which makes the heading strip
conditional on the shape of each column — and it is the one thing in this arrangement that
must stay uniform, because every row's cells line up against it. It is also renderer
surgery in two frameworks for an arrangement two columns already express.

**Keep the flattening and stop clipping when a cell holds more than one field**
(`:not(:has([part='field'] ~ [part='field']))`). Cheap, and it makes the labels visible.
Rejected because it keeps the part that is actually wrong: the group's own name still
never reaches the page, so the document says the answers are grouped and the form does not,
and the heading strip names a group whose boundary no longer exists.

**Leave it, and document that a group in a column is undefined.** Rejected on this
repository's own rule — a characterisation describes one version and no other, and
"undefined" here means two labels a theme has already hidden. An absent statement prompts
the question; this one would answer it incorrectly.

**Refuse it in the renderers instead**, by throwing on a grouped column. Rejected: it
fails at the worst moment, in front of whoever opened the form, for a mistake the author
made. The generator rule this repository already follows — throw on input you have no
vocabulary for — applies at authoring time, which here means the validator.
