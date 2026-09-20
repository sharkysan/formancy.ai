# 0010 — Canonically serialise and hash every schema

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/canonical.test.ts` — "produces identical
  output for objects differing only in key order", the re-canonicalisation
  fixed-point test, and a `test.each` that requires a throw for `undefined`,
  `NaN`, `Infinity`, a function and a bigint; `packages/spec/src/hash.test.ts`;
  and the fast-check property in `packages/spec/src/validate.test.ts` that every
  document `validateSchema` accepts also canonicalizes and hashes without
  throwing. `packages/spec` carries no `@types/node`, so importing `node:crypto`
  fails `pnpm --filter @formancy/spec typecheck` with TS2591.

## Context

Two things need one schema to produce one string, every time. A submission needs
tamper evidence, so that it can be shown afterwards that the stored answers were
collected against the schema the person actually saw. A version cache needs a
key, so that republishing an unchanged form is a no-op rather than a new row.
Both fail the same way when serialisation is not deterministic: two documents
differing only in key order look like two versions, and — the direction that
matters — two documents that genuinely differ can end up looking like one.

## Decision

`canonicalize()` in `packages/spec/src/canonical.ts` produces a deterministic
serialisation, with object keys sorted and array order preserved.
`schemaHash()` in `packages/spec/src/hash.ts` takes SHA-256 over its output. The
digest comes from `@noble/hashes` rather than `node:crypto`, because the builder
hashes schemas in the browser ([0008](0008-layered-packages.md)), and rather
than Web Crypto, because `crypto.subtle` is async and this has to be callable
from pure functions.

The load-bearing detail is that `canonicalize` **throws** on `undefined`, `NaN`,
`Infinity`, functions and bigints rather than dropping or coercing them.
`JSON.stringify` drops the first three from objects entirely and turns
non-finite numbers into `null`, so a silently dropped field would let two
different schemas share one hash — precisely the failure the hash exists to
detect.

## Consequences

**What it buys.** A submission's binding to its schema is checkable by anyone
holding both, without trusting the database row it was read from. Key order
stops being a semantic difference, so a builder that rewrites a document on save
does not produce a spurious new version.

**What it costs.** An author who puts `undefined` in a document gets an error
instead of a quiet coercion, and that error surfaces at save time rather than
where the value came from. That is the intended trade. The alternative is a hash
collision nobody notices until someone is relying on it.

**What it forecloses.** The document format cannot grow a value JSON has no
representation for. Dates stay strings, and a numeric bound cannot be
`Infinity`.

## Alternatives considered

**`JSON.stringify` with sorted keys.** Rejected: that is this function with the
throw removed, and the throw is the whole of the safety.

**`node:crypto`.** Rejected: it does not exist in the browser the builder runs
in, and [0004](0004-headless-core.md) keeps Node types out of the packages the
browser loads.

**Web Crypto `crypto.subtle`.** Rejected: it is async, which would make
`schemaHash` async and infect every pure function that needs a version key.
