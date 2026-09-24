# 0054 — Refuse an expression that compiles and then never works

- **Status:** accepted
- **Date:** 2026-09-24
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/expression-problems.test.ts` (20 cases,
  half of them about what this must *not* report), and two cases in
  `packages/server-core/src/use-cases.test.ts` showing publish refusing the
  broken form and accepting it once the literal has a decimal point.

## Context

`seats * 4`, on a form with a `number` field called `seats`, computes nothing.
Not an error — nothing. The field stays empty for every value anybody types,
for the life of the form, and nothing anywhere says why.

Two decisions combine to produce that, and each is right on its own.

**Leaves are declared `dyn`.** A field is empty while somebody is typing into
it and CEL has no nullable scalars, so declaring a `number` field as `double`
would make an unfinished answer a type error on every keystroke. `dyn` agrees
with anything, so the type checker passes `seats * 4` without comment.

**A computed rule that fails writes nothing.** The previous value stands until
the inputs make sense, which is exactly right for `qty * unitPrice` while
`unitPrice` is still empty — writing a garbage number there would be worse than
writing nothing.

At runtime CEL is strongly typed and a JSON number is a double, so `double *
int` has no overload and the evaluation fails. The engine cannot tell that
failure apart from a half-filled input, because from where it stands they are
the same event. So the right behaviour for one case is silence for the other.

This was found by writing a demo form for the website, which is the only reason
it was found at all.

## Decision

**A second type check, with leaves declared as the model says, at publish.**

`expressionProblems(schema)` in `@formancy/core` re-checks every rule with a
`number` field declared `double`, a `text` field `string`, and so on. Where
that strict pass reports `no_such_overload`, the expression has no meaning for
those types and therefore fails for *every* input rather than for an unfinished
one — which is precisely the class the engine cannot see.

**The strict result is consulted, not obeyed.** Strict declarations also make
`seats == null` a type error, and asking whether an optional field is empty is
a perfectly good thing to write. So an overload error mentioning `null` is
skipped. That also skips a genuinely silly `seats * null`, returning that one
expression to the silence everything had before — a fair trade for never
refusing a valid form. **A check that refuses a valid form is worse than the
silence it replaces:** the silence costs one field, a false refusal costs the
whole publish.

**It runs at publish, not at render.** `createFormEngine` is unchanged, so a
form already out there with this mistake keeps opening for whoever is halfway
through filling it in, with the one field that never fills in that it has
always had. New ones cannot be published.

**The message names the fix when the fix is a decimal point.** Two numeric
types either side of an operator is somebody writing ordinary arithmetic and
meeting CEL's refusal to widen an int, so the message says to write `4.0`.
`double * string` is reported too, without that advice, because telling that
author about decimal points sends them looking in the wrong place.

## Consequences

**What it buys.** The class of mistake that produced no signal anywhere now
produces one, at the moment the author can act on it, in their own words.

**What it costs.** A second parse and check per rule at publish, which is a
save-time cost on a document that is about to be written to a database. And a
list of field-type-to-CEL-type mappings in `expression-problems.ts` that has to
stay in step with the engine's understanding of what a stored answer looks
like — the top-level field walk is now shared with the engine for exactly that
reason, but the type table is not.

**What it does not fix.** The underlying asymmetry is still there: the engine
runs loose and the gate runs strict, so an expression can still fail at runtime
for a reason the gate did not anticipate, and still fail quietly. This closes
the class that was reachable by writing something reasonable; it does not make
runtime expression failure observable in general.

## Alternatives considered

**Declare leaves strictly and give absent fields a zero value** — `0.0` for a
number, `""` for text — so the engine's own check catches this and `dyn`
disappears. Rejected for now, and it is the better long-term answer: it changes
what a computed field does while its inputs are empty, from "keep the previous
value" to "compute from zero", which is a semantic change to every existing
form. That belongs in a spec version with a migration note, not in a bug fix.

**Make runtime expression failures loud.** Rejected: they happen constantly and
legitimately while somebody types, so it would be noise with one real signal
buried in it.

**Lint for an int literal next to a number field.** Rejected as too narrow — it
would miss `price * index`, where `$index` is genuinely an int and no literal
is involved, and it would miss `double * string` entirely.

**Refuse at `createFormEngine`.** Rejected: it would turn a published form that
renders-but-does-not-compute into one that does not render, for somebody
already filling it in. A form that is already live has already made its
mistake; the person in front of it should not pay for it.
