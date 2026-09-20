# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## [0.1.0] — unreleased

The first release. **Spec version: `"1"` (frozen).**

### Read this first

The *spec* is frozen; the *packages* are not. A form document written today
keeps working, and the submissions stored against it keep their shape. The
package APIs are pre-alpha and will change before 1.0.

The packages are **not on npm yet** — the `@formancy` scope is unclaimed. To try
formancy today, clone the repository.

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

### Applications

- **Admin** — the builder in a three-pane inspector with live preview, plus a
  raw schema editor, publish, version history, submissions and CSV export.
- **Playground** — schema *or* the builder on the left, the live form in the
  middle, the engine's actual state on the right. A theme switcher that proves
  the renderers ship no CSS, and a language switcher over a demo form written
  in `$t` references with a deliberately partial French catalogue, so the
  fallback to the default locale is visible rather than claimed.
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

**Not built yet.** Conditions combining more than one comparison; file upload; webhooks and actions; rate
limiting, challenge and origin allowlists on the public plane; multi-tenancy; a
published container image — one builds locally from `docker compose up`, but nothing is pushed to a registry or signed.

**Known gaps.**

- 118 CEL specification cases fail. If your forms use expressions, read
  `CEL-CONFORMANCE.md` rather than this summary.
- A `pattern` that `recheck` cannot decide about is accepted rather than
  refused, and patterns published before the gate existed were never analysed.
- `@fastify/rate-limit`'s default store is per-process and therefore wrong
  behind more than one replica.
- A `visible` rule that fails at runtime shows the field. That is deliberate,
  but it means a form whose visibility rules are quietly failing looks as though
  it is working.
- No manual screen-reader audit and no published VPAT. Automated checking
  catches roughly 57% of machine-detectable issues, and about 30% of WCAG 2.2
  criteria are machine-testable at all.
- Async validators do not exist. They need a new rule kind, which is a spec 2
  change; `runsOn` is already in place so that change is additive.
- The release pipeline — npm provenance, CycloneDX SBOM, cosign signature — is
  configured but has never run. Its first execution is its first test. Container
  image signing waits on there being a container image.

### Getting it

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
