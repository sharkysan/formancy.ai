# SOUP characterisation

Written for a manufacturer who is incorporating formancy into a product
developed under IEC 62304, and who therefore has to record what this software
is, what it needs, what it is known to get wrong, and what evidence exists that
it works. Read [`MDR-CONTEXT.md`](MDR-CONTEXT.md) first.

**This document describes version `0.10.0`.** Everything below is true of that
version and of no other. Pin an exact version; a range is not characterised
software, and neither is `latest`.

## Identity

| | |
|---|---|
| Name | formancy |
| Supplier | the formancy project (open source) |
| Licence | Apache-2.0 for every package ([0002](../decisions/0002-apache-2-0.md)) |
| Source | this repository, in full, including tests |
| Package version | `0.10.0`, published to npm under the `@formancy` scope |
| Spec version | `"5"`, **frozen as of 2026-10-27 and first released with 0.8.0** ([0201](../decisions/0201-spec-5-freezes-with-the-batch-it-opened-for.md)) — the version this release writes and the one this document characterises. Versions `"1"` ([0042](../decisions/0042-freeze-the-spec.md)), `"2"` ([0051](../decisions/0051-spec-2-adds-types.md)), `"3"` ([0088](../decisions/0088-spec-3-freezes-with-four-constructs.md)) and `"4"` ([0140](../decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)) are frozen too and stay readable, so a deployment pinned to any of them is characterising a settled format. No version is open: a construct needing one opens version `"6"`. What each version added, and what freezing one costs, is in [`MIGRATIONS.md`](../../MIGRATIONS.md) |
| Development stage | beta. 0.1.0 was the first release and predates spec versioning: it pins documents to version 1 and refuses anything later rather than ignoring the property. 0.2.0 reads version 2; 0.3.0 reads version 3; 0.4.0 reads version 4 and **writes** it by default, so a form authored here is refused by a reader pinned to 0.3.0 — loudly, which is the point. 0.5.0, 0.6.0 and 0.7.0 read and write version 4 as 0.4.0 does, so the four read each other's documents, save one that keys a field or a matrix row `__proto__`, which 0.7.0 refuses ([0185](../decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)). 0.8.0 reads version 5 and **writes** it, so a form authored with its builder is refused by a reader pinned to 0.7.0, as 0.4.0's was by 0.3.0. 0.9.0 and 0.10.0 read and write version 5 as 0.8.0 does, so the three read each other's documents |
| Integrity | each tarball carries a SLSA v1 provenance attestation issued by GitHub's OIDC identity for the workflow run that built it, plus a registry signature. Verify with `npm audit signatures`. The server image is published to GHCR and **signed by digest**, with the SBOM attached as a CycloneDX attestation — verify with `cosign verify` and `cosign verify-attestation` against the digest rather than the tag, since a tag is mutable. From 0.9.0 the release also attests the image with GitHub's build provenance, verified with `gh attestation verify`; every earlier image carries BuildKit's provenance inside its index and none of GitHub's ([0209](../decisions/0209-the-image-carries-githubs-build-provenance.md)). There is deliberately no `latest`, for the reason this table gives two rows down. The pipeline is described in [`RELEASING.md`](../../RELEASING.md) |

The two version lines are independent and both matter. The package version
governs the code; the spec version governs the *documents and stored
submissions*, which is the artefact with real switching costs.

> **A manufacturer must pin the spec version as well as the package version.**
> Each version is a superset of the one before it: it adds field types, layout kinds
> and properties, and removes nothing, so a document characterised under version 1 is
> unchanged and still valid under every later one — save one that keys a field or a matrix
> row `__proto__`, which every release since `0.7.0` refuses in every version, since none could
> store an answer under it ([0185](../decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)).
> But a reader that speaks only one version cannot read a document written against a later
> one — the failure is a validation error rather than a silent one
> ([0051](../decisions/0051-spec-2-adds-types.md)). This document characterises the released
> package, which writes version 5.
>
> **The data format is stable; the code is not.** Every released spec version — 1 to 5 — is
> frozen, so a form document written against any of them, and the submissions stored against
> it, keeps its shape ([0201](../decisions/0201-spec-5-freezes-with-the-batch-it-opened-for.md)). A
> deployment pinned to any of them is characterising a settled format whatever the source
> does next. The *packages* are pre-1.0 and their APIs will still change. A manufacturer
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
| Runtime (engine, spec, expressions, builder-core) | Any ECMAScript 2023 environment. **No DOM and no Node APIs are used** ([0008](../decisions/0008-layered-packages.md)). `builder-core` additionally uses the ECMA-402 `Intl.PluralRules` and `Intl.ListFormat` for the builder's own words ([0114](../decisions/0114-the-builder-speaks-the-authors-language.md)), and so does `core`'s second entry, `@formancy/core/words`, for the renderers' own words in the form's language ([0171](../decisions/0171-the-renderers-words-are-the-forms-language.md)); the engine itself does not. Every current browser and the official Node builds carry the locale data; a runtime without data for the builder's or the form's language — Node built with `small-icu` — words counts and joins lists in English, and says nothing |
| Runtime (server) | Node.js `>=22.12.0`; tested on 22.12.0 and 24, the engine and the server's integration tests included ([0134](../decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)) |
| Renderer (React) | React `^19.0.0` (peer dependency) |
| Renderer (Angular) | `@angular/core` `^22.0.0` (peer dependency), zoneless change detection. **Under a strict `style-src` Content Security Policy this package needs Angular's `ngCspNonce`**: it ships one component stylesheet, `:host { display: contents }`, which takes the recursing layout component's host element out of the box tree so a consumer's grid sees the same children it sees in React ([0073](../decisions/0073-a-host-element-is-not-a-layout.md)). Without it a table layout collapses to one column. `@formancy/angular/material` additionally needs `@angular/material` and `@angular/cdk` `^22.0.0` — optional peers, tested against 22.1.7 — and a Material theme of the application's choosing ([0132](../decisions/0132-material-draws-what-it-has-an-equivalent-for.md)) |
| Database (server only) | PostgreSQL 17 or 18 |
| Deployment (server only) | Two compose files are supplied: `compose.yaml` builds from a checkout, `compose.published.yaml` runs the signed published image and requires `FORMANCY_VERSION` to be pinned, because no `latest` tag is published. Every variable `.env.example` documents is passed through by both, and following its object-store block leaves the server one store — the object store — rather than two, both checked by `packages/server/src/compose.test.ts`. Switching to the object store through compose sets `FORMANCY_FILES_DIR=""`, which only a server from `0.5.0` on reads as unset |
| Pictures on options | A host with a strict Content Security Policy needs `img-src` to allow `data:` for pictures a document carries, and the hosts it names for the others; without it the option still works and its picture does not load ([0126](../decisions/0126-an-option-may-carry-a-picture.md)) |
| File uploads | A thumbnail needs `createImageBitmap` and a 2D canvas, which every browser in the stylesheet row has; without them no thumbnail is drawn and the file's name is shown alone. It needs no `img-src` permission, because it is drawn from the file's bytes and no URL is involved. A figure on the progress bar needs the host's uploader to report one, which `fetch` cannot do for an upload; a cancel stops the transfer only if the uploader passes the signal on ([0130](../decisions/0130-each-file-is-its-own-upload.md)) |
| Virus scanning (server only, optional) | A ClamAV daemon reachable over TCP when `FORMANCY_CLAMD_HOST` is set, spoken to with its INSTREAM command and no client library. Run once against ClamAV 1.5.4 (`clamav/clamav:stable`, 2026-10-09); the adapter's tests use a protocol stand-in. **Set `AlertExceedsMax yes`**: ClamAV's shipped `clamd.conf` says content past `MaxFileSize` or `MaxScanSize` is not flagged otherwise, and is answered clean. Unreachable, every upload is refused ([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)) |
| A model for the builders (server only, optional, from `0.5.0`) | An account with Anthropic, OpenAI or xAI, named by `FORMANCY_MODEL_PROVIDER` with its key and model, and outbound HTTPS from the server to that provider's API — `api.anthropic.com`, `api.openai.com` or `api.x.ai`. All three or none; half is refused at startup, and none is the default. With Anthropic, a model with adaptive thinking (Opus 4.6, Sonnet 4.6 or later). Each request sends the form, or its words, to that provider ([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md); hazards C8, C9 and D17) |
| Stylesheets (`@formancy/themes`) | Chrome 120, Edge 120, Firefox 113, Safari 16.4 — the first releases with both `:dir()` and `color-mix()`. **A host that bundles them must target these or later**: a bundler targeting older browsers rewrites `:dir(rtl)` as a list of right-to-left languages, after which a page's `dir` no longer mirrors the layout; Vite's default target did ([0123](../decisions/0123-the-builder-reads-right-to-left.md)). Loaded with a plain `<link>`, they are not rewritten |
| Module format | ESM only; no CommonJS build is published ([0038](../decisions/0038-esm-only.md)) |

## Composition and third-party dependencies

Sixteen published packages, layered so that the isomorphic ones cannot
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
| `@formancy/cli` | none |
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

**Its anomaly that reached formancy is a member named `constructor`.** Version 8.0.0 tells a
map from anything else by `value.constructor`, so an object holding a member of its own by that
name is `Unsupported type` to it, and every expression reading the object fails, whatever member
it asks for. A key is a name an author chooses, so through `0.6.0` a group, a repeater's row or a
matrix answer holding an answered `constructor` could be read by no rule. `@formancy/expressions`
now hands such an object to the library as a `Map`, which it reads by `get`, and charges each
member read out of it as it charges any read; held by `own-members.test.ts` there
([0185](../decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)). The library also
leaves `__proto__`, `constructor` and `prototype` out of a map literal, as a defence of its own,
so `{"constructor": 1}` evaluates to `{}` — measured on 2026-10-19, and not worked around.

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
challenge, and its HMAC signs the two keys the public plane hands out: a draft's,
and the token a response is sent with
([0169](../decisions/0169-a-response-is-stored-once.md)). It is audited, has no dependencies of its own, and replaced Web
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

**`@anthropic-ai/sdk` and `openai`**, new in `0.5.0`, are the providers' own clients for the
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
manufacturer characterising `0.10.0` needs on one page, with the anomalies of earlier releases
that `0.5.0` to `0.10.0` fix, so that one still running them knows what it is upgrading away from.

**Every release from `0.6.0` through `0.9.0` draws a computed field whose control has no read-only
state as an ordinary control**: a tick box, a choice, a list, a ranking, a matrix, a rating, a
slider, a picker, rich text, a file or a signature that a `computed` rule writes. A person could
tick or choose in it, and the engine refused the change. React drew the control back; the Angular
binding went on showing it, so the screen showed one answer while the form held another — measured
in jsdom on 2026-10-18, a ticked box over `false` and a select showing `b` over `a`. Fixed in
`0.10.0`: each is drawn as its answer in words, in a read-only text box labelled by the field, and
a rule in each renderer and under Material holds every type and widget but a repeater to having
nothing a person can change under a `computed` rule. Hazard A3 in
[`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md), and
[0216](../decisions/0216-a-computed-answer-is-read-not-operated.md).

**Every release from `0.3.0` through `0.9.0` draws none of the rows of a list of ticks that names an
options source**, as tick boxes or as a tag picker, in both renderers, though the document is valid
and the server checks every value of its answer: tick boxes over a source are an empty group, and
a tag picker a combobox with nothing in its list. Read from their code, and measured in jsdom on
the code after `0.9.0` by the tests of the fix. Fixed in `0.10.0`: both draw what the source returns, and a tick stores its row
([0215](../decisions/0215-a-list-of-ticks-draws-its-sources-rows.md)).

**`0.8.0` and `0.9.0` leave a question nobody answered out of the review before sending**, so one
skipped by mistake is missing at the moment the form asks the person to check, from a list that
reads as complete. Fixed in `0.10.0`: the review lists every question the form asks, the
unanswered ones as *Not answered*, each with its Change
([0214](../decisions/0214-the-review-names-a-question-left-unanswered.md)).

**Every release through `0.8.0` lets a radio group, React's rating and a signature that a rule
disables take an answer.** Neither renderer set `disabled` on a radio group's radios; React's
rating set it on its `role="radiogroup"` element, which disables nothing; and a signature's typed
box, its Clear button and its drawing surface took input under the rule, in both renderers and
under Material — so a click, a keystroke or a stroke changed the answer of a field the form had made
read-only, and Clear erased it. Measured on 2026-10-20 in jsdom. Fixed in `0.9.0`: each radio, the
signature's box and Clear carry `disabled`, its surface says `aria-disabled` and takes no stroke,
and a rule in each renderer and under Material holds every type and widget to having nothing to
operate under a `disabled` rule. Hazard B6a in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md), and
[0210](../decisions/0210-a-disabled-field-has-nothing-to-operate.md).

**Every release from `0.3.0` through `0.8.0` draws a required tag picker that says nowhere that it
is required**, in both renderers: its box has no `aria-required` and is described by a hint no
element carries, so neither a screen reader nor a theme says it. Measured on 2026-10-20 in jsdom.
**And under Material, `0.8.0` draws no description for eight controls** — the text, the paragraph,
the number, the date, the time, the select, the checkbox and the toggle — though each names its id
in `aria-describedby`, so spec 5's help text is not on the page; `0.8.0`'s changelog says Material
draws it. Found on 2026-10-28, after `0.8.0` was published. Fixed in `0.9.0`: the engine counts a
tag picker as one control, Material draws the description under each, and a rule in each renderer
and under Material holds every type and widget to naming no id it does not draw. Hazard D4, and
[0211](../decisions/0211-every-id-a-field-names-is-drawn.md).

**Every release from `0.3.0` through `0.8.0` gives a signature's typed box none of its field's
state**: no `aria-required`, no `aria-invalid` and no `aria-describedby`, so a screen reader taken
there from the error summary hears the box and not the problem; and names it *Type your name* under
the visible label *Signature*, a WCAG 2.5.3 (Label in Name) failure no axe rule reports. Read from
their code, and measured in React while making `0.7.0`. Fixed in `0.9.0`: the box carries the field's control props and is named *Signature: type your name*.
Hazard D4, and [0212](../decisions/0212-a-signatures-box-says-what-its-field-says.md).

**Every release through `0.7.0` stores an answer of another shape than its type where no
constraint reads it.** The engine read a value's type only where a constraint needed it, so a
`text` field with no length, pattern, format or mask stored an object posted for it, a `number`
with no bounds stored a string, and every `hidden`, `richtext` and optional `checkbox` stored
whatever arrived; a group's value was never checked to be an object; and a decimal computed into a
field — the documented way to add up money — stored an object that made the form impossible to
submit. Read from their engines' code, and held by the tests of the fix, twenty-eight of whose
cases failed against the engine before it. Fixed in `0.8.0`: every answer is checked against the
shape its type stores, `ANSWER_KINDS` in `@formancy/spec`, before any constraint reads it, in the
browser and on the server's replay, so a published form version is held to it without being
republished. Hazard A1a in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md), and
[0189](../decisions/0189-every-answer-has-the-shape-its-type-says.md).

**Every release through `0.7.0` shows a field's errors as codes.** Both renderers and Material
drew the engine's codes under a question — `required, minLength`, in English under a German form —
and a `validate` rule's code as its author wrote it, a word no catalogue knows. Fixed in `0.8.0`:
each of the engine's codes is a sentence in the form's language with the field's own limit in it,
and a spec 5 rule says its own `message`; a rule in an older document still has its code said as
written. Hazard D20, and [0191](../decisions/0191-an-error-is-said-not-coded.md),
[0198](../decisions/0198-a-rule-says-its-own-message.md).

**Every release through `0.7.0` gives a paged form's error summary a link that does nothing.** A
failed send lists every page's problems while showing the first page with one, and a link to a
question on a page not drawn found no element: focus stayed on the link. Measured on `0.7.0`, in
both renderers. Fixed in `0.8.0`: the link moves to the question's page and focuses the question.
Hazard D4, and [0205](../decisions/0205-a-summary-link-goes-to-its-questions-page.md).

**Every release through `0.6.0` answers a field keyed after a name every object has with what the
object inherits.** A path was read with `value[key]`, so a required field keyed `constructor` and
left empty counted as answered by `function Object` and was stored, a rule reading it could not be
evaluated and a `visible` rule showed what it hid, the export printed a function's source, a draft's
rename to such a key was never applied, and a list the deployment supplies was found under
`constructor` where it configured none, its answers stored unchecked. A group, a row or a matrix
answer holding an answered `constructor` could be read by no rule, because the expression library
tells a map by that member; a list sent where a group was asked for answered a field keyed
`length` with its own; and a message id `toString` missing from a locale gave the renderer a
function for a label. A field keyed `__proto__` lost every answer, and a matrix row so valued
could not be answered past the server's parser. Measured on 2026-10-18 and 2026-10-19 against
`0.6.0`'s code. Fixed in `0.7.0`: an answer is read as the value's own, a list answers no key,
the library is handed such an object as a `Map`, and `__proto__` is refused as a key. Hazard B11
in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md), and
[0185](../decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md).

**In every release, a group keyed `constructor` holding a field keyed `prototype` cannot be
answered.** Fastify 5.12.5 parses a JSON body with `secure-json-parse` 4.1.0, which refuses an
object under `constructor` that has a `prototype` member, as prototype poisoning, with a `400`; a
submission or a draft answering that field is such a body. Measured on 2026-10-19, and the same for
a matrix keyed `constructor` with a row valued `prototype`. The format does not refuse the pair,
since the limit is the server's parser and not the document.

**Every release through `0.6.0` draws a radio group, a set of tick boxes and a signature with no
element carrying the field's control id**, in both renderers and, for the two groups, in Angular
Material — the signature since it arrived in `0.3.0`, and Material since it arrived in `0.4.0`.
The error summary's link and a failed submit move focus by that id, so a link to one of
them left focus on the link and did not scroll, and a failed submit whose first invalid field was
one of them left focus on Submit: a person told that the form had a problem and not taken to it.
Measured in React against the published `0.6.0`, and in all three by the tests that hold the fix,
each of which failed before it. Fixed in `0.7.0`: the groups' fieldsets and the signature's typed
box carry the id, and focus moves to the first option or to the box. Hazard D4 in
[`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md), and
[0186](../decisions/0186-a-fields-control-id-names-its-group-or-its-control.md).

**Every release through `0.5.0` validates nothing a document says about a repeater.** The engine
validated fields, and a repeater is not one: its `maxItems`, `required` on it, and a `required` or
`validate` rule whose target is the repeater were accepted at publish and evaluated nowhere, in
the browser or in the server's replay. A submission with more rows than allowed, or none where
rows were required, was stored, and a rule aimed at a repeater failed open where validation
fails closed. Found on 2026-10-18 and recorded before it was fixed. Fixed in `0.6.0`: a repeater
is validated as a field is, the engine refuses a row added or removed past a bound, and neither
renderer offers the button. **A short submission is still topped up** with empty rows, as the
browser opens the form, so `minItems` refuses it only where a field in those rows is required.
Hazard A1 in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md), and
[0184](../decisions/0184-a-repeater-is-validated-as-a-field-is.md).

**Every release through `0.5.0` hides only what a rule names.** A field inside a group a
`visible` rule hid was still drawn and validated, so a required one made the form impossible to
send, the server refusing it too; a repeater's rows on a page the answers walk past were
validated; and `clearOnHide` on a group or a repeater was read from nothing. Fixed in `0.6.0`: a
rule hides or disables a group with its fields and a repeater with its rows.

**Every release through `0.5.0` lets a computed field be typed over, and its server store what
was typed.** The renderers drew a field a `computed` rule writes as an ordinary control, and the
engine took a value set on it. Where the expression could be evaluated the rule overwrote that
value at once; where it could not, because an input it reads was still empty, the typed value
stood. The server replays the same engine, so a total sent with an input it reads left out was
stored as though computed. Read from each release's engine code, and every case that holds the
fix failed before it. Fixed in `0.6.0`: only the rule writes a computed field, a value handed in
— a draft, a prefill, a request body — is dropped before the first pass, the field's snapshot
says `readOnly`, and both renderers and Material draw its text, paragraph, number, date, time and
date-and-time controls read-only. **A control with no read-only state of its own** — a tick box,
a choice, a slider, a picker — is drawn as before; a change in it does not take, though the
Angular binding can go on showing it, and a `disabled` rule on such a field is the documented
remedy. Hazard A3 in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md), and
[0181](../decisions/0181-a-computed-value-is-the-engines.md).

**From `0.4.0` through `0.5.0`, an example that names a list is told the form has no such
field**, and so is one naming a group, a row or a page, in the scenario panes, `check_scenarios`
and the publish's warnings alike. Worse for an example used as evidence: one expecting a field to
be visible in a row the list does not have passes, so it vouches for a field nobody can see.
Fixed in `0.6.0`: the check says what the path names and how to name a row, and that example
fails ([0182](../decisions/0182-a-list-is-filled-row-by-row.md)).

**Every release from `0.3.0` through `0.5.0` lets a tag picker a rule disabled be changed.** A
`disabled` rule greys a field out and the field keeps its answer; a renderer holds that by
disabling the control's elements, because the engine accepts a value set on a disabled field.
The tag picker draws a list, and a remove button on each chip, outside its text box. Measured in
jsdom on 2026-10-18, before the fix: in React the remove buttons stayed enabled and a click took
an answer away, and a list open when the rule landed stayed drawn with rows a click added; in
Angular the text box was not disabled either, so the field was typed into and chosen from as
though enabled. Fixed in `0.6.0`: the box and every remove button are disabled with the field,
and the list is drawn only while the field is enabled. Hazard B6a in
[`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md).

**Through `0.5.0`, a typeahead a rule disabled can be changed through its list.** A rule landing
while the list was open left it drawn, and a click on a row changed the answer of a field the
form had made read-only. Measured in jsdom with the fix taken out, in both renderers; that
`0.5.0` draws it this way was read from its code. Fixed in `0.6.0`: each typeahead draws its
list only while its field is enabled ([0177](../decisions/0177-a-source-may-say-its-list-goes-on.md)). Hazard B6a.

**Through `0.5.0`, a list from a source can look complete when it is not.** A source could answer
rows and nothing else, and the control counted what it was handed, so a source that pages either
looked complete or claimed a total of `limit + 1`, and a row it matched and could not hand over
was left out unsaid. A person who does not see the answer that exists picks the nearest one that
is offered, and the membership check passes it. `0.6.0` lets a source answer a page,
`{ options, more, withheld? }`, refuses an ambiguous page whole as a source that failed, and never
calls a list complete that the control cut, that the source said goes on, or from which it
withheld rows — held by `packages/spec/src/options-source.test.ts`, with a property over answers
and limits, by `packages/core/src/options-status.test.ts` and by each renderer's
`options-source` test. **A source written for `0.5.0` gains nothing until it answers pages**, and
a page that says `more: false` when more rows match is the same defect, which nothing here
detects. Hazard A7a ([0177](../decisions/0177-a-source-may-say-its-list-goes-on.md)).

**Through `0.5.0`, a sourced control can tell its person to do what they cannot.** As the
changelog records, measured on `0.5.0`: a plain select said *keep typing to narrow*, *type at
least 2 characters* and *Type to try again*, though nobody can type into a `<select>`, and a React
select whose source failed once stayed failed for as long as the form was open; a field a rule
disabled searched its source and said what it found; and an Angular sourced field searched again
after a choice and a blur. Fixed in `0.6.0`: what a sourced control says is decided once, by
`optionsStatus` in `@formancy/core/words`; a plain select has sentences of its own and asks again
when the person comes back to it after a failure; and a disabled field asks only for the name of
what it holds and says nothing. Held by each renderer's `options-source` test.

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
sequence without the scan, read in their source but not run. Fixed in `0.5.0`, with a
residual: a request whose scan and write together outlast two minutes can still replace the
bytes, though not the row, and the supplied clamd adapter does not keep a scan inside that.
Hazard B10 in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) has both, and
[0153](../decisions/0153-a-file-is-received-by-one-request-at-a-time.md) the fix.

**Every release through `0.4.0` answers a request that fails on the server with what was
thrown.** Fastify's default reply to an error carries its message: for a database error the
failing query and its parameters, for a full disk the path it could not write. From `0.2.0`, a
file's id that is not a uuid — in the address that reads a file or receives its bytes, or in a
response naming its attachments, the last two public — is such a failure, so anybody could have
the query and the id they sent read back to them. And the route that receives a file's bytes has
no rate limit. Fixed in `0.5.0`: a 5xx says its status and nothing of what was thrown, such an
id is an unknown file, and the bytes are limited as their offer is
([0172](../decisions/0172-a-5xx-says-nothing-of-what-was-thrown.md)); see the changelog.

**Every release through `0.4.0` answers a NUL character with a `500`.** PostgreSQL holds no U+0000
in `text` or `jsonb`, and nothing before it looked: a NUL in a form's path — on the public read,
which no limit counts — in a sign-in's email, in a submission's answers or in most else a request
sends to be looked up or kept fails in the database, and the reply is the error's, quoting the
failing query and the value, as the entry above says. The `500`s were measured on real PostgreSQL
against the code after `0.4.0`; that each release looks up and stores these values the same way
was read in its source, not run. Fixed in `0.5.0`: a NUL in an address names nothing, and a
body with one is refused as malformed, `400`
([0173](../decisions/0173-a-nul-character-names-nothing-and-a-body-with-one-is-refused.md)); see
the changelog.

**Every release through `0.4.0` cannot export a form whose path holds a character outside
Latin-1 or a control character, and from `0.2.0` cannot serve a file named so.** The name goes
into `content-disposition`, Node.js refuses to write a header holding such a character, and the
answer is a `500` carrying Node's `ERR_INVALID_CHAR` and its sentence naming the header. The
supplied uploaders send a file's own name, so a file named in Japanese on a respondent's disk is
enough; the bytes are kept, and can be read from the store directly. A Latin-1 name such as `café.pdf` is served, as one raw byte that the server sent
as Latin-1 before a file and as UTF-8 before an export — Node.js 22 with Fastify 5.12.5, measured
on 2026-10-11. Read in those releases' source and measured on the code just before the fix, not
run on them. After `0.4.0` the `500` lost its words to 0172's change everywhere but here,
because the error's reply failed on the same header and Fastify 5.12.5's last-resort reply runs
no hook. Fixed in `0.5.0`: a name is encoded as RFC 6266 and RFC 8187 have it, and an error's
reply drops a header Node would refuse
([0175](../decisions/0175-a-name-goes-into-a-header-encoded.md)).

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

**No release since `0.7.0` opens a version stored with a field keyed `__proto__`, on purpose.**
Every earlier release opened it and lost what was typed into that field without a word; the
engine since `0.7.0` refuses it, so its public read answers `200` and every submission to it is answered
`500` until it is republished without the key. Nothing finds such versions for an operator: search the
stored documents for the key
([0185](../decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)).

**Found while making `0.10.0` or since, and not changed by it:**

- **Focus falls to the page after a person removes a row**, adds the last row a repeater allows,
  or moves a row to an end, in both renderers. The button pressed is drawn out with the change and
  nothing moves focus, so the next Tab starts from the top of the form (WCAG 2.4.3). Measured in
  jsdom on 2026-10-29, after `0.10.0` was published; fixed after it by
  [0219](../decisions/0219-focus-follows-a-row-a-person-adds-removes-or-moves.md).
- **A repeater a computed rule writes cannot be drawn once the rule has written a row.** The rows
  a rule writes carry no row id, and both renderers key a row by its id, so each throws
  `Row 0 of "…" has no _id` drawing it. Before the rule writes a row, the repeater is drawn as an
  ordinary one: its rows' fields say they are not read-only, and a row can be added and typed
  into. While the expression cannot be evaluated the rule writes nothing back, so such a row stands
  on the screen, and the server, which drops what arrives for a computed field, stores none of it.
  And a repeater's `minItems` is met with an empty row, which the server's replay stores as
  `[{ "_id": "r1" }]` for a submission that sent nothing. Measured on 2026-10-29 on `0.10.0`'s code,
  after it was published; earlier releases were not run. `0.10.0`'s changelog says only that such
  a repeater is drawn as an ordinary one. Hazard A3, and
  [0218](../decisions/0218-a-computed-repeater-is-the-rules-row-by-row.md), which fixes it after
  `0.10.0`.
- **A computed field whose options come from a source is said by its stored value**, not its
  row's label, since nothing asks the source for it (0216).

**Found while making `0.9.0`, and not changed by it or by `0.10.0`:**

- **Under Material, a field's description and its count are drawn outside the form field**, so
  they are not inside the element that carries the field's path, and a tool reading a field by
  that element misses them ([0211](../decisions/0211-every-id-a-field-names-is-drawn.md)).

**Found while making `0.8.0`, and not changed by it, by `0.9.0` or by `0.10.0`:**

- **A default left alone is stored as the person's answer**, indistinguishable from the same
  answer chosen, and a required field with a default is answered before anybody reads it, so
  `required` does not make a person look at that question. Where the difference matters — a
  clinical question, a consent — the field should have no default. Hazard A10, and
  [0197](../decisions/0197-a-default-is-where-something-fresh-starts.md).
- **Nothing records that the person looked at the review before sending**
  ([0204](../decisions/0204-answers-can-be-checked-before-they-are-sent.md)).
- **A rule's message is the author's, and nothing checks it against the rule.** It is said for its
  code wherever the field carries it, so a rule whose code is one the engine reports itself — `min`
  — words the engine's error too. Hazard D20, and
  [0198](../decisions/0198-a-rule-says-its-own-message.md).

**Found while making `0.7.0`, and not changed by it or by a release since:**

- **A field drawn with no control** — a file field in a deployment that takes no uploads, a select
  whose source the deployment lacks — has no element carrying its id, measured on 2026-10-20, so
  the error summary's link to it does nothing; and since `0.9.0` `useGoToField` or
  `injectGoToField` with its path moves to its page and focuses nothing, read from their code.
  Hazard D4, and [0213](../decisions/0213-a-host-can-take-a-person-to-a-question.md); fixed
  after `0.10.0` by [0221](../decisions/0221-a-field-with-no-control-is-reached-at-its-sentence.md).
- **A submission is not required to be an object, and what a form does not define is stored as
  sent.** One sent as a list is stored with `201` unless a required field asks it something —
  `[1, 2]` was, measured on 2026-10-19 — and members the form does not define are stored as they
  arrive. Hazard B11.
- **A `computed` field writing out a map an expression builds loses its `constructor`,
  `prototype` and `__proto__` without an error**, because the library leaves those keys out of a
  literal (above). Hazard B11.

**Found while making `0.6.0`, and not changed by it:**

- **A deployment that configures no options sources checks no sourced answer.** It publishes a
  document naming any source and asks nothing about a value submitted for one. The server's own
  `main.ts` composes `createApp` with no sources, so the image as shipped is such a deployment;
  hazard A7 had said a document naming an unconfigured source is refused at publish, which holds
  only where the deployment configures some.
- **No expression totals a list.** `sum`, `fold` and their like are refused when the engine is
  built; the logic page says what a form can do instead.

**The object store cannot be used through either compose file in `0.4.0`**, nor in `0.2.0`
or `0.3.0`. Both files pass `FORMANCY_FILES_DIR` to the server as a literal path, so a
deployment that follows the object-store block of `.env.example` hands the server two
stores, and it refuses to start on every restart — measured with the published `v0.4.0`
image. A blanked `FORMANCY_FILES_DIR` does not help with those images either: they read the
empty string as a directory. Fixed in `0.5.0`, in the compose files and in the server
together; see the changelog.

**With the S3 object store, a download fails if it is still streaming thirty seconds after
the server asked the store for it**, in `0.4.0` as in `0.2.0` and `0.3.0`. The store's
timeout covers the whole request, body included, so a file still arriving when it runs out
is cut off part-way however steadily it is arriving — and how long a download streams is
mostly the downloader's connection, which backpressure carries back to the store. Thirty
seconds is the store's default and the server sets no other, so no setting changes it. The
local store has no such bound. An upload to the object store is bounded the same way, as a
whole, and stays so after the fix. Fixed in `0.5.0` for downloads, at the cost of
leaving nothing in the server to end a download whose reader has stopped reading
([0155](../decisions/0155-the-object-store-is-timed-on-its-silence.md)); see the changelog.

**Behind a reverse proxy nobody named, every respondent shares one rate-limit budget.** `0.4.0`
counts every public limit by the address on the socket, and behind the reverse proxy the
deployment view draws, that address is the proxy's for every request: thirty submissions a
minute between everybody, and the next refused with `429` for traffic that was not theirs. The
operator is not told, because that server writes no request log, and nothing in `0.4.0` can be
set to change it. Hazard D14 in [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) has it. `0.5.0` adds
the setting, `FORMANCY_TRUST_PROXY`, and a request log that names each request's route and
status; with the setting unset it counts as `0.4.0` does. Set wider than the proxy, it turns
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

### Characterised by this document, and new since 0.9.0

`0.10.0` reads and writes `specVersion: "5"`, as `0.9.0` does, and adds no third-party dependency,
table, setting or route; the server's code changes only in the path it imports an author's tools
from. **What a person sees changes**: a computed field whose control has no read-only state is a
read-only text box holding its answer in words (above, hazard A3), a list of ticks over a source
draws its rows, and the review lists a question left unanswered. What a *host* sees is below;
[`MIGRATIONS.md`](../../MIGRATIONS.md) has what must move.

- **`@formancy/core/authoring`**, a fourth entry of `@formancy/core`, exports `runScenarios`,
  `expressionProblems`, `unknownReferences` and `MIXED_NUMERIC_LITERAL_EXAMPLE` with their types,
  and the engine's barrel no longer does
  ([0217](../decisions/0217-what-no-form-runs-leaves-the-engine-barrel.md)).
- **A field a computed rule writes, drawn by a control with no read-only state, is the renderer's
  own read-only box**, chosen where each renderer picks a field's component: a control a host
  registers for that field's path still draws it, one registered for its type does not.
  `hasReadOnlyControl` in `@formancy/core` says which controls have a read-only state, and
  `answerInWords` in `@formancy/core/words` says the answer (0216).
- **`answersToReview` returns a line for every question asked**, each with `answered`, and an
  unanswered one is drawn as the part `review-unanswered`, in the words `answer.none`
  ([0214](../decisions/0214-the-review-names-a-question-left-unanswered.md)).
- **A list of ticks over a source asks the deployment's options source**, as the select and the
  typeahead do, and draws the parts `checkbox-status`, `tagpicker-status` and `checkbox-retry`
  and the words `options.failedTicks` and `options.retry`
  ([0215](../decisions/0215-a-list-of-ticks-draws-its-sources-rows.md)).

### Characterised by an earlier version of this document, and new in 0.9.0

`0.9.0` reads and writes `specVersion: "5"`, as `0.8.0` does, and adds no dependency, table,
setting or route; the server's code is unchanged. **What a person can do with a form changes**: a
radio group, React's rating and a signature that a rule disables take no input, where they took
it (above, hazard B6a). What a *host* sees is below;
[`MIGRATIONS.md`](../../MIGRATIONS.md) has what must move.

- **A required tag picker carries `aria-required` on its box and names no hint**, decided in the
  engine's `buildFieldProps`, which no longer counts a list of ticks drawn as a tag picker as a
  group (0211).
- **A signature's typed box carries the field's control props**, and is named by the word
  `signature.typed`, which now takes the field's label: *Signature: type your name* (0212).
- **Under Material, eight controls draw the field's description** under the form field, at the
  engine's id (0211).
- **`useGoToField` in `@formancy/react` and `injectGoToField` in `@formancy/angular`** take a
  field's path and move a paged form to its page and focus into its control, as the error
  summary's links and the review's Change do, which call the same function
  ([0213](../decisions/0213-a-host-can-take-a-person-to-a-question.md)).
- **The server image is attested with GitHub's build provenance** as well as BuildKit's, by the
  digest the release pushed (0209).

### Characterised by an earlier version of this document, and new in 0.8.0

`0.8.0` reads versions `"1"` to `"5"` and **writes `specVersion: "5"`**, so a form its builder
authors is refused by a reader on `0.7.0` or earlier — loudly, as the format means it to be. A
version 4 document reads as it did. Version 5 adds properties only, and every one is optional: a
field's `description`, `autocomplete`, `placeholder`, `default` and `shuffle`, an option's
`exclusive` and `keepPlace`, and a `validate` rule's `message`
([0201](../decisions/0201-spec-5-freezes-with-the-batch-it-opened-for.md)). It adds no third-party
dependency, table or setting; the new package `@formancy/cli` depends on `@formancy/spec` alone.
**A deployment's answers change**, and a published form version is held to them without being
republished: an answer of another shape than its field's type stores is refused `422` with
`type`, where it was stored (above, hazard A1a), and the server replays a response sent with no
data as `{}`, so a spec 5 document's defaults are never stored as answers nobody sent (hazard
A10). **The server answers one route more**: `GET /f/:path/versions/:version`, behind
`form.read`, the document a version was published with, `404 unknown_version` for a number this
form has no version under ([0207](../decisions/0207-a-versions-document-can-be-read.md)). What a
*host* sees is below; [`MIGRATIONS.md`](../../MIGRATIONS.md) has what must move.

- **A field's errors are sentences**, from `errorSentence` in `@formancy/core/words`, one `span`
  per sentence carrying the code as `data-formancy-code`; the codes are unchanged in `submit()`,
  the API and the conformance fixtures (0191).
- **A field with a `maxLength` draws a character count**, said through a `role="status"` region of
  its own, so a page can have more than one status region
  ([0203](../decisions/0203-a-limit-is-counted-while-typing.md)).
- **A form can show every answer before it is sent**, with `review` in React and `[review]` in
  Angular (0204).
- **The engine's types grow**: `BuiltInErrorCode` gains `exclusive`, `FieldIds` gains `count`, and
  `FieldSnapshot` gains `messages` and `optionOrder`, so a host building one by hand must add them.
- **A form's submissions have a type**: `answersTypeScript` in `@formancy/spec`, and the
  `formancy types` command of `@formancy/cli`, print what a form's submission data holds, true of
  stored data because the engine checks every answer's shape (hazard A9,
  [0190](../decisions/0190-a-form-has-a-type.md)).
- **`summariseAnswers`**, in a new entry `@formancy/core/summary`, counts a form's responses
  question by question ([0206](../decisions/0206-a-forms-responses-are-summarised-by-question.md)).
- **The published JavaScript carries no JSDoc**; the declarations keep it, and nothing that runs
  changes ([0208](../decisions/0208-the-published-javascript-carries-no-jsdoc.md)).

### Characterised by an earlier version of this document, and new in 0.7.0

`0.7.0` reads and writes `specVersion: "4"`, as `0.4.0` to `0.6.0` do, and adds no dependency,
table or setting. **The schema refuses one thing more**: `validateSchema` refuses `__proto__`
as a field's key and as a matrix row's value, with `key.unstorable`, in every spec version, where
every earlier release accepted it; no release could store an answer under it (above, hazard
B11). **A deployment's answers change**, and a published form version is held to them without
being republished. The server refuses with `required` a submission leaving empty a required
field keyed after a name every object has, `constructor` or `toString`, or keyed `length` with a
list sent in its group's place, where it stored it; a rule reading a group, a row or a matrix
answer holding an answered `constructor` decides, where it failed; where the deployment
configures sources, a document naming a source `constructor` is refused at publish as one it
does not configure, and an answer to a version stored before with such a source is refused
`503 source_unavailable`, where it was stored unchecked; and a stored version with a field
keyed `__proto__` answers every submission `500` until it is republished, where it lost that one
answer ([0185](../decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)). What a *host*
sees is below; [`MIGRATIONS.md`](../../MIGRATIONS.md) has what must move.

- **An answer is what the value holds as its own.** `getAt` reads a key only out of an object
  and an index only out of a list, `parsePath` and `formatPath` throw on `__proto__`, `evaluate`
  reports `missing_variable` for a declared name the bag does not hold as its own, and a
  translation a locale lacks falls back to the default's words whatever its id (0185).
- **Every field drawn with a control has an element carrying its control id.** A radio group's
  and a set of tick boxes' fieldsets carry it, in both renderers and in Material, and so does a
  signature's typed box, which the field's label now labels; every option keeps
  `<control id>:<value>`. The error summary's link and a failed submit land in all three, where
  they left focus on the link or on Submit (hazard D4,
  [0186](../decisions/0186-a-fields-control-id-names-its-group-or-its-control.md)).

### Characterised by an earlier version of this document, and new in 0.6.0

`0.6.0` reads and writes `specVersion: "4"`, as `0.4.0` and `0.5.0` do, so no document changes,
and the schema validates what it did: only its `specVersion` default, now `"4"`, and descriptions
moved. **A deployment's answers change**, though no table or setting does, and a published
form version is held to them without being republished, because the version is immutable and
the engine reading it is not. The server refuses a submission a repeater's bounds, `required` on
it or a rule aimed at it refuses, where it stored it (above, hazard A1); it accepts one it refused
for a required field inside a hidden group; it stores no value for a computed field that its
replay did not compute (hazard A3); and `GET /model` on a deployment with no model answers `200`
naming none, where it answered `404` ([0183](../decisions/0183-no-model-is-an-answer.md)). What a *host* sees is below;
[`MIGRATIONS.md`](../../MIGRATIONS.md) has what must move.

- **A repeater answers as a field does**: its own path has a snapshot and errors, `addRow` and
  `removeRow` throw past a bound, and `canAddRow` and `canRemoveRow` say so first
  ([0184](../decisions/0184-a-repeater-is-validated-as-a-field-is.md)).
- **A computed field is the engine's.** `setValue` on one does nothing, a value handed in for one
  is dropped, and its snapshot says `readOnly`
  ([0181](../decisions/0181-a-computed-value-is-the-engines.md)).
- **An example's failure says what its path names**, a list, a group, a row or a page, where it
  said the field does not exist ([0182](../decisions/0182-a-list-is-filled-row-by-row.md)).

- **A source may answer a page**, `{ options, more, withheld? }`, read strictly by
  `acceptRemoteAnswer` and `capRemoteAnswer` in `@formancy/spec`; a page they refuse is shown as a
  source that failed ([0177](../decisions/0177-a-source-may-say-its-list-goes-on.md)). A host that calls `resolve` itself gets a list or a page, and
  code that treated the answer as an array no longer compiles.
- **What a sourced control says, and when it asks**, decided by `optionsStatus` in
  `@formancy/core/words`. A plain select has words of its own — `options.cappedListed`,
  `options.moreListed`, `options.searchOnly` and `options.failedListed` — and a host that reworded
  the typeahead's sees the shipped words under a plain select until it words the new ones. A field
  a rule disables asks its source for `labels` alone.
- **A control a rule disables draws nothing clickable outside its disabled element.** A
  typeahead's or a tag picker's list is not drawn, and a tag picker's remove buttons are disabled
  (hazard B6a).
- **A palette, `@formancy/themes/room.css`**: custom properties on `:root` and
  `color-scheme: dark`, no rule for an element and no face loaded. It must load after
  `workbench.css`, since both say `:root`. Its names and values are API from `0.6.0`, and
  `apps/docs/src/room.test.ts` pins every value
  ([0178](../decisions/0178-the-rooms-palette-is-published.md)).

### Characterised by an earlier version of this document, and new in 0.5.0

`0.5.0` reads and writes `specVersion: "4"`, as `0.4.0` does, so no document and no stored
submission changes. What changes what a *deployment* stores, configures or answers is below;
each has its section in [`MIGRATIONS.md`](../../MIGRATIONS.md) where something must move.

- **Two tables and a column, added on start.** `form_examples` keeps a form's examples beside
  it and never in a version
  ([0166](../decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)).
  `rate_limit_counters`, unlogged, is the count every replica spends
  ([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)).
  `files.receiving_until` is the lease under which one request receives a file's bytes
  ([0153](../decisions/0153-a-file-is-received-by-one-request-at-a-time.md)). There is nothing
  to run.
- **Settings, each optional.** `FORMANCY_TRUST_PROXY` names the proxies whose
  `X-Forwarded-For` is believed ([0156](../decisions/0156-a-proxy-is-trusted-by-its-address.md)).
  `FORMANCY_LOG_LEVEL` sets how much the request log writes. `FORMANCY_MODEL_PROVIDER`,
  `FORMANCY_MODEL_API_KEY` and `FORMANCY_MODEL` give the builders a model, asked through the
  server with the provider's own client above
  ([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md)). An empty
  `FORMANCY_FILES_DIR` or `FORMANCY_S3_ENDPOINT` is read as unset.
- **What a client is answered.** An anonymous submission without the token its form was
  handed out with is refused, and one sent twice is stored once
  ([0169](../decisions/0169-a-response-is-stored-once.md)). A `5xx`, or a fault answered under
  a `4xx`, says its status and nothing of what was thrown
  ([0172](../decisions/0172-a-5xx-says-nothing-of-what-was-thrown.md),
  [0175](../decisions/0175-a-name-goes-into-a-header-encoded.md)). A body with a NUL character
  in any string is refused `400`
  ([0173](../decisions/0173-a-nul-character-names-nothing-and-a-body-with-one-is-refused.md)).
  A file is downloaded, and a form exported, under any name, encoded (0175).
- **The admin loads nothing from another host.** Its faces and its editor are served from the
  deployment's own origin, where `0.4.0`'s asked Google Fonts and jsDelivr;
  `apps/admin/src/no-other-host.test.tsx` reads its page for any other address.

### Characterised by an earlier version of this document, and new in 0.4.0

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
  more than one replica — stated here because it is silent. Fixed in `0.5.0`: every limit
  counts in the PostgreSQL the replicas share, a public limit admits uncounted and a login or
  a model request is refused while that count cannot be had
  ([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md));
  see the changelog.
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
when a deployment runs ClamAV — above. So was a submission token, until 0.5.0: every form is
handed out with one, so that a response sent twice is stored once, and it
adds no dependency — an HMAC from `@noble/hashes`, already declared above
([0169](../decisions/0169-a-response-is-stored-once.md)).)

**`0.4.0` and earlier write no request log; from `0.5.0` on the server writes one.** In the earlier releases
Fastify is constructed with the logger off, so nothing can tell an operator why a request
failed, and the background workers print a failed pass's error to standard error, unredacted.
From `0.5.0` the server writes a line per request and per error to standard output, built from a list of
fields, with the workers' failures and the database's notices through the same rule
([0168](../decisions/0168-the-log-is-built-from-a-list-of-fields.md)); hazard C3 says what it
holds and what it leaves out. There is no redaction configuration: what a line may carry is the
list, and a deployment that adds a logger of its own owns that question alone.

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
that produced D4a's third instance and D4c, a file field's thumbnail, and since then the
checks `scripts/browser-test.mjs` imports by name: the templates gallery and the Angular page
drawn in the landing page's shell, both builders laid out alike (D4a), a drop between two nodes
on the preview, the Material starter's date button, where the relay's suggestions sit, and that
no page asks another host for anything (C6). Nothing else of appearance: no pixel baselines by
choice, one engine rather than Safari, and one demo schema rather than the conformance suite. A manufacturer relying on visual correctness must still
verify it in the browsers it ships to.

## Verification evidence

| Evidence | Where |
|---|---|
| Every automated test in the repository passing at this commit, in every package and application that has tests | `pnpm test`, which prints the count |
| The server's integration suites run against a real PostgreSQL instance, and the object store's against a real Garage, via Testcontainers, rather than a stub | `packages/server/src/*.integration.test.ts` |
| One behavioural conformance suite executed against the engine, both renderers and the server | `packages/conformance` ([0033](../decisions/0033-one-suite-n-drivers.md)) |
| Property-based invariants over hide/unhide, repeater identity and evaluation order | `packages/core` |
| The official CEL corpus, with results pinned | `packages/expressions/CEL-CONFORMANCE.md` |
| Performance budgets, measured: keystroke ≈0.54 ms against a <1 ms budget, re-measured 2026-10-19; graph compile ≈1.7 ms against a <30 ms budget | `packages/core/bench/perf.mjs` |
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
