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
- **Conditions combining more than one comparison** in the builder's editor.
  The expression language handles them; the authoring UI does not yet, and you
  can still write the CEL directly.
- **Virus scanning** of uploaded files, and **resumable uploads**. Files
  themselves work; a stored file is trusted the moment its bytes land, and the
  deployment's byte ceiling is also the largest single file.
- **Per-file upload progress.** The field reports that an upload is happening,
  not how far along each file is. Reporting it needs the `Uploader` interface to
  emit progress, which is a wider change than the control — so it is the one
  part of the file field still outstanding, along with thumbnails and reordering.
- **An S3 file store.** Local disk is the only one, and it does not survive
  more than one replica.
- **Form actions** beyond webhooks.
- **OIDC / SAML.** Local users and API keys only for now.
- **Saving a partly-filled form and coming back to it.** Drafts exist in the
  data model and migrate lazily; what is missing is the public-plane endpoint and
  the resume token that would let a visitor use them.
- **Translated form content.** The key structure is reserved
  (`label: { $t: "..." }`) and the engine resolves it, but there is no catalogue
  management and no authoring for it.
- **Concurrent editing of one form.** Published versions are immutable and a
  submission carries the hash it was rendered from, so the pieces are there; two
  people editing one draft still last-write-wins.
- **A published container image**, signed. The npm releases carry provenance and
  a signed SBOM; the image is built and tested in CI but not pushed.
- **Multi-tenancy, PDF output, e-signatures, analytics.**
- **A Vue renderer.** The engine protocol is designed for one; it is not a
  commitment yet.

Field **type names** for several of these are reserved — `file`, `datetime`,
`multiselect` and the rest are simply absent from the type list, and adding a
value to that list is a compatible change.

Rule-level properties are **not** reserved, and this is a real gap: `runsOn`
and `async` were meant to be, but `logicRule` is `additionalProperties: false`,
so a document carrying either would be rejected today. Adding them is therefore
a spec version bump, not an additive change — which is worth settling before
the spec freezes rather than after.

## Field types that are not here yet

Named because a type name is a promise: adding a value to the type list is a
compatible change, so reserving the name costs nothing and renaming later costs
everybody.

| Type | What it is | Why it is not trivial |
|---|---|---|
| `signature` | A drawn mark, stored as points rather than as a picture | Points scale, survive a re-render and diff; a PNG does none of that. It needs a pointer *and* keyboard route, and "sign here" carries legal weight the rest of the form does not |
| `datagrid` | A table of repeating rows, edited in place | The repeater's data model already handles it — `items[2].name`, per-row rules, stable row ids. What is missing is the grid *control*: column headers, tab-through-cells, and a row count that does not break the accessible name of every field inside it |
| `qrcode` | A code rendered from another field's value, or scanned into one | Two features wearing one name. Rendering is a computed display node. *Scanning* needs a camera, a permission prompt and a fallback, which is a different kind of thing and should be a separate type rather than a flag |
| `autocomplete` / `tagpicker` | Type-ahead against a list, one or many | Needs `optionsSource` — remote options — which is reserved and unbuilt. The combobox pattern is also the most-failed ARIA pattern there is, so it gets built once, here, rather than per renderer |
| `time`, `datetime` | The other two thirds of a date | Reserved deliberately. Time zones are where form platforms lose data, and `date` is date-only on purpose until the semantics are written down |
| `toggle` | A switch | A checkbox with different paint, *unless* it commits immediately — and in a form it must not, so it is a checkbox with different paint |

`signature`, `datagrid` and `qrcode` are the three
[FormEngine](https://formengine.io) groups as "special components", and they are
the three most asked about. That is the reason they are named here rather than
left out as v2-era omissions.

## What comes next

Roughly in order, and subject to change. The ordering is argued below rather
than asserted.

1. **Saving a partly-filled form and coming back to it.** The expensive half is
   built: drafts migrate lazily against `diffSchemas` severity, and answers whose
   field disappeared move to `data.__orphaned` rather than being deleted. What is
   missing is the public endpoint and a resume token.
2. **`signature` and `datagrid`**, in that order — signature is smaller and more
   asked for; datagrid is mostly a control over a data model that already exists.
3. **Translated form content**, while the reservation is still fresh.
4. **A published container image**, signed, alongside the npm releases.

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
