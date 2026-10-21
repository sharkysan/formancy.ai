# 0187 — The SBOM describes what a consumer installs, and is checked before anything is published

- **Status:** accepted
- **Date:** 2026-10-21
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/server/src/release-image.test.ts`.** `release.yml`'s SBOM step packs with
    `scripts/pack.mjs`, installs those tarballs with npm, `--ignore-scripts` and no peer, in a
    directory under `RUNNER_TEMP`, and runs cdxgen with `--required-only` over the directory npm
    installed into, followed through the step's `cd`s rather than looked for as a phrase; and
    `scripts/sbom.mjs` runs after it and before `pnpm publish`. Watched failing against the
    workflow as it was, and against five changes to the new one: cdxgen run over the checkout
    after the install, the peers installed, install scripts run, `--required-only` dropped, and
    the check moved after publishing.
  - **`apps/docs/src/sbom.test.ts`.** The check refuses an SBOM that leaves out a published
    package, or names it at another version; whose dependency graph does not give a package a
    dependency its manifest declares, the CEL evaluator among them while the evaluator is named
    elsewhere in it; that gives a package a dependency it does not name, or another release of a
    sibling; that has no graph, or one whose references are not package URLs; and that gives no
    package the evaluator, even once no manifest declares it. Each refusal watched failing against
    a stub that refused nothing; then each rule taken out of the check on its own, the evaluator's
    put back as the old test of a name among the components, against the cases that hold it; and
    reading cdxgen's two spellings of a scoped package URL, against a reader that knew one. It
    also fails when `scripts/pack.mjs` finds other packages than the projects under
    `pnpm-workspace.yaml`'s globs that are not private, which is what `pnpm publish -r`
    publishes: watched failing with `apps/site` made public.
  - **By hand, on 21 October 2026, on Windows, not on a runner.** The step's own `run:` block,
    taken out of `release.yml` and run with `RUNNER_TEMP` in a scratch directory over `main` at
    `97f3dc9`, version `0.6.0`, made an SBOM of 199 components that `scripts/sbom.mjs` accepted:
    every published package at `0.6.0`, tslib under both Angular packages, and no test tool, no
    React and no Angular. The same check refused `0.6.0`'s SBOM, read from its release page,
    with 45 problems. Its first run on a runner is the next tag.

## Context

`release.yml` made the release's CycloneDX SBOM by running cdxgen 12.8.4 with `--required-only`
over the pnpm workspace, after `pnpm publish -r`, and then checked one thing: that some package
URL in it contained `%40marcbachmann/cel-js`. `RELEASING.md` said the flag "keeps every runtime
dependency and drops the test tooling — about 71 components instead of 1067", and the step's
comment named eight runtime dependencies it had been verified to keep.

`0.6.0`'s SBOM, read from its GitHub release on 2026-10-21, has 109 components:
- **What does not ship, marked required:** Playwright, TypeScript 6.0.3 and 5.6.1-rc, Vite,
  ng-packagr, `@angular/build` and the Testing Library packages, beside React, Monaco and the
  fonts the apps use.
- **What ships, left out:** tslib, which both Angular packages depend on; eleven of the fifteen
  packages fastify depends on, avvio, pino and find-my-way among them; and the ProseMirror
  packages TipTap is built on.
- **The release itself, left out:** every package it published, which in the workspace are links,
  not packages.

The CEL check passed, so the release went on.

The same was found twice beside this repository. formancy.ai-report's v0.1.0 tag was refused
for an SBOM made this way, which named no tslib, and its 0017 made the SBOM from the tarballs
the release publishes; Formancy Data's `0.2.0` SBOM, read from its release page on 2026-10-21,
names mssql and not tedious, the driver mssql runs on. This record adapts formancy.ai-report
0017 to a repository whose release publishes with `pnpm publish -r` and has no release report
to check an SBOM against.

## Decision

**The SBOM is made from what the release publishes, installed as a consumer installs it.** The
step:
1. packs every package the release publishes with `scripts/pack.mjs`, the helper the install
   gates already pack with, into `RUNNER_TEMP`;
2. writes a `package.json` naming `formancy` at the release's version in a directory of its own
   under `RUNNER_TEMP`, outside the checkout, and installs the tarballs there with `npm install
   --ignore-scripts --legacy-peer-deps`;
3. runs cdxgen 12.8.4 with `--required-only` over that directory.

**`scripts/sbom.mjs` checks it**, and the release stops on any of these:
- a package the release publishes that the SBOM does not name at the release's version;
- a dependency a published package's manifest declares that the SBOM's dependency graph does not
  give it, or gives it at a version the SBOM does not name, or, for a sibling, at another
  release's version;
- no published package given the CEL evaluator, `@marcbachmann/cel-js`, whatever the manifests
  declare, because it decides whether a submission is valid.

**Both run before `pnpm publish -r`.** A refusal after publishing would leave a version on npm
that can never be published again, with no SBOM, image or GitHub release, since every later step
is skipped. Before it, a refusal leaves the version free for the tag to be cut again.

What the release publishes is what `scripts/pack.mjs` finds: every package under `packages/`
that is not private. `pnpm publish -r` publishes every project under `pnpm-workspace.yaml`'s
globs that is not private, and the test above holds the two to one list. pnpm's own `pnpm -r
pack` is not used: on 2026-10-21, with pnpm 12.4.2, it packed the private apps and the workspace
root as well.

## Consequences

**What it buys.**
- **An SBOM of the artefact.** A consumer or an auditor reading it sees every published package
  and what installing them brings, not what this repository tests with.
- **A check a wrong SBOM fails.** It reads the graph, so an evaluator named somewhere in the SBOM
  no longer stands in for the evaluator `@formancy/expressions` is given, and a component list
  without the packages being released is refused rather than counted.
- **No release left half-made by its SBOM.** The step that could refuse now comes before the one
  that cannot be undone.

**What it costs.**
- **No peers, one a consumer gets among them.** `--legacy-peer-deps` keeps React and Angular out,
  which the host brings at versions of its own. It also keeps out `@tiptap/extension-list`, which
  three of `@formancy/tiptap`'s list extensions ask for as a peer, and which npm installs for a
  consumer, measured on 2026-10-21. Installed with peers, the SBOM named it, and named React 19.3.1
  and Angular 22.2.3, which no host is bound to; a wrong version is worse than an absent one.
- **Versions resolved on the day.** The install has no lockfile, as a consumer's has none, so
  every version but the published packages' own is the one npm resolved during the release. The
  server image is built from the lockfile and carries this SBOM as its attestation, so the two
  disagree: on 2026-10-21 the SBOM named fastify 5.12.7 and `@node-rs/argon2` 2.2.2 where the
  lockfile, and so the image, holds 5.12.5 and 2.2.1. The attestation already said nothing of the
  image's base layers ([§11](../architecture/11-risks-and-debt.md)).
- **No platform binaries.** `--required-only` drops what npm marks optional, so the SBOM names
  `@node-rs/argon2` and `recheck` and not the native package each installs for a platform; the
  workspace SBOM named every platform's.
- **Tarballs packed twice.** `pnpm publish -r` packs again from the same tree, so the SBOM
  describes packages with the same manifests as the ones published, not the bytes uploaded.
  Publishing the step's tarballs would change how the release publishes, which this does not.
- **A registry install before publishing.** The step took about forty seconds on Windows on
  2026-10-21, packing, installing and cdxgen together, and now stands between the gates and the
  publish. A registry failure there stops the release before anything is published, which is the
  cheaper place for it.
- **The check needs cdxgen's graph.** An SBOM without one, or with references that are not package
  URLs, gives no package anything and is refused; a cdxgen that stopped writing the graph would
  stop every release until it is read another way.

**What it forecloses.** Nothing that cannot be undone: two steps of `release.yml` and a script.

## Alternatives considered

**Keep cdxgen on the workspace and check more of it.** Rejected. The workspace SBOM cannot name
the packages being released, so the first check would refuse it; and it would still mark every
test tool required.

**`pnpm -r pack` for the tarballs.** Rejected: it packs private projects, the apps and the root,
whose dependencies would then be in the SBOM. Filtering it would be a second definition of what a
release publishes beside `scripts/pack.mjs`.

**Install with peers.** Rejected: it names React and Angular at whatever versions npm resolved
that day, as though formancy shipped them. Naming `@tiptap/extension-list` is what it would
gain.

**Hold the SBOM to the install's lockfile, as Formancy Health's release does.** Not now. It would
also refuse a component the install does not hold, a test tool among them. Here the failure that
happened, cdxgen reading the workspace, is refused already, by the released packages missing;
held this way, the lockfile less what npm marks optional matched the SBOM on 2026-10-21.

**Make the SBOM after publishing, as before.** Rejected: see the Decision.
