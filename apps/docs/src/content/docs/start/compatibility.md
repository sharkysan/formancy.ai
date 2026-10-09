---
title: Compatibility
description: The React, Angular and Node.js versions formancy is tested with, what each run proves, and what is not tested.
---

Each version below is a run in CI, on every pull request. They come from one file,
[`compatibility.json`](https://github.com/sharkysan/formancy.ai/blob/main/compatibility.json),
which the workflow reads as its job matrices — and a test requires the lowest of each to be
the lower bound of the range the packages declare, so a range cannot widen without a run at
its new bound
([0134](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)).

| | Declared | Lowest tested | Newest tested |
| --- | --- | --- | --- |
| React | `^19.0.0` (peer) | 19.0.0 | the newest 19 |
| Angular | `^22.0.0` (peer) | 22.0.0 | the newest 22 |
| Node.js | `>=22.12.0` | 22.12.0 | 24 |

**Angular Material** follows Angular: `@formancy/angular/material` needs `@angular/material`
and `@angular/cdk` at the same version as Angular, and each Angular run installs them at it.
**TypeScript** is tested at `~6.0`, which is what Angular 22 requires (`>=6.0 <6.1`). A React
project on another TypeScript is not tested.

## What each run proves

**React.** The packed packages install into a plain npm project with that React, type-check
with `skipLibCheck` off, run their isomorphic part under Node, **render a form to HTML with
that React** — the hooks run, and the engine's ids and `aria-required` reach the markup — and
bundle with Vite, stylesheet included.

**Angular.** The packed Angular packages install into an Angular project with that Angular and
Material, are linked and built by that project's own Angular, and **run in Chromium**: a field
drawn with Material, a file drawn by the default control, and a submit that reaches the engine
and comes back.

**Node.js.** The engine, the expression language, the spec, the MCP server and the server —
its integration tests against real PostgreSQL and Garage included — on that Node. 22.12 is the
container's own.

## What is not tested

- **The conformance suite under the lowest versions.** It runs against the workspace's own
  React and Angular; the runs above prove the packages install, build and work, not every
  behaviour the fixtures specify.
- **Server-side rendering in Angular**, and **React Server Components**.
- **Browsers other than Chromium.** The stylesheets are built for Chrome and Edge 120, Firefox
  113 and Safari 16.4 — the first with both `:dir()` and `color-mix()` — and a bundler targeting
  older browsers rewrites `:dir()` wrongly. Layout and gestures are checked in Chromium only.
- **Bundlers other than Vite**, and the Angular CLI's own builder: the Angular run uses Vite with
  Analog's Angular plugin, which links packages the same way.
