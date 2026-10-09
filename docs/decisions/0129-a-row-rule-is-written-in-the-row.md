# 0129 — A rule on a field in a repeater row is written in the row's scope

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/builder-core/src/row-rules.test.ts` — a field in a row is
  addressed as `items[].note`; a rule the condition editor composes on it is accepted; it
  may compare the fields of its own row, named "in this row", and a rule about the whole form
  or another repeater's row may not; each row is decided by that row, agreeing with the
  engine; a list in a fresh row is unanswered rather than a reason to show the field, and "not
  answered" holds for it; the overview says it in words; renaming the row field it reads, the
  row field it is about, or the repeater, and unwrapping a group inside the row, all carry the
  target, the condition and the editor metadata along. Eight mutations — no `[]` in the path,
  lists in a row treated as never null, no `item.` rewrite, `underPath` blind to rows, editor
  metadata at dotted paths, row fields never offered, row fields unnamed, the overview at
  whole-form fields — each fail a named case. Both builders' `logic-panel.test` — the picker
  offers "Quantity in this row" and the rule added is the one the engine runs; an unscoped
  picker fails it. `apps/docs/src/empty-answer-guards.test.ts` — the row rows of the guard
  table in `concepts/logic.md`, and the engine's fresh-row binding they assume.
  `apps/playground/src/starter.test.ts` — the demo has an editor-written row rule, and every
  editor-written rule's CEL is what its metadata compiles to.
- **Deciders:** Daniel Bacher

## Context

The format and the engine have had rules on repeater rows since repeaters existed: a target
of `items[].note` runs once per row, with `item` bound to that row and `index` to its
position. The builder could not write one. `ruleTargetFor` addressed a field by its dotted
data path, `items.note`, which no field has, so the validator refused every rule the logic
panel composed on a field in a row. The condition editor offered no row fields to compare,
and a rename did not know that `items[].qty` and `item.qty` are names for the field it moved.

Writing it showed two things wrong beneath it, both measured:

- **A list in a fresh row is null, not `[]`.** At the top level an untouched list is `[]`,
  which is why the condition compiler compares a list by length and never with null — the
  checker refuses `list != null` there. In a row the engine presents every key, null until
  answered, so `"gift" in item.tags` throws on a fresh row and a `visible` rule shows the
  field it was meant to hide. `compileCondition` already accepted `items[].tags` and is
  exported, so an integrator calling it got that expression before the builder could.
- **The user documentation gave the wrong guard for a row.** It said to test presence with
  `has()` "for a path inside a group or a row". In a row every key is present, so `has()` is
  always true and answers nothing; `!= null` is the guard.

## Decision

**A field in a row is addressed as the engine scopes it.** `rulePathOf` puts `[]` after a
repeater whose row the path is in, and `ruleTargetFor` and the rules overview both use it.

**A rule in a row may compare its own row, and says so.** `conditionFields` takes the rule's
target; when it is in a row, that repeater's fields are offered at `items[].qty` — which the
compiler already turned into `item.qty` — and named "Quantity in this row", in the picker and
in the overview's sentence, because "Quantity is at least 3" under a field in the row does
not say whose quantity. Another repeater's rows are never offered: `item` there is another
row.

**In a row a list is guarded with `!= null`.** `item` is dynamic, so the checker allows it,
and it is what answers: `item.tags != null && "gift" in item.tags`. The top level keeps its
length-only shape.

**A rename follows a row rule in all three places.** `repathRules` works in the form a rule
names a path by: the target and the editor metadata at `items[].qty`, and the condition of a
rule in the row at `item.qty`. Renaming the repeater moves `items[].note` to `lines[].note`
and leaves `item` alone. Before this, renaming a row field succeeded and left every rule in
the row reading its old name — `item` is dynamic, so a field it lacks is null, nothing refused
the edit, and publishing only warned.

## Consequences

**A row rule has no verdict in the rules overview.** It has one per row; the overview lists
it, in words, under its field ([0128](0128-a-form-says-why-a-field-is-hidden.md)).

**Rewriting `item.qty` is not scoped to rules in that repeater's row.** Only a rule in a row
can read `item`, and keys are unique across the form, so `item.qty` in another repeater's row
already reads a field that row lacks; rewriting it changes nothing that worked. The check
that scoped it was unreachable, and was removed rather than kept untested.

**Rules written by hand, or by an earlier tool, keep their expression.** A hand-written
`"gift" in item.tags` still fails open on a fresh row; the guide now says why and what to
write instead.

## Alternatives considered

**Offer every row's fields to every rule, as `items[].qty`.** A rule about the whole form
cannot say which row it means — the reason they were left out — and the compiler would write
`item.qty` into a rule where `item` is not bound.

**Teach the engine to present an untouched list in a row as `[]`.** It would make rows match
the top level, and change what every existing row rule evaluates to on a fresh row — a
behaviour change in the runtime for a defect in what the builder wrote.

**Label row fields with the repeater's name — "Items › Quantity".** It says where the field is,
not which row; "in this row" is what the rule means.
