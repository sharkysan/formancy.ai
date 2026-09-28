---
title: What is formancy?
description: A visual form builder for Angular and React. Conditional fields, validation and your own styling, with one engine running in the browser and on the server. Open source, with an optional self-hosted backend.
---

:::caution[Status: beta, version 0.2.0]
formancy is beta software: **versions 1 and 2 of the spec are frozen, version 3 is open,
and the package APIs are not frozen at all.**

`specVersion: "2"` needs `0.2.0` or newer, and `specVersion: "3"` — which is what this
source writes, and the only version that has `signature` — needs a release later than
`0.2.0`. `0.1.0` predates spec versioning entirely: its schema pins `"specVersion"` to
`{ "const": "1" }`, so it does not merely ignore a newer document, it refuses it. Write
the version your installed packages actually speak, which is what the
[React](/docs/start/react/) and [Angular](/docs/start/angular/) quickstarts say.

**Every version only adds**, so an older document still validates and upgrading one is a
single line with nothing rebinding — see
[`MIGRATIONS.md`](https://github.com/sharkysan/formancy.ai/blob/main/MIGRATIONS.md), which
lists what each version added and what freezing one costs. The direction that costs
something is the other one: a reader pinned to an older version refuses a newer document
rather than dropping the answer it cannot render. The packages are published to npm from
CI with provenance under the [`@formancy`](https://www.npmjs.com/org/formancy) scope, and
their APIs will still change before 1.0.

The server has authentication, role-based authorization, per-IP rate limiting, a per-form
origin allowlist, audit logging, drafts that carry their own key, and an opt-in
proof-of-work challenge for anonymous submissions. What it does not have is a submission
token bound to the form version, and no virus scanning of what people attach. It also
writes **no log at all** — Fastify is constructed with the logger off, so nothing can leak
a submission into one and nothing can tell you why a request failed either. Do not deploy
it anywhere public yet.
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
