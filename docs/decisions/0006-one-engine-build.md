# 0006 — One engine build runs in the browser and on the server

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core` declares no `@types/node` and
  `tsconfig.base.json` sets `lib: ["ES2023"]` with no DOM entry, so
  `pnpm --filter @formancy/core typecheck` fails the moment the engine reaches
  for a Node or browser global. `packages/server-core/src/use-cases.ts` builds
  the engine with the same `createFormEngine` the renderers use, and the test
  "never trusts the client: hidden-branch data is stripped and computed lies are
  overwritten" in `packages/server-core/src/use-cases.test.ts` fails if the
  server stops replaying. The fixtures are not yet executed against the engine
  in a real browser — the renderer suites run under jsdom — so the browser half
  of this rests on the compiler rather than on a run.

## Context

Client validation that disagrees with server validation is a permanent bug
class, and it is permanent precisely because the two are different codebases.
Every rule is written twice and the second writing drifts. form.io makes this
structural by splitting the architecture across languages, so the disagreement
is not something anyone can finish fixing.

## Decision

The backend is TypeScript, so the same compiled engine runs in both places. The
server rebuilds the engine from the exact form version the client rendered and
replays the submission through it.

## Consequences

**What it buys.** There is one definition of what a form means. The server's
answer and the client's answer cannot disagree, because there is only one
answer and the client holds a fast preview of it. That is what makes
recomputing every derived value server-side
([0030](0030-never-trust-client-state.md)) a few lines rather than a second
implementation.

**What it costs.** The server is locked to Node. A future Go or Java
implementation cannot link this build and must reimplement the engine against
the spec, which is part of why CEL was chosen ([0016](0016-cel.md)): its
semantics are portable, and its corpus belongs to someone else
([0036](0036-pin-the-cel-corpus.md)).

**What it forecloses.** This is load-bearing for the whole design rather than a
local choice. It constrains `@formancy/core` to zero DOM, framework and Node
imports and to fully serialisable state. Replay only means something if the
engine is deterministic, which is why the clock and randomness are injected
([0019](0019-injected-capabilities.md)). Anything that would break isomorphism
is rejected regardless of how convenient it is.

## Alternatives considered

**A backend in another language.** Rejected: it reintroduces the split whose
consequences motivated the decision. It remains available later as a second
implementation certified against the published suite
([0033](0033-one-suite-n-drivers.md)), which is a different thing from a second
source of truth.

**Two engines kept in step by tests.** Rejected. A cross-implementation test
catches the disagreements somebody thought to write down, and the expensive ones
are the others.
