---
title: What is formancy?
description: A self-hostable form engine, renderers and backend for React and Angular — one engine in browser and server, your design system's markup, Apache-2.0.
---

:::caution[Status: pre-alpha]
formancy is pre-alpha software. The schema spec is at `specVersion: "2"`.
Version 1 is frozen and every version 1 document still validates — version 2
only adds, so upgrading is one line and nothing rebinds. The *packages* are still
pre-alpha and their APIs will change. They are **on npm** under the
[`@formancy`](https://www.npmjs.com/org/formancy) scope at `0.1.0`, published
from CI with provenance — except `@formancy/builder-react`, which lands in
the next release. The server has authentication, role-based authorization,
per-IP rate limiting and a per-form origin allowlist, but no proof-of-work
challenge, no submission tokens and no audit logging. Do not build on it yet,
and do not deploy it anywhere public.
:::

formancy is a modern, self-hostable form platform for React and Angular. It is
three things that are usually sold separately:

- **A headless form engine** (`@formancy/core`) that compiles a form document —
  fields, conditional logic, computed values, validation — into one reactive
  evaluation graph.
- **Native renderers** for React (`@formancy/react`) and Angular
  (`@formancy/angular`), which are thin bindings over the same engine: hooks and
  `useSyncExternalStore` on one side, signals on the other, identical behaviour
  on both.
- **A self-hostable backend** (`@formancy/server`), a Fastify + Postgres service
  that publishes form versions, replays every submission through the same
  engine, and exports the results.

## The three commitments

Form platforms today make you choose between a good renderer and a good
builder, and most of them own your markup. formancy is built on three
commitments:

**One engine, browser and server.** The same compiled validation,
conditional-logic and calculation engine runs in both places, so client and
server rules cannot drift. The server does not trust the browser: it replays
every submission through the engine, recomputes calculated values, strips
hidden branches and stores the canonical result.

**Your design system owns the markup.** Headless by default. The component kits
ship zero CSS, and there are two levels of escape: swap individual field
components through a registry (per-path entries beat per-type entries beat the
unstyled built-ins), or drop to the engine's prop getters and render every
element yourself. The prop getters are computed in the engine, so React and
Angular ship byte-identical ARIA wiring.

**Apache-2.0, with no paywalled essentials.** The spec, engine, renderers,
conformance suite and self-hostable backend are free forever. The conformance
suite is itself published, so a third party building a Vue, Svelte or Solid
renderer can certify against the same behavioural contract.

## What keeps the renderers honest

Both renderers pass the same [conformance suite](/docs/concepts/conformance/): six
fixtures, written once as data, executed against each implementation. A driver
may locate a control only by **accessible name and role** — never a test id or
a CSS selector — so a renderer whose markup a screen reader cannot use cannot
pass the suite either.

## Where to go next

- [Quickstart: React](/docs/start/react/) — a working form in one component.
- [Quickstart: Angular](/docs/start/angular/) — the same form over signals.
- [Quickstart: self-hosting](/docs/start/self-hosting/) — Postgres, the server, and
  the full HTTP surface.
- [The schema](/docs/concepts/schema/) — why the model, the logic and the
  presentation are separate sections.
- [Roadmap and status](/docs/project/roadmap/) — what exists today and what is
  planned.
