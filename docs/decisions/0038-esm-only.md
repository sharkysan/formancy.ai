# 0038 — Publish ESM only

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `pnpm check:pkg`, run in `.github/workflows/ci.yml`, executes
  `publint && attw --pack . --profile esm-only` in every TypeScript package and
  `publint ./dist` in `packages/angular`, where the Angular Package Format
  manifest actually lives. The byte budgets and the unused-export check
  described below are not wired up: nothing in the repository runs `size-limit`
  or `knip`.

## Context

Dual CJS and ESM publishing is the largest single cause of "are the types wrong"
failures and of consumer builds that break subtly and out of the library
author's sight: two resolutions of the same module, two copies of module-level
state, and type declarations that are right under one condition and wrong under
the other. Node 24 can `require()` an ES module, which removes the main reason
dual publishing existed in the first place.

## Decision

ESM only for every browser-facing package, with `"sideEffects": false` and
per-entry `exports` maps so a subpath tree-shakes independently. `@formancy/spec`
is the case that needs it: `./validate` is an entry of its own, built from its
own source file, so a consumer that only reads schemas does not pull ajv's
generated validator into its bundle.

CI gates the result rather than trusting it. `publint` checks the manifest
against what is really in the tarball, and `@arethetypeswrong/cli` runs with
`--profile esm-only`. The profile matters: the default one reports
CJS-resolves-to-ESM as a failure, which for an ESM-only package is the intended
state and would leave the gate permanently red and therefore ignored. Byte
budgets and an unused-export check belong in the same gate and are not there
yet.

## Consequences

**What it buys.** One resolution of every module, one copy of every singleton,
and one set of type declarations that is correct in every consumer. Packaging
mistakes surface in this repository's CI rather than in someone else's build.

**What it costs.** A consumer on an older CommonJS toolchain cannot use the
packages at all. There is no fallback and no interop shim. That is a deliberate
exclusion, and it is the kind that quietly removes a segment of the addressable
market rather than annoying it.

The gates earned their keep immediately, which is the argument for having them
rather than reasoning carefully and shipping. The build emitted `.mjs` while the
exports map still pointed at `.js`, a mismatch nothing but a packaging linter
would have caught before a consumer did. Then `publint` failed on unresolvable
`workspace:` protocols in the Angular package: `ng-packagr` copies them verbatim
into `dist/package.json`, and `dist` is what Angular publishes, so pnpm's own
rewrite-on-publish never reached them. `packages/angular/scripts/finalize-dist.mjs`
now rewrites those to the siblings' real versions and strips `publishConfig`,
which copied into `dist` would redirect publishing again, into `dist/dist`.

## Alternatives considered

**Dual CJS and ESM.** Rejected. It doubles the build matrix and the test
surface, and it buys compatibility with toolchains that Node itself has stopped
requiring us to support.
