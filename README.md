# formancy

A modern, self-hostable form engine and backend — for React and Angular.

> **Status: pre-alpha, version 0.1.0, unpublished.**
>
> The **spec is frozen** at `specVersion: "1"`: a form document written today
> keeps working, and the submissions stored against it keep their shape. The
> **packages are not** — their APIs will change before 1.0, and they are not on
> npm yet, so clone the repository to try them.
>
> Do not deploy the server anywhere public. It has authentication and
> role-based authorization, but no rate limiting, no anonymous-submission
> hardening and no audit logging.

## Why

Form platforms today make you choose between a good renderer and a good
builder, and most of them own your markup. formancy is built on three
commitments:

- **One engine, browser and server.** The same compiled validation,
  conditional-logic and calculation engine runs in both places, so client and
  server rules cannot drift.
- **Your design system owns the markup.** Headless by default — the component
  kit ships zero CSS, and you can drop to prop getters and render every element
  yourself.
- **Apache-2.0, with no paywalled essentials.** The spec, engine, renderers,
  builder and self-hostable backend are free forever.

## Layout

```
packages/spec           schema types, JSON Schema, canonical hash, diffing,
                        i18n and layout resolution
packages/expressions    CEL parse/check/compile/evaluate + deterministic metering
packages/core           the headless reactive engine (rules, rows, wizard, a11y ids)
packages/react          React binding: hooks, unstyled components, error summary
packages/angular        Angular binding: signals over the same protocol, zoneless
packages/conformance    the behaviour + accessibility contract (7 fixtures, published)
packages/builder-core   headless schema editing: commands, undo/redo, valid targets
packages/server-core    backend use-cases against storage ports
packages/server         Fastify + Postgres: publish, resolve, replayed submissions,
                        drafts with lazy migration, CSV export
packages/themes         two reference themes. Nothing depends on them
apps/playground         the one-screen demo (editor / live form / engine state)
apps/admin              the self-hosted admin, v0.1 cut
apps/docs               the documentation site (Astro Starlight)
```

**There is no builder UI yet.** `builder-core` is the document engine
underneath one — commands, undo/redo, and legality decided by attempting the
edit — and it is done and tested. The canvas is the next large piece of work.

## Development

Requires Node >= 22.12, pnpm (via `corepack enable pnpm`), and Docker (for the
server's integration tests and the dev database).

```bash
pnpm install
pnpm build
pnpm test        # server tests start a disposable Postgres via Testcontainers
pnpm typecheck
```

### Run the stack locally

```bash
docker compose up -d                    # Postgres on :5439

DATABASE_URL=postgres://formancy:formancy@localhost:5439/formancy \
  pnpm --filter @formancy/server dev    # API on :4380

pnpm --filter @formancy/admin dev       # admin on :4382 (proxies /api)
pnpm --filter @formancy/playground dev  # playground on :4381
```

The admin is the v0.1 cut: a schema editor with live preview, publish, version
history, and submissions with a CSV export whose columns are unioned across
schema versions. The playground is the one-screen demo — schema on the left,
the live form in the middle, the engine's actual state on the right — with a
theme switcher, because two themes that look like unrelated products are how
the headless claim gets falsified rather than asserted.

## Documentation

Two sets, for two different questions.

**How to use it** — [`apps/docs`](./apps/docs), an Astro Starlight site with
quickstarts for React and Angular, the concepts, and a spec reference generated
from the JSON Schema.

**Why it is built this way** — [`docs/`](./docs):

- [Architecture](./docs/README.md#architecture), arc42-shaped. Start with
  [the five ideas everything else follows from](./docs/architecture/04-solution-strategy.md).
- [Forty-three decision records](./docs/decisions/), each naming what would
  fail if the decision were violated — or saying plainly that nothing would.
- [Regulatory material](./docs/regulatory/MDR-CONTEXT.md) for anyone
  incorporating formancy into a product that has to answer to a regulator.
  formancy is not a medical device and claims no conformity; the documents say
  what they are and what they are not.

## Releases

[`CHANGELOG.md`](./CHANGELOG.md) — what is in each version, and what is
knowingly missing from it. [`RELEASING.md`](./RELEASING.md) — how a release is
cut, and what the pipeline signs and attests.

Releases are published from CI with npm provenance, and each one carries a
CycloneDX SBOM signed with cosign. Nothing is published yet: 0.1.0 is tagged,
and the `@formancy` npm scope has not been claimed.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
