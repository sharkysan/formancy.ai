# formancy

A modern, self-hostable form engine, visual builder and backend — for React and Angular.

> **Status: pre-alpha.** The schema spec is `specVersion: "1"` and is *unstable*. It
> freezes to `"1"` once the Angular renderer has proved the model is not React-shaped.
> Do not build on it yet.

## Why

Form platforms today make you choose between a good renderer and a good builder, and
most of them own your markup. formancy is built on three commitments:

- **One engine, browser and server.** The same compiled validation, conditional-logic and
  calculation engine runs in both places, so client and server rules cannot drift.
- **Your design system owns the markup.** Headless by default — the component kit ships
  zero CSS, and you can drop to prop getters and render every element yourself.
- **Apache-2.0, with no paywalled essentials.** The spec, engine, renderers, builder and
  self-hostable backend are free forever.

## Layout

```
packages/spec           schema types, JSON Schema, logic rules, canonical hash, diffing
packages/expressions    CEL parse/check/compile/evaluate + deterministic metering
packages/core           the headless reactive engine (rules, rows, wizard, a11y ids)
packages/react          React binding: hooks, unstyled components, error summary
packages/angular        Angular binding: signals over the same protocol, zoneless
packages/conformance    the behaviour + accessibility contract (6 fixtures, published)
packages/builder-core   headless schema editing: commands, undo/redo, valid targets
packages/server-core    backend use-cases against storage ports
packages/server         Fastify + Postgres: publish, resolve, replayed submissions,
                        drafts with lazy migration, CSV export
apps/playground         the one-screen demo (editor / live form / engine state)
apps/admin              the self-hosted admin, v0.1 cut
apps/docs               the documentation site (Astro Starlight)
```

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
docker compose up -d                                  # Postgres on :5439
DATABASE_URL=postgres://formancy:formancy@localhost:5439/formancy   pnpm --filter @formancy/server dev                  # API on :4380
pnpm --filter @formancy/admin dev                     # admin on :4382 (proxies /api)
pnpm --filter @formancy/playground dev                # playground on :4381
```

The admin is the v0.1 cut: a schema editor with live preview, publish,
version history and submissions with a CSV export whose columns are unioned
across schema versions. The playground is the one-screen demo: schema on the
left, the live form in the middle, the engine's actual state on the right.

## Documentation

Two sets, for two different questions.

**How to use it** — [`apps/docs`](./apps/docs), an Astro Starlight site with
quickstarts for React and Angular, the concepts, and a spec reference generated
from the JSON Schema.

**Why it is built this way** — [`docs/`](./docs):

- [Architecture](./docs/README.md#architecture), arc42-shaped. Start with
  [the five ideas everything else follows from](./docs/architecture/04-solution-strategy.md).
- [Forty decision records](./docs/decisions/), each naming what would fail if
  the decision were violated — or saying plainly that nothing would.
- [Regulatory material](./docs/regulatory/MDR-CONTEXT.md) for anyone
  incorporating formancy into a product that has to answer to a regulator.
  formancy is not a medical device and claims no conformity; the documents say
  what they are and what they are not.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
