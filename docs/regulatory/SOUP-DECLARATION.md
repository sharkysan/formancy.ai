# SOUP characterisation

Written for a manufacturer who is incorporating formancy into a product
developed under IEC 62304, and who therefore has to record what this software
is, what it needs, what it is known to get wrong, and what evidence exists that
it works. Read [`MDR-CONTEXT.md`](MDR-CONTEXT.md) first.

**This document describes version `0.4.0`.** Everything below is true of that
version and of no other. Pin an exact version; a range is not characterised
software, and neither is `latest`.

## Identity

| | |
|---|---|
| Name | formancy |
| Supplier | the formancy project (open source) |
| Licence | Apache-2.0 for every package ([0002](../decisions/0002-apache-2-0.md)) |
| Source | this repository, in full, including tests |
| Package version | `0.4.0`, published to npm under the `@formancy` scope |
| Spec version | `"4"`, **frozen as of 0.4.0** ([0140](../decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)) — the version this release writes and the one this document characterises. Versions `"1"` ([0042](../decisions/0042-freeze-the-spec.md)), `"2"` ([0051](../decisions/0051-spec-2-adds-types.md)) and `"3"` ([0088](../decisions/0088-spec-3-freezes-with-four-constructs.md)) are frozen too and stay readable, so a deployment pinned to any of them is characterising a settled format. No version is open. What each version added, and what freezing one costs, is in [`MIGRATIONS.md`](../../MIGRATIONS.md) |
| Development stage | beta. 0.1.0 was the first release and predates spec versioning: it pins documents to version 1 and refuses anything later rather than ignoring the property. 0.2.0 reads version 2; 0.3.0 reads version 3; 0.4.0 reads version 4 and **writes** it by default, so a form authored here is refused by a reader pinned to 0.3.0 — loudly, which is the point |
| Integrity | each tarball carries a SLSA v1 provenance attestation issued by GitHub's OIDC identity for the workflow run that built it, plus a registry signature. Verify with `npm audit signatures`. The server image is published to GHCR and **signed by digest**, with the SBOM attached as a CycloneDX attestation — verify with `cosign verify` and `cosign verify-attestation` against the digest rather than the tag, since a tag is mutable. There is deliberately no `latest`, for the reason this table gives two rows down. The pipeline is described in [`RELEASING.md`](../../RELEASING.md) |

The two version lines are independent and both matter. The package version
governs the code; the spec version governs the *documents and stored
submissions*, which is the artefact with real switching costs.

> **A manufacturer must pin the spec version as well as the package version.**
> Each version is a superset of the one before it: it adds field types, layout kinds
> and properties, and removes nothing, so a document characterised under version 1 is
> unchanged and still valid under every later one. But a reader that speaks only one version
> cannot read a document written against a later one — the failure is a validation error
> rather than a silent one ([0051](../decisions/0051-spec-2-adds-types.md)). This document
> characterises the released package, which writes version 4.
>
> **The data format is stable; the code is not.** Every spec version is frozen, so a form
> document written against any of them — and the submissions stored against it — keeps its
> shape ([0140](../decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)). A
> deployment pinned to any of them is characterising a settled format whatever the source
> does next. The
> *packages* are pre-1.0 and their APIs will still change. A manufacturer
> should read the two version lines separately: the one that governs stored
> data is settled, the one that governs the software is not.

## Intended function

formancy renders data-collection forms from a JSON document, evaluates
conditional logic and validation rules against the answers, and — in the
server packages — stores submissions bound immutably to the exact form version
that produced them.

It is **general-purpose**. It has no clinical intended purpose, no notion of a
patient, and no domain knowledge of anything a form might collect.

What it does **not** do, and must not be assumed to do:

- It does not decide whether collected data is clinically meaningful, only
  whether it satisfies the rules the form author wrote.
- It does not identify or authenticate the person filling in a form. That is
  the surrounding application's responsibility.
- It does not provide an audit trail of who saw a submission unless the server
  packages are deployed and audit logging is configured.
- It does not encrypt data at rest. That is the database deployment's job.

## Required environment

| Layer | Requirement |
|---|---|
| Runtime (engine, spec, expressions, builder-core) | Any ECMAScript 2023 environment. **No DOM and no Node APIs are used** ([0008](../decisions/0008-layered-packages.md)). `builder-core` additionally uses the ECMA-402 `Intl.PluralRules` and `Intl.ListFormat` for the builder's own words ([0114](../decisions/0114-the-builder-speaks-the-authors-language.md)). Every current browser and the official Node builds carry the locale data; a runtime without data for the builder's language — Node built with `small-icu` — words counts and joins lists in English, and says nothing |
| Runtime (server) | Node.js `>=22.12.0`; tested on 22.12.0 and 24, the engine and the server's integration tests included ([0134](../decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)) |
| Renderer (React) | React `^19.0.0` (peer dependency) |
| Renderer (Angular) | `@angular/core` `^22.0.0` (peer dependency), zoneless change detection. **Under a strict `style-src` Content Security Policy this package needs Angular's `ngCspNonce`**: it ships one component stylesheet, `:host { display: contents }`, which takes the recursing layout component's host element out of the box tree so a consumer's grid sees the same children it sees in React ([0073](../decisions/0073-a-host-element-is-not-a-layout.md)). Without it a table layout collapses to one column. `@formancy/angular/material` additionally needs `@angular/material` and `@angular/cdk` `^22.0.0` — optional peers, tested against 22.1.7 — and a Material theme of the application's choosing ([0132](../decisions/0132-material-draws-what-it-has-an-equivalent-for.md)) |
| Database (server only) | PostgreSQL 17 or 18 |
| Deployment (server only) | Two compose files are supplied: `compose.yaml` builds from a checkout, `compose.published.yaml` runs the signed published image and requires `FORMANCY_VERSION` to be pinned, because no `latest` tag is published. Every variable `.env.example` documents is passed through by both, and following its object-store block leaves the server one store — the object store — rather than two, both checked by `packages/server/src/compose.test.ts`. Switching to the object store through compose sets `FORMANCY_FILES_DIR=""`, which only a server newer than `0.4.0` reads as unset |
| Pictures on options | A host with a strict Content Security Policy needs `img-src` to allow `data:` for pictures a document carries, and the hosts it names for the others; without it the option still works and its picture does not load ([0126](../decisions/0126-an-option-may-carry-a-picture.md)) |
| File uploads | A thumbnail needs `createImageBitmap` and a 2D canvas, which every browser in the stylesheet row has; without them no thumbnail is drawn and the file's name is shown alone. It needs no `img-src` permission, because it is drawn from the file's bytes and no URL is involved. A figure on the progress bar needs the host's uploader to report one, which `fetch` cannot do for an upload; a cancel stops the transfer only if the uploader passes the signal on ([0130](../decisions/0130-each-file-is-its-own-upload.md)) |
| Virus scanning (server only, optional) | A ClamAV daemon reachable over TCP when `FORMANCY_CLAMD_HOST` is set, spoken to with its INSTREAM command and no client library. Run once against ClamAV 1.5.4 (`clamav/clamav:stable`, 2026-10-09); the adapter's tests use a protocol stand-in. **Set `AlertExceedsMax yes`**: ClamAV's shipped `clamd.conf` says content past `MaxFileSize` or `MaxScanSize` is not flagged otherwise, and is answered clean. Unreachable, every upload is refused ([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)) |
| A model for the builders (server only, optional, after `0.4.0`) | An account with Anthropic, OpenAI or xAI, named by `FORMANCY_MODEL_PROVIDER` with its key and model, and outbound HTTPS from the server to that provider's API — `api.anthropic.com`, `api.openai.com` or `api.x.ai`. All three or none; half is refused at startup, and none is the default. With Anthropic, a model with adaptive thinking (Opus 4.6, Sonnet 4.6 or later). Each request sends the form, or its words, to that provider ([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md); hazards C8, C9 and D17) |
| Stylesheets (`@formancy/themes`) | Chrome 120, Edge 120, Firefox 113, Safari 16.4 — the first releases with both `:dir()` and `color-mix()`. **A host that bundles them must target these or later**: a bundler targeting older browsers rewrites `:dir(rtl)` as a list of right-to-left languages, after which a page's `dir` no longer mirrors the layout; Vite's default target did ([0123](../decisions/0123-the-builder-reads-right-to-left.md)). Loaded with a plain `<link>`, they are not rewritten |
| Module format | ESM only; no CommonJS build is published ([0038](../decisions/0038-esm-only.md)) |

## Composition and third-party dependencies

Fifteen published packages, layered so that the isomorphic ones cannot
acquire a platform dependency ([0008](../decisions/0008-layered-packages.md)).
Workspace dependencies between them are not listed: the whole repository is
delivered as one version under one licence, so assessing `@formancy/server` is
not separately assessing `@formancy/spec`.

| Package | Runtime dependencies outside the project |
|---|---|
| `@formancy/spec` | `@noble/hashes ^2.4.0`, `ajv ^8.20.0` |
| `@formancy/expressions` | `@marcbachmann/cel-js ^8.0.0` |
| `@formancy/core` | none |
| `@formancy/challenge` | `@noble/hashes ^2.4.0` |
| `@formancy/builder-core` | none |
| `@formancy/builder-react` | none (React is a peer) |
| `@formancy/builder-angular` | `tslib ^2.8.0` (Angular is a peer) |
| `@formancy/conformance` | none |
| `@formancy/react` | `uqr ^0.1.3` (React is a peer) |
| `@formancy/angular` | `tslib ^2.8.0`, `uqr ^0.1.3` (Angular Material and its CDK are optional peers, for `/material` only; Angular is a peer) |
| `@formancy/server-core` | `@noble/hashes ^2.4.0`, `recheck ^4.5.0` |
| `@formancy/server` | `@anthropic-ai/sdk ^0.132.1`, `@fastify/rate-limit ^11.2.0`, `@node-rs/argon2 ^2.2.1`, `drizzle-orm ^0.45.2`, `fastify ^5.12.5`, `jose ^6.2.12`, `openai ^7.31.0`, `postgres ^3.4.9`, `undici ^8.10.2` |
| `@formancy/mcp` | `@modelcontextprotocol/sdk ^1.30.1`, `zod ^4.6.5` |
| `@formancy/themes` | none (CSS only) |
| `@formancy/tiptap` | `@tiptap/core ^3.31.3`, `@tiptap/extension-bold ^3.31.3`, `@tiptap/extension-bullet-list ^3.31.3`, `@tiptap/extension-document ^3.31.3`, `@tiptap/extension-italic ^3.31.3`, `@tiptap/extension-link ^3.31.3`, `@tiptap/extension-list-item ^3.31.3`, `@tiptap/extension-ordered-list ^3.31.3`, `@tiptap/extension-paragraph ^3.31.3`, `@tiptap/extension-text ^3.31.3`, `@tiptap/pm ^3.31.3` |

`@formancy/tiptap`'s nine extensions are listed one by one, in the table and in
the package's own source, rather than taken from `@tiptap/starter-kit` — which
is one line and would bring six more constructs the stored grammar cannot hold
([0061](../decisions/0061-tiptap-over-the-closed-grammar.md)). Summarising them
here as "and the nine extensions" is what the first version of this row did, and
`apps/docs/src/soup.test.ts` rejected it: a range a manufacturer cannot read is
not a declared range.

**This table is derived from the manifests by `apps/docs/src/soup.test.ts`,
not maintained by hand.** It had drifted three packages and four dependencies
before that test existed — a composition list is the one part of this
document a manufacturer builds their own dependency assessment on, and a
wrong one is worse than an absent one. The test fails on any package, name or
version range that does not match `package.json`.

The dependency count is deliberately small, and the engine — the part that
decides whether a submission is valid — has **no third-party runtime
dependency at all**. So does `@formancy/core`'s whole layer: a manufacturer whose
product renders forms and validates them, without the server or the rich-text
editor, is assessing `ajv`, `@noble/hashes`, `uqr` and `@marcbachmann/cel-js` and
nothing else.

### The dependencies to look at closely

`uqr` draws a QR code. MIT, **zero dependencies**, 6.6 kB brotli measured
2026-09-27, and it is reached only when a form contains a `qrcode` layout node — it is
left external by the build rather than bundled, so a consumer with no code nodes pays
for it in install size and not in their application bundle.

**What is used of it is `encode` alone**, which returns a boolean matrix; its own
`renderSVG` is deliberately not called, because it emits `fill="white"` and
`fill="black"` and a renderer choosing colours is what
[0004](../decisions/0004-headless-core.md) exists to prevent. That narrows the exposure
to one pure function over a string, which is also the part a manufacturer can most
easily satisfy themselves about.

**The anomaly to be aware of is a wrong code rather than a crash.** A mis-encoded QR
code is a picture that looks correct and does not scan, or scans to the wrong string.
Nothing in this repository can detect that — the tests assert the matrix is drawn,
its colours and its accessibility, not that a scanner reads it — so a deployment whose
codes are load-bearing should scan one before relying on them. Stated because no test
here covers it.

`@marcbachmann/cel-js` evaluates every conditional and validation expression.
It is MIT-licensed, zero-dependency and fast, and it has roughly 190 GitHub
stars and a single maintainer. That bus factor is recorded and handled
architecturally rather than hoped away: nothing above the expression layer
imports it, so replacing it is a change to one package
([0017](../decisions/0017-expression-facade.md)).

Its conformance against the official CEL specification was **measured rather
than assumed**, because the library's own claim is the unquantified phrase
"most of the CEL spec". The result is pinned in a test and written up in
`packages/expressions/CEL-CONFORMANCE.md`
([0036](../decisions/0036-pin-the-cel-corpus.md)).

`recheck` decides whether a form's `pattern` may be published. It statically
analyses each expression for catastrophic backtracking, which is the only
moment that cost can be refused — a JavaScript regular expression cannot be
timed out once it has started, so a bad pattern published once turns every
later submission into unbounded CPU for anyone who can reach the form. It
found a polynomial case in formancy's own built-in email format before it was
ever pointed at a user's. Which engine it uses is chosen by the host:
`@formancy/server` pins `RECHECK_BACKEND=pure`, and absent that recheck falls
back to the pure engine itself.

`@noble/hashes` computes the canonical schema hash and the proof-of-work
challenge. It is audited, has no dependencies of its own, and replaced Web
Crypto in the challenge after measurement: a hundred thousand hashes cost
269ms synchronously against about 4,800ms through `crypto.subtle`, and the
overhead fell on the legitimate visitor rather than on an attacker, who
writes the fast loop ([0059](../decisions/0059-proof-of-work-not-a-captcha.md)).

**ProseMirror, through TipTap**, is the largest dependency in the tree by an
order of magnitude and the newest. Two things bound what it can do. It is
**optional**: it lives in its own package, the renderers take an editor from the
host rather than importing one, and a deployment that does not provide one gets a
textarea and never loads it — so a manufacturer who does not want this
dependency simply does not have it. And its schema is **closed by
construction**: the editor is built from exactly the nodes and marks the stored
grammar has, so it cannot produce a document the grammar has no way to store,
which is asserted against a real ProseMirror rather than assumed
([0061](../decisions/0061-tiptap-over-the-closed-grammar.md)).

What it does **not** get is trust. Its output is converted through
`@formancy/spec` and every link is re-checked against the same scheme list the
parser uses, because the editor runs in the browser and a document really does
arrive carrying a `javascript:` href if one is put there. The server re-parses
the stored string regardless. Nothing anywhere calls TipTap's `getHTML`, and no
stored answer is ever markup — which is what keeps the rich-text field out of
the stored-XSS class entirely
([0052](../decisions/0052-richtext-is-not-html.md)).

`@tiptap/core`, `@tiptap/pm` and the nine extensions are MIT. TipTap also sells
commercial extensions; none is used, and depending on one would contradict the
project's open-core line.

**`@anthropic-ai/sdk` and `openai`**, after `0.4.0`, are the providers' own clients for the
model a deployment may configure for its builders
([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md)). They are in
the server's image whether or not a model is configured, and loaded when it starts; neither
sends anything unless `FORMANCY_MODEL_PROVIDER` names its provider. `openai` (Apache-2.0) has
no dependencies of its own, only optional peers; of those, `undici`, which the server depends
on already, and `zod` resolve. `@anthropic-ai/sdk` (MIT) brings `json-schema-to-ts` and
`standardwebhooks`, and through them `@babel/runtime`, `ts-algebra` and `@stablelib/base64`
(MIT) and `fast-sha256` (Unlicense). **`zod` (MIT) is in the image through these two SDKs
alone**: both name it as an optional peer, and because the workspace has it for
`@formancy/mcp`, the lockfile resolves it for them and the image installs it — read from the
installed manifests, `pnpm why zod --prod` on `@formancy/server` and a `pnpm deploy` of its
production closure on 2026-10-10. Each adapter names its provider's base URL, and sets the
credential, organisation, project and log level, rather than taking them from the
environment, which both SDKs would otherwise do; headers the SDKs would read from
`ANTHROPIC_CUSTOM_HEADERS` or `OPENAI_CUSTOM_HEADERS` stop the server at startup instead. Their tests drive the real clients over a fake transport; **no
test reaches a provider**, so a provider that changes its API changes what they read, and
xAI's compatibility with OpenAI's client is xAI's documented claim, not something exercised
here.

## Known anomalies and limitations

IEC 62304 §7.1.2 asks for the supplier's published anomaly list.
[`CHANGELOG.md`](../../CHANGELOG.md) is it: every entry says what changed and why, and the
defects found by review are named there rather than summarised away. What follows is what a
manufacturer characterising `0.4.0` needs on one page.

**`0.2.0`, `0.3.0` and `0.4.0` can take an accepted submission's attachment away, and replace
its bytes.** The `PUT` that receives a file's bytes writes the row back as it read it before
the write — and, in `0.4.0` with a scanner, before the scan — as `stored` with no submission,
unconditionally. If a second `PUT` for the same file is stored and claimed by a submission
while the first is still being written or scanned, the first puts the claimed row back to
unclaimed, for the collector to delete a day later, and its bytes replace the ones the
submission was accepted with. Nothing in the submission records either. The clients this
repository supplies never send that second `PUT` — the admin's uploader offers the file anew,
under a new id, for every attempt — so it takes a proxy or HTTP library retrying the request,
an integrator's uploader that sends the bytes again without offering again, or whoever holds
the file's id, on purpose. Reproduced on real PostgreSQL against `0.4.0`'s route, with a
scanner held open and, without one, with the write held open; `0.2.0` and `0.3.0` have the same
sequence without the scan, read in their source but not run. Fixed after `0.4.0`, with a
residual: a request whose scan and write together outlast two minutes can still replace the
bytes, though not the row, and the supplied clamd adapter does not keep a scan inside that.
Hazard B10 in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) has both, and
[0153](../decisions/0153-a-file-is-received-by-one-request-at-a-time.md) the fix.

**Measured functional gaps.** Against the official CEL corpus: 2,344 cases
total, 704 in scope and run, **586 passed and 118 failed**, 2 refused
deliberately by formancy's own policy, 1,638 excluded as out of scope. The 118
failures are real gaps in the expression evaluator, enumerated in
`packages/expressions/CEL-CONFORMANCE.md`. A manufacturer whose forms use
expressions should read that file rather than this summary.

**Declared scope limits**, refused by the validator rather than mishandled:

- Nested repeaters are rejected ([0012](../decisions/0012-pages-scope-nothing.md)).
- Pages below the top level are rejected.
- A `datagrid` column may not name a group: a grid's rows are flat, because one heading
  over several answers names none of them ([0078](../decisions/0078-a-grid-row-is-flat.md)).
- Multi-tenancy is absent entirely.

**The object store cannot be used through either compose file in `0.4.0`**, nor in `0.2.0`
or `0.3.0`. Both files pass `FORMANCY_FILES_DIR` to the server as a literal path, so a
deployment that follows the object-store block of `.env.example` hands the server two
stores, and it refuses to start on every restart — measured with the published `v0.4.0`
image. A blanked `FORMANCY_FILES_DIR` does not help with those images either: they read the
empty string as a directory. Fixed after `0.4.0`, in the compose files and in the server
together; see the changelog.

**With the S3 object store, a download fails if it is still streaming thirty seconds after
the server asked the store for it**, in `0.4.0` as in `0.2.0` and `0.3.0`. The store's
timeout covers the whole request, body included, so a file still arriving when it runs out
is cut off part-way however steadily it is arriving — and how long a download streams is
mostly the downloader's connection, which backpressure carries back to the store. Thirty
seconds is the store's default and the server sets no other, so no setting changes it. The
local store has no such bound. An upload to the object store is bounded the same way, as a
whole, and stays so after the fix. Fixed after `0.4.0` for downloads, at the cost of
leaving nothing in the server to end a download whose reader has stopped reading
([0155](../decisions/0155-the-object-store-is-timed-on-its-silence.md)); see the changelog.

**Behind a reverse proxy, every respondent shares one rate-limit budget.** `0.4.0` counts
every public limit by the address on the socket, and behind the reverse proxy the deployment
view draws, that address is the proxy's for every request: thirty submissions a minute
between everybody, and the next refused with `429` for traffic that was not theirs. The
operator is not told, because the server writes no request log, and nothing in `0.4.0` can
be set to change it. Hazard D14 in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) has it. The
setting that follows `0.4.0`, `FORMANCY_TRUST_PROXY`, is in
[`CHANGELOG.md`](../../CHANGELOG.md) under *Unreleased*; set wider than the proxy, it turns
this into the opposite defect, a client choosing the address it is counted by
([0156](../decisions/0156-a-proxy-is-trusted-by-its-address.md)).

### Reserved, and not implemented

Each name is reserved in the sense that nothing else may take it, and **reserving is not
the same as being free to adopt.** Acquiring any of them is a new spec version and a
re-characterisation: the document schema is closed, so a reader on the older version
refuses a document carrying one rather than ignoring it
([0051](../decisions/0051-spec-2-adds-types.md)). A pinned deployment therefore keeps
working untouched.

- `async` — an asynchronous validator. `runsOn` already says *where* a check runs, so the
  ordering question is answered; the property that would make a check asynchronous is not
  in `logicRule`, which is `additionalProperties: false`.

An earlier version of this section listed remote option sources and the date-time types
here. Both shipped — `time`, `datetime` and `optionsSource` are in spec 2 — and the
sentence stayed, which would have told a manufacturer to leave out three features the
software has. `signature` and `tagpicker` have since left this list the same way — a spec 3
field type and a spec 3 widget — and the list is checked rather than read. `apps/docs/src/soup.test.ts` now checks every name in this list against the
format's own vocabulary, so it cannot happen again in that direction.

### Characterised by this document, and new since 0.3.0

`0.4.0` reads and writes `specVersion: "4"`. Everything version 4 added is listed in
[`MIGRATIONS.md`](../../MIGRATIONS.md); the parts that change what a *deployment* stores or
has to configure are:

- **Two answer shapes.** A `ranking` stores the chosen option values in the order chosen
  ([0138](../decisions/0138-a-ranking-stores-the-order-chosen.md)); a `matrix` stores an
  object from row value to column value, holding the rows answered
  ([0139](../decisions/0139-a-matrix-answers-one-question-per-row.md)). Both are refused by
  the engine on the server when they have a shape no control produces. A CSV export writes
  each as JSON in one column.
- **Each file is its own upload, and can be scanned.** An upload belongs to its row rather
  than its control ([0130](../decisions/0130-each-file-is-its-own-upload.md)), and a
  deployment that sets `FORMANCY_CLAMD_HOST` has every upload scanned by ClamAV before it is
  kept, refusing it when the scanner cannot answer
  ([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)). Without the setting,
  nothing is scanned.
- **Angular Material is an optional peer.** `@formancy/angular/material` draws with Material
  what it has an equivalent for and needs `@angular/material` and `@angular/cdk` only in an
  application that imports it ([0132](../decisions/0132-material-draws-what-it-has-an-equivalent-for.md)).
- **The tested versions are runs.** The lowest and newest React, Angular and Node.js the
  ranges admit are each a CI run ([0134](../decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)).

### Characterised by an earlier version of this document, and new in 0.3.0

`0.3.0` reads and writes `specVersion: "3"`. Everything version 3 added is listed in
[`MIGRATIONS.md`](../../MIGRATIONS.md); the parts that change what a *deployment* has to
think about are:

- **`kind: "check"`**: a validator the deployment answers by name, asked by the engine in
  the browser, on the server, or both. A deployment supplies it through `ServerDeps.checks`
  and a check a document names and the deployment has not supplied **fails the field
  closed** — a form that names a check nobody answers cannot be submitted. It re-runs on
  its own field's changes only, and nothing debounces it.
- **`kind: "skip"`**: a page the answers walk past, whose fields are hidden and therefore
  neither validated nor submitted
  ([0087](../decisions/0087-a-page-can-be-walked-past.md)).
- **`signature`**: a mark stored as points or a typed name, and never as stroke timing —
  velocity is what would make it biometric data, which nothing here is equipped to hold.
  This software cannot **verify** a signature: no identity proof, no certificate, no
  timestamp authority.
- **`optionsSource` on a list-valued field**, with the server's membership check widened to
  walk a list. Before this it asked only about string answers, so every value in a sourced
  `selectboxes` would have been stored unexamined — hazard A7 in a different shape.
- **The server replays as the server**, which it never did: every replay before this ran
  the client's `runsOn` rules. A deployment relying on a `runsOn: "server"` validation rule
  was relying on a rule that did not run.

Still from 0.2.0 and unchanged:

- **File uploads** with a claim-and-collect lifecycle, and an S3-compatible store verified
  against a real Garage instance in a container. Local disk remains the default and is the
  only one that needs no external service.
- **Webhook delivery** through a transactional outbox with a per-destination circuit
  breaker, and SSRF defence that validates the resolved address and connects to it.
- **Rate limiting** at four scopes, and a **proof-of-work challenge** on the public
  submission plane. The rate limiter's default store is per process, so it is wrong behind
  more than one replica — stated here because it is silent.
- **Drafts carry their own key** ([0062](../decisions/0062-a-draft-carries-its-own-key.md)).
  A draft written under 0.1.0 cannot be resumed, because no token was ever minted for it.
- **`optionsSource`**: a select whose answers come from the deployment rather than the
  document. The server asks the deployment whether a submitted value is offered and fails
  **closed** if it cannot answer — and a source that declares no `members` function checks
  nothing, which weakens the "an answer is one of the options" guarantee for that field.
  Hazard A7 in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) is the one to read.

### Still absent, and designed only

Resumable and multipart uploads, and presigned uploads that would keep bytes out of the
server's own data path. (Virus scanning was in this list until 0.4.0, which scans every upload
when a deployment runs ClamAV — above.) Also a submission token bound to the form version,
which is the gap that keeps the public plane off a public deployment.

**The server writes no request log.** Fastify is constructed with the logger off, so no
submission content can reach a request log — and nothing can tell an operator why a request
failed either. Its background workers do print a failed pass's error to standard error,
unredacted; hazard C3 says what that can carry.
There is no redaction configuration, so a deployment that adds a logger owns that question
alone. Hazard C3 has the detail.

**Accessibility**, stated precisely because vague claims here are worse than
none: the conformance suite structurally requires that every control be
reachable by role and accessible name ([0034](../decisions/0034-accessible-name-only.md)),
and axe-core runs after every mount and every DOM-mutating change. Automated
checking is a floor and not a claim — axe detects roughly 57% of
machine-detectable issues by Deque's own published figure, and only about 30%
of WCAG 2.2 criteria are machine-testable at all. **No manual screen-reader
audit has been performed, and no VPAT has been published.** A manufacturer
requiring an accessibility conformance statement must perform that work.

**Appearance is largely reviewed, not verified.** jsdom implements no layout and resolves
no media queries, so almost no test here can ask where a box is. Defects of both kinds —
where a box sits, and what a control's state looks like — have shipped and been found by
somebody opening a page rather than by a gate; hazards D4a, D4b, D4c and D7 have them by
name.

**The exception is `pnpm test:browser`**, which loads the composed site in Chromium at four
viewports and asserts that nothing scrolls sideways, how many columns the pane row computes,
and the computed `touch-action` of both renderers' signature surfaces with and without a
theme — and, since 2026-10-09, that a picked image is decoded and drawn as its thumbnail in
both renderers, at its own shape and within the theme's size. It covers the two mechanisms
that produced D4a's third instance and D4c, a file field's thumbnail, and nothing wider: no pixel baselines by choice, one engine rather than Safari, and one demo schema
rather than the conformance suite. A manufacturer relying on visual correctness must still
verify it in the browsers it ships to.

## Verification evidence

| Evidence | Where |
|---|---|
| Every automated test in the repository passing at this commit, across ten packages and two applications | `pnpm test`, which prints the count |
| 29 of those run against a real PostgreSQL instance via Testcontainers, rather than a stub | `packages/server/src/server.integration.test.ts` |
| One behavioural conformance suite executed against the engine, both renderers and the server | `packages/conformance` ([0033](../decisions/0033-one-suite-n-drivers.md)) |
| Property-based invariants over hide/unhide, repeater identity and evaluation order | `packages/core` |
| The official CEL corpus, with results pinned | `packages/expressions/CEL-CONFORMANCE.md` |
| Performance budgets, measured: keystroke ≈0.38 ms against a <1 ms budget; graph compile ≈1.7 ms against a <30 ms budget | `packages/core/bench/perf.mjs` |
| Layout and gesture facts jsdom cannot represent — horizontal overflow, computed grid columns and computed `touch-action` for both renderers — at four viewports in Chromium against the composed site, and a picked image drawn as its thumbnail | `pnpm test:browser` |
| Package-publication gates: `publint`, `@arethetypeswrong/cli` | `pnpm check:pkg` |
| Bundle sizes, measured by hand and dated rather than gated — `size-limit` is **not** wired up, and this table named it as a gate until 2026-09-27 | [§9.3](../architecture/09-quality-requirements.md) |
| Line coverage, reported per package and uploaded per commit — **reported and gated nowhere**, deliberately ([0099](../decisions/0099-coverage-is-reported-per-package-and-never-gated.md)) | `pnpm turbo run test:coverage`, and Codecov |
| Build provenance for every published tarball | `npm audit signatures` against the installed version |

A per-package breakdown used to be transcribed here, package by package. It is
not any more, and the reason is worth stating because it applies to every number
in this set: those ten figures changed on almost every commit, nothing failed
when they stopped matching, and a reader cannot tell a figure that is one release
old from one that was never right. **The suite prints its own counts**, per
package, in a form nobody has to keep in step — so the command is the evidence
and this paragraph is only the pointer to it.

What is worth writing by hand is the shape, which does not drift: the largest
suites are the engine and the expression language, every distributed package has
one, and the two applications are counted separately because they are not
distributed. Where a figure in this document is load-bearing it is measured and
dated rather than incremented — the performance budgets above are the example
— and where it is mere inventory it now names the command instead.

Coverage is reported rather than targeted, and what it counts is stated in
`vitest.coverage.ts`: barrels and composition roots are excluded, with the
reasoning written beside the exclusion, because a coverage figure is only
evidence if the reader can see what it measured. The two lowest figures are the
applications; every distributed package is above 85% of statements.

## Maintenance and support

No commercial support, no service-level agreement, and no security-response
commitment beyond `SECURITY.md`. Governance is documented honestly in
`GOVERNANCE.md` as a single maintainer.

Obtaining a fixed version does not depend on this repository staying up: the
packages are on the public npm registry, each Apache-2.0, each with a
provenance attestation tying it to the commit it was built from — so a
manufacturer can establish what they installed without trusting the supplier's
own claim about it.

A manufacturer relying on this in a regulated product should plan for the
possibility of maintaining it themselves. Apache-2.0 permits that, the
repository contains the complete test suite, and
[the architecture documents](../architecture/01-introduction-and-goals.md) exist partly so that a successor
maintainer can understand the design without the original author.
