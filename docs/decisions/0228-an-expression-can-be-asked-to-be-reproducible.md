# 0228 — An expression can be asked to be reproducible, and then reads neither the clock nor a random source

- **Status:** accepted
- **Date:** 2026-10-31
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/expressions/src/check.test.ts`, *a reproducible expression reads neither
  the clock nor a random source*:
  - `now()`, `today()` and `random()` are refused in a reproducible `computed` expression and
    `now()` in a reproducible `visible` one, as `function_not_allowed` at the call, with the reason
    in the hint. Each failed before the option existed, compiling as its kind allows.
  - the rest of the kind's set still compiles, a timestamp handed in included;
  - without the option the same kind still reads both, and a kind's own refusal still lists what
    it allows. That assertion fails when the reason is given for every such call.
  - `compile` hands the option on. That case fails when it does not.

## Context

A kind's policy decides what an expression may call ([`kinds.ts`](../../packages/expressions/src/kinds.ts)).
Every kind may read the clock, and `computed` may also draw `random()`. For a form that is right:
the engine injects all three and freezes them for the evaluation pass, and the values are captured
with the submission, so the server replays it to the same answers.

Formancy Report calls `@formancy/expressions` itself, and has nothing to capture them in. A report
rendered twice from the same data must print the same thing, so a reviewer's preview is the
customer's PDF. It could not ask the compiler to refuse the clock, so it probed for each call: at
every place one could stand, it re-spelled the token at the same length, compiled again, and
watched whether the outcome changed there (issue #261). A probe that misses a spelling lets a call
through, and what the same data gives then changes from one render to the next.

## Decision

**`compile` and `check` take `reproducible: true`, which removes the clock and the random source
from whatever the kind allows**: `now`, `today` and `random`, named once as `UNREPRODUCIBLE` in
`kinds.ts`. A call to one is the compiler's own policy error, `function_not_allowed`, at the call's
span, saying it "cannot be used in a reproducible computed expression", with a hint that it reads
the clock or a random source and that the value should be handed in. Everything else the kind
allows is unchanged, its result types included.

It is an option of the compiler, not of a document: no form can ask for it, and a form's rules are
compiled as before.

## Consequences

A caller that must give the same answer for the same values says so once and gets the refusal from
the gate every other refusal comes from, at the place the author wrote the call.

**What it costs.**

- **One more option on the public surface** of `@formancy/expressions`, on `CompileOptions` and
  `CheckOptions`. The `Program` a compile returns does not record it, so a caller that receives a
  program from elsewhere cannot ask whether it was compiled reproducibly.
- **A function added to a kind later is reproducible unless it is added to `UNREPRODUCIBLE`.** The
  set names what reads outside the values handed in, and a new function that does must go there as
  well as into its kind.

**What it does not do.** It does not say which functions a program calls or whether it computes
through a double; that is #260, a description a caller reads, where this is a refusal it does not
have to read.

## Alternatives considered

- **A new kind with the read-only core alone.** `ExpressionKind` is what a document's rule kinds
  compile as, and core maps one onto the other; a kind no document can name would sit in that type,
  and a caller would have to pick between it and the result types of the kind it actually is.
- **Leave it to the caller, as #260's list of what a program calls would let it.** A list the caller
  checks is a second gate it has to remember to run. The issue asked for the stronger guarantee, the
  compiler's own refusal.
