# 0028 — Separate the use cases from the HTTP framework

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `@formancy/server-core` declares no HTTP framework and no
  `@types/node`, and its `tsconfig.json` does not add `node` to `types`, so
  `pnpm --filter @formancy/server-core typecheck` fails the moment a Fastify
  type is imported. Every use case is exercised with no server and no database
  in `packages/server-core/src/use-cases.test.ts`, against the `Map`-backed
  `createMemoryStorage`.

## Context

The backend is not a function deployed to an edge runtime. It is a long-lived
container that somebody self-hosts, upgrades, and eventually debugs at two in
the morning. That setting decided the framework. Hono's advantage is running
unchanged on Workers, Deno and Bun, and in a container that portability buys
nothing, while Fastify's plugin ecosystem — rate limiting, helmet, multipart,
under-pressure, swagger — is the part that is load-bearing for operating the
thing. NestJS was rejected for a different reason: its dependency injection and
decorator indirection raise the cost of a first contribution, and for an
adoption-led open-source project a drive-by contributor is a first-class
concern, not a nicety.

Fastify is still a framework, and a framework wound through the use cases makes
them hard to test and impossible to replace.

## Decision

`@formancy/server-core` holds the use cases — publish, resolve, submit, drafts,
listing, export, identity and authorization — and contains no HTTP types at
all. `@formancy/server` holds the Fastify routes and the Postgres storage.
Storage reaches the use cases through the `Storage` port in
`packages/server-core/src/ports.ts`.

## Consequences

**What it buys.** The port has two implementations, Postgres in
`@formancy/server` and a `Map` in `createMemoryStorage`, and the use cases
cannot tell them apart. So the behavioural suite runs without a container, and
the integration suite spends its Testcontainers Postgres only on what needs
real SQL semantics — the immutability trigger, the foreign keys. It also keeps
a Hono adapter possible later at no ongoing cost, because the use cases would
not move.

**What it costs.** An extra package boundary, and plumbing for every endpoint.
Each route parses its body by hand, calls a use case, and maps a discriminated
outcome onto a status code; `packages/server/src/app.ts` is largely that
translation, and adding an endpoint means touching two packages.

**What it forecloses.** Anything that wants the request object inside a use
case. Authorization is therefore split: the route runs `requires(action)` and
the decision table `can(actor, action)` lives in server-core, so the table
stays testable while the 401-or-403 distinction stays with HTTP.

## Alternatives considered

**Hono.** Rejected: multi-runtime portability is worth nothing to a self-hosted
container, and the plugin ecosystem that is worth something is Fastify's.

**NestJS.** Rejected: the indirection tax is paid by every contributor, and
adoption is the scarce resource here.

**One server package.** Rejected: it is the arrangement that makes a use case
untestable without booting a server, which is how server logic drifts away from
the engine's — the failure mode this project exists to prevent
([0030](0030-never-trust-client-state.md)).
