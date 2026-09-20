# formancy

A modern, self-hostable form engine and backend — for React and Angular.

> **Status: pre-alpha, version 0.1.0, unpublished.**
>
> The **spec is frozen** at `specVersion: "1"`: a form document written today
> keeps working, and the submissions stored against it keep their shape. The
> **packages are not** — their APIs will change before 1.0, and they are not on
> npm yet, so clone the repository to try them.
>
> The server is not ready for a public deployment. It has authentication,
> role-based authorization, forms that are private until opened, per-IP rate
> limits, a request body cap and a publish-time check that refuses regular
> expressions which can be made to backtrack — but no challenge, no submission
> tokens and no audit logging.

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
packages/builder-react  the builder UI: structure tree, field palette,
                        property panel — all keyboard-first
packages/server-core    backend use-cases against storage ports
packages/server         Fastify + Postgres: publish, resolve, replayed submissions,
                        drafts with lazy migration, CSV export
packages/themes         two reference themes. Nothing depends on them
apps/playground         the one-screen demo (editor / live form / engine state)
apps/admin              the self-hosted admin, v0.1 cut
apps/docs               the documentation site (Astro Starlight)
```

**The builder is partly built.** `builder-core` holds the document, the undo
stack and the rules about which edits are legal. `builder-react` is the
interface over it — structure tree, field palette and property panel — and it
is entirely keyboard-driven with no drag surface,
[deliberately in that order](./docs/decisions/0046-keyboard-before-drag.md).
Logic authoring and dragging are still to come.

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
```

The admin has a **build** tab — the keyboard-driven builder in a three-pane
inspector, beside a live preview — plus the raw schema editor, publish, version
history, and submissions with a CSV export whose columns are unioned across
schema versions.

The playground is the one-screen demo: schema or builder on the left, the live
form in the middle, the engine's actual state on the right. Two switchers, and
neither is decoration.

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
| **1.3.1** Info and Relationships | A row is presentation and gets no semantics; a *labelled* section is visibly grouping fields, so it is a real `role="group"` with an accessible name. An unlabelled one stays a plain box, because a group with no name announces "group" and tells nobody anything |

**The builder is keyboard-first**, and its drag surface was added afterwards
on purpose: 2.5.7 requires every dragging movement to have an equivalent
alternative, and building the alternative second is how it ends up unfinished
([0046](./docs/decisions/0046-keyboard-before-drag.md)). Dragging calls the
same commands the keyboard does, offers only drops the session will accept, and
announces through the same live region.

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
- [Forty-seven decision records](./docs/decisions/), each naming what would
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
