# 0127 — A condition nests one level, compares by the field's kind, and asks before it reads

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/builder-core/src/conditions.test.ts` — each comparison's CEL,
  including the guards, a group inside a group parenthesised, an `||` inside an `&&`
  parenthesised, and a third level refused. `condition-draft.test.ts` — the fields offered
  are at the engine's paths (a field in a page is not `about.country`), with their kind and
  options; a change of field keeps or falls back the comparison and clears a value of the
  wrong kind; a checkbox's value starts as yes; an emptied group goes; values are narrowed
  by the field and not by their look; and every comparison is run against an empty form in
  the engine — a group child and an empty number both hide rather than fail open, an
  unticked list is unanswered. `rules-follow-paths.test.ts` — a rename follows into a group
  and into `has()`. Both builders' `logic-panel.test` — "(A and B) or C" built through the
  UI and accepted by the session; typed value controls; the comparisons offered follow the
  field. Each was seen to fail with what it guards removed.
- **Deciders:** Daniel Bacher

## Context

The logic-editor item asked for nested conditions — "(A and B) or C" — value pickers that
know the field's type, more comparisons, a form-wide overview of the rules, and an
explanation of why a field is hidden or required. The first three are the condition
editor; this record is about them.

The editor said in its own comment that a group was flat **deliberately**: "nesting is
where a condition editor stops being readable". Half right. Three levels in, nobody can tell
what the parentheses do; but "(A and B) or C" is one level, and it is the question people
ask. A flat list cannot say it, and the escape hatch — writing CEL — is the whole difficulty
for the authors this editor exists for.

Rebuilding it found four defects, each shipped:

- **A comparison on a field inside a group failed open.** `address.city == "Bern"` throws
  on an untouched form, because the group itself is null, and a `visible` rule that throws
  shows its field. Measured: a builder-written rule's target was visible on an empty form.
- **So did a bound on an empty number.** `age > 18.0` has no `>` for null.
- **A field inside a page was compared at a path no field has.** Both panels built their
  field list from the tree's key path, `about.country`, where the engine reads `country`.
- **A choice whose value looks like a number was compared as one.** The typed value was
  narrowed by its shape, so a choice stored as `"10"` was compared with `10.0` — a type
  error at save, for a condition built correctly.

And the condition being written lived in each builder separately, as a list and a join. Each
of the new decisions — which comparison a field still takes, whether a value survives a
change of field, what an emptied group becomes — would have been written twice.

## Decision

**A condition nests one level.** A group holds comparisons and groups of comparisons; a
group inside a group holds comparisons only. The compiler refuses a third level, so the
limit is the format's and not only the editor's. A group inside a group is always
parenthesised in the CEL, so the preview shows the grouping that was built; a comparison
that compiles to an `||` is parenthesised inside an `&&`, which is precedence rather than
taste.

**What can be compared follows what the field holds.** Text is, is not, contains, does not
contain; a number is more, less, at least, at most; a date or a time is before or after; a
choice is one of its own options, offered by label; a checkbox is yes or no; a list of ticks
includes or does not include; anything may be answered or not. The value control follows
the same kind — a list of the field's options, yes and no, a number box, a date box — and
the value is narrowed by the field, never by how the text looks.

**Every comparison asks before it reads.** `has()` before reading into a group — the one
guard that answers there — and `!= null` before ordering or searching a value. A list is
never compared with null, which the checker refuses; `size()` and `in` already answer for a
list nobody touched, and an empty list, which both renderers store when every tick is taken
off, is not an answer. The condition carries its field's kind (`answer`) in the stored
`editor` metadata for that reason.

**The condition being written is builder-core's.** `condition-draft.ts` holds the draft —
comparisons and groups — and every edit to it; `conditionFields` lists the fields at the
paths the engine reads. Both logic panels draw it and hand each edit back. Its words joined
the catalogue in `messages-logic.ts`, composed into the one `BUILDER_MESSAGES`.

## Consequences

**Rules written by an earlier builder keep their expression.** The CEL is the stored truth
and nothing recompiles it, so an unguarded rule stays unguarded until it is written again.
The logic documentation's table of shapes that fail on an empty form now includes the bound,
and is how to recognise one.

**Fields inside a repeater are not offered.** A rule about the whole form cannot say which
row it means, and a rule ON a row field needs the row's own scope — and a rename that follows
`item.` references — which is the next piece of work, not this one.

**A guarded condition is longer.** `has(address.city) && address.city != null &&
address.city == "Bern"` is what a careful person writes and what the preview shows; it is
more to read than what the editor wrote before, and it is right where that was not.

**Changing a comparison's field may clear its value.** A value typed for a number means
nothing to a choice. It is kept when the kind is the same.

## Alternatives considered

**Arbitrary nesting.** The readability argument the flat rule made is right past one level,
and the editor would have to draw it.

**Guard in the engine instead** — treat a read of a missing member as null. It would change
what every existing expression means, which the spec's version line forbids, and it would
hide exactly the kind of mistake a hand-written rule should be told about.

**Keep the draft in each builder.** The state in question is a list of decisions; two copies
of each is how the two builders came to need this record.
