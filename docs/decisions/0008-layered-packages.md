# 0008 — Layer the packages and enforce the dependency direction

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `tsconfig.base.json` sets `lib: ["ES2023"]` with no DOM
  entry, and `packages/server` is the only package that declares
  `@types/node`, so a `document`, `URL` or `node:crypto` reference in L0 to L2
  fails `pnpm typecheck`. `.npmrc` sets `node-linker=isolated`, so a package
  cannot import what its own `package.json` does not declare and an upward
  import does not resolve at all. The stylesheet rule is not mechanically
  enforced: `packages/themes` is the only package holding a `.css` file and no
  package depends on it, but nothing fails if that changes.

## Context

A layer diagram is a drawing until something rejects the edge that points the
wrong way. The rules worth drawing here are narrow: spec, expressions, core and
builder-core compile with no DOM and no Node library; core never imports a
framework; nothing below the component kit ships a CSS file; and themes are
never a dependency of anything.

## Decision

Six layers. L0 `@formancy/spec` — types, JSON Schema, diff, canonical hash. L1
`@formancy/expressions`, the CEL facade ([0017](0017-expression-facade.md)). L2
`@formancy/core`, the engine. L3 `@formancy/react` and `@formancy/angular`, the
bindings. L4 the unstyled component kits those bindings ship as their defaults.
L5 `@formancy/themes`, which nothing depends on and which an application opts
into.

Enforcement is mostly the type system rather than a lint rule. The isomorphic
packages deliberately have no `@types/node` and the base config's `lib` has no
DOM entry, so a violation is a compile error and not a review comment.

## Consequences

**What it buys.** The direction holds without anybody policing it. A
contributor meets the rule the first time they break it, from the compiler
rather than from a reviewer. The same absence is what makes the isomorphism in
[0006](0006-one-engine-build.md) a property rather than an intention.

**What it costs.** The missing ambient globals are genuine friction. Hashing
could not use `node:crypto` and uses `@noble/hashes` instead
(`packages/spec/src/hash.ts`); the `url` format check could not use the `URL`
constructor and is a regular expression
(`packages/core/src/model-validators.ts`). Each was found by hitting it rather
than by anticipating it, and each is a small cost paid for a large invariant.

**What it forecloses.** The renderers can never ship a default stylesheet, so a
form is unstyled until the application says otherwise. That is correct and it
is also the first thing an evaluator sees.

## Alternatives considered

**A boundary lint rule**, from ESLint or dependency-cruiser. Rejected: an
exception can be added to a rule file, usually in the same commit as the
violation. Adding `@types/node` to an isomorphic package is the same act, but it
lands in a dependency list a reviewer is already reading. The repository has no
linter at all and does not need one for this.

**Fewer, larger packages.** Rejected. A direction can only be enforced between
artefacts, and one package has no edges to check. It would also hand every
consumer code they do not use.
