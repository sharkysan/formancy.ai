# 0040 — No `eval` and no `new Function`, anywhere

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/csp.test.ts`, which `pnpm test` runs in CI.
  Three guard tests assert that the shipped validator source contains no
  `new Function`, no `eval(` and no `require(`; a fourth recomputes
  `schemaHash()` over `formancy.schema.json` and requires it to match the
  `schema-hash:` stamp in `packages/spec/src/generated/document-validator.js`,
  so editing the schema without regenerating fails the suite. That guard covers
  the generated validator only. There is no repository-wide lint rule, so
  everywhere else the rule rests on review.

## Context

Many form libraries evaluate user-authored logic with `new Function`. It is the
obvious implementation, and it is what forces a relaxed Content-Security-Policy
on every application that embeds them. A relaxed CSP is a hard blocker for
banking and government buyers, who cannot permit `unsafe-eval` and will not
make an exception for a form library.

## Decision

No `eval` and no `new Function` in any package. CEL ([0016](0016-cel.md)) is
interpreted over its own AST rather than compiled to JavaScript. The
schema-derived validator is generated ahead of time by an ajv codegen step
rather than compiled at runtime: `packages/spec/src/generated/document-validator.js`
is a committed artefact, produced by `packages/spec/scripts/generate-validator.mjs`
and stamped with the hash of the schema it was generated from, so CI can tell
when it has gone stale. ajv's `compile()` reaches `new Function` on its first
call, and the one consumer that must call `validateSchema` is the builder, in
the browser.

The consequence is that formancy runs under a strict CSP with zero
configuration. That is a documented headline feature, stated in
`apps/docs/src/content/docs/concepts/logic.md` and in `packages/spec/README.md`,
and not an accident of implementation.

## Consequences

**What it buys.** An application can serve the builder and the renderer under
`script-src 'self'` and change nothing. For the buyers this project is aimed at,
that moves formancy from disqualified to evaluable.

**What it costs.** The generated validator is a build artefact in version
control. It is large, nobody reads it, and it has to be regenerated whenever the
schema changes; the hash stamp is what makes forgetting detectable rather than
silent, but the regeneration itself is still a manual step in the author's
workflow.

Interpreting CEL is slower than compiling it to a JavaScript function would be.
The performance budgets say that is affordable. Those budgets are falsifiable —
`packages/core/bench/perf.mjs` exits non-zero when a mean exceeds its ceiling —
but they measure the engine's graph and store work, not expression evaluation,
and the bench is run by hand rather than in CI. The CEL cost is argued from the
budgets rather than measured against one.

## Alternatives considered

**Compile logic to JavaScript with `new Function`, and document the CSP
requirement.** Rejected. The requirement is the problem, not the documentation
of it, and pushing it onto the embedding application means pushing it onto the
buyer least able to accept it.
