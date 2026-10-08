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
The builder's words come from one catalogue in `builder-core`, English and German: a
session refuses, offers destinations and names layout nodes in the language it was
opened in, and the structure tree, the arrangement pane, the property editors and the
logic panel show and announce everything in it, in both builders.
The other panes have not moved to it yet
([0114](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0114-the-builder-speaks-the-authors-language.md),
[0116](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0116-what-a-builder-says-is-decided-once.md)).

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

**A visual theme editor**, in the playground's third editor mode. Every token the
applied theme declares, discovered from its stylesheet — which is what lets it work on a
theme nobody here wrote, and what a fixed set of controls could not do: the four shipped
themes declare different vocabularies on purpose
([0103](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0103-a-theme-editor-edits-what-a-theme-declares.md)).
It emits a patch rather than a fork, and it does not persist: what you leave with is a
CSS file. A stored theme needs somewhere to put it, which is a backend decision nobody
has taken.

**Spec version 4 is open**, with `widget: "rating"`, `widget: "slider"` and the `step`
property. Both are widgets on `number` because neither changes the answer — a rating is a
number between two bounds and so is a slider — and `step` is a *field* property rather than
widget configuration, because it says which values are valid and the server has to agree
([0104](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)).
An NPS question is `rating` with `min: 0` and `max: 10`; it needs no construct of its own.

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

## Field type names that were reserved, and what became of them

Named because a type name is a promise: reserving one costs nothing and renaming
it later costs everybody. Note what reserving does **not** buy — adding any of
these to the spec is a version bump, for the reason under *What does not exist
yet* above, so they are worth grouping into one.

**Every row below has shipped**, which is why this heading no longer says they are
missing. It said so for one row longer than it was true: `toggle` sat here
unstruck while the widget had been in the spec since version 2, and a reader
comparing this repository against a competitor's feature list found it.
`apps/docs/src/claims.test.ts` now fails when a row here names something the
document schema defines and is not struck through — derived from the schema, so
the next reserved name to ship cannot sit here quietly either.

| Type | What it is | Why it is not trivial |
|---|---|---|
| ~~`signature`~~ | **Shipped, in spec 3.** A mark stored as points, or a name typed — never both, and never stroke timing ([0083](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0083-a-signature-is-points-or-a-name.md)) | This row said it needs a pointer *and* a keyboard route, and that is how it was built: typing your name is the second route rather than a fallback, because it is the only one a keyboard has. The legal weight the row mentions is answered by saying plainly what this is not — there is no identity proof, no certificate and no timestamp authority, so a qualified signature under eIDAS needs a qualified provider. Timing is refused rather than omitted: velocity is what makes a signature biometric |
| ~~`datagrid`~~ | **Not a type, and now shipped.** `widget: "datagrid"` on a repeater, with `columns` configuring the arrangement ([0066](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0066-a-widget-may-be-configured.md)), drawn as a grid in both renderers ([0075](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0075-a-datagrid-is-drawn-not-tabulated.md)) | The repeater's data model already handled it, as this row said. The control is built: column headings, per-column width and alignment, row reordering, and a row count that stays out of the accessible name of every field inside it — asserted element for element against the same schema rendered as blocks. **Tab-through-cells is refused rather than missing**: this is not a `role="grid"`, so it never takes the arrow keys, which the controls in the cells already own — a `typeahead` in a row claims Up, Down, Home, End, Enter and Escape. A grid's rows are also flat, because a column holding several answers is a heading that names none of them ([0078](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0078-a-grid-row-is-flat.md)) |
| ~~`qrcode`~~ | **Split, as this row said, and both halves are shipped.** Showing is a `qrcode` layout node that collects nothing ([0070](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md)); scanning is `widget: "scanner"` on a text field ([0071](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0071-a-scanner-is-supplied-not-built.md)) | Neither half ships a codec. The display half shows the value as text and no picture; the scanning half renders a button and awaits a string from a scanner **the host supplies**, because no renderer may own camera permission policy, a decoder in every consumer's dependency closure, or a viewfinder in a design system it knows nothing about. With no scanner supplied there is no button and the field is the ordinary text input — typing is the primary route, the fallback and the accessibility floor at once |
| ~~`autocomplete`~~ / ~~`tagpicker`~~ | **Both shipped, and neither as a type.** One answer from a list the document already carries is `widget: "typeahead"` on a select, built in both renderers ([0072](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)); the name `autocomplete` is still spent on the HTML autofill token and not on this. `optionsSource` — a list the deployment resolves rather than the document carrying it — is built too, in both renderers and on the server, which checks membership because the frozen document cannot ([0077](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0077-options-may-come-from-a-named-source.md)). The many-answer tag picker is built too, as `widget: "tagpicker"` on a `selectboxes` and for the same reason: the answer is an array of offered option values in the options' own order, which is what that type stores without it ([0085](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0085-a-tag-picker-is-a-widget-and-a-widget-has-a-version.md)) | This row said the combobox pattern gets built once rather than per renderer. Half of that held: the filter is one function in `@formancy/spec`, so it cannot fold one way in React and another in Angular. The markup was written twice on purpose, because a shared control would be a third renderer and the agreement it reported would be agreement with itself |
| ~~`time`, `datetime`~~ | **Shipped.** One canonical fixed-width string each, with `earliest`/`latest` bounds ([0067](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0067-a-temporal-answer-is-one-fixed-width-string.md)) | This row said time zones are where form platforms lose data, and the semantics are written down now: a `datetime` is an instant in UTC, a `time` is a wall clock with no zone, and there is deliberately no per-field `timezone` — a zone *name* would put the host's IANA data into the replay contract |
| ~~`toggle`~~ | **Shipped, and not as a type.** `widget: "toggle"` on a checkbox, in spec 2 — drawn as a switch by both renderers, each with its own test file | This row was in a table of things that are not here, unstruck, while the widget had been in the spec since version 2. Its reasoning still holds and is why it is a widget rather than a type: a switch is a checkbox with different paint *unless* it commits immediately, and in a form it must not. What was wrong was the heading above it, not the argument in it — found by somebody reading the repository against a competitor's feature list, which is one of the two stale claims a reader found that nineteen guards had not |

`signature`, `datagrid` and `qrcode` are the three
[FormEngine](https://formengine.io) groups as "special components", and they are
the three most asked about. That is the reason they are named here rather than
left out as v2-era omissions. All three are now shipped.

## What comes next

Roughly in order, and subject to change. The ordering is argued below rather
than asserted.

1. **`ranking` and `matrix`, in version 4.** The two survey constructs that are types
   rather than widgets, because each stores an answer no existing type holds: a ranking
   stores the respondent's chosen order and a matrix a row-to-column map. They are the
   reason version 4 is open rather than frozen — it can gain them without another bump.
   Image choices are smaller and go with them: an `image` on an option plus a widget,
   which changes no answer at all.
2. **XLIFF**, if somebody asks for it. The exchange format is JSON carrying the source
   beside every target, which converts to XLIFF in a script; a real XLIFF implementation
   is a specification, a namespace and versions, and half of one is worse than none.
### Done since this list was written

**A publish warns about a rule reading a path no field provides.** This list asked for
detection and described the gap wrongly: an unknown *root* has always been refused, because
the engine compiles each rule against the fields that exist. What got through is a member of a
group or of a repeater row — `address.nope`, `item.nope` — which type-check as `dyn`, publish,
and then evaluate as nothing for the life of an immutable version. Those are also the cases
that matter, since a grouped path is exactly where a rename leaves a rule behind.

It **warns rather than refuses**, and that is the decision rather than a half-measure:
tightening what a reader accepts would make documents valid today invalid tomorrow, and the
spec versions are frozen. The warning rides on the `201` and the admin shows it under the
version it created, so a success with a warning is not read as a failure
([0097](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0097-a-publish-may-warn.md)).

A deployment that needs a *gate* can treat those warnings as one; nothing here does that for
them, and `SAFETY-ANALYSIS.md` B1a says so as the main residual.

**Both Angular packages are mounted, and the builder shares the React builder's session.** The
playground's Build pane has a chooser: React or Angular, over the *same* `BuilderSession`. Make
an edit in the Angular tree, switch back, and undo it — the document, the undo stack and both
rendered forms are one set of things, which is
[0091](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0091-a-second-builder-is-a-binding.md)'s
claim as something to do rather than something to read.

Mounting it turned up why it had been easy to leave: **`@formancy/builder-angular` could not be
imported from anywhere in the workspace.** Its manifest carried no `exports` and no `types`, so
there was nothing for a bundler or TypeScript to resolve — and its own ninety-five tests never
noticed, because they import by relative path
([0096](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0096-two-builders-one-session.md)).

**One schema renders in React and Angular, side by side, on one page.** The project's founding
claim — a headless engine that is genuinely framework-neutral — was demonstrated nowhere until
now: both Angular packages were complete, published and mounted by no application.

Putting them on one page needed something the engine could not express. Element ids are minted
from the form id, so two engines over one schema mint identical ones — and a duplicate id does
not merely duplicate: `<label for>` resolves to the first match in the document, so every
control in the second renderer loses its accessible name. Measured, both before and after.
`createFormEngine` now takes a `formId`, which is a rendering concern rather than a document
one; the schema, its hash and what a submission binds to are unchanged
([0095](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0095-one-schema-two-renderers.md)).

Building it also found that the playground's own capabilities — the options source, the
scanner, the uploader, the editor — were local to the React component, so the Angular half
rendered one control fewer and looked fine doing it.

**The Angular builder reached parity.** Dragging on the rendered form was the last thing the
React builder had that it did not. Where a drop lands moved into `@formancy/builder-core`
rather than being copied, so the two cannot disagree about which part of a field is a side
zone; what is per-framework is reading a pointer and drawing a line, which is about 190 lines
either way — a binding, as
[0091](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0091-a-second-builder-is-a-binding.md)
said, and not a free one
([0094](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0094-the-second-builder-reaches-parity.md)).

**Rules follow the paths they read.** `renameField` and `unwrapField` now rewrite a rule's
target, its condition and the metadata the logic panel reopens from, by splicing the source
spans the CEL parser reports — so a field whose name is a prefix of another's is untouched,
and a field name inside a string literal stays the data it is. This list used to say both
commands *refused*. One did; `renameField` did not, and that was the defect: it succeeded
and left the condition reading a path no field had, which still compiles, still publishes,
and evaluates as null for the life of an immutable version. A conditionally visible field
was simply never shown again, with nothing to say so
([0093](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0093-a-rule-follows-the-path-it-reads.md)).

**Collision control on form editing** is built. A publish may declare the version it
started from, and one overtaken by somebody else is refused with the same **409
`FORM_VERSION_CHANGED`** a stale submission gets, carrying the current schema so an editor
can show what changed rather than fetching and diffing to find out why. Declaring is
optional on purpose — a script, the CLI and an agent compose a document rather than opening
one, and have nothing to declare; the builder opened a version, so the builder declares.
Nothing is overwritten either way, because a published version is immutable; what was
missing was that anybody noticed.

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
builder that grows one afterwards never quite gets it.

That includes the gesture that CREATES structure rather than moving it: dragging a
field onto another field's side makes a row of the two, on the rendered form itself,
with the side aimed at deciding the order. The arrangement *tree* deliberately does not
offer that one by drag — in a list of full-width items, left and right point at nothing
— so there it is the `w` key, which was the first route to it and is still the complete
one.

*This paragraph previously ended "what remains is a gesture that creates a row", and
kept saying it after the gesture shipped. A sentence naming what is absent is a sentence
that goes stale silently; the list above is the one place where an absence is named, and
each item there says what would have to exist for it to go.*

### Worth doing, because the hard half already exists

**Save and resume a draft.** ~~form.io sells this.~~ **Built, and it was the endpoint
and the token that this said were missing.** A resumed draft is rebound against the exact
version it was written under — `compatible` silently, `lossy` with a migration report,
`breaking` read-only — and the routes are there: `POST /f/:path/drafts` starts one and
hands back the only key to it, `PUT` and `GET` require that key, and both renderers show
the notice when a resumed draft was migrated. The server picks the id and signs it, and
the token comes back exactly once, because an id the caller chose meant anybody who
guessed one could read and overwrite a stranger's part-filled form
([0062](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0062-a-draft-carries-its-own-key.md)).

**The components they charge for, or lead with** — signature, data grid, QR code,
autocomplete, tag picker. Each is small on its own and collectively they are a
priced tier elsewhere. See the table above for what each actually costs.

**Translated form content.** Built, including the file a vendor works in. The format
always allowed `label: { $t: "..." }` and the engine always resolved it; what was missing
was any way to produce one. An author extracts, a translator works down a table, and a
message whose field has gone is kept rather than collected. "Self-hosted, nothing phones
home" is a European pitch where this is table stakes rather than a nicety.

**Two people editing one form**, which form.io calls collision control. Built. The
409-on-stale-hash pattern that was already on the submission path now runs on the publish
route too: an editor declares the version it opened, and one overtaken by somebody else is
refused with the current schema attached, so it can show what changed rather than fetching
and diffing to find out why. Declaring is optional, because a script or an agent composes a
document rather than opening one. Nothing was ever overwritten — published versions are
immutable — and what was missing was that anybody noticed.

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
