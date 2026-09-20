# 0043 — A validation rule says which side it runs on

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** the `runsOn` block in
  `packages/core/src/engine-logic.test.ts` asserts that an unmarked rule runs
  in both modes, that a client-only rule does not run under `mode: 'server'`
  and a server-only rule does not run under `mode: 'client'`, and that the
  default is the client. `packages/spec/src/logic.test.ts` pins that a metadata
  rule carrying `runsOn` is refused and that an unknown side is refused by the
  schema. `createSubmission` in `packages/server-core/src/use-cases.ts` passes
  `mode: 'server'` to the replay.

## Context

Every validation rule ran in both places. That is the right default — it is
what makes the server's replay a check of what the client did
([0030](0030-never-trust-client-state.md)) — but some checks cannot honestly
run in both.

A uniqueness check needs the database, so it can only run on the server. A
debounced hint that reacts as somebody types needs the keyboard, so it only
makes sense on the client. With no way to express either, an author writes the
check twice, in two places, and the two copies drift — which is precisely the
failure this project exists to prevent.

This was the third semantics the spec freeze was waiting on
([0009](0009-independent-spec-version.md)). It is a spec-level question because
`logicRule` is `additionalProperties: false`, so a property that does not exist
cannot be added later without a version bump.

## Decision

A `validate` rule may carry `runsOn: 'both' | 'client' | 'server'`, defaulting
to `both`. The engine takes a `mode`, defaulting to `'client'`, and drops rules
belonging to the other side at compile time rather than skipping them per
evaluation. The server's replay builds its engine with `mode: 'server'`.

**Metadata rules may not carry it, and `validateSchema` refuses one that
does.** If a `visible`, `required` or `disabled` rule could behave differently
on the two sides, the server would no longer be able to check what the client
did — visibility decides what is validated at all, and what is stripped from
the submission ([0013](0013-hidden-field-semantics.md)). The asymmetry is the
whole point: the sides may differ about *checks*, never about *state*.

## Consequences

**What it buys.** A server-only uniqueness check and a client-only hint are
both expressible, in one rule each, with no second implementation to drift.
The restriction to validate rules keeps the replay meaningful.

**What it costs.** A rule marked `runsOn: 'client'` is, by definition, not
enforced anywhere an attacker cannot reach. That is the correct reading of what
the author asked for, but it is a sharp edge: a check written as a hint and
later relied upon as a guarantee would be trusted wrongly. It is recorded as a
residual risk in
[`../regulatory/SAFETY-ANALYSIS.md`](../regulatory/SAFETY-ANALYSIS.md) rather
than only in this record.

There is also a smaller cost: the engine now has a mode, which is one more
thing a caller can get wrong. The default is the client, because that is where
a form is filled in, so the mistake a forgetful caller makes is the safe one —
a server that forgets to say so runs the client's rules and skips the
server-only checks, which fails closed on the hint and open on the uniqueness
check. That asymmetry is worth knowing about.

## Alternatives considered

**Reserve the key and ignore its value**, so that adding the behaviour later
would be compatible. Rejected: a property that a form author can set and that
silently does nothing is worse than one that does not exist, because the author
believes the check is server-only and it is not.

**A separate rule kind, such as `serverValidate`.** Rejected: it multiplies
kinds for what is one property of one kind, and `kind` is a closed list, so
every future combination would need its own value.

**Leave it out and let authors duplicate the check.** Rejected: that is the
duplicated, drifting logic the project exists to remove.
