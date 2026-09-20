# 0037 — pnpm workspaces with Turborepo, not Nx

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `.npmrc` sets `node-linker=isolated`, so a package resolves
  only what its own manifest declares and `pnpm typecheck` fails on anything
  else; no package outside `packages/server` depends on `@types/node`, so an
  ambient Node import in an isomorphic package does not compile. The
  `eslint-plugin-boundaries` configuration this record anticipates is not in the
  repository yet: there is no ESLint config, and `turbo run lint` matches no
  package script. The layer *ordering* of [0008](0008-layered-packages.md) is
  therefore not mechanically enforced today.

## Context

The two candidates split cleanly, and neither dominated.

Nx wins on Angular integration and ships `@nx/enforce-module-boundaries`, which
is the natural way to enforce [0008](0008-layered-packages.md): tag each project
with its layer, declare which tags may depend on which, and a violation becomes
a lint error rather than a review comment.

Turborepo wins on whether a drive-by contributor understands the repository in
ten minutes. There are no generators and no project graph to learn; `turbo.json`
is a short list of tasks, and each package builds with its own script.

## Decision

pnpm 12 workspaces with catalogs, plus Turborepo. The layering enforcement that
Nx would have provided comes from `eslint-plugin-boundaries` and, more
importantly, from the type system: the isomorphic packages simply have no
`@types/node`, so reaching for `node:fs` inside the engine is a compile error
and not a matter of anyone's vigilance.

The deciding variable is that this is an adoption-led commercial open-source
project ([0003](0003-open-core-line.md)), where contributor onboarding is a
first-class concern rather than a nicety.

## Consequences

**What it buys.** Anyone who has used a pnpm workspace can navigate this one on
the first evening. The choice is also cheap to revisit: the package boundaries
and the dependency graph already live in the manifests, so if layering
violations start slipping through in practice, moving to Nx is a contained
change rather than a rewrite.

**What it costs.** Less integrated Angular tooling. `ng-packagr` is invoked
through its CLI from the build script in `packages/angular`, and there are two
publishing toolchains to maintain: `tsdown` for the TypeScript packages and
`ng-packagr` for Angular, because the Angular Package Format requires
partial-Ivy compilation. Two toolchains mean two sets of packaging failures, and
the Angular one needed a post-build step of its own,
`packages/angular/scripts/finalize-dist.mjs` (see [0038](0038-esm-only.md)).
That is a real, permanent cost of supporting Angular
([0007](0007-react-and-angular-first.md)), budgeted from day one rather than
discovered.

**What it forecloses.** The module-boundary rule has to be bought back by hand,
and until it is, the type system carries the enforcement alone. The type system
catches a package reaching outside its runtime; it does not catch a package
reaching sideways into a peer it should not know about.

## Alternatives considered

**Nx.** Rejected, and not on its feature list, which is the larger one. It lost
on the cost it imposes on a contributor who has never used it, which for an
adoption-led project is the variable that matters most. The one thing it would
have given for free, `@nx/enforce-module-boundaries`, is replaceable.
