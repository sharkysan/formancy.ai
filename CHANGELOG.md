# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## Unreleased

**Spec version 2.** Five constructs form.io has and formancy did not:
`selectboxes`, `file` and `richtext` field types, and `tabs` and `table` layout
kinds. Adding them is a version bump rather than a quiet addition, because the
version line answers "can I read this?" and the answer changes the moment the
format grows something a reader has never heard of
([0051](./docs/decisions/0051-spec-2-adds-types.md)).

Version 2 is a superset: it adds and removes nothing, so every version 1
document is a valid version 2 document, `upgradeSpecVersion` is one line, and a
1-to-2 diff is `compatible`. A version 2 construct inside a document declaring
version 1 is refused by name with the fix in the message. Going backwards is
refused rather than performed, because dropping what the newer version added is
data loss wearing the word "conversion".

- **`selectboxes`** — several answers from one list. A fieldset and a legend,
  like the radio group, because the relationship is the same one; the answer is
  stored in the options' own order, so two people who choose the same answers
  produce the same submission. Nothing ticked is `[]`, never null
  (see below) — an empty list is an answer, and treating it as the absence of
  one is the mistake every implementation makes first.
- **`file`** — attachments, now with a server behind them. The submission
  stores what each file is and where it went, never its bytes. `accept` and
  `maxFileSize` are enforced by the
  engine as well as by the picker, because a picker's filter means nothing to
  somebody posting to the endpoint directly. The renderers take an uploader
  from the host and say so plainly when there is none.
- **`richtext`** — formatted text, **stored as a small closed grammar rather
  than as HTML**. Parsed once into a typed tree and rendered as elements by
  both renderers, so there is no path from an answer to `innerHTML`, no
  sanitiser to keep correct forever, and a `javascript:` link renders as the
  text somebody typed ([0052](./docs/decisions/0052-richtext-is-not-html.md)).
- **`tabs`** — one panel at a time, the full ARIA pattern with a roving
  tabindex. Presentation, unlike pages: a field in a closed tab is still
  validated and still submitted, so a panel is hidden rather than unmounted and
  the strip opens the tab that focus lands in.
- **`table`** — a grid whose columns line up across rows, which stacked rows
  cannot do. Not a `<table>`: arranging fields in columns is not tabular data.

**File uploads work.** The `file` type shipped with a renderer and nowhere to
put bytes; the server now has somewhere. A file is **offered** before any bytes
exist, **stored** when they arrive, and **claimed** inside the submission's own
transaction — so a submission exists if and only if the files it names belong
to it, and two submissions naming the same file are adjudicated by the database
rather than by whichever check ran first. The field's `accept` list and size
limit are enforced at the offer, before a byte is sent, because a browser's
filter means nothing to somebody posting to the endpoint directly. Unclaimed
files are collected after a day, bytes first and the row second. Files come
back as authenticated attachments with `nosniff`, never inline
([0055](./docs/decisions/0055-files-are-claimed.md)).

Set `FORMANCY_FILES_DIR` to turn uploads on. Leaving it unset is a supported
state, not a misconfiguration: a form with a file field still renders and still
submits, and the field says plainly that there is nowhere to put one.

**A rule reading a list field now hides what it was told to hide.** An
untouched `selectboxes` or `file` field reached expressions as null rather than
as `[]`, so `'migration' in topics` was `in` against null: no overload, a
runtime failure, and a `visible` rule that fails is shown rather than hidden
([0022](./docs/decisions/0022-fail-open-fail-closed.md)). Every field whose
visibility depended on a tick was therefore visible until the first tick, which
reads as an inverted rule rather than a broken one. `LIST_VALUED_FIELD_TYPES`
now names the types whose answer is a list, in `@formancy/spec` rather than in
the engine, because two readers disagreeing about it disagree about whether a
form is showing a field.

**The conformance run audits accessibility, and it found a bug on its first
pass.** axe-core now runs on every mounted form and after every step that can
change the DOM — an error appearing, a row arriving, a page turning — which
are the states a hand-written audit never visits. The rule set lives in
`@formancy/conformance` rather than in a driver, because two renderers audited
against two rule sets are not held to one standard and both suites would stay
green while they drifted. The auditor itself belongs to the driver: the
published package stays framework-free, and a third party may certify with a
different tool.

The bug: a required `radio` or `selectboxes` group carried `aria-required` on
its `<fieldset>`. `role="group"` does not support that attribute, so assistive
technology ignored it — a required group said nothing about being required,
and the attribute was invalid ARIA besides. Requiredness for a grouped field is
now announced through the group's description, which the engine composes, and
is visible as well as announced. A required radio group never announced it at
all, which no test could have told you, because the wrong answer and no answer
look identical from the outside.

Two documents already described axe as running in the conformance suite. It
was not. That is the second time writing something down has been what found it
missing.

**The stack, in three dimensions.** formancy is a layer cake, so the landing
page draws one: the shared layers deep and carrying both accents, the two
per-framework layers near the reader and split violet from teal. Where the
product forks is now something you can see rather than read. It is an ordered
list of packages underneath — without 3D, without scroll timelines or with
motion turned off it is exactly that, because the geometry is a second reading
of the content and never the only one. Built with `timeline-scope` and
`animation-composition`, so the depth readout in the heading follows a list in
a different branch of the document and nothing needs a frame loop. The mark
from the favicon is now in the bar.

**A new form in the admin starts at version 2.** It started at version 1,
which meant a form created today could not be given tick boxes, a file field
or formatted text: the builder refuses a version 2 construct in a version 1
document, correctly, and offers to move it — a dead end nobody asked to be
in. The same mistake the playground's starter had.

**The admin is tested.** It was the least-covered part of the repo at 57% of
lines while being the part a self-hoster touches most: the workspace — four
tabs, publish, versions, submissions, the CSV export — had almost none. Now
86%, and every case is a thing that would have been silently wrong rather than
loudly broken: a publish reporting success it did not get, an edit lost on a
tab switch, a refusal swallowed. The uploader is at 100%, including the part
where the offer succeeds and the bytes do not land.

**The website deploys as one static site.** The landing page at `/` and the
playground at `/playground/`, built by `pnpm build:web`. The playground is
built with `base: '/playground/'`, without which Vite's absolute asset URLs
point at the site's asset directory instead of its own — the page loads, the
script 404s, and the deployment is a blank screen while the build log says
everything succeeded. The build script reads the built HTML back and refuses
to finish if that has happened, because a check that only runs when somebody
remembers to look is not a check. The site also has a favicon now; it had been
asking for one that was never there.

**The website.** `apps/site` is formancy.ai, and the form halfway down it is a
real document handed to `@formancy/react` rather than a screenshot
([0053](./docs/decisions/0053-the-page-is-the-product.md)). It exercises every
type spec 2 added — `selectboxes`, `richtext` and `file`, arranged in `tabs`
over a `table` — which is how the list-field bug above was found. Its file
field uploads nowhere and says so in the storage key, because the page is
static and a demo that looks like it stored something makes the product look
like it silently drops files. The playground is one click away from the bar,
from the demo and from the end of the page.

### Fixed

- Deleting or renaming a field that a layout placed was refused outright, so a
  field could not be changed at all once it had been arranged.
- The Angular rich-text component recursed through its own selector without
  importing itself, which Angular renders as an empty custom element and does
  not report.
- `newFieldOfType` produced choice fields with no options — a control nobody
  can answer.

- **An expression that compiles and then never works is refused at publish.**
  `seats * 4` on a `number` field computed nothing — not an error, nothing —
  for every value anybody typed, with no signal in the builder, at publish or
  at runtime. Two correct decisions produced it: leaves are declared `dyn` so
  that a half-typed answer is not a type error, and a computed rule that fails
  writes nothing so that a half-filled input keeps its previous value. CEL is
  strongly typed at runtime and a JSON number is a double, so `double * int`
  has no overload and the engine cannot tell "not ready yet" from "never will
  be".

  `expressionProblems(schema)` re-checks each rule with leaves declared as the
  model says and reports the failures strictness is reliably right about — and
  only those, because a check that refuses a valid form is worse than the
  silence it replaces. It runs at publish, not at render, so a form already out
  there keeps opening for whoever is filling it in.
  ([0054](./docs/decisions/0054-expressions-that-never-work.md)).

## [0.1.0] — 2026-09-20

The first release. **Spec version: `"1"` (frozen).**

### Read this first

The *spec* is frozen; the *packages* are not. A form document written today
keeps working, and the submissions stored against it keep their shape. The
package APIs are pre-alpha and will change before 1.0.

The packages are **on npm** under the
[`@formancy`](https://www.npmjs.com/org/formancy) scope: `@formancy/spec`, `@formancy/expressions`, `@formancy/core`,
`@formancy/react`, `@formancy/angular`, `@formancy/conformance`,
`@formancy/builder-core`, `@formancy/server-core`, `@formancy/server` and
`@formancy/themes`. Each was
published from CI with a SLSA v1 provenance attestation, so `npm audit
signatures` can say which workflow run and which commit built the tarball you
installed.

`@formancy/builder-react` is not among them. It was written after this release
was cut and lands in the next one; clone the repository to use the builder
today.

Do not deploy the server anywhere public. It has authentication, role-based
authorization, a fail-closed access gate on anonymous submission, per-IP rate
limiting and a request body cap — but no challenge, no submission tokens and no
audit logging. The route comments say so too.

### What it does

A form is a JSON document. An engine evaluates it — visibility, requiredness,
calculations, validation — and the **same compiled engine runs in the browser
and on the server**, so the two cannot disagree about whether a submission is
valid. Renderers for React and Angular bind to it natively and emit your markup,
not ours.

### The spec, version 1

Frozen on 2026-09-20. It shipped as `"0"` and unstable first, because three
things about the model turned out to be undiscoverable without a renderer and a
server actually using it. All three now have answers:

- **A hidden field's answer.** `clearOnHide`, defaulting to true, decides
  whether it is pruned — and the server applies its own reading, so a client
  cannot smuggle data into a branch the person could not see.
- **A repeating-group row's identity.** Each row carries `_id`, minted by the
  engine, in the data. Position was never an identity: removing a row renumbers
  everything after it. `_id` is reserved and no field may use it.
- **Where a validation check runs.** `runsOn: 'both' | 'client' | 'server'` on a
  validate rule. Metadata rules may not set it, because a visibility rule that
  differed between the two sides would leave the server unable to check what the
  browser did.

**Twelve field types:** `text`, `textarea`, `number`, `checkbox`, `select`,
`radio`, `date`, `hidden`, `static`, `group`, `page`, `repeater` — all twelve
rendered, and all editable in the builder. Deferred type
names are reserved, so adding `file` or `datetime` later is a compatible change.

**Five rule kinds**, all written in CEL: `visible`, `disabled`, `required`,
`computed`, `validate`.

**Validators:** `required`, `min`/`max`, `minLength`/`maxLength`, `pattern`
(anchored), and a closed format list — `email`, `url`, `uuid`.

**Layouts render.** `layouts` places fields side by side, in sections, in an
arrangement that is not model order — and both renderers do it identically. The
DOM order is the layout's declared order and the stylesheet places by source
order alone, so reading order, tab order and visual order cannot come apart
(WCAG 1.3.2, 2.4.3); a row reflows to one column with a media query rather than
a measurement (1.4.10); a row carries no semantics and a labelled section is a
real `group` (1.3.1).

**Optional sections:** `i18n` for message catalogues, so any text a person reads
can be `{ "$t": "some.id" }` instead of a literal; and `layouts`, for named
arrangements of one model. A form using neither behaves exactly as if neither
existed.

### Packages

| Package | What it is |
|---|---|
| `@formancy/spec` | Types, JSON Schema, canonical hash, `diffSchemas`, validation |
| `@formancy/expressions` | CEL, behind our own facade, with the safety policy |
| `@formancy/core` | The engine. No framework, no DOM, no Node |
| `@formancy/react` | React 19 bindings, via `useSyncExternalStore` |
| `@formancy/angular` | Angular 22 bindings, zoneless and signal-based |
| `@formancy/conformance` | The behavioural suite, published so others can self-certify |
| `@formancy/builder-core` | Headless schema editing: commands, undo/redo, legality |
| `@formancy/builder-react` | The builder UI: structure tree, field palette, property panel, logic authoring. Keyboard-first, no drag surface |
| `@formancy/server-core` | Use cases, framework-free |
| `@formancy/server` | Fastify routes, PostgreSQL, auth runtime |
| `@formancy/themes` | Two reference form themes, plus the workbench chrome for the tools. Nothing depends on them |

### Engine

- Dependencies are extracted statically from each expression's AST, so a form
  that could loop is **refused when it is saved**, with the cycle named, rather
  than discovered by somebody filling it in.
- The clock and randomness are injected and frozen per pass. The engine never
  reads an ambient `Date.now()`, which is what makes the server's replay a check
  rather than a second opinion.
- Snapshots are identity-stable, so React needs no memoisation and Angular's
  `OnPush` sees the change.
- The engine owns element ids and ARIA composition, so both renderers wire
  accessibility identically and the `useId` hydration-mismatch class of bug does
  not exist here.
- Metadata expressions fail **open**, validation expressions fail **closed**. A
  broken visibility rule shows the field; a broken check rejects the submission.
- **No `eval` and no dynamic function construction anywhere**, so formancy runs
  under a strict Content-Security-Policy with no configuration.

### Renderers

React and Angular pass the **same conformance fixtures with no
framework-specific skips**. Neither ships a CSS file. Styling attaches to
`data-formancy-part` and `data-state`.

Two reference themes — Blueprint (light, technical) and Dusk (dark, rounded) —
are deliberately different design languages rather than two palettes. The
playground switches between them to demonstrate that the renderers emit no
styling of their own. If either theme had needed a component change, the claim
would be false.

### Server

Twelve endpoints across two planes. The public plane is unauthenticated by
opt-in; the management plane requires a session or an API key and runs
`can(actor, action, resource)` on every route.

- A submission is replayed server-side against the exact version the client
  rendered. Every computed value is recomputed and **overwritten**; visibility
  and requiredness are recomputed; hidden branches are stripped. What is stored
  is the canonical result, not the request body.
- Published versions are immutable, enforced by a **database trigger** rather
  than application code, so it holds for every path into the database.
- A submission binds to its version by foreign key *and* by schema hash — one
  for joins, one for tamper evidence.
- Drafts migrate lazily on resume, driven by diff severity. Answers belonging to
  removed fields move to `data.__orphaned` and are never deleted. **Submissions
  never migrate.**
- Login is enumeration-resistant: a missing user costs the same argon2
  verification as a wrong password.
- A form is **private until opened**. `PUT /f/:path/access` turns on anonymous
  submission and optionally pins an origin allowlist, which is matched exactly
  — a missing `Origin` is refused, and an empty allowlist allows nothing rather
  than everything. Access is a property of the deployment rather than of the
  form document, so exporting a form cannot carry "anyone may submit this"
  across a boundary where it is wrong.
- The public submission route is **rate limited per IP** — 30 a minute by
  default — and counts attempts rather than successes, so a refused request
  still costs an attacker their budget. Login is limited to 10 a minute, which
  matters because enumeration resistance makes each wrong guess cost a full
  argon2 verification. Requests are capped at 256 kB before the JSON parser
  sees them.
- Every `pattern` is checked for catastrophic backtracking at publish time and
  a vulnerable one is refused — a form author's regular expression is run by
  the server against submitted text, and it cannot be timed out once started.
  The check found a polynomial case in formancy's own email format the first
  time it ran.
- CSV export unions columns across every version a form has had, and neutralises
  spreadsheet formulas — type-aware, so a numeric `-5` stays `-5`.
- **Webhooks** are queued by the same transaction that stores the submission,
  so a delivery exists if and only if the submission does. Delivery resolves
  the hostname itself, refuses if any returned address is private, and connects
  to the address it checked through a pinned agent — "validate the URL then
  fetch it" is defeated by DNS rebinding, since the two lookups are
  independent. Redirects are not followed, the response is capped at 64 kB and
  never interpreted, and the signature is Stripe's scheme so receivers can use
  code they already have.
- **The outbox is drained** by a five-second polling worker in the server
  process — no queue library, no second container. Retries are exponential with
  full jitter over eight attempts, and a delivery that runs out of them is
  marked dead rather than deleted, because the row is the evidence that
  something was supposed to be sent and never arrived. It is **not** a
  distributed queue: run exactly one replica, or a delivery goes out twice.
  Plain http and private addresses are each opt-in per deployment
  (`FORMANCY_WEBHOOK_ALLOW_HTTP`, `FORMANCY_WEBHOOK_ALLOW_PRIVATE`) for a
  receiver on a trusted network — per deployment, never per form, since a form
  author is exactly who the address guard defends against.

### The arrangement editor

- **Rows, columns and sections are authorable**, which is how two fields end up
  side by side. Renderable since the layout work landed, and until now editable
  only as JSON.
- **Two views of one document.** A separate arrangement tree beside the
  structure tree — the model says what a form collects, the arrangement says
  where it appears, and a field can be in one without the other — and the
  **rendered form itself is a drop target**. Both go through the same session
  command, so they cannot disagree.
- **Keyboard first, again.** Add, move, unwrap and remove all work with no
  pointer, and the move palette reads destinations as sentences: *"Row with
  First name and Last name, between First name and Last name"*. Dragging came
  afterwards, in all three places.
- **The renderer knows nothing about any of it.** It emits two inert
  attributes; the builder reads them from the outside. Nothing in
  `@formancy/react` imports anything from `@formancy/builder-react`.
- **Fields the arrangement leaves out are named**, because a field the only
  layout omits is collected by the form and invisible to everyone filling it in.
- **Deleting or renaming a field now keeps every layout in step.** Both were
  refused outright before — a layout node pointing at a field that does not
  exist is invalid — so a field could not be deleted or renamed at all once it
  had been arranged.

### Applications

- **Admin** — the builder in a three-pane inspector with live preview, plus a
  raw schema editor, publish, version history, submissions and CSV export. The
  left pane switches between the form's **structure** and its **arrangement**.
- **Playground** — schema *or* the builder on the left, the live form in the
  middle, the engine's actual state on the right. Under Build, *Fields* and
  *Arrangement* are two views of one document, and the form in the middle is a
  drop target for the second. A theme switcher that proves the renderers ship
  no CSS, and a language switcher over a demo form written in `$t` references
  with a deliberately partial French catalogue, so the fallback to the default
  locale is visible rather than claimed. A link to the repository, since this
  page is where most people meet the project.
- **Docs** — Astro Starlight; the spec reference is generated from the JSON
  Schema.

### Verification

- **808 automated tests** across eight packages, plus **21 integration tests**
  against a real PostgreSQL instance via Testcontainers.
- One conformance suite, executed against the engine in Node, the engine in a
  browser, both renderers, and the server.
- Conformance drivers may find elements **only by role and accessible name** —
  never a test id, never a CSS selector. A renderer whose markup a screen reader
  cannot navigate fails the suite.
- axe-core after every mount and every DOM-mutating change.
- Property-based invariants over hide/unhide, repeater identity and evaluation
  order.
- The official CEL corpus, with results pinned: **586 of 704 in-scope cases
  pass**. The 118 failures are enumerated in
  `packages/expressions/CEL-CONFORMANCE.md` rather than averaged into a
  percentage.
- Performance, measured: keystroke on a large conditional form **≈0.38 ms**
  against a 1 ms budget; cold graph compile **≈1.7 ms** against 30 ms.

### Supply chain

Releases are cut by a GitHub Actions workflow and nowhere else, because
provenance is a statement *by GitHub* about which workflow produced a tarball —
a release built on a laptop cannot carry one.

- **npm provenance** via OIDC, so every tarball is bound to the workflow run,
  commit and repository that built it. Check it with `npm audit signatures`.
  There is no private key, so there is none to leak.
- **A CycloneDX SBOM** attached to each GitHub release, describing what ships
  rather than the workbench, and **signed with cosign** keylessly.
- **Licence enforcement.** Apache-2.0 requires the licence and NOTICE to travel
  with the work. Both are copied into every package at build time and the
  release refuses to publish a tarball missing either.
- **Version agreement.** A tag that disagrees with the manifests fails the
  release rather than publishing the wrong version under the right name.

See [`RELEASING.md`](./RELEASING.md).

### Known limitations

Named rather than implied.

**Not built yet.** Conditions combining more than one comparison; file upload;
a per-action circuit breaker and dead-letter replay from the admin, so a
receiver that has been down for a day is retried on the same schedule as one
that failed once and re-queueing a dead delivery is a SQL statement; a
proof-of-work challenge on the public plane, which the rate limit and the
origin allowlist stand in for; multi-tenancy; a published container
image — one builds locally from `docker compose up`, but nothing is pushed to a
registry or signed.

**Known gaps.**

- 118 CEL specification cases fail. If your forms use expressions, read
  `CEL-CONFORMANCE.md` rather than this summary.
- A `pattern` that `recheck` cannot decide about is accepted rather than
  refused, and patterns published before the gate existed were never analysed.
- `@fastify/rate-limit`'s default store is per-process and therefore wrong
  behind more than one replica. The outbox worker has the same constraint for a
  different reason — `claimDueDeliveries` takes no row lock — so more than one
  replica delivers every webhook more than once.
- A `visible` rule that fails at runtime shows the field. That is deliberate,
  but it means a form whose visibility rules are quietly failing looks as though
  it is working.
- No manual screen-reader audit and no published VPAT. Automated checking
  catches roughly 57% of machine-detectable issues, and about 30% of WCAG 2.2
  criteria are machine-testable at all.
- Async validators do not exist. They need a new rule kind, which is a spec 2
  change; `runsOn` is already in place so that change is additive.
- The container image is neither published nor signed, because no registry has
  been chosen. It builds locally from `docker compose up`. The npm side of the
  release pipeline has run: provenance attestations and a cosign-signed
  CycloneDX SBOM went out with `0.1.0`.
- `@formancy/builder-react` missed the release. It was written after `0.1.0`
  was cut, so the builder is reachable only by cloning.

### Getting it

```bash
npm install @formancy/react @formancy/core @formancy/spec   # or @formancy/angular
npm audit signatures                                        # check the provenance
```

Or from source, which is the only way to get the builder for now:

```bash
git clone <this repository> && cd formancy.ai
pnpm install && pnpm build && pnpm test

docker compose up -d                     # PostgreSQL on :5439
pnpm --filter @formancy/server dev       # API on :4380
pnpm --filter @formancy/admin dev        # admin on :4382
pnpm --filter @formancy/playground dev   # playground on :4381
```

Requires Node 22.12 or newer, pnpm via `corepack enable pnpm`, and Docker.

### Documentation

- [Architecture](./docs/README.md#architecture) — arc42, twelve documents
- [Decision records](./docs/decisions/) — 43, each naming what fails if the
  decision is violated, or saying plainly that nothing does
- [Regulatory](./docs/regulatory/MDR-CONTEXT.md) — for anyone incorporating
  formancy into a product that answers to a regulator. formancy is not a medical
  device and claims no conformity

### Licence

Apache-2.0, every package, no dual licensing.
