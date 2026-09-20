# 0019 — Inject the clock and randomness; never read them ambiently

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/engine-logic.test.ts` — "logic rules
  require capabilities, because `now()` must be injected, never ambient" asserts
  that `createFormEngine({ schema })` throws, and its neighbour asserts a schema
  without logic still needs none. `packages/expressions/src/capabilities.test.ts`
  covers the rest: each source is read exactly once per pass, the result is
  frozen, and `fixedCapabilities` rejects a recorded triple that would make a
  replay disagree with the original. The narrower rule — that engine code never
  touches a clock directly — is **not mechanically enforced**: `packages/core`
  compiles against `lib: ["ES2023"]`, where `Date` is in scope and needs no
  import, so nothing fails if someone writes `Date.now()`. No file under
  `packages/core/src` outside tests mentions `Date` or `Math.random` today, and
  that is held by review.

## Context

[0006](0006-one-engine-build.md) requires the server to replay a submission
through the same engine and reach the same answers. Any expression that reads
the current time or a random number defeats that. The client evaluated at one
instant and the server replays at another, so a rule involving today's date can
legitimately disagree with itself and reject a submission that was valid when it
was made.

## Decision

The engine never reads an ambient clock or random source. `now()`, `today()` and
`random()` are served from an injected capability object, drawn once and frozen
for the duration of an evaluation pass, and the server pins one clock per
submission. A schema with logic rules cannot construct an engine without
supplying a capability source: the constructor throws and says why, so this is
not a convention.

## Consequences

**What it buys.** Byte-identical replay, which is what makes server-side
revalidation ([0030](0030-never-trust-client-state.md)) a check rather than a
second opinion. A pass is also internally consistent: capabilities are drawn
once per pass and not once per expression, so a form with fifty computed fields
agrees with itself about what time it is. `fixedCapabilities` validates and
freezes a recorded set, which is the shape a later replay reads back.

The discipline concentrates ambient reality in one file. The server's
composition root is where `randomUUID`, the real clock and the CSPRNG enter;
everything below it is injected and replayable.

**What it costs.** Every caller must supply capabilities, including every test,
which is more ceremony than calling `Date.now()` would be. Accepted: the
ceremony is the guarantee. The cost is not only typing. A capability source has
to be threaded through the server's dependency object and into every use case
that builds an engine, and any future impure function — a lookup, an identifier
generator — has to be added to the capability interface rather than simply
called.

## Alternatives considered

**Read the clock ambiently and tolerate the disagreement.** Rejected: server
revalidation could then no longer distinguish a tampered submission from an
honest one evaluated a second earlier, which is the whole point of doing it.

**Have the client send the instant it used, and replay against that.** Rejected
on [0030](0030-never-trust-client-state.md): the client controls that value, so
a date-sensitive rule becomes something the submitter can set.
