# 0236 — A date or time compared with text not written as its answers are is named at publish, not refused

- **Status:** accepted; extended by [0238](0238-a-time-or-an-instant-declares-its-precision.md): on a field
  that declares a `precision`, such a comparison refuses the publish; its `has()` for a field at
  the top corrected by 0238
- **Date:** 2026-11-15
- **Deciders:** Daniel Bacher
- **Extends:** [0235](0235-a-date-and-time-in-a-condition-is-the-instant-its-author-chose.md),
  whose rules this finds, and [0097](0097-a-publish-may-warn.md), whose channel it uses.
- **Verified by:**
  - `packages/expressions/src/compared-literals.test.ts`: a field compared with a string on
    either side, at any depth, read through brackets or through `item`, and none for a
    comprehension's own variable, two fields, a number or a function's argument. With the
    right-hand side unread, *on whichever side* failed. With every member access taken for a
    field, *not a comprehension's own variable* failed.
  - `packages/core/src/temporal-literals.test.ts`: the old editor's literal on a date and time
    is found, and the sentence names the rule, the field, the literal and the shape. A date and
    a time in the wrong shape are found. A row rule is resolved to its repeater. Nothing is said
    about a literal in the answers' shape, about a text field, or about a check or an expression
    that does not parse. Without row resolution the row case failed. With every literal
    reported, *says nothing about one written as the answers are* failed.
  - `packages/server-core/src/use-cases.test.ts`, *a date or time compared with text not written
    as its answers are*: published, with one warning naming the field and the literal, and
    version 1 really there. None for an instant in the answers' shape. The first failed before
    `publishForm` asked.
  - `packages/core/src/authoring.test.ts`: the check is exported from `@formancy/core/authoring`
    and not from the engine's barrel. It failed before the export.

## Context

CEL has no date type, so a rule compares a temporal answer as text. Text orders as time does
only between strings of the one fixed shape every answer has
([0067](0067-a-temporal-answer-is-one-fixed-width-string.md)). `"2026-1-5"` sorts after
`"2026-10-01"`, `"9:30"` after `"10:00"`, and `"2026-10-08T10:30"` before the instant
`"2026-10-08T10:30:00Z"`, which no answer of twenty characters can equal. A rule comparing an
answer with such a literal holds at the wrong moment, and one using `==` holds for nobody. Every
gate passes it: the expression type-checks, and it decides something for every answer.

The builder's condition editor wrote exactly that for every date and time through 0.13.0
([0235](0235-a-date-and-time-in-a-condition-is-the-instant-its-author-chose.md)). Those rules
are in published versions. The author's zone was never recorded, so nothing can convert one,
and until now nothing named one either: `MIGRATIONS.md` asked a deployment to look by hand. A
literal written by hand in CEL has the same fault and had the same silence.

## Decision

**A publish names, as a warning on its `201`, every rule that compares a `date`, `time` or
`datetime` field with a string literal not in that type's answer shape.** The sentence names
the rule, the field, the literal and the shape, with an example. For a date and time it says
the editor wrote such a local time through 0.13.0, and that removing the rule and adding it
again writes the instant.

It is a warning and not a refusal, for 0097's reason: refusing would make documents valid
today invalid tomorrow, and what a reader accepts is the frozen version contract.

It is three pieces at three layers:

- **`comparedLiterals` in `@formancy/expressions`**, because an expression's tree is opaque
  outside that package. It reports every comparison (`==`, `!=`, `<`, `<=`, `>`, `>=`) of a
  field with a string. A side counts as a field only where `readChains` found a whole read at
  exactly its span. That is the walk which already decides which names are fields and which a
  comprehension binds itself, so this one does not decide it a second time.
- **`misshapenTemporalLiterals` in `@formancy/core/authoring`**, beside `unknownReferences`. It
  resolves `item` in a row rule to the rule's own repeater, using the same `rowScopeOf` that
  `unknownReferences` now uses, and compares each literal with `TEMPORAL_SHAPES`.
- **`publishForm`**, which adds these sentences to the warnings it already carries.

## Consequences

**The rules 0235 left behind are named the next time their form is published**, and so is a
hand-written literal of the wrong shape, on a date, a time or a date and time. A deployment that
gates on `warnings`, as the self-hosting guide suggests, now stops on them.

**What it costs:**

- **A version already published is not revisited.** The warning is said when a form is
  published. A form nobody publishes again keeps its rule unnamed, as with 0097's warnings.
  `MIGRATIONS.md` still asks a deployment to republish.
- **Only a literal compared directly with the field is seen.** A literal built by a function,
  passed through `timestamp()`, held in a list for `in`, or compared through a computed index
  is not. Neither is a comparison of two fields, which a literal's shape cannot judge. Those
  are the evaluator's, and their author's, to get right.
- **A string compared with a date that is meant as text is warned about too.** `leave != ""`
  as a test for an answer, or a prefix like `leave >= "2026"`, is reported. Both compare a date
  with something that is not one, and `has()` and `!= null` say the first more truly. But a
  rule its author knows to be right will warn on every publish.

  > **Corrected 2026-11-16 by [0238](0238-a-time-or-an-instant-declares-its-precision.md).**
  > `has()` takes a field selection, so `has(leave)` does not compile: for a field at the top of
  > the form the test for an answer is `leave != null`, and `has()` is for a member of a group.
  > Measured with the built `@formancy/expressions`; the decision above is unchanged.
- **The sentence is English**, as 0097's is. A publish's warnings are sentences for whoever
  publishes, not codes a catalogue words.
- **`@formancy/expressions` exports one more function.** No form calls it. It reaches a page only
  through `@formancy/core/authoring`, which no form loads (0217).

## Alternatives considered

**Refusing the publish.** Rejected for 0097's reason, and more sharply here: the documents
holding such rules were written by this product's own editor, so refusing them would punish the
owners for the product's defect.

**Rewriting the literal at publish**, assuming UTC or the server's zone. Rejected for 0235's
reason: either is a guess about an instant nobody recorded, and a rule repaired wrongly looks
fixed.

**Only `datetime`, the type the editor got wrong.** Rejected: a date or a time typed by hand in
the wrong shape misorders the same way, and the check is the same check.

**Finding comparisons with a walk of its own in core**, over a tree core cannot see. Rejected:
the tree is opaque to callers by design, and a second walk deciding which names are fields
would be the second answer `chains.ts` exists to prevent.

**Warning in the builder as the author writes.** Not done here: the builder's editor no longer
writes such a literal (0235), and a rule pasted in as CEL meets this warning at its first
publish.
