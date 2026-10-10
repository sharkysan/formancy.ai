# 8. Cross-cutting concepts

Concepts that appear in more than one building block, and that a reader needs
in order to follow any of them.

## 8.1 The path model

Everything in formancy — the store, the diff, the logic rules, the layouts, the
server's stripping, the export columns — addresses data by the same path
grammar. Getting it right once was the reason repeaters stayed in v0.1.

```
email                      a top-level field
address.city               a field inside a group
contacts[2].email          a field inside the third row of a repeater
contacts[].email           the same field in the repeater's TEMPLATE
```

The rule that matters: **a page contributes nothing**
([0012](../decisions/0012-pages-scope-nothing.md)). A field on page 2 is
addressed exactly as if pages did not exist, so moving a field between pages
never moves data. A group nests; a repeater indexes.

## 8.2 Snapshots and change propagation

`getFieldSnapshot(path)` returns a frozen object — value, type, resolved label,
required, visible, disabled, touched, errors, ids, props, and the raw
definition — whose **identity** changes only when one of those changes
([0020](../decisions/0020-identity-stable-snapshots.md)).

Consequences worth knowing before adding state to the engine:

- Anything a renderer reads must be part of the snapshot *and* part of the
  invalidation rules. State added to one without the other is silently stale.
- Nothing that can change outside the invalidation rules may be baked into a
  snapshot. This is precisely why the locale is fixed when the engine is
  constructed rather than being a parameter of every read.

## 8.3 Determinism

The engine never reads `Date.now()`, a timezone, a locale from the environment,
or a random source. All of them arrive in an injected capability object, frozen
per pass ([0019](../decisions/0019-injected-capabilities.md)). A schema with
logic rules **throws** if constructed without one, so this is not a convention
that a caller can forget.

It is what makes server replay a check rather than a second opinion, and it is
also why the engine's tests never need to mock a clock.

## 8.4 Validation, in three tiers

| Tier | Where | Example |
|---|---|---|
| **Structural** | ajv against the spec's JSON Schema, ahead-of-time compiled | a field with no `key` |
| **Semantic** | `validateSchema`, expressing what JSON Schema cannot | a duplicate key; a rename whose old key still exists; a page below the top level; a pattern that does not compile; a message reference that resolves nowhere |
| **Model** | the engine, against answers | `required`, `min`, `maxLength`, anchored `pattern`, the closed format list, and expression-driven rules |

Messages in the first two tiers are written for a form author, not for a
compiler. "There is no `en` catalogue, so the language everything falls back to
has no words in it" is the register. Each carries a code and the values it names as
well as that English, so a builder says it in the author's language without reading
the English back ([0122](../decisions/0122-a-validator-error-has-a-code.md)).

## 8.5 Hidden fields

A specified behaviour, not an emergent one
([0013](../decisions/0013-hidden-field-semantics.md)):

- A hidden field is excluded from validation.
- `clearOnHide`, default `true`, decides whether its answer is pruned.
- The **server** applies the same semantics from its own evaluation, so a
  client cannot smuggle data into a hidden branch by sending it anyway.
- Invariant, held by property tests: hiding then unhiding restores the value if
  and only if `clearOnHide` is `false`.

## 8.6 Accessibility

Owned centrally, because accessibility implemented separately in two renderers
is accessibility implemented differently in two renderers
([0021](../decisions/0021-engine-owns-aria.md)).

`engine.ids(path)` mints deterministic ids from the form id and the path, so
server-rendered markup and hydrated markup agree and the entire `useId`
mismatch bug class does not exist. `engine.props(path)` returns plain
serialisable objects carrying every ARIA attribute, composed once.

Specified centrally and not left to renderers: `aria-invalid` only when
validated *and* invalid; `aria-required` reactive because requiredness can be
expression-driven; real `fieldset` and `legend` for groups; **exactly one**
polite live region per form, with error text as a `describedby` target and
**not** also a live region — the classic double-announcement bug; and an error
summary with `tabindex="-1"` that receives focus but deliberately does not get
`role="alert"`, because focusing it already announces it.

The verification side of this is
[0034](../decisions/0034-accessible-name-only.md): a conformance driver may
find elements only by role and accessible name, so unreachable markup fails the
suite.

## 8.7 Theming

Three concentric mechanisms, each usable without the next:

1. **Prop getters.** A consumer who wants none of formancy's markup spreads
   `engine.props(path)` onto their own elements and still gets correct wiring.
2. **A component registry**, resolving a field to a component with precedence
   per-path > per-type > default. Layout nodes resolve through the *same*
   registry, so the grid system belongs to the consumer too. There is **no
   per-widget entry**: a `widget` is the author's statement of intent in the
   document ([0065](../decisions/0065-a-widget-is-authored-not-registered.md)),
   honoured by the default control for that type — `toggle` is a part name on the
   checkbox, `typeahead` is a combobox the select renders instead of itself
   ([0072](../decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)) —
   and a registry entry replaces the component either way, which is what keeps the
   two mechanisms from contradicting each other. An earlier version of this
   sentence described a per-widget precedence step that no renderer has ever had.
3. **The unstyled kit** — semantic HTML, zero CSS files, and stable
   `data-formancy-part` and `data-state` hooks, so a Tailwind user writes
   `data-[state=invalid]:border-red-500`.

**Zero CSS is about appearance, and one property crossed that line.** A control
declares what it needs in order to *work*; a theme declares how it looks
([0101](../decisions/0101-a-control-is-operable-without-a-theme.md)). The test is
not whether a property is CSS but whether removing every stylesheet leaves a
control a person can still operate — and the signature surface failed it, because
`touch-action: none` lived only in the four shipped themes, so a touch drag
scrolled the page for anybody using their own design system. The surface now
declares it inline and the themes do not declare it at all. A theme still owns
the height, the border, the background and the cursor.

Themes are strictly downstream and are never a dependency. The shipped themes
are deliberately *different design languages* rather than palette swaps —
different radii, typefaces, spacing, and different devices for showing an
invalid field — because that is what falsifies the headless claim. If either
had required a component change, the claim would be false.

**Every stylesheet says which side in reading order**, the builder's included: logical
properties, and `:dir(rtl)` for what CSS cannot write logically — an icon's
`background-position`, a bar drawn down one side with an inset shadow
([0113](../decisions/0113-a-theme-is-written-in-reading-order.md)). What the browser
computes is the builder's answer to which way a form reads, too: its drag surface reads
`direction` from the element under the pointer, so a side aimed at is the side a field
lands on. `:dir()` only means that while it reaches the browser — a bundler targeting
older browsers rewrites it as a list of languages — so the apps here build for
`CSS_TARGET`, and a host is told to
([0123](../decisions/0123-the-builder-reads-right-to-left.md)).

**The builders are dressed by one stylesheet**, `workbench.css`, and an application changes
how they look through its `--wb-*` tokens rather than with rules of its own — the playground
and the admin point them at a dark bench, the Angular starter at Material's tokens. Every part
either builder draws has a rule there, which `apps/docs/src/workbench.test.ts` derives from
the builders' sources and checks; the prompt pane, the scenarios and seven other panes had
none until it did
([0143](../decisions/0143-the-workbench-dresses-every-part-a-builder-draws.md)).

**The playground's theme editor reads a theme rather than knowing one.** Every token a theme
declares on its own selector gets a control, discovered from the live stylesheet because
the shipped themes share no vocabulary, and what it hands back is a patch of only what
changed ([0103](../decisions/0103-a-theme-editor-edits-what-a-theme-declares.md)). That
patch is the preset: imported, it is parsed by the browser and filtered by the same rule,
and what it cannot apply is reported rather than dropped
([0124](../decisions/0124-a-theme-preset-is-the-patch-read-back.md)).

## 8.8 Internationalisation

Optional, and resolved in the engine
([0014](../decisions/0014-presentation-sections.md)). Anywhere a person reads
something, the document may carry a literal or `{ "$t": "some.id" }`. Every
reference must resolve in the default locale, enforced when the schema is
validated; a missing translation in another locale falls back to the default
rather than showing an id.

Snapshots carry the resolved label, and `engine.text()` handles option labels
and anything else. Neither renderer reads `def.label` directly, which is how
they are kept from disagreeing.

**The builder's own words are a second, separate catalogue**, and the two are not
to be merged. The document's catalogue is the form's, for the people filling it in,
and is published with the form. The builder's is for the person building it, who may
work in a different language from the form they are building: `@formancy/builder-core`
ships English, German and French, a session carries one, and both builders read it. A message a
translation lacks falls back to English one message at a time, and a locale the runtime
has no data for is English rather than whatever the machine is set to — measured, the
other answer joined one document's lists differently on two machines
([0114](../decisions/0114-the-builder-speaks-the-authors-language.md)).

**The spec's own words are a third**, kept beside the schema rather than in either
catalogue: a property's title and description and a field type's name stay English in
the JSON Schema, which the reference documentation reads, and translations sit beside it
keyed by that English. The set is derived from the schema, so a reworded description fails
a test until its translations follow
([0121](../decisions/0121-the-specs-words-are-translated-beside-it.md)).

**The validator's sentences are a fourth**, keyed by code rather than by English: each
error carries a stable code and the values its sentence names, the English is the spec's
table, and German and French sit in `@formancy/builder-core`, typed as every code so a new
sentence does not compile until it is translated. A session's refusals go through it.
What stays English is what no table here wrote — ajv's wording for a keyword with no
sentence of its own, and a regular-expression engine's reason
([0122](../decisions/0122-a-validator-error-has-a-code.md)).

## 8.9 Error handling

**Fail open on metadata, fail closed on validation**
([0022](../decisions/0022-fail-open-fail-closed.md)).

Server verdicts arrive in the identical shape local errors use and render
through the same path, so a renderer has one error model rather than two, and
they are cleared per field on edit.

Error codes, not sentences, are what the engine produces. Text belongs to the
message catalogue.

## 8.10 Security

| Concern | Approach |
|---|---|
| Expression sandbox | Non-Turing-complete by construction, plus structural limits, wall-clock budgets and a per-slot function allow-list ([0016](../decisions/0016-cel.md), [0017](../decisions/0017-expression-facade.md)) |
| Content-Security-Policy | No `eval` and no dynamic function construction anywhere, so a strict CSP needs no configuration ([0040](../decisions/0040-no-eval.md)) |
| Requests to other sites | formancy.ai serves its own faces and the playground's editor, and `test:browser` opens one of each kind of page the site serves and aborts and names any request to another origin; the playground, which renders documents other people wrote, holds pictures and connections to itself by a content security policy ([0154](../decisions/0154-the-website-makes-no-request-to-any-other-site.md)). A form's own pictures are the author's choice (C6 in the safety analysis) |
| What leaves with the model's turn | On formancy.ai the page calls no model. The relay pane shows the request and a person carries it: what the visitor copies goes on their clipboard, and pasting it into a chat gives it to that service under their own account — the pane says so in its own sentence, of itself alone, naming no service. What the request carries depends on its kind, which the run sets on the prompt: a form's edit carries the whole form, rules included; a translation or a request for examples, part of it and none of its rules. The sentence is the kind's (`relayLeaves`) and says which part. `relay.test.ts` checks each run's request against a list of what its sentence claims, and pins the sentence beside that list in English, German and French, so a reworded sentence fails there and the list has to be read again; the words are not parsed ([0167](../decisions/0167-the-relay-says-what-each-request-carries.md)). The link to a chat is the host's to name and is navigation, never carrying the request; no prompt is put in a URL. Both builders' `relay-pane.test` press every Copy with `fetch`, `XMLHttpRequest`, `sendBeacon` and `window.open` spied, which is what backs the pane's sentence; `two-builders.test` does the same through a round trip in either builder of the playground, and the request gate carries a turn through each builder in Chromium ([0160](../decisions/0160-a-person-carries-the-models-turn.md)). What a host's own `AskModel` sends, and the rest of a host's page, are the host's |
| What leaves for a deployment's model | Nothing, unless the operator names a provider, its key and a model; then the form a builder asks about — the whole document for an edit, part of it and none of its rules for a translation or examples, with the sample a deployment keeps for its examples (0166) — goes from the server, never the browser, to that provider's one host, which the adapter names rather than reading from the environment. The browser sends the kind of request and the user part to its own server; the server writes the briefing, so the key pays for formancy's three requests and not for a system part a session sends. The admin says which provider and model before anybody asks, and every request is audited without its text. Held by `model-route.test.ts`, the two adapters' tests and the admin's `server-model.test.tsx` and, for drafting, `examples.test.tsx`; hazards C8 and C9 ([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md)) |
| Trusting the client | Nothing computed by the client is trusted; everything is recomputed and overwritten ([0030](../decisions/0030-never-trust-client-state.md)) |
| A response sent twice | Every form is handed out with a token naming the id its response will be stored under, signed for that form with the deployment's key, and a draft with one naming the draft. The id is the submission's primary key, so the same response sent again — the retry a lost answer forces, a replay — is refused `409 submission_token_spent`, and nothing is stored, delivered or audited a second time; a refused attempt spends nothing. Required of an anonymous submission. It binds no version, which the schema hash does, and does not expire; and it is not an anti-automation measure — a script reads the form for one, and what prices a script is the challenge. Held by `submitting.test.ts`, the PostgreSQL suite's *a response is stored once* and the admin's `fill-pane.test.tsx`; hazards A8 and D18 ([0169](../decisions/0169-a-response-is-stored-once.md)) |
| Account enumeration | A decoy hash, so both paths do the same work ([0031](../decisions/0031-enumeration-resistant-login.md)) |
| Export injection | Type-aware formula neutralisation ([0032](../decisions/0032-csv-formula-neutralisation.md)) |
| SSRF on webhooks | Resolve DNS in-process, refuse if ANY returned address is private, connect to the checked address through a pinned agent with Host and SNI preserved; redirects not followed ([0048](../decisions/0048-webhook-delivery.md)) |
| ReDoS from a form author | Anchored patterns, compiled at save time; `recheck` linting at publish is designed and **not yet implemented** |

## 8.11 Logging

**The server keeps a log, and a line is built from a list of fields**
([0168](../decisions/0168-the-log-is-built-from-a-list-of-fields.md)). Its process writes a JSON
line to standard output for every request — method, the route as the route table writes it,
status, milliseconds and Fastify's request id — at `error` when the status is a 5xx, and one for
every error that answered a request, naming what was thrown by its class and code. Every audit
row a request writes carries the same id: the route passes `request.id` to the three use-cases
that write their row inside their own transaction — a publish, a change of examples, a
submission — as `audit-trail.ts` does for the rest. A route or a background worker adds a line
by naming an event from `LOG_EVENTS` in `server/server-log.ts`; the outbox, the collector and
the sweeper are handed the app's log, and so are the database's notices. The rate limits' counter
is made before the app, so `main.ts` hands it a log of its own by the same rule, to the same place
(0170).

"Every request" includes three kinds Fastify's own request line misses, because it is written
when an answer has been sent: a request refused before routing for a URL it cannot decode or a
parameter too long for the router, answered through `frameworkErrors` so it gets the refusal's
line and its own; one that arrives while the server closes, refused with a `503` before routing,
whose line has only its id and status; and one whose client left before the answer was sent,
written as `request.abandoned` when its response closes without having finished, with no status.

What keeps a body, a query string, a header, an answer or a credential out is that a line is
assembled from `LOG_FIELDS` and nothing else, each field kept only when its value is of that
field's kind, and that the words of a call — a message, an error's message or stack, Fastify's
own sentences — are never written. There is no filter over text to get wrong, and no field for
any of those to go in. Fastify's own lines about a request go through the same rule because the
server hands Fastify a `LogController` that writes them.

| Who writes | Through |
|---|---|
| Every request, and every error that answered one | `RequestLines`, Fastify's `logController`, and its `frameworkErrors` for what Fastify refuses before routing |
| A route, about something beside its answer | `request.log`, with a listed event |
| The three background workers | the app's log, from `main.ts`; to standard error by the rule when started without one |
| The database's notices | `databaseNotices`, by SQLSTATE |
| The rate limits' counter, when it stops answering, answers again or fails a sweep | the log `main.ts` makes before the app, by the same rule; nowhere when given none, as `createApp` |
| The libraries | nothing at all ([0115](../decisions/0115-a-library-writes-nothing-to-its-hosts-console.md)) |

`FORMANCY_LOG_LEVEL` is read once, by `server/log-settings.ts`, and refused at startup when it is
not one of pino's level names or `off`. Only `main.ts` passes `createApp` a log; an app built
without one keeps none.

The audit log is the other record, and the two do different jobs: the audit log says who did
what to whose data, in the transaction that did it, and is read by people with the right to;
the request log says what the server answered, and how long it took, to whoever reads the
process's output. That is why the request log is the one that can hold no subject.
