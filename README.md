# formancy.ai

<p>
  <a href="https://github.com/sharkysan/formancy.ai/actions/workflows/ci.yml"><img src="https://github.com/sharkysan/formancy.ai/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/sharkysan/formancy.ai"><img src="https://codecov.io/gh/sharkysan/formancy.ai/branch/main/graph/badge.svg" alt="Codecov coverage" /></a>
  <a href="https://www.npmjs.com/package/@formancy/core"><img src="https://img.shields.io/npm/v/%40formancy%2Fcore?style=flat&amp;label=npm&amp;color=a8f5ca&amp;labelColor=102b29" alt="npm version: @formancy/core" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-a8f5ca?style=flat&amp;labelColor=102b29" alt="License: Apache-2.0" /></a>
  <a href="#development"><img src="https://img.shields.io/badge/node-%3E%3D22.12.0-a8f5ca?style=flat&amp;labelColor=102b29" alt="Node.js: >=22.12.0" /></a>
  <a href="#formancy"><img src="https://img.shields.io/badge/status-pre--alpha-a8f5ca?style=flat&amp;labelColor=102b29" alt="Status: pre-alpha" /></a>
</p>

A modern, self-hostable form engine and backend — for React and Angular.

> **Status: pre-alpha, version 0.1.0.**
>
> **Spec version 2.** A form document written against version 1 keeps working
> and its submissions keep their shape — version 2 only adds, so upgrading is
> one line and nothing rebinds
> ([0051](./docs/decisions/0051-spec-2-adds-types.md)). The
> **package APIs are not frozen** — they will change before 1.0.
> Ten packages are on npm under the
> [`@formancy`](https://www.npmjs.com/org/formancy) scope at `0.1.0`, published
> from CI with provenance.
>
> The server is not ready for a public deployment. It has authentication,
> role-based authorization, forms that are private until opened, per-IP rate
> limits, a request body cap and a publish-time check that refuses regular
> expressions which can be made to backtrack — but no challenge, no submission
> tokens and no audit logging.

## Install

```bash
npm install @formancy/react @formancy/core @formancy/spec    # React 19
npm install @formancy/angular @formancy/core @formancy/spec  # Angular 22
```

ESM-only, Node >= 22.12. The framework package is a peer dependency, so you
keep the React or Angular version you already have. The backend is a container
rather than a dependency — see [running the stack](#run-the-stack-locally).

`@formancy/builder-react` is not published yet; [clone the
repository](#development) to use the builder.

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
packages/builder-react  the builder UI: structure tree, arrangement tree,
                        field palette, property panel, logic — keyboard-first,
                        with drag as a second route
packages/server-core    backend use-cases against storage ports
packages/server         Fastify + Postgres: publish, resolve, replayed submissions,
                        drafts with lazy migration, CSV export
packages/themes         two reference themes. Nothing depends on them
apps/site               formancy.ai — the landing page, which renders a real form
apps/playground         the one-screen demo (editor / live form / engine state)
apps/admin              the self-hosted admin, v0.1 cut
apps/docs               the documentation site (Astro Starlight)
```

**The builder edits two documents over one model.** `builder-core` holds the
document, the undo stack and the rules about which edits are legal.
`builder-react` is the interface over it, in two trees:

- **Structure** — what the form collects. Fields, groups, pages and repeaters,
  with a palette, a property panel generated from the spec's own JSON Schema,
  and conditions that compile to CEL.
- **Arrangement** — where it appears. Rows, columns and sections, which is how
  two fields end up side by side.

Both are entirely keyboard-driven, and both grew a drag surface afterwards,
[deliberately in that order](./docs/decisions/0046-keyboard-before-drag.md).
Rows and columns can also be dragged **on the preview itself** — the rendered
form is a drop target, going through the same commands, so the two views cannot
disagree ([0050](./docs/decisions/0050-arrange-in-two-places.md)).

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
docker compose up -d                    # Postgres on :5439, API on :4380
```

That builds and runs the server image. It **refuses to start until you have
secrets**:

```bash
cp .env.example .env
# then fill in FORMANCY_AUTH_SECRET, FORMANCY_ADMIN_EMAIL and
# FORMANCY_ADMIN_PASSWORD — .env.example has a one-line generator
```

There are no defaults, here or in the image. A form platform that boots with a
signing key printed in its own repository is one that anyone who has read the
repository can forge a session for. The admin is created only while no user
exists, so it cannot re-seed an admin into a running installation.

To work on the source instead, run only the database and start the server
from the workspace:

```bash
docker compose up -d postgres           # Postgres on :5439

DATABASE_URL=postgres://formancy:formancy@localhost:5439/formancy \
  pnpm --filter @formancy/server dev    # API on :4380

pnpm --filter @formancy/admin dev       # admin on :4382 (proxies /api)
pnpm --filter @formancy/playground dev  # playground on :4381
pnpm --filter @formancy/site dev        # formancy.ai on :4384
```

Those ports are fixed rather than "the next free one", so a stale dev
server is an error you see immediately instead of a page at an address
nobody was told about.

### Build formancy.ai

The website is one static deployment: the landing page at `/`, the playground
copied into `/playground/`.

```bash
pnpm build:web                          # -> apps/site/dist
```

Two Vite apps rather than one, because they are two products — and serving
them together is a copy. The playground is **built with `base: '/playground/'`**,
which is the part that is easy to get wrong and impossible to notice: Vite
writes absolute asset URLs, so a playground built at the default base asks for
`/assets/index-<hash>.js`, which is the *site's* asset directory. The page
loads, the script 404s, and the deployment is a blank screen while every build
log says it succeeded. `scripts/build-web.mjs` reads the built HTML back and
refuses to finish if that has happened.

Deploying is whatever serves a directory. With Cloudflare:

```bash
pnpm build:web                          # build command
cd apps/site && npx wrangler deploy --assets=dist   --name=formancy-ai --compatibility-date=2026-09-18
```

The admin has a **build** tab — the keyboard-driven builder in a three-pane
inspector, beside a live preview, switching between the structure and the
arrangement in the pane header — plus the raw schema editor, publish, version
history, and submissions with a CSV export whose columns are unioned across
schema versions.

The playground is the one-screen demo: schema or builder on the left, the live
form in the middle, the engine's actual state on the right. Under **Build**,
*Fields* and *Arrangement* are two views of one document — move a field into a
row in either tree, or drag it on the form itself, and all three panes follow.
Two switchers, and neither is decoration.

**Theme** proves the headless claim: the renderers ship no CSS, and two themes
that look like unrelated products swap live with no remount and no component
change.

**Language** proves the i18n section. The demo form's labels are `$t`
references into three catalogues, and French is deliberately incomplete —
switch to it and most of the form is French while three labels stay English,
because a missing translation falls back to the default locale rather than
printing a message id at somebody.

## Accessibility

Not a workstream beside the code — a property of passing the tests.

**A renderer whose markup cannot be reached by role and accessible name fails
the conformance suite.** The drivers are forbidden from using test ids or CSS
selectors, so a control a screen reader cannot find is a control no test can
drive ([0034](./docs/decisions/0034-accessible-name-only.md)). axe-core runs
after every mount and every DOM-mutating change.

**The engine owns ids and ARIA composition**
([0021](./docs/decisions/0021-engine-owns-aria.md)), so both renderers wire
them identically rather than each getting it slightly wrong: `aria-invalid`
only when validated *and* invalid, `aria-required` reactive because
requiredness can be expression-driven, real `fieldset`/`legend` for groups,
exactly one polite live region per form, and an error summary that takes focus
without `role="alert"` — focusing it already announces it.

**Side-by-side layouts** are where reading order and visual order most easily
come apart, so four criteria shape how they are built:

| Criterion | What it forces |
|---|---|
| **1.3.2** Meaningful Sequence | Children are emitted in the layout's declared order; the stylesheet places them by source order alone — no `order`, no explicit `grid-column` |
| **2.4.3** Focus Order | Follows from the same rule: tab order is DOM order is visual order |
| **1.4.10** Reflow | A row becomes one column when there is no width for two, via `auto-fit`/`minmax` — a media query, not a measurement. A layout that reflows only after scripts run does not reflow |
| **1.3.1** Info and Relationships | A row is presentation and gets no semantics; a *labelled* section is visibly grouping fields, so it is a real `role="group"` with an accessible name. An unlabelled one stays a plain box, because a group with no name announces "group" and tells nobody anything. A **table** is a grid and not a `<table>`: arranging fields in columns is not tabular data, and the markup would announce rows and columns that mean nothing |

**Tabs** are presentation, unlike pages, and everything about them follows from
that one fact.

| Criterion | What it forces |
|---|---|
| **4.1.2** Name, Role, Value | The full ARIA tabs pattern: `tablist`, `tab`, `tabpanel`, `aria-selected`, `aria-controls`. A strip may be named, because two strips in one form are otherwise both announced as "tab list" |
| **2.1.1** Keyboard | Arrows move between tabs, Home and End reach the ends, and the strip is one tab stop through a roving tabindex — twelve tabs must not cost twelve presses to get past |
| **3.3.1** Error Identification | A field in a closed tab is still validated and still submitted, so the error summary can send focus to it. Focusing a control inside a hidden panel does nothing at all, so the strip **opens the tab focus lands in** — without that, a reader is told the form has an error and sent nowhere |
| **1.4.1** Use of Colour | Which tab is open is carried by weight, background and a border as well as by colour |
| **2.5.8** Target Size | A tab is at least 24 CSS pixels tall, which is exactly where a tab strip is tempting to shrink |

**A formatted-text answer is never HTML.** It is stored as a small closed
grammar, parsed once into a typed tree, and rendered as elements by both
renderers — so there is no path from an answer somebody typed to
`innerHTML`, and a `javascript:` link renders as the text they wrote
([0052](./docs/decisions/0052-richtext-is-not-html.md)). That is a security
decision before it is an accessibility one, but it is the same principle: the
safe thing is the structural thing, not the thing a consumer has to remember.

**The website holds itself to this too.** formancy.ai passes at 320 CSS pixels
with no horizontal scrolling, and `prefers-reduced-motion` removes every
scroll effect in the stylesheet rather than in script
([0053](./docs/decisions/0053-the-page-is-the-product.md)). A page that makes
somebody ill while they read the part about accessibility has refuted itself.

**The builder is keyboard-first**, and its drag surfaces were added afterwards
on purpose: 2.5.7 requires every dragging movement to have an equivalent
alternative, and building the alternative second is how it ends up unfinished
([0046](./docs/decisions/0046-keyboard-before-drag.md)). That holds for all
three of them — the structure tree, the arrangement tree and the preview
itself. Each drag calls the same commands the keyboard does, offers only drops
the session will accept, and announces through the same live region. The
keyboard move palette names destinations as sentences rather than coordinates:
*"Row with First name and Last name, between First name and Last name"* is a
choice somebody can make without seeing the screen, and
`{ parent: [0], index: 1 }` is not.

**What this is not.** Automated checking catches roughly 57% of
machine-detectable issues by Deque's own figure, and about 30% of WCAG 2.2
criteria are machine-testable at all. No manual screen-reader audit has been
performed and no VPAT is published. The claim is "built to be accessible and
tested to a floor", not "conformant".

## Documentation

Two sets, for two different questions.

**How to use it** — [`apps/docs`](./apps/docs), an Astro Starlight site with
quickstarts for React and Angular, the concepts, and a spec reference generated
from the JSON Schema.

**Why it is built this way** — [`docs/`](./docs):

- [Architecture](./docs/README.md#architecture), arc42-shaped. Start with
  [the five ideas everything else follows from](./docs/architecture/04-solution-strategy.md).
- [Forty-eight decision records](./docs/decisions/), each naming what would
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
CycloneDX SBOM signed with cosign.

**0.1.0 is on npm.** Ten packages under the
[`@formancy`](https://www.npmjs.com/org/formancy) scope —
`@formancy/spec`, `@formancy/expressions`, `@formancy/core`,
`@formancy/react`, `@formancy/angular`, `@formancy/conformance`,
`@formancy/builder-core`, `@formancy/server-core`, `@formancy/server` and
`@formancy/themes` — each carrying a SLSA v1 provenance attestation that
binds the tarball to the workflow run, commit and repository that built it.
There is no signing key, so there is none to leak. Check one yourself:

```bash
npm install @formancy/core
npm audit signatures
```

`@formancy/builder-react` is the one exception: it was written after 0.1.0 was
cut and lands in the next release. Until then the builder is reachable by
cloning the repository.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
