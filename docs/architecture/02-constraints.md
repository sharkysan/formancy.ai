# 2. Constraints

Constraints, unlike decisions, were not chosen. They are recorded because
several of the decisions in [`../decisions/`](../decisions/) look arbitrary
without them.

## Technical constraints

| Constraint | Consequence |
|---|---|
| **The engine must run in a browser and in Node from one build** | `@formancy/core`, `@formancy/spec`, `@formancy/expressions` and `@formancy/builder-core` use no DOM API, no Node API and no ambient global. They deliberately have no `@types/node`, so the compiler enforces this ([0006](../decisions/0006-one-engine-build.md), [0008](../decisions/0008-layered-packages.md)) |
| **Angular 22 pins the TypeScript version** | `@angular/compiler-cli` 22.1.7 declares `typescript: ">=6.0 <6.1"`. TypeScript `latest` is 7.0.2 and is rejected, so the whole monorepo is pinned to `~6.0.3` ([0039](../decisions/0039-pin-typescript.md)) |
| **Angular requires its own build toolchain** | The Angular Package Format needs partial-Ivy compilation, so `ng-packagr` is mandatory alongside `tsdown`. Two publishing toolchains, permanently ([0037](../decisions/0037-turborepo-over-nx.md)) |
| **Angular 22 is zoneless and OnPush by default** | An external store bound naively produces either missed updates or a whole-form re-render per keystroke. The subscription API had to be designed for this, which is why Angular was built second rather than last ([0020](../decisions/0020-identity-stable-snapshots.md)) |
| **Buyers in banking and government cannot permit `unsafe-eval`** | No `eval` and no dynamic function construction anywhere; CEL is interpreted and the schema validator is generated ahead of time ([0040](../decisions/0040-no-eval.md)) |
| **Node 22.12's bundled corepack fails signature verification** | Contributors need `npm install -g corepack@latest`. Recorded because it blocks a fresh clone and the error message does not say why |

### What the isomorphic constraint cost in practice

Each of these was hit as a compile error and forced a better answer:

- `TextEncoder` is unavailable, so hashing uses `@noble/hashes` and its own
  `utf8ToBytes` rather than `node:crypto`.
- `structuredClone` is unavailable, so tests clone by JSON round-trip.
- `URL` is unavailable, so the `url` format check is an explicit regular
  expression rather than a constructor call in a `try`.
- `console` is unavailable, so a test that needed it declares the shape it uses
  locally.

None of these is a hardship. They are listed because the absence of
`@types/node` looks like an oversight until you see what it prevents.

## Organisational constraints

| Constraint | Consequence |
|---|---|
| **Single maintainer** | Documented honestly in `GOVERNANCE.md`. It is also why the CEL library's own single-maintainer risk is handled architecturally rather than by relationship ([0017](../decisions/0017-expression-facade.md)) |
| **Adoption-led commercial open source** | Contributor onboarding is a first-class concern, which decided Turborepo over Nx and Fastify over NestJS |
| **Competing commercially under the project's own name** | Apache-2.0's explicit non-grant of trademark rights matters, and the word mark should be registered before the project has traction ([0002](../decisions/0002-apache-2-0.md)) |

## Conventions

- ESM only, `NodeNext` resolution, so relative imports carry `.js`.
- `erasableSyntaxOnly`: no TypeScript enums, no parameter properties.
- `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  The latter is why an optional field on a snapshot is declared
  `label: string | undefined` rather than `label?: string` — the property is
  always present and sometimes undefined, and saying so is more honest.
- One version number across all packages; the spec version is a separate line
  ([0009](../decisions/0009-independent-spec-version.md)).
