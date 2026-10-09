# 0134 — The versions formancy says it supports are the versions it runs

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `apps/docs/src/compatibility.test.ts` — the lowest version of each list in
  `compatibility.json` is the lower bound of the range the packages declare (React's and
  Angular's peers, agreed across every package that declares them, and the root `engines`),
  Angular Material's and the CDK's peers are Angular's, the CI workflow reads each list as a
  job matrix, and the compatibility page states each lowest version with the range it is
  the bound of. Widening a range, raising `engines`, a page naming another version, a list
  not run as a matrix and Material out of step each fail a named case.
  `pnpm test:e2e:install` with `FORMANCY_REACT` — now renders a form with the installed React;
  an expected fragment removed from the markup fails it. `pnpm test:e2e:angular` with
  `FORMANCY_ANGULAR` — builds and runs the packed Angular packages under that Angular in
  Chromium; dropping Material from its fixture fails it.
- **Deciders:** Daniel Bacher

## Context

The backlog asked for a tested compatibility matrix. The packages declared React
`^19.0.0`, Angular `^22.0.0` and Node `>=22.12.0`, and nothing had ever run on React 19.0,
Angular 22.0 or Node 24: the workspace pins one version of each, so every gate tested the
newest, and a consumer at the bottom of a range was trusting a promise nobody had checked.

## Decision

**One file names the tested versions, and CI runs each as a job.** `compatibility.json` holds
a list per runtime — the lowest the range admits and the newest. A `matrix` job reads it, and
three jobs run once per entry: `install` per React, `angular` per Angular, `node` per Node.

**The lowest of each list is the bound of the declared range, and a test says so.** A range
cannot be widened without a run at its new bound, and a page cannot name a version the runs do
not.

**Each run proves something a type check cannot.**

- **React:** the packed packages, installed into a plain npm project with that React — now
  also rendering a form to HTML, so the hooks run and the engine's ids and `aria-required`
  reach the markup. The bundle the install test already built was never executed.
- **Angular:** a new install test, `scripts/angular-install-test.mjs`. An Angular package is
  consumed by an Angular build whose linker is the consumer's, so the packed packages are
  installed into an Angular project at that version — Material at the same version, since
  Angular refuses siblings at different ones — built by that project, and run in Chromium:
  Material draws the email, the default control draws the file, and a submit comes back.
- **Node:** the engine, the expression language, the spec, the MCP server and the server, the
  server's integration tests against PostgreSQL and Garage included.

Once the Angular runner worked, all four framework combinations passed locally; the matrix
exists so that stays a fact rather than becomes an assumption.

## Consequences

**CI is wider.** Six more jobs per pull request, each a few minutes, run in parallel.

**What is not tested is said on the page.** The conformance suite still runs against the
workspace's own React and Angular, not the lowest; Angular SSR and React Server Components are
not run; browsers other than Chromium are a CSS target, not a run; Vite is the only bundler.

**A local Windows run met a trap CI cannot.** `tmpdir()` can return an 8.3 short path, Vite
resolves modules to the long one, and Analog's plugin then compiled none of the fixture's own
components — its decorator reached the bundle as a syntax error. The runner canonicalises its
working directory. Two "fixes" made before the cause was found — a separate entry file and an
absolute tsconfig path — were confounded by it, were measured as unnecessary once it was gone,
and were reverted.

**The pack step is shared.** `scripts/pack.mjs` packs for both install tests; it was inside
the first, and a second copy would have been a second answer to what a release pushes.

## Alternatives considered

**State the ranges and test only the newest.** What was done; it is what this replaces.

**Narrow the ranges to what is tested.** Honest, and hostile: `^22.1.7` would refuse an
Angular 22.0 application that works, as the run now shows it does.

**A matrix in the workflow and the versions in prose.** Two places, and the next widening of a
range would update one of them.
