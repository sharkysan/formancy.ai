# formancy

A modern, self-hostable form engine, visual builder and backend — for React and Angular.

> **Status: pre-alpha.** The schema spec is `specVersion: "0"` and is *unstable*. It
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
packages/server-core    backend use-cases against storage ports
packages/server         Fastify + Postgres: publish, resolve, replayed submissions
```

## Development

Requires Node >= 22.12 and pnpm (via `corepack enable pnpm`).

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
