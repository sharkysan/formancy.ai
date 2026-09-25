# 0022 — Fail open on metadata, fail closed on validation

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** the `an expression that fails at runtime` block in
  `packages/core/src/engine-logic.test.ts`, which drives a real runtime failure —
  `int(reference) > 5` against text that is not a number, which type-checks at
  save time and throws when it runs — through all four rule kinds and asserts
  each direction. Inverting either branch in `packages/core/src/engine.ts` makes
  two of those tests fail; both mutations were run to confirm it. The block
  opens with a premise test, because an expression that evaluated successfully
  to `false` is indistinguishable from one that failed open unless you also
  check the working case.
- **History:** this record originally read "Not mechanically enforced", which
  was true when it was written: the two branches existed and nothing drove a
  rule to a runtime failure, so swapping them would have broken no test. Writing
  the record is what surfaced that, and the tests were added in response. The
  earlier state is left here rather than quietly overwritten, because it is the
  clearest evidence that the **Verified by** field does work.

## Context

An expression can fail at runtime despite having type-checked at save time. A
null arrives where an object was expected, or the evaluation budget is
exhausted. What happens then is a safety decision, and the right answer differs
according to what the expression was deciding.

## Decision

An expression that decides metadata fails open. If a `visible` rule fails, the
field is shown; if a `disabled` rule fails, the control stays usable; if a
`required` rule fails, the field is not required. An expression that decides
validation fails closed: if a `validate` rule fails, it contributes its error
code and the submission is rejected.

## Consequences

**What it buys.** The rule follows from what each failure costs the person in
front of the form. A metadata rule that failed closed would hide a field
someone needs to answer, or disable a control they need to use, and they would
have no way to proceed and no idea why. A validation rule that failed open
would accept data nobody has checked. Confusion is recoverable; unchecked data
in a database is not.

**What it costs.** A form whose visibility rules are quietly failing looks like
it is working. It shows more than it should, and nothing in the interface says
so — the failure is silent by construction, because the alternative to silence
is the dead end just described. The mitigation is that a rule which can fail at
runtime should have been caught at save time, which
[0016](0016-cel.md) and [0018](0018-static-dependencies.md) make mostly true:
unknown identifiers, type errors and computed cycles are rejected when the
engine is built, and never reach a user. Mostly is not entirely, which is why
this record exists.

**One instance of that cost, found and removed.** A `visible` rule reading a
`selectboxes` or `file` field hid nothing until the first tick or the first
attachment. The engine declared every non-container leaf `dyn` and seeded an
absent one with null, so `'migration' in topics` was `in` against null — no
overload, a runtime failure, and by this record's own rule the field was shown.
The form looked like the rule was inverted rather than broken, which is the
silence described above doing exactly what it says it does.

The fix is not to the failure policy but to the premise: an empty list answer is
`[]`, so `LIST_VALUED_FIELD_TYPES` in `@formancy/spec` names the types that
carry one and the engine declares them `list`. It lives in the spec rather than
in the engine because two readers that disagree about it disagree about whether
a form is showing a field. Pinned by the `an untouched list answer is an empty
list, not nothing` block in `packages/core/src/list-fields.test.ts`, which fails
in all three directions against the previous declaration.

## Alternatives considered

**Fail closed everywhere.** Rejected: consistent, and it converts a broken rule
into a form nobody can submit.

**Fail open everywhere.** Rejected: it lets a broken `validate` rule wave
through exactly the data that rule was written to stop.

**Surface every failure to the person filling in the form.** Rejected: the
audience for an expression failure is the form's author, not its respondent,
and there is nothing useful a respondent could do with the message.
