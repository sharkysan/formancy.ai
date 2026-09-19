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
packages/spec           schema types, JSON Schema, canonical hash, diffing
packages/expressions    CEL parse/check/compile/evaluate + sandbox policy   (not yet)
packages/core           the headless reactive engine                        (not yet)
packages/react          React binding                                       (not yet)
packages/angular        Angular binding                                     (not yet)
packages/conformance    the behaviour + accessibility contract              (not yet)
packages/server         Fastify backend                                     (not yet)
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
