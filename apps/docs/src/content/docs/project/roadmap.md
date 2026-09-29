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
columns can also be dragged on the rendered form itself. A wizard is buildable:
`p` adds a page, and the first one takes the fields already at the top level,
because the engine gives a field that is not inside a page to page one wherever
it sits ([0081](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0081-a-page-absorbs-the-form-it-joins.md)).

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
- ~~**A worked example of saving a partly-filled form.**~~ **Built.** The admin's
  *fill in* tab opens the published form against the server and does the three things
  [Drafts](/docs/concepts/drafts/) asks a host to get right: it saves two seconds after
  the typing stops rather than per keystroke, it keeps the token the server minted and
  sends it in a header, and it shows the resume notice and refuses to save a draft that
  came back read-only. Not demonstrated there: the **anonymous** submission path, since
  the admin is signed in and skips the challenge.
- ~~**Translated form content.**~~ **Authoring is built.** The admin's *translations*
  tab extracts every literal label into a message reference, keeping the words, and a
  translator works down a table per language with untranslated messages marked rather
  than shown as their fallback. A message nothing refers to any more is listed and never
  collected ([0084](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0084-a-translation-is-authored-not-imported.md)).
  One press extracts every text the format has — `Text` appears in exactly four places —
  the form is previewed in the language being worked on without editing the document to
  look at it, and a catalogue goes out and comes back as a file carrying the source beside
  every target. Not XLIFF: that is a format with a specification and a namespace, and
  shipping half of one would be worse than shipping none.
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

Rule-level properties are reserved one at a time, and **both of the two are there now.**
`runsOn` is in the format and enforced — `both | client | server` on a validate rule and
deliberately nowhere else, because visibility that differed between the browser and the
server would leave the server unable to check what the browser did
([0043](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0043-runs-on.md)).
`async` is not: `logicRule` is `additionalProperties: false`, so a document carrying it is
rejected today, and adding it is a version bump rather than an additive change.

It was deliberately not reserved ahead of use, and it did not need to be: an asynchronous
validator turned out not to be a property at all. `kind: "check"` is a rule kind in spec 3
— a CEL expression is synchronous by construction, so the asynchronous thing could never
be an expression with a flag on it
([0086](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).

## Field types that are not here yet

Named because a type name is a promise: reserving one costs nothing and renaming
it later costs everybody. Note what reserving does **not** buy — adding any of
these to the spec is a version bump, for the reason under *What does not exist
yet* above, so they are worth grouping into one.

| Type | What it is | Why it is not trivial |
|---|---|---|
| ~~`signature`~~ | **Shipped, in spec 3.** A mark stored as points, or a name typed — never both, and never stroke timing ([0083](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0083-a-signature-is-points-or-a-name.md)) | This row said it needs a pointer *and* a keyboard route, and that is how it was built: typing your name is the second route rather than a fallback, because it is the only one a keyboard has. The legal weight the row mentions is answered by saying plainly what this is not — there is no identity proof, no certificate and no timestamp authority, so a qualified signature under eIDAS needs a qualified provider. Timing is refused rather than omitted: velocity is what makes a signature biometric |
| ~~`datagrid`~~ | **Not a type, and now shipped.** `widget: "datagrid"` on a repeater, with `columns` configuring the arrangement ([0066](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0066-a-widget-may-be-configured.md)), drawn as a grid in both renderers ([0075](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0075-a-datagrid-is-drawn-not-tabulated.md)) | The repeater's data model already handled it, as this row said. The control is built: column headings, per-column width and alignment, row reordering, and a row count that stays out of the accessible name of every field inside it — asserted element for element against the same schema rendered as blocks. **Tab-through-cells is refused rather than missing**: this is not a `role="grid"`, so it never takes the arrow keys, which the controls in the cells already own — a `typeahead` in a row claims Up, Down, Home, End, Enter and Escape. A grid's rows are also flat, because a column holding several answers is a heading that names none of them ([0078](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0078-a-grid-row-is-flat.md)) |
| ~~`qrcode`~~ | **Split, as this row said, and both halves are shipped.** Showing is a `qrcode` layout node that collects nothing ([0070](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md)); scanning is `widget: "scanner"` on a text field ([0071](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0071-a-scanner-is-supplied-not-built.md)) | Neither half ships a codec. The display half shows the value as text and no picture; the scanning half renders a button and awaits a string from a scanner **the host supplies**, because no renderer may own camera permission policy, a decoder in every consumer's dependency closure, or a viewfinder in a design system it knows nothing about. With no scanner supplied there is no button and the field is the ordinary text input — typing is the primary route, the fallback and the accessibility floor at once |
| ~~`autocomplete`~~ / ~~`tagpicker`~~ | **Both shipped, and neither as a type.** One answer from a list the document already carries is `widget: "typeahead"` on a select, built in both renderers ([0072](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)); the name `autocomplete` is still spent on the HTML autofill token and not on this. `optionsSource` — a list the deployment resolves rather than the document carrying it — is built too, in both renderers and on the server, which checks membership because the frozen document cannot ([0077](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0077-options-may-come-from-a-named-source.md)). The many-answer tag picker is built too, as `widget: "tagpicker"` on a `selectboxes` and for the same reason: the answer is an array of offered option values in the options' own order, which is what that type stores without it ([0085](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0085-a-tag-picker-is-a-widget-and-a-widget-has-a-version.md)) | This row said the combobox pattern gets built once rather than per renderer. Half of that held: the filter is one function in `@formancy/spec`, so it cannot fold one way in React and another in Angular. The markup was written twice on purpose, because a shared control would be a third renderer and the agreement it reported would be agreement with itself |
| ~~`time`, `datetime`~~ | **Shipped.** One canonical fixed-width string each, with `earliest`/`latest` bounds ([0067](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0067-a-temporal-answer-is-one-fixed-width-string.md)) | This row said time zones are where form platforms lose data, and the semantics are written down now: a `datetime` is an instant in UTC, a `time` is a wall clock with no zone, and there is deliberately no per-field `timezone` — a zone *name* would put the host's IANA data into the replay contract |
| `toggle` | A switch | A checkbox with different paint, *unless* it commits immediately — and in a form it must not, so it is a checkbox with different paint |

`signature`, `datagrid` and `qrcode` are the three
[FormEngine](https://formengine.io) groups as "special components", and they are
the three most asked about. That is the reason they are named here rather than
left out as v2-era omissions. All three are now shipped.

## What comes next

Roughly in order, and subject to change. The ordering is argued below rather
than asserted.

1. **A gesture that creates a row.** Every arrangement edit has a keyboard route and
   most have a drag one, and the one that is missing is dropping a field *between* two
   others to make a row of them. `wrapLayoutNodes` is the command underneath it and is
   built; what is missing is the gap target — a drop zone that is not a node — which is
   the one drag affordance that cannot be described as a smaller version of an existing
   one.
2. **XLIFF**, if somebody asks for it. The exchange format is JSON carrying the source
   beside every target, which converts to XLIFF in a script; a real XLIFF implementation
   is a specification, a namespace and versions, and half of one is worse than none.
3. **Rewriting a data path inside a rule's condition.** Two commands refuse a document they
   should accept, for one missing capability: `renameField` refuses to rename a field a rule
   mentions, and `unwrapField` refuses to unwrap a group a rule reads inside. Both would
   need the CEL parsed and printed back, because a regular expression over source is the
   shape of guard this repository has got wrong six times. Refusing names the rule and loses
   nothing, which is why this is third rather than first.

### Done since this list was written

**Spec version 3 is frozen**, as of `0.3.0`. It holds `signature`, the `tagpicker` widget,
the `check` and `skip` rule kinds, and `optionsSource` on a list-valued field — four
constructs in one version rather than four versions, which is the batching rule written
down ([0088](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0088-spec-3-freezes-with-four-constructs.md)).

**Conditional page routing is built**, and is in spec 3 rather than being the only thing in
a version 4: `kind: "skip"` walks past a page while its expression is true, and the fields
on it are hidden, which is what keeps a required answer on a page nobody saw from holding
the form up
([0087](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0087-a-page-can-be-walked-past.md)).
The **builder writes both** of spec 3's rule kinds: a page's panel offers “Skip this page
when” with the condition editor, and a field's offers “Ask the deployment about the answer”,
which takes a check's name rather than a condition — because a check has no expression to
write.

**Un-paging a form from the builder** is built, and it was not the transposition it looked
like. `u` on the structure tree replaces a container with its children, the way
`unwrapLayoutNode` has always done in the arrangement tree — except that a page's questions
join the neighbouring page instead of the top level, because a top-level field that is not
inside a page is asked on step one wherever it sits. Only the last page leaves the form
unpaged
([0089](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0089-a-page-is-unwrapped-into-its-neighbour.md)).
It also found that a page carrying a `skip` rule could not be deleted at all.

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

**Translated form content.** Built, for labels: the format always allowed
`label: { $t: "..." }` and the engine always resolved it, and what was missing was
any way to produce one. An author extracts, a translator works down a table, and a
message whose field has gone is kept rather than collected. Built, including the file a vendor works in —
"self-hosted, nothing phones home" is a European pitch where this is table stakes
rather than a nicety.

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
