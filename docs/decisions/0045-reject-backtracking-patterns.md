# 0045 — Refuse a pattern that can be made to backtrack

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** the `patterns that backtrack are refused at publish` block in
  `packages/server-core/src/use-cases.test.ts` — an exponential pattern, a
  polynomial one with its degree named, an ordinary one that publishes, and one
  inside a repeater reported at `contacts[].code`. The exponential case also
  asserts nothing was persisted on the way to the refusal. The built-in formats
  are pinned separately by `format checks are cheap on hostile input` in
  `packages/core/src/engine-validators.test.ts`, whose timing assertion fails
  against the old email pattern — confirmed by putting it back.

## Context

A form author supplies `pattern`, and the server runs it against whatever a
submitter typed. That makes a regular expression an author-side denial of
service: one bad pattern, published once, and every submission afterwards can
be turned into unbounded CPU by anyone who can reach the form.

It has to be caught at publish time, because a JavaScript regular expression
cannot be timed out once it has started matching. There is no `AbortSignal` for
a backtracking engine. The only moment the cost can be declined is before the
pattern is stored.

This was a named residual risk in the failure mode analysis for several days
before it was closed, on the grounds that publish-time linting was designed and
not implemented. Writing it down is what kept it findable.

## Decision

`publishForm` runs every `pattern` in the model through
[`recheck`](https://makenowjust-labs.github.io/recheck/) and refuses the
publish if any is `vulnerable`, reporting the data path, the pattern and the
complexity so the author can see which field and why.

Patterns are analysed anchored — `^(?:...)$` — because that is how the engine
runs them, and an unanchored analysis can miss a case the anchors create.

A pattern recheck reports as `unknown` is **accepted**. Refusing on an
undecided analysis would make publishing depend on an analysis timeout, and an
author whose legitimate form intermittently stops publishing has nothing to act
on. The failure that is merely possible loses to the failure that is certain
and unexplainable.

## Consequences

**What it buys.** The risk is closed at the only point where it can be, and the
analysis is static, so it costs nothing per submission.

**It immediately found one in formancy's own code.** The built-in `email`
format was `^[^\s@]+@[^\s@]+\.[^\s@]+$`, which recheck rates polynomial degree
2 with a concrete attack string — both halves of the domain can match a dot, so
a long dotted input can be split in quadratically many ways before failing. It
is now `^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$`, which is linear and accepts and
rejects exactly the same addresses, including `first.last@example.ch`. The
first replacement considered did not: it moved the dot exclusion into the local
part too, which would have rejected a very common address shape to fix a
performance problem.

**What it costs.** `recheck` brings a 23 MB JVM jar and a native binary per
platform as optional dependencies. They are not needed — it falls back to a
pure JavaScript engine that reaches the same verdict on every case here, and
`@formancy/server` pins `RECHECK_BACKEND=pure` so the choice is deterministic
rather than dependent on what happened to install. An attempt to stop pnpm
installing the optional binaries at all was abandoned: `ignoredOptionalDependencies`
had no effect in `package.json` and made the situation worse in
`pnpm-workspace.yaml`, pulling in all five platforms instead of one. The weight
is therefore real and is recorded here rather than hidden.

There is also a false-positive cost. A pattern an author believes is fine may
be refused, and the remedy — rewrite it unambiguously — requires understanding
why, which not every form author will. The error names the complexity to make
that as tractable as it can be.

**Where the environment variable lives** is a consequence of
[0008](0008-layered-packages.md): `@formancy/server-core` has no `@types/node`,
so it cannot read one. The host chooses the engine, which is the right shape
anyway.

## Alternatives considered

**Time out the match instead.** Not possible. A JavaScript regular expression
runs to completion.

**Cap the input length before matching.** Insufficient. Exponential
backtracking is exponential in the input length, so any cap large enough to be
useful is large enough to hang.

**Write the analysis by hand** — detect nested quantifiers and similar.
Rejected: it would be an approximation of a solved problem, and the cases it
missed would be exactly the subtle ones. The built-in email pattern is the
proof: it has no nested quantifier and a hand-rolled heuristic would have
passed it.

**Lint only formancy's own built-in patterns, in CI.** Rejected: it protects
the wrong patterns. The threat is the ones an author writes.
