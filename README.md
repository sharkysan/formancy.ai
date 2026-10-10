# formancy.ai

<p>
  <a href="https://formancy.ai"><img src="https://img.shields.io/badge/website-formancy.ai-8b7bff?style=flat&amp;labelColor=102b29" alt="Website: formancy.ai" /></a>
  <a href="https://github.com/sharkysan/formancy.ai/actions/workflows/ci.yml"><img src="https://github.com/sharkysan/formancy.ai/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/sharkysan/formancy.ai"><img src="https://codecov.io/gh/sharkysan/formancy.ai/branch/main/graph/badge.svg" alt="Codecov coverage" /></a>
  <a href="https://www.npmjs.com/package/@formancy/core"><img src="https://img.shields.io/npm/v/%40formancy%2Fcore?style=flat&amp;label=npm&amp;color=a8f5ca&amp;labelColor=102b29" alt="npm version: @formancy/core" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-a8f5ca?style=flat&amp;labelColor=102b29" alt="License: Apache-2.0" /></a>
  <a href="#development"><img src="https://img.shields.io/badge/node-%3E%3D22.12.0-a8f5ca?style=flat&amp;labelColor=102b29" alt="Node.js: >=22.12.0" /></a>
  <a href="#formancy"><img src="https://img.shields.io/badge/status-beta-a8f5ca?style=flat&amp;labelColor=102b29" alt="Status: beta" /></a>
</p>

## Build the form. Ship your product.

**The open-source visual form builder for Angular and React.**

From a simple signup to a multi-step application: build it visually, add rules,
and make it yours. Embed your form in Angular or React with your own design
system. Conditional questions, live validation and calculated totals are already
part of the toolkit.

**Your forms. Your design. Your infrastructure.** Use the renderer in your app,
then add the optional backend for submissions, file uploads and workflows.
Apache-2.0 throughout.

<h3 align="center">
  <a href="https://formancy.ai">formancy.ai</a>
  &nbsp;·&nbsp;
  <a href="https://formancy.ai/playground/">Build your first form</a>
  &nbsp;·&nbsp;
  <a href="https://formancy.ai/docs/">Read the documentation</a>
</h3>

<p align="center">
  <a href="https://formancy.ai"><img src="./docs/images/readme/hero.jpg" alt="The formancy landing page: a working form preview on the right, its appearance switchable between four themes and its total calculated by the engine" width="100%" /></a>
</p>

## Design it. Add rules. Put it to work.

1. **Build your form.** Choose fields, arrange them in rows, sections or pages,
   and preview the result. Use drag and drop or keyboard controls, with undo.
2. **Set the rules.** Show follow-up questions based on previous answers,
   make fields required when relevant, and calculate values such as totals.
3. **Use it in Angular or React.** Save the form definition as JSON and render
   it with the native framework components. Start with a theme or connect your
   own design system.
4. **Collect answers on your infrastructure.** The optional backend checks
   submissions with the same rules, stores them in PostgreSQL, and provides
   drafts, file attachments — scanned by ClamAV before they are kept, if you run it —
   CSV export, webhooks and an audit log.

The visual editor is built in **both Angular and React**, over one shared core
that decides what any edit may do — so the two cannot offer different answers
for the same document — and the forms it creates render in either. You can also
author the JSON directly or use a coding agent through MCP. The shared engine
handles validation and calculations, so you do not need to implement each rule
separately in your UI and the formancy backend.

> **Status: beta, version 0.4.0.**
>
> **Every spec version is frozen.** Each only adds, so an older document
> keeps working and its submissions keep their shape — upgrading is one line and
> nothing rebinds ([0051](./docs/decisions/0051-spec-2-adds-types.md),
> [0140](./docs/decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)).
> [`MIGRATIONS.md`](./MIGRATIONS.md) lists what each version added.
>
> **The direction that costs something is the other one.** A reader pinned to an
> older release *refuses* a newer document rather than ignoring the part it cannot
> read — loudly, on purpose, because the alternative is a form with a missing
> question and a submission with a missing answer. Upgrade the readers before the
> documents.
>
> **The package APIs are not frozen** — they will change before 1.0. They are
> published to npm from CI with provenance under the
> [`@formancy`](https://www.npmjs.com/org/formancy) scope.
>
> The server is not ready for a public deployment. It has authentication,
> role-based authorization, forms that are private until opened, per-IP rate
> limits, a request body cap, a publish-time check that refuses regular
> expressions which can be made to backtrack, an audit log, drafts that carry
> their own key and a proof-of-work challenge for anonymous submissions — but no
> submission tokens yet, and it writes no log at all, so nothing tells you why a
> request failed.

## What you can build

### Your form should look like your product

<p align="center">
  <img src="./docs/images/readme/themes.png" alt="One event-registration form rendered four times — in the Paper, Blueprint, Dusk and Pop themes — with the same answers typed in and the same calculated total" width="100%" />
</p>

One event registration form, four themes, the same answers typed into each.
Change its appearance without rewriting its fields or rules — the renderers are
unstyled by default, so a supplied theme, your own CSS or your own components
all reach the same markup.

Every one of them says **490** because the engine calculated it from the
selected pass, in the browser, as the radio was clicked. With the formancy
backend, that total is recalculated on submission rather than trusted from the
browser. The same four themes are on the landing page, switchable while you
type into the form.

### Add a field. Set a rule. See it work.

<p align="center">
  <img src="./docs/images/readme/builder.png" alt="The self-hosted admin editing a conference registration: the structure tree with a nested group and a repeater, a live two-column preview with a grid of colleagues and a calculated total, and the property panel for the selected field" width="100%" />
</p>

A real registration form, open in the admin: a group of attendee details, a
pass that decides which questions follow, two dates with bounds, a grid of
colleagues on one invoice, a file and a total the engine calculates.

Add and organise fields in the structure tree, see the form in the live preview,
and edit labels, validation and other settings in the property panel — each with
a sentence saying what it does to the data. Arrange fields side by side or into
sections by drag or by keyboard. The admin reopens published forms and reports
which changes would invalidate the submissions you already have.

### Click an answer. Watch the form adapt.

<p align="center">
  <img src="./docs/images/readme/playground.png" alt="The playground: the builder, the live form in the Blueprint theme, and the engine's submission value and tracked fields side by side" width="100%" />
</p>

Use the visual builder or edit the JSON in the playground. The form is rendered
**twice, side by side — once by Angular and once by React**, from one schema over
two engines built from it, so the claim that the engine is framework-neutral is
something you can look at rather than something this file asserts. Try
conditional questions and validation, and inspect the answers that would be
submitted. Switch language or theme without reloading.
`pnpm --filter @formancy/playground dev` runs it locally.

*(The screenshot above predates the second renderer.)*

### Six reasons to build with formancy

- **The builder is open source, too.** The visual editor, Angular and React
  renderers, and optional backend are all Apache-2.0. Inspect, adapt and host
  the whole stack yourself.
- **Your forms evolve. Answers keep their context.** Each submission keeps
  the exact form version used to collect it. Review compatibility, potential
  information loss and breaking changes before publishing an update.
- **Two frameworks. One tested contract.** Angular and React render the same
  form definition and run through the same behaviour and accessibility test
  suite. Support for both is continuously checked.
- **Catch broken rules before your users do.** Publishing checks form structure
  and expressions, including invalid references, cycles and supported type
  errors. The same checks help validate forms written by coding agents.
- **Your components. Your design system.** Connect your own field components
  and styles, or start with a supplied theme — or, in Angular, with Angular
  Material, held to the same conformance fixtures as the defaults; an
  [Angular starter](./apps/angular-starter) puts the builder and a Material form
  side by side, and [formancy.ai/angular-form-builder](https://formancy.ai/angular-form-builder/)
  runs it in the page. The shared engine handles the rules while you control how the
  form fits your product.
- **Tested on the versions it declares.** React 19.0 and the newest 19, Angular 22.0
  and the newest 22, Node.js 22.12 and 24 — each a CI run; the
  [compatibility page](https://formancy.ai/docs/start/compatibility/) says what
  each proves.
- **Accessibility built in. Continuously checked.** Designed with WCAG 2.2 in
  mind: keyboard editing, connected labels, help text and error messages, plus
  automated accessibility checks in both renderers. Your finished form still
  needs review with its own components, colours and content; automated tests
  alone do not establish WCAG conformance.

### The hard parts of forms, already connected

- **Conditional fields and calculations.** Build questions that adapt to
  previous answers, conditional required fields and automatically calculated
  totals. The condition editor writes "(A and B) or C", offers the comparisons a
  field can take and a value control of the field's own kind, and guards every
  read so a rule never fails open on an empty form — or in a fresh repeater row, where a
  rule compares the fields of its own row; CEL is there for the rest. A rules
  overview lists every rule in words and, against a preview's answers, says why a field
  is hidden or required now — including a rule that cannot be decided.
- **Files and formatted text.** Collect attachments with type and size limits —
  each file its own upload, with its progress, a way to cancel or retry it, a place
  in the order, and a picture of an image — and let people write answers with bold,
  italic, links and lists.
- **Validation in the browser and on the server.** Give immediate feedback,
  then check submissions again with the same rules in the formancy backend.
- **Keyboard controls and accessibility checks.** The engine connects labels,
  descriptions and errors. Both renderers are checked with axe-core in the
  shared conformance suite.
- **Form versions and submission history.** Each submission keeps the form
  version used to collect it. Review changes before publishing an update.
- **A visual theme editor.** Every design token the applied theme declares, read
  from its stylesheet rather than from a list — so it works on a theme you wrote,
  and what it hands back is a CSS patch that keeps inheriting rather than a fork.
  That patch is the preset: import it and the editor opens where you left it, and
  says what in the file it could not apply.
- **Ratings and sliders.** A scale is a `number` field with a widget on it, so the
  answer is the same number either way — and a rating is a radio group rather than
  a row of buttons, which is one tab stop instead of eleven.
- **Choices with pictures.** A radio group or a set of checkboxes can show a picture with
  each option, inside its label, so the picture chooses it and its description is part of
  the option's name. Never on a dropdown, which cannot show one.
- **Input masks that store the number, not its spelling.** `(999) 999-9999` shapes how
  a phone number is typed and stores `5551234567`. Where a typed, deleted or pasted
  character lands is decided once for both renderers, and the server refuses an answer
  that does not fill the mask, because the engine does.
- **AI-assisted authoring.** Describe a form in the builder, or give your coding
  agent the MCP tools to author and validate a form definition.
- **No third party in the loop.** Spam protection is proof of work computed in
  the visitor's browser and verified with your own key, not a captcha service.
- **Apache-2.0, all of it.** The spec, engine, renderers, builder and backend.

## Start from a template

The [starter collection](./templates/README.md) covers HR, sales, customer service,
events, operations and healthcare administration. Each template is a plain JSON
form with English, Swiss High German and French text, a fictional sample and
executable behaviour cases. Browse [Templates](https://formancy.ai/templates/)
to preview or download a form, then open it in the playground to edit it and
try both renderers. You can also copy its `*.form.json` straight into your app.
The forms use frozen spec version 2 and need no external services.

## Integrate a form into your app

Install the renderer for your framework:

```bash
npm install @formancy/react @formancy/core @formancy/spec    # React 19
npm install @formancy/angular @formancy/core @formancy/spec  # Angular 22
```

ESM-only, Node >= 22.12. The framework package is a peer dependency, so you
keep the React or Angular version you already have. The backend is a container
rather than a dependency — see [running the stack](#run-the-stack-locally).

The builder ships as two packages over one core — `@formancy/builder-react`
and `@formancy/builder-angular`, both published. What decides anything is in
`@formancy/builder-core` and shared, so the two cannot offer different
destinations for the same document
([0091](./docs/decisions/0091-a-second-builder-is-a-binding.md)). Both carry
both trees, the property panel, the condition editor, the translations pane,
the drop surface over the rendered form, and the prompt pane — describing a
form in words, and reviewing what the answer does before it lands, with the form's
examples run against it so the review names any it would stop holding
([0159](./docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)). The
model is the host's `AskModel`; for a page that may not call one, both carry a **relay**
pane, where a person copies each request to a chat of their own and pastes the answer
back, and every check after the paste runs in the page
([0160](./docs/decisions/0160-a-person-carries-the-models-turn.md)). Given that model, the
translations pane asks it for the messages a language is missing, and holds the answer for
review message by message — the source beside what is proposed, and the form as it would
read — before it lands; a translation somebody made is never replaced
([0161](./docs/decisions/0161-a-model-translates-only-what-is-missing.md)). Given the same
model, both scenario panes draft examples from what the author says the form should do,
showing the model the form's fields and never its rules, and the author keeps each one
with the engine's verdict beside it
([0162](./docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)). Both save a
field as a **block** to use again — with the rules that live inside it and the words
it names — and insert one with its keys made unique and its rules following them; the
host keeps the blocks ([0135](./docs/decisions/0135-a-block-is-a-field-with-its-rules.md)).
Both speak
the author's language — their own words, the spec's property labels, and why the
validator refused an edit: English, German and French are shipped, a host can add its own
catalogue a message at a time, and the playground's Language switch shows it
([0114](./docs/decisions/0114-the-builder-speaks-the-authors-language.md),
[0122](./docs/decisions/0122-a-validator-error-has-a-code.md)).

## How it fits your stack

The editor saves a form definition containing fields, layout and rules. Your
application renders that definition, and the optional backend validates and
stores the submitted answers. These pieces share the same form model:

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
packages/conformance    the behaviour + accessibility contract, published so another
                        renderer can be held to it
packages/builder-core   headless schema editing: commands, undo/redo, valid
                        targets, and everything a builder's UI reads off a
                        session — shared by both builders
packages/builder-react  the builder UI for React: structure tree, arrangement
                        tree, field palette, property panel, logic —
                        keyboard-first, with drag as a second route
packages/builder-angular  the same builder for Angular: zoneless, one signal per
                        session, the same commands and the same destinations
packages/server-core    backend use-cases against storage ports
packages/server         Fastify + Postgres: publish, resolve, replayed submissions,
                        drafts with lazy migration, CSV export
packages/themes         reference themes. Nothing depends on them
packages/tiptap         a TipTap editor held to formancy's rich-text grammar
packages/challenge      the proof-of-work challenge: mint, solve and verify
packages/mcp            formancy as tools for a coding agent (MCP)
apps/site               formancy.ai — the landing page, which renders a real form
apps/playground         the one-screen demo (editor / live form / engine state)
apps/angular-starter    an Angular application: the builder and a Material form
apps/admin              the self-hosted admin, v0.1 cut
apps/docs               the documentation site (Astro Starlight)
```

**The builder edits two documents over one model.** `builder-core` holds the
document, the undo stack, the rules about which edits are legal, and what any
builder's interface reads off a session. `builder-react` is the interface over
it, in two trees, and `builder-angular` carries the same two:

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

### Use it from a coding agent

```bash
claude mcp add formancy -- npx -y @formancy/mcp
```

Nine tools. Five of them — `describe_spec`, `validate_form`, `diff_forms`,
`check_scenarios` and the checking half of `publish_form` — need **no server and no
credentials**, so an agent can write a whole form and be told exactly what is
wrong with it before anybody deploys anything. Set `FORMANCY_URL` and
`FORMANCY_API_KEY` together to add publishing and reading submissions.

Every tool says what it will do before it is called — read-only or not, open world
or closed — so a host can run the five local checks without asking and still stop at
a publish. Each answers with a structured result beside the prose rather than JSON
glued to the end of a sentence. And three prompts ship with the server:
`build_a_form`, `change_a_form` and `embed_a_form`, which give the **order** rather
than the tool names — a model that writes a document before calling `describe_spec`
has already invented `type: "email"`.

`check_scenarios` is the one that catches a rule written backwards.
`leaveType == 'other'` and `leaveType != 'other'` are both valid CEL and both pass
every other check here — the difference is between the document and what somebody
meant, and the only thing that can see it is an example with its answer written down.

Changing a form that already exists is two calls, not one. `propose_form_edit`
holds the edit up against what is published and answers with what it would cost
submissions already collected — then `publish_form` takes the hash it gave you
and refuses if the form moved in between. A document is the whole form, so
publishing one based on an older version silently reverts whatever somebody
published while you were working.

The point is not that the API is reachable by prompt. It is that a model
writing a form is a model writing logic, and this is the one product category
where the logic can be **checked before the form exists**: the document format
has a published JSON Schema, and CEL type-checks. Ask an agent for
`seats * 4` and it is told

> no such overload: double * int. This evaluates to nothing for every value
> anybody enters […] write the literals with a decimal point — 4 becomes 4.0.

rather than publishing a form whose total silently stays empty
([0056](./docs/decisions/0056-agents-get-the-checks.md)).

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

Three apps, one directory: the landing page at `/`, the playground at
`/playground/`, the documentation at `/docs/`. Each is built knowing where it
is served from, and the script refuses to finish if one of them is not — an
app built at the wrong base asks for another app's files, which 404 while the
build log says everything succeeded.

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
switch to it and the labels nobody has translated stay English, because a
missing translation falls back to the default locale rather than printing a
message id at somebody. The builder's *Translations* tab is the other side of
it: choose French there, in either builder, and every message still to translate
is marked beside its English — and a model of your own can be asked for them, through the
same relay as describing a change, with each message reviewed before any of it lands.

**Describe a change in words** under *Fields*, in either builder, and the playground
shows the exact request it would send a model — it calls none, because formancy.ai asks no
other site for anything. Copy it into a chat of your own, paste the answer back, and the
answer is checked, diffed against the form and held for review like any model's. Copying
puts the whole request on your clipboard, the form included, and pasting it into a chat
gives it to that service under your own account
([0160](./docs/decisions/0160-a-person-carries-the-models-turn.md)). While your chat answers,
look at anything — the JSON, another tab, the other builder: the request waits above the
tabs, and the answer pasted then is held for review under *Fields*, in either builder
([0163](./docs/decisions/0163-a-models-run-belongs-to-the-host.md)).

**`?dir=rtl`** opens the playground right to left: both forms and both builders follow
the reading order — the marks on a selected node move to the side a line starts on, and a
field dragged onto the rendered form lands on the side it was aimed at
([0123](./docs/decisions/0123-the-builder-reads-right-to-left.md)).

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
- [The decision records](./docs/decisions/), each naming what would
  fail if the decision were violated — or saying plainly that nothing would.
- [Regulatory material](./docs/regulatory/MDR-CONTEXT.md), for anyone
  incorporating formancy into a product that has to answer to a regulator.
  **Built to be incorporated.** formancy is not a medical device and claims no
  conformity. It ships the characterisation a manufacturer needs under IEC 62304
  to treat it as software of known provenance — a
  [SOUP declaration](./docs/regulatory/SOUP-DECLARATION.md), a
  [safety analysis](./docs/regulatory/SAFETY-ANALYSIS.md), the
  [lifecycle](./docs/regulatory/LIFECYCLE.md) and the
  [design rationale](./docs/decisions/) — as an input to your risk analysis, not
  a substitute for it.

## Releases

[`CHANGELOG.md`](./CHANGELOG.md) — what is in each version, and what is
knowingly missing from it. [`RELEASING.md`](./RELEASING.md) — how a release is
cut, and what the pipeline signs and attests.

Releases are published from CI with npm provenance, and each one carries a
CycloneDX SBOM signed with cosign.

**`0.4.0` is the current beta.** Every package under the
[`@formancy`](https://www.npmjs.com/org/formancy) scope moves on one version
number, so any two of them at the same version are known to work together — which
is what makes the support matrix size one
([0009](./docs/decisions/0009-independent-spec-version.md)). Each tarball carries
a SLSA v1 provenance attestation binding it to the workflow run, commit and
repository that built it. There is no signing key, so there is none to leak.
Check one yourself:

```bash
npm install @formancy/core
npm audit signatures
```

The list of packages is not repeated here, because a list in prose goes stale and
this one did: it said ten, and `@formancy/builder-react` — the package a
prospective adopter most wants to see — was the exception that "lands in the next
release". It lands in this one, along with `@formancy/challenge`,
`@formancy/mcp` and `@formancy/tiptap`. The authoritative list is the composition
table in
[`SOUP-DECLARATION.md`](./docs/regulatory/SOUP-DECLARATION.md), which
`apps/docs/src/soup.test.ts` checks against the manifests on every run.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
