---
title: Roadmap and status
description: What exists in formancy today, what is deliberately missing, and what comes next.
---

Written to be honest rather than encouraging. Everything under "what exists" is
covered by tests in the repository; everything under "what does not" is absent,
not partial.

## What exists

**The spec** (`@formancy/spec`) — the versioned form document, its JSON Schema,
a validator whose messages are written for form authors, a canonical content
hash, and `diffSchemas` with a compatible / lossy / breaking severity model.

**Expressions** (`@formancy/expressions`) — CEL behind our own
parse / check / compile / evaluate interface, with structural and runtime
limits, per-kind function allow-lists, injected capabilities, and an exact
decimal type for money.

**The engine** (`@formancy/core`) — one build that runs in a browser and in
Node: the reactive graph, conditional visibility, computed values, row-scoped
rules inside repeaters, model validators, wizard semantics, identity-stable
snapshots, and engine-minted accessibility ids.

**Two renderers** — `@formancy/react` (hooks, unstyled components, error
summary) and `@formancy/angular` (signals, zoneless, DI registry). Both pass the
same conformance fixtures.

**The conformance suite** (`@formancy/conformance`) — published, so third-party
renderers can self-certify.

**The builder** (`@formancy/builder-core` and `@formancy/builder-react`) —
schema editing as commands with undo/redo and valid-target computation, where a
command that would produce an invalid document is refused rather than applied,
and a rename declares `renamedFrom` so collected answers follow the field. Over
that: a structure tree, an arrangement tree for rows and columns, a field
palette, a property panel generated from the spec's own JSON Schema, and a
condition editor that compiles to CEL — all keyboard-driven, each with a drag
surface added afterwards as a second route to the same commands. Rows and
columns can also be dragged on the rendered form itself.

**The backend** (`@formancy/server`) — Fastify and Postgres: publish with the
engine as the save gate, submissions replayed server-side and stored canonical,
drafts with lazy migration, submissions listing, CSV export unioned across
versions, a management plane behind sessions, API keys and role-based
authorization, per-IP rate limiting and per-form origin allowlists on the
public plane, and webhooks delivered from a transactional outbox to an address
the server resolved and checked itself.

**Two apps** — a playground (schema or builder, live form and engine state side
by side, with theme and language switchers) and the self-hosted admin (the
builder in a three-pane inspector, a raw schema editor, publish, version
history, submissions and export).

## What does not exist yet

- **Dropping *between* two elements** rather than onto one, which would need gap
  targets the renderers do not emit. Dropping onto an element's side makes a row
  and dropping onto its top or bottom moves it, so the gap is narrower than it
  was — what is missing is inserting between two siblings without aiming at
  either.
- **Nested condition groups** in the builder's editor. Combining comparisons with
  `all` or `any` works; a group inside a group does not, deliberately — nesting
  is where a condition editor stops being readable, and ejecting to raw CEL is the
  escape hatch that makes the restriction affordable.
- **Virus scanning** of uploaded files, and **resumable uploads**. Files
  themselves work; a stored file is trusted the moment its bytes land, and the
  deployment's byte ceiling is also the largest single file.
- **Per-file upload progress.** The field reports that an upload is happening,
  not how far along each file is. Reporting it needs the `Uploader` interface to
  emit progress, which is a wider change than the control — so it is the one
  part of the file field still outstanding, along with thumbnails and reordering.
- **A presigned upload path.** The object store landed, so bytes survive more
  than one replica — but they still travel through the server, so the request
  body cap is also the largest file anybody can send.
- **Form actions** beyond webhooks.
- **OIDC / SAML.** Local users and API keys only for now.
- **A worked example of saving a partly-filled form.** The parts all exist now —
  the three public routes, the token that addresses a draft, and the notice both
  renderers ship for a resume that lost answers, documented in
  [Drafts](/docs/concepts/drafts/). What is missing is a host that puts them together:
  the playground and the marketing site are client-only, and the admin is the
  authoring tool rather than a form-filling surface. So the debounce, the stored
  token and the read-only path are described and not demonstrated.
- **Translated form content.** The key structure is reserved
  (`label: { $t: "..." }`) and the engine resolves it, but there is no catalogue
  management and no authoring for it.
- **Concurrent editing of one form.** Published versions are immutable and a
  submission carries the hash it was rendered from, so the pieces are there; two
  people editing one draft still last-write-wins.
- **An object store in the compose file.** The design calls for Garage and the
  compose files give a local files volume instead, so uploads do not survive more
  than one replica. (An earlier version of this entry said the one-command path
  was missing, which was simply wrong — `compose.yaml` has given
  `docker compose up -d` for some time, and `compose.published.yaml` now does it
  from the signed image without a checkout.)
- **Multi-tenancy, PDF output, e-signatures, analytics.**
- **A Vue renderer.** The engine protocol is designed for one; it is not a
  commitment yet.

Field **type names** for several of these are reserved — `multiselect`, `combobox`,
`signature` and the rest are simply absent from the type list.

**Reserving a name costs nothing; adding the type costs a spec version.** Those
are different things, and an earlier version of this page ran them together. The
format is additive — a new type removes nothing, every older document stays
valid, and `upgradeSpecVersion` stays one line — but the version line is a
contract for *readers*, and a reader that speaks the older version does not
half-understand a type it has never heard of: it renders nothing, collects
nothing, and drops the answer, which looks exactly like a field somebody left
blank ([0051](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0051-spec-2-adds-types.md)).

The practical consequence is that **field types should arrive in batches, not one
at a time.** Each bump is an event for every consumer: a pinned reader, a
regulatory characterisation, a line in `MIGRATIONS.md`. Shipping `signature` on
its own and `datagrid` a fortnight later spends two of those where one would do.

Rule-level properties are **not** reserved, and this is a real gap: `runsOn`
and `async` were meant to be, but `logicRule` is `additionalProperties: false`,
so a document carrying either would be rejected today. Adding them is therefore
a spec version bump, not an additive change — which is worth settling before
the spec freezes rather than after.

## Field types that are not here yet

Named because a type name is a promise: reserving one costs nothing and renaming
it later costs everybody. Note what reserving does **not** buy — adding any of
these to the spec is a version bump, for the reason under *What does not exist
yet* above, so they are worth grouping into one.

| Type | What it is | Why it is not trivial |
|---|---|---|
| `signature` | A drawn mark, stored as points rather than as a picture | Points scale, survive a re-render and diff; a PNG does none of that. It needs a pointer *and* keyboard route, and "sign here" carries legal weight the rest of the form does not |
| ~~`datagrid`~~ | **Not a type.** `widget: "datagrid"` on a repeater, with `columns` configuring the arrangement ([0066](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0066-a-widget-may-be-configured.md)) | The repeater's data model already handled it, as this row said. What is still missing is the grid *control*: column headers, tab-through-cells, row reordering, and a row count that does not become part of the accessible name of every field inside it |
| ~~`qrcode`~~ | **Split, as this row said, and both halves are shipped.** Showing is a `qrcode` layout node that collects nothing ([0070](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md)); scanning is `widget: "scanner"` on a text field ([0071](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0071-a-scanner-is-supplied-not-built.md)) | Neither half ships a codec. The display half shows the value as text and no picture; the scanning half renders a button and awaits a string from a scanner **the host supplies**, because no renderer may own camera permission policy, a decoder in every consumer's dependency closure, or a viewfinder in a design system it knows nothing about. With no scanner supplied there is no button and the field is the ordinary text input — typing is the primary route, the fallback and the accessibility floor at once |
| ~~`autocomplete`~~ / `tagpicker` | **Half shipped, and not as a type.** One answer from a list the document already carries is `widget: "typeahead"` on a select, built in both renderers ([0072](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)); the name `autocomplete` is still spent on the HTML autofill token and not on this. What is missing is `optionsSource` — remote options, reserved and unbuilt — and the many-answer tag picker | This row said the combobox pattern gets built once rather than per renderer. Half of that held: the filter is one function in `@formancy/spec`, so it cannot fold one way in React and another in Angular. The markup was written twice on purpose, because a shared control would be a third renderer and the agreement it reported would be agreement with itself |
| ~~`time`, `datetime`~~ | **Shipped.** One canonical fixed-width string each, with `earliest`/`latest` bounds ([0067](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0067-a-temporal-answer-is-one-fixed-width-string.md)) | This row said time zones are where form platforms lose data, and the semantics are written down now: a `datetime` is an instant in UTC, a `time` is a wall clock with no zone, and there is deliberately no per-field `timezone` — a zone *name* would put the host's IANA data into the replay contract |
| `toggle` | A switch | A checkbox with different paint, *unless* it commits immediately — and in a form it must not, so it is a checkbox with different paint |

`signature`, `datagrid` and `qrcode` are the three
[FormEngine](https://formengine.io) groups as "special components", and they are
the three most asked about. That is the reason they are named here rather than
left out as v2-era omissions.

## What comes next

Roughly in order, and subject to change. The ordering is argued below rather
than asserted.

1. **A host that actually saves and resumes a draft**, so the flow is
   demonstrated rather than only documented. Everything it needs is built; what it
   wants is somewhere to live, since no app in this repository fills in a form
   against a server.
2. **`signature` and `datagrid`**, in that order — signature is smaller and more
   asked for; datagrid is mostly a control over a data model that already exists.
3. **Translated form content**, while the reservation is still fresh.

## Measured against the competition

[form.io](https://form.io/features/) is the benchmark this project was started
against, and [FormEngine](https://formengine.io) is the closest thing to a modern
answer to it. Worth saying plainly which of their features matter, which are
already here, and which are deliberately not coming. Ordered by what would change
an adopter's decision, not by what is easiest.

### The one that decides adoption

**A pointer-driven builder a non-technical person can use.** This is what form.io
is bought for and what FormEngine leads with, and it is the thing a buyer judges
in ten minutes. Most of it exists here — the structure tree, the arrangement
tree, the palette, a property panel generated from the spec's own JSON Schema,
and a condition editor that compiles to CEL — and each got its keyboard route
first and a drag surface afterwards. That order is not politeness: WCAG 2.2
SC 2.5.7 requires a complete keyboard path for every drag operation, and a
builder that grows one afterwards never quite gets it. What remains is a gesture
that creates a row.

### Worth doing, because the hard half already exists

**Save and resume a draft.** form.io sells this. Here the distributed-systems
half is already built and tested: a resumed draft is rebound against the exact
version it was written under — `compatible` silently, `lossy` with a migration
report, `breaking` read-only. What is missing is an endpoint and a token, which is
a small fraction of the cost and most of the visible value.

**The components they charge for, or lead with** — signature, data grid, QR code,
autocomplete, tag picker. Each is small on its own and collectively they are a
priced tier elsewhere. See the table above for what each actually costs.

**Translated form content.** `label: { $t: "..." }` is reserved and resolved, and
retrofitting i18n into every string-bearing property after people have stored
documents is brutal. Doing it while the reservation is fresh is the cheapest it
will ever be, and "self-hosted, nothing phones home" is a European pitch where
this is table stakes rather than a nicety.

**Collision control on form editing.** form.io's term for two people editing one
form. Immutable published versions and a schema hash on every submission already
give the mechanism; the 409-on-stale-hash pattern exists on the submission path
and wants extending to the editor.

### Deferred, with the reason

**PDF output and e-signatures.** The strongest commercial pull on form.io's list,
and explicitly in the sold tier here. Expensive, and it needs a deterministic
render path that does not exist yet — the honest version of this feature is not
"print the form". It also wants `signature` first.

**Offline mode.** Expensive, narrow, and it argues with the rule that the server
is the authority on validity. A form that validated offline and is rejected on
reconnect is a worse experience than one that said it needed a connection.

**FormEngine's display components** — breadcrumbs, cards, menus, tooltips,
progress rings, skeleton placeholders. These are a *page* toolkit, and a form
library that grows one starts competing with its host application's design
system instead of composing with it. The layout kinds here stay structural, and
anything decorative is the consumer's markup through the component registry. This
is a deliberate difference, not a gap.

**Analytics, multi-tenancy, SSO and teams.** The sold tier, by design. The
open-core line is drawn so that everything a developer needs to adopt formancy is
free and everything about *operating* it for other people is not.

**Agent-facing features.** `@formancy/mcp` already exists, so this is extending
something rather than starting it.

### Deliberately not copying

- **A generated API that returns `any`.** form.io's per-form endpoints hand you
  untyped data; `npx @formancy/cli types` emits a real type per form.
- **Markup baked into the renderers.** Bootstrap classes in the core are the
  reason theming form.io means fighting it. Here the markup belongs to the
  consumer's design system.
- **Charging for accessibility.** It is a property of passing the conformance
  suite, not a tier.
- **An importer for form.io schemas.** A clean-slate spec was chosen on purpose;
  an importer would drag the model it was meant to escape back in.

## Versioning promises

Pre-1.0, breaking changes may land in minor releases and are documented in
`MIGRATIONS.md`. The spec version is separate from package versions and is the
one we treat as load-bearing. Submissions never migrate — see
[Versioning](/docs/concepts/versioning/).

## Contributing

The contributor agreement policy is not settled yet, and the repository is not
open to outside contributions until it is — deliberately, because that choice
cannot be made retroactively. `GOVERNANCE.md` says so plainly rather than
leaving a well-meant pull request to be refused later.
