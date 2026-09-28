# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## Unreleased

**A form can be translated in the product now.** `label: { $t: "name" }` has been valid
since version 1 and the engine has always resolved it — and nothing in the builder could
produce one, so translated content was a feature a developer could hand-write and an author
could not reach. The admin has a **translations** tab.

The command that matters is **extraction**: it turns the words somebody already typed into
a message reference and seeds the default locale with them, so the form reads exactly as it
did a moment before. A catalogue editor would have been the obvious surface and the one
that helps least — it presumes the document already refers to messages, and nothing could
make it. One press does every labelled field, because field by field is a chore people
abandon halfway.

**A message nothing refers to any more is listed, never collected.** Rename or delete a
field and its translations stay, with what they said. The tidy instinct is to sweep them;
the cost of keeping one is bytes and the cost of discarding one is somebody's work
([0084](./docs/decisions/0084-a-translation-is-authored-not-imported.md)).

An untranslated message is **marked** rather than shown as its fallback, because "it looked
fine in the preview" is how a language ships half-finished. The default locale cannot be
removed, and the refusal says why.

**And the language being worked on is previewed**, beside the table. An engine resolves
text in one locale fixed for its lifetime, so showing a translation used to mean changing
the document's `defaultLocale` — an edit to the form in order to read it. The pane builds a
second engine instead. An untranslated message falls back there exactly as it will for a
visitor, because a preview showing message ids would teach a translator that the fallback
is broken when the fallback is the feature.

Not built, and named rather than implied: catalogue import and export — a team with a
translation vendor and a translation memory works in XLIFF or JSON, not in a table in
somebody's admin.

**The one press reaches every text the format has**: a field's label, an option's label, a
grid column's heading and a layout node's label. `Text` appears in exactly those four
places, and the ids it mints need not be stable — a reference lives *inside* the thing it
names, so reordering options or moving a section carries it along.

*An earlier draft of this entry said the button leaves "options, placeholders and help
text" for later. The format has no `placeholder` and no help text at all, so two of those
three named nothing: the sentence was written from a memory of other form builders rather
than from this one's schema, in a changelog whose subject is this one's schema. Recorded
rather than quietly corrected, because it is the failure this repository's documentation
rules exist for, and it got past me three times in one afternoon — into the roadmap, the
changelog and a decision record.*

**`signature`, and the spec version 3 that carries it.** The last of the three components
form.io and FormEngine both charge for, and the only one still unbuilt. A signature is
**points, or a name** — `{ "drawn": [[[12, 40], …]] }` or `{ "typed": "Mara Lindqvist" }`,
never both and never a picture. Points scale, diff and survive a re-render; a PNG does none
of that and puts a megabyte of base64 in a submission nobody can read. Whole numbers inside
a `box` the field declares, because a submission is bound to a canonical hash and that hash
must not depend on how a browser rounded a pointer event. `maxPoints` bounds it: it is the
one answer whose value is an unbounded nested array.

**Typing your name is the second route, not a fallback with an apology.** It is how most
people sign most things and the only route a keyboard has, so a field offering drawing
alone would be a WCAG 2.1.1 failure with a legal signature attached to it.

**Stroke timing is refused rather than omitted.** Velocity is what makes a signature
biometric, and biometric data is a category (GDPR Article 9) nothing here is equipped to
hold. Said plainly alongside it: this software cannot verify a signature. There is no
identity proof, no certificate and no timestamp authority, so a qualified electronic
signature under eIDAS needs a qualified provider
([0083](./docs/decisions/0083-a-signature-is-points-or-a-name.md)).

**Spec version 3 is open**, and `MIGRATIONS.md` says what it added and what upgrading
costs — nothing inside the document, and one thing outside it: every reader of your forms
has to speak version 3, because a reader pinned to 2 refuses a version 3 document rather
than dropping the answer it cannot render. Opening it required generalising the version
gate, which read `if (specVersion !== '1') return []` — right while there were two versions
and silently wrong the moment there was a third, since a `richtext` in a version 1 document
would then have been waved through by a function that had stopped looking.

**And the builder now steps one version at a time.** Its upgrade button was the literal
"Move it to version 2" over an `upgradeSpec()` with no argument, which would have moved a
version 1 document straight to 3 — costing it every reader pinned to 2, for a type that
only needs 2.

**A part-filled form can be saved and resumed, and now somebody can watch it happen.**
The parts were all built and none of them was demonstrated — three public routes, a token
that addresses a draft, a notice both renderers ship for a resume that lost answers — which
is this repository's own named failure: prose saying a feature exists and a build where
nobody can see it working are two different claims. The admin's **fill in** tab opens the
published form against the server and does the three things the documentation asks of a
host: it saves two seconds after the typing stops rather than per keystroke, it keeps the
token the server minted and sends it in a header rather than a URL, and it shows the resume
notice and refuses to save a draft that came back read-only. The public routes are called
the way a respondent's browser calls them, without a session
([0082](./docs/decisions/0082-the-draft-flow-is-demonstrated-in-the-admin.md)).

Not demonstrated there, and said rather than implied: the **anonymous** submission path.
The admin is signed in, so its submissions skip the proof-of-work challenge.

**A wizard is something an author can make now.** It was the one thing a developer could
write by hand and the builder could not produce: the format has `page`, the engine walks
the pages and refuses to advance past a problem, both renderers draw the stepper, and
there was no route to one. `p` in the structure tree adds a page, beside `a`, `m` and
`Delete`, and it is in the legend the tree renders.

**The first page takes the fields already at the top level**, which was decided by
measuring the engine rather than by taste. A top-level field that is not inside a page is
given to page one *wherever it sits*: in `bare1, page one, bare2, page two` the engine
reports pages 0, 0, 0, 1, so `bare2` is drawn between the two pages and renders on the
first. No builder tree can show that honestly. So "add a page" to an unpaged form means
"make this form a wizard", the form somebody already built becomes page one, and it is one
undoable step and announced — a command that rearranges every field in the document is not
one to perform quietly. `validTargets` stops offering the bare top level once a form has
pages, which is what keeps the shape from coming back on the next insertion
([0081](./docs/decisions/0081-a-page-absorbs-the-form-it-joins.md), and D8 in
`SAFETY-ANALYSIS.md`, whose residual is that the **format** still permits the shape —
refusing it there is a spec change and version 2 is frozen).

A test had to be corrected rather than the code: `commands.test.ts` asserted that a leaf
may land in any container, including the top level of a paged form. True of the validator,
false of the engine.

## 0.2.0 — 2026-09-28

**The beta, and the release that freezes spec version 2.** A document written against
version 2 will validate against every future release that speaks it; what version 2 added
and what freezing it costs are in [`MIGRATIONS.md`](./MIGRATIONS.md). The short of the
cost: an async validator and a `signature` field type are now spec 3 features.

`0.2.0` is also the first release that **reads** version 2. `0.1.0` predates spec
versioning and pins documents to `{ "const": "1" }`, so it refuses a version 2 document
rather than ignoring the property — which is the loud failure rather than the silent one,
and still a failure.

*This entry is written for somebody integrating formancy, and it is a summary. The
argument behind each decision is in [`docs/decisions/`](./docs/decisions/), each record
naming the test that fails if the decision is violated; the blow-by-blow development
record is the git history.*

### Breaking, and behaviour that changed under you

- **Drafts need a token, and there is no compatibility window.** `PUT` and
  `GET /f/:path/drafts/:draftId` were unauthenticated and the id came from the caller, so
  anybody who guessed an id could read or overwrite a part-filled form — and an overwrite
  is then submitted under the victim's name, with nothing in the submission or the audit
  log saying the content was not theirs. `POST /f/:path/drafts` now starts a draft and
  returns an id the caller did not choose plus an HMAC over it, required in
  `X-Formancy-Draft-Token` on both other routes and compared in constant time. A wrong
  token is answered exactly like a draft that is not there, so the reply cannot enumerate
  ids. A window in which the old routes kept working would be a window with the hole open
  ([0062](./docs/decisions/0062-a-draft-carries-its-own-key.md), C5 in
  [`SAFETY-ANALYSIS.md`](./docs/regulatory/SAFETY-ANALYSIS.md), and
  [`MIGRATIONS.md`](./MIGRATIONS.md)).
- **An answer is checked against the options offered.** A `select` offering CH and DE
  accepted `XX`; a `radio` offering `red` accepted `plaid`. The controls could not produce
  it, but a payload posted at the endpoint is not a control. `modelViolations` refuses it
  with the code `option`, on the value and never the label, and only when the document
  carries the options. Stored submissions are never revalidated, so nothing already
  collected changes — but **a resumed draft holding an option the author has since deleted
  now reports `option` where it used to say nothing**
  ([0076](./docs/decisions/0076-an-answer-is-one-of-the-options.md)).
- **A chooser stores a string.** A `select` or `radio` answer that is an object, an array
  or a number is refused with `type`. `{"canton": {"$gt": ""}}` used to be stored with
  nothing having looked at it.
- **A `date` answer's shape is checked.** Version 1 fixed `date` as a date-only ISO 8601
  string and nothing enforced it, so a deployment posting `19/09/2026` was accepted until
  now and will start failing with `shape`. The freeze promises a version 1 *document*
  keeps validating, not that a malformed *answer* keeps being accepted.
- **A spec 2 document is refused by a spec 1 reader**, by name, with the fix in the
  message. Going backwards is refused rather than performed: dropping what version 2 added
  is data loss wearing the word "conversion".

### The format — version 2, and what it added

Five field types: **`selectboxes`** (several answers from one list, stored in the options'
own order; nothing ticked is `[]` and never null), **`file`** (the submission stores what
each file is and where it went, never its bytes), **`richtext`** (a small closed grammar
rather than HTML — no path from an answer to `innerHTML`, no sanitiser to keep correct
forever, and a `javascript:` link renders as the text somebody typed,
[0052](./docs/decisions/0052-richtext-is-not-html.md)), and **`time`** and **`datetime`**.
One canonical form per temporal type, `earliest`/`latest` bounds rather than `min`/`max`,
and no per-field `timezone` property: a `datetime` is an instant, a `time` is a wall clock.

Three layout kinds: **`tabs`** (presentation, not pages — a field in a closed tab is still
validated and still submitted), **`table`** (a grid whose columns line up across rows; not
a `<table>`, because arranging fields in columns is not tabular data), and **`qrcode`** (a
second view of an answer a field node already places — not a field type, because it
collects nothing).

Four widgets, through a new `widget` property that says how a field should *look* without
changing what it *stores*: `toggle` on a checkbox, `datagrid` on a repeater, `typeahead`
on a select, `scanner` on a text field. A renderer that ignores a widget is still correct,
because the field renders as its type.

And: **`optionsSource`**, so a `select` can take its answers from the deployment rather
than from the document — nothing in formancy fetches anything, the host supplies the
resolver ([0077](./docs/decisions/0077-options-may-come-from-a-named-source.md));
**`span`** on a child of a `table` layout; **`columns`** on a datagrid; and condition
groups, so one rule can combine several comparisons with `all` or `any`.

A grid's rows are flat: a `datagrid` column naming a `group` is refused when the document
is saved, because both renderers flatten a group into its leaves and one heading would
then name two controls ([0078](./docs/decisions/0078-a-grid-row-is-flat.md)).

### Packages

Four reach npm for the first time: **`@formancy/builder-react`** — the embeddable builder,
and the package a prospective adopter most wants to see — along with
**`@formancy/challenge`** (the proof-of-work scheme, isomorphic), **`@formancy/mcp`**
(formancy as seven tools for a coding agent) and **`@formancy/tiptap`** (the rich-text
editor a host supplies; ProseMirror is larger than the engine, so it is never a dependency
of a renderer).

`@formancy/themes` ships four appearances — Blueprint, Dusk, Paper and Pop — beside the
builder's own. Every part the renderers emit is styled by every one of them, and the test
that says so derives the list from the renderers rather than from a list somebody
maintains.

### The server

- **File uploads.** A file is *offered* before any bytes exist, *stored* when they arrive,
  and *claimed* inside the submission's own transaction — so a submission exists if and
  only if the files it names belong to it. `accept` and the size limit are enforced at the
  offer, before a byte is sent, because a browser's filter means nothing to somebody
  posting at the endpoint. Unclaimed files are collected after a day, bytes first and the
  row second. Files come back as authenticated attachments with `nosniff`, never inline
  ([0055](./docs/decisions/0055-files-are-claimed.md)).
- **An S3-compatible object store**, verified against a real Garage instance in a
  container. Local disk stays the default and is the only store needing no external
  service; configuring both is refused rather than resolved by precedence.
- **Webhook delivery** through a transactional outbox, with a per-destination circuit
  breaker and dead deliveries you can replay from the admin — a self-hoster has no ops
  team watching a dashboard, so a failing destination has to be visible in the product.
- **Audit logging**, written in the same transaction as the mutation it records, and
  covering submission reads as well as writes.
- **A proof-of-work challenge** for anonymous submissions, with no third party in the
  request path and no cookie: `FORMANCY_CHALLENGE_SECRET`, stateless. It hashes
  synchronously because `crypto.subtle` made the defender pay about 18× what an attacker
  pays ([0059](./docs/decisions/0059-proof-of-work-not-a-captcha.md)).
- **Rate limits at four scopes**, both draft routes included. One public route is
  deliberately unlimited and now says so in the documentation.
- **A resumed draft says what changed while you were away**, and a publish is one
  transaction rather than three storage calls that could half-succeed.
- **The server image is published and signed**, at
  `ghcr.io/sharkysan/formancy-server:v0.2.0`, with a compose file for it. There is
  deliberately **no `latest`**: the SOUP declaration tells a manufacturer to pin an exact
  version, and publishing a moving tag would contradict that in the most convenient place
  to do it.

### The builder and the admin

- **Every property the format has is configurable, and a guard says so.** The property
  panel is generated from the spec's own JSON Schema, so a new property arrives with its
  control rather than two releases later.
- **Keyboard before pointer.** `w` puts two arrangement items side by side, Escape closes
  every dialog in the arrangement pane, and focus follows the field rather than the row
  number. WCAG 2.2 SC 2.5.7 requires a keyboard path for every drag, so the command was
  built first and the gesture second.
- **Drag and drop on the form preview**, with a drop indicator that is actually drawn:
  dropping beside a field puts both in a row, as one undoable command.
- **Describe a form and get one.** `PromptPane` takes a description and returns a document
  the validator has already accepted.
- **Rows can be reordered while a form is being filled in** — `engine.moveRow`, with Move
  up and Move down in both renderers. Known limitation: focus is lost on a reorder.
- The admin has a **Webhooks tab**, looks like the rest of formancy.ai, and is tested. A
  new form starts at spec version 2.

### Accessibility

The conformance run audits every mount and every DOM-mutating change with axe, and found a
real bug on its first run. The engine owns ids and `aria-describedby` composition, so
correct wiring is a property of the architecture rather than of three implementations. A
`toggle` is deliberately **not** `role="switch"`: it is a checkbox that looks like a
switch. Stated plainly — automated checking catches roughly 57% of machine-detectable
issues, no manual screen-reader audit has been done, and there is no VPAT.

### Supply chain

Every tarball carries npm provenance binding it to the workflow run, the commit and the
repository. Each release attaches a CycloneDX SBOM signed keylessly with cosign, and the
workflow refuses to continue if the CEL evaluator is missing from it. The image is signed
by digest, never by tag. Every third-party action in the release workflow is pinned to a
commit hash. There is no signing key, so there is none to leak — see
[`RELEASING.md`](./RELEASING.md) for how to verify any of it.

### Fixed

Selected, where an integrator would notice:

- **A strict CSP needs no configuration now, including `style-src`.** Angular's component
  style was a `<style>` element that `style-src 'self'` blocks, which silently undid a
  two-column table layout in that renderer
  ([0079](./docs/decisions/0079-a-host-is-undone-without-a-stylesheet.md)).
- **A two-column `table` layout never produced two columns in Angular** — the host element
  was its parent's only grid item.
- **A rule reading a list field now hides what it was told to hide.**
- **An expression that compiles and then never works is refused at publish**, not at
  render, so a form already out there keeps opening for whoever is filling it in
  ([0054](./docs/decisions/0054-expressions-that-never-work.md)).
- **The rich-text editor was invisible.** A bare `contenteditable` has no border, no
  padding and no height, and no theme knew the part's name.
- **`FORMANCY_CHALLENGE_SECRET` did nothing under docker compose**, and the container was
  broken by a missing dependency with nothing noticing.
- **The server's membership check could not run.** `createApp` never set `optionsSources`,
  so the server half of `optionsSource` was unreachable while the hazard analysis stated
  the constraint unconditionally.
- **A file that uploaded is no longer thrown away because a later one failed.**
- **Date and time fields show a calendar or a clock on iPhone**, and fit their field.
- **A checkbox and a radio answer the pointer.** Neither had a hover or a press of its
  own, and the rule every control shares outranked `:checked` — so hovering a *chosen*
  radio repainted it as unchosen
  ([0080](./docs/decisions/0080-a-choice-control-dresses-its-own-states.md), and D7 in
  `SAFETY-ANALYSIS.md`).

### Documentation

The website deploys as one static site: landing page, playground and documentation under
one origin, with a sitemap, link previews and a social card rendered from source rather
than exported by hand. The landing page and the README now say what a manufacturer can do
with this — formancy is not a medical device and claims no conformity, and it ships the
characterisation needed under IEC 62304 to treat it as software of known provenance.

Several documentation claims were wrong, and are now guarded rather than merely corrected:
a bundle-size gate that does not exist, a spec version no released package spoke, "adding
a field type is a compatible change" in four documents at once, per-package test counts
transcribed into the SOUP declaration, and the regulatory set saying the spec is frozen at
version 1. `CLAUDE.md` gained the enforcement half of the rule that produced them.

### What 0.2.0 knowingly does not have

[`RELEASING.md`](./RELEASING.md) asks a release entry to say this, because the absence a
reader discovers for themselves is the one that costs them a day.

- **No submission token bound to the form version.** This is the gap that keeps the
  public plane off a public deployment. Everything else guarding it — the origin
  allowlist, the rate limits, the proof-of-work challenge, the body cap — is in place.
- **The server writes no log at all.** Fastify is constructed with the logger off, so no
  submission content can reach one and nothing will tell an operator why a request
  failed. The audit log records mutations, including submission reads, and is all there
  is. A deployment that adds a logger owns the redaction question alone.
- **The rate limiter's store is per process**, so it is wrong behind more than one
  replica. Documented rather than fixed.
- **No virus scanning, no resumable or multipart uploads, and no presigned uploads.**
  Bytes still pass through the server, so the request body cap is the ceiling on a file.
- **`signature`, a many-answer tag picker and async validators are spec 3**, now that
  version 2 is frozen. None of them is reserved ahead of use.
- **No manual screen-reader audit and no VPAT.** The accessibility claim rests on
  automated checking, which catches roughly 57% of machine-detectable issues.
- **Appearance is reviewed, not verified.** jsdom implements no layout, and no
  application in this repository renders the Angular bindings in a browser at all.
- **Nothing verifies a release after it is published.** Every gate runs inside the
  workflow that publishes, against the tree it built from.

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
