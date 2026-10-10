# Versioning and migration policy

## Two version lines, on purpose

**Package versions** (`@formancy/*`) move together as one number. Before 1.0,
breaking changes may land in minor releases; every one is documented here with
what changed, why, and how to move.

**The spec version** (`specVersion` inside every form document) is independent
of package versions, because it is the artifact with real switching costs:
your forms and your submissions are written against it. Packages 0.9 and 1.4
can both speak spec `"1"`.

## Spec version 4 is FROZEN

Spec `"4"` is frozen as of 2026-10-09, and first released with `0.4.0`. A document that
validates today will validate against every future release that speaks spec 4. **No version
is open now**: the next construct that needs one opens version 5
([0140](docs/decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)).

It is a superset of version 3 and removes nothing, so upgrading is the same single line
and `upgradeSpecVersion` still does nothing else. The direction that costs something is
the other one, exactly as before: a reader pinned to spec 3 **refuses** a version 4
document rather than ignoring the part it does not know
([0051](docs/decisions/0051-spec-2-adds-types.md)).

### What version 4 added

Two field types:

- `ranking` — options put in order. The answer is the chosen values in the order chosen,
  most preferred first, and an option nobody ranked is not in it; it starts empty rather
  than in the options' written order. `minItems` and `maxItems` bound how many are ranked,
  at least two options are required and no two may share a value. A version 3 reader refuses
  a document carrying one, and is told it needs version 4
  ([0138](docs/decisions/0138-a-ranking-stores-the-order-chosen.md)).
- `matrix` — one question asked of several `rows`, with the field's `options` as the columns
  every row shares. The answer is an object from row value to column value, holding the rows
  answered — `{}` untouched — and a required matrix needs every row. At least one row and two
  columns, no two sharing a value, and no pictures
  ([0139](docs/decisions/0139-a-matrix-answers-one-question-per-row.md)).

A picture on an option is refused on both, as it is in a dropdown: a ranking draws its options
as buttons and a matrix as columns of radios, and the ranking accepted a picture it never drew
when it first appeared in this source.

Two widgets, both on `number`:

- `rating` — stars, or a scale of numbers, between the field's `min` and `max`. An NPS
  question is this with `min: 0` and `max: 10`; it needs no name of its own.
- `slider` — a track to drag between the same two bounds.

And three properties:

- `step` — the granularity of a numeric answer, and the distance a slider moves. Counted
  from `min` when there is one and from zero when there is not, so `min: 2, step: 5`
  accepts 2, 7 and 12. A **field** property rather than widget configuration, because it
  says which values are valid and the server has to agree
  ([0104](docs/decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)).
- `image` — on an option of a `radio` or `selectboxes` field, a picture shown with it:
  `{ "src": "…", "alt": "…" }`. Presentation: the answer is still the option's `value`. Not on a
  `select` or a tag picker, which cannot show one, so the document is refused if it asks
  ([0126](docs/decisions/0126-an-option-may-carry-a-picture.md)).
- `mask` — on a `text` field, the shape the answer is typed into: `9` a digit, `a` a
  letter, `*` either, and any other character written by the control. **The answer holds
  only what was typed**, so `(999) 999-9999` stores `5551234567`, and one that leaves a
  position empty is refused with the code `mask` — by the engine, so the server agrees
  ([0125](docs/decisions/0125-a-mask-stores-what-was-typed.md)). A property and not a widget
  for the reason `step` is one: it says which answers are valid.

**Both are widgets rather than types, and that is the design.** Each stores exactly what a
`number` field already stores, so the control differs and the answer does not. A construct
that changes the answer is a type, which is why `ranking` and `matrix` are: no other type
stores an order somebody chose, or an answer per row.

It is still a version, for the reason every widget is: the format is closed, so a version 3
reader does not shrug at `widget: "rating"` — it refuses the document. A version that
rendered the default control instead would collect the same answers and look entirely
correct, which is the silent failure the version line exists to prevent.

### What upgrading to version 4 costs you

As for version 3, and for the same reason: **every reader of your forms has to speak version
4** before your documents do. A deployment pinning `@formancy/*` at `0.3.0` anywhere — a
server, a mobile build, a partner's embedded renderer — refuses a version 4 document, loudly.
Upgrade the readers first.

Nothing migrates submissions. A submission stays bound to the version it was collected under.

## Spec version 3 is FROZEN

Spec `"3"` is frozen as of 2026-09-29, with the `0.3.0` release. A document that validates
today will validate against every future release that speaks spec 3.

**Version 3 is a superset of version 2 and removes nothing.** Upgrading is the same one
line, and `upgradeSpecVersion` still does nothing else.

The direction that costs something is the other one. A reader pinned to spec 2 — `0.2.0`,
or anything built against it — **refuses** a version 3 document rather than ignoring the
part it does not know. That is deliberate and it is the whole point of the version line: a
reader that shrugged would render a form with a missing question and collect a submission
with a missing answer, which looks exactly like somebody leaving a field blank
([0051](docs/decisions/0051-spec-2-adds-types.md)).

### What version 3 added

One field type:

| Type | What it collects |
|---|---|
| `signature` | A mark somebody drew, as points, or their name as they typed it |

Two rule kinds:

| Kind | What it does |
|---|---|
| `check` | Asks the deployment about an answer — whether this email is registered, whether this reference exists. It names a check rather than carrying an expression, and the deployment answers it |
| `skip` | Walks past a page while its expression is true. Its target is the PAGE's key rather than a data path, because a page carries no answer of its own — and the fields on a skipped page are hidden, which is what keeps them out of validation ([0087](docs/decisions/0087-a-page-can-be-walked-past.md)) |

A check carries `check` (the name) and no `cel`, and may carry `code` and `runsOn` like a
`validate` rule. **A name and never an address**: a URL in a document is a deployment
detail frozen into a published version, and a way to make a server inside a private network
fetch something ([0086](docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).

One widget:

| Widget | On | What it does |
|---|---|---|
| `tagpicker` | `selectboxes` | Several answers narrowed by typing and shown as chips. The answer is unchanged — an array of offered option values in the options' own order — which is why it is a widget and not a type |

`optionsSource` also widens to `selectboxes`, so a tag picker can be fed by the
deployment rather than by the document. That widening is itself a version: a
version 2 reader refuses the combination, so a document using it is not a version 2
document however version 2 the property looks on its own.

And two properties, both on `signature` alone:

| Property | What it does |
|---|---|
| `box` | The `[width, height]` the points are recorded in — a coordinate space, not pixels. It belongs to the field so that a stored answer can be redrawn at any size |
| `maxPoints` | How many points one answer may carry across all its strokes |

**A signature answer is points or a name, never both and never a picture**
([0083](docs/decisions/0083-a-signature-is-points-or-a-name.md)):

```jsonc
{ "drawn": [[[12, 40], [13, 41], [20, 55]]] }   // a mark
{ "typed": "Mara Lindqvist" }                   // a name
```

Points are whole numbers, because a submission is bound to a canonical hash and that hash
must not depend on how one browser rounded a pointer event. There is deliberately **no
stroke timing**: velocity is what makes a signature biometric, and biometric data is a
category nothing in this product is equipped to hold.

### What upgrading to version 3 costs you

Nothing inside the document, and one thing outside it: **every reader of your forms has to
speak version 3.** If a deployment pins `@formancy/*` at `0.2.0` anywhere — a server, a
mobile build, a partner's embedded renderer — upgrade those before the documents, not
after. The refusal is loud rather than silent, so you will know; the question is whether
you find out in a test or in production.

Nothing migrates submissions, as ever. A submission stays bound to the version it was
collected under.

## Spec version 2 is FROZEN

Spec `"2"` is frozen as of 2026-09-28, with the `0.2.0` beta. A document that validates
today will validate against every future release that speaks spec 2.

**Version 2 is a superset of version 1 and removes nothing.** Upgrading a document is one
line — `specVersion: "1"` becomes `"2"` — and nothing rebinds: no key changes, no answer
moves, no submission is touched ([0051](docs/decisions/0051-spec-2-adds-types.md)).
`upgradeSpecVersion` does exactly that one line and is tested to change nothing else.

### What version 2 added

Five field types:

| Type | What it collects |
|---|---|
| `selectboxes` | Several answers from one list, in the options' own order |
| `time` | A wall clock with no zone, `HH:MM`, with `earliest`/`latest` bounds ([0067](docs/decisions/0067-a-temporal-answer-is-one-fixed-width-string.md)) |
| `datetime` | An instant in UTC, with the same bounds |
| `file` | Uploads, claimed inside the submission's transaction ([0055](docs/decisions/0055-files-are-claimed.md)) |
| `richtext` | A structured document, never HTML ([0052](docs/decisions/0052-richtext-is-not-html.md)) |

Three layout kinds — `table`, whose columns line up across every row and collapse to one
below 40rem; `tabs`; and `qrcode`, which shows a value and collects nothing
([0070](docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md)).

Four widgets, under the `widget` property — the author says how a field should look and
nothing else, so each sits on a type whose stored value it leaves exactly alone
([0065](docs/decisions/0065-a-widget-is-authored-not-registered.md)): `toggle` on a
checkbox, `typeahead` on a select, `scanner` on a text field, and `datagrid` on a repeater,
configured by `columns` ([0066](docs/decisions/0066-a-widget-may-be-configured.md)).

And four properties: `earliest` and `latest` on the temporal types, `optionsSource` for a
list the deployment resolves rather than the document carrying it
([0077](docs/decisions/0077-options-may-come-from-a-named-source.md)), `span` on a node
inside a `table` ([0074](docs/decisions/0074-a-table-child-may-span.md)), and `columns`
beside a `datagrid`.

### A property is as much a version as a type

This is the part that catches people, and it caught us. `formancy.schema.json` is closed at
every level — `additionalProperties: false` at the root, `unevaluatedProperties: false` on
a field — so a reader that has never heard of `widget` does **not** ignore it. It answers
`Unknown property "widget"` and refuses the whole document: no field renders and nothing is
collected.

So a version 1 document may not carry `widget`, `optionsSource`, `earliest`, `latest`,
`span` or `columns`, even though every one of them is optional and adding one takes nothing
away. `validateSchema` says so by name, with the fix in the message, because the author
cannot see the reader that would refuse it. For `span` and `columns` it did not name the
property until 2026-10-09 — a version 1 document carrying one was refused through the `table`
or the `datagrid` widget that carries it. Every construct's version is now read from one
ledger that a test holds to this format, so the next property cannot be forgotten the way
those two were
([0145](docs/decisions/0145-a-version-for-everything-a-document-can-say.md)).

The consolation is that the failure is **loud**. A reader on the older version refuses the
document rather than rendering a field it does not understand and dropping the answer, which
is what would look like a field somebody left blank.

### What freezing 2 costs

**An async validator is now a spec 3 feature.** `runsOn` is in the format and enforced, so
*where* a check runs is answered; `async` is not, and `logicRule` is
`additionalProperties: false`, so a document carrying it is refused. It was deliberately not
reserved ahead of use: a property nothing reads validates and does nothing, and reserving it
would not have saved the bump anyway, for the reason in the section above.

**`signature` and a many-answer tag picker are spec 3 too**, along with any other field
type. Types should arrive in batches for that reason — each bump is an event for every
consumer, and shipping two types a fortnight apart spends two of them where one would do.

**A grid's rows are flat**, and that restriction landed *before* the freeze on purpose: a
`datagrid` column may not name a group ([0078](docs/decisions/0078-a-grid-row-is-flat.md)).
Refusing something costs nobody anything while a version is unreleased and is a breaking
change afterwards. Relaxing it later is allowed and would be spec 3.

## Spec version 1 is FROZEN

Spec `"1"` is frozen as of 2026-09-20. A document that validates today will
validate against every future release that speaks spec 1.

It shipped as `"0"` and unstable first, on purpose. Three things about the
model turned out to be undiscoverable without a renderer and a server actually
using it, and each of them is a decision that cannot be taken back once there
is data:

| Question | How it was answered |
|---|---|
| What happens to a hidden field's answer? | `clearOnHide`, defaulting to true, and the server applies the same reading so a client cannot smuggle data into a hidden branch |
| How does a repeating-group row keep an identity that is not its position? | Each row carries `_id`, minted by the engine, in the data — so a submission read years later can still say which row an answer belonged to. `_id` is reserved and no field may use it |
| Where does a validation check run? | `runsOn: 'both' \| 'client' \| 'server'` on a validate rule. Metadata rules may not set it, because a visibility rule that differed between the two sides would stop the server being able to check the client |

Nothing was ever published under spec `"0"`, so there are no version-0
documents in the world and no migration from 0 to 1 exists. If you have a
document from a pre-freeze checkout, change its `specVersion` to `"1"`, give
every repeater row an `_id`, and validate it.

From spec `"1"` on:

- a spec version bump is always a MAJOR event, announced ahead of time,
- `upgradeSpecVersion` from `@formancy/spec` moves a document from version N to
  a later one. Schemas are data, so the migrator is cheap to provide — so far it
  is one line, because each version has been a superset of the one before. It is
  a function, not the command-line migrator this line used to promise, which was
  never built,
- submissions never migrate: they stay bound to the exact form version that
  produced them, forever. That binding is what makes an old submission
  auditable, and no upgrade may touch it.

## If you ran `docker compose up` before 2026-09-20

An earlier compose file supplied default values for the auth secret and the
first admin's password. Both were in the repository, so both were public.

Fixing the compose file does not fix an installation that already booted with
them: the admin row is in the volume and still works. Verified rather than
assumed — the old password authenticated against a running container after the
defaults were removed.

If you have such an installation, change that account's password, and rotate
`FORMANCY_AUTH_SECRET`, which invalidates every session signed with the old
one. Or, if it holds nothing you need, `docker compose down -v` and start
again.

## Known pre-1.0 caveats

- Both spec versions are frozen; the PACKAGES are not. Their APIs will still change
  before 1.0, and those changes are documented here.
- Async validators do not exist. When they arrive they will need a new rule kind and an
  `async` property, which is a **spec 3** change now that 2 is frozen — the version line
  exists for exactly that, and `runsOn` is already in place so the ordering question can
  be answered without restructuring anything.

## Every rate limit is counted in the database (Unreleased)

**The database.** The server adds a table, `rate_limit_counters`, on start with `CREATE UNLOGGED
TABLE IF NOT EXISTS`, as it creates every table: one row per route and client, the key, the count
and when its window ends. There is nothing to run and nothing to backfill: a database from before
it gains the table empty, and every client starts a fresh window, which is what a restart of the
old server did too
([0170](docs/decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)).
It is **unlogged**: a crash empties it, and it is on no standby, which costs each client one
fresh window. If you grant the application's role privileges table by table, it needs `SELECT`,
`INSERT`, `UPDATE` and `DELETE` on `rate_limit_counters`; without them every count fails, nobody
can sign in, and the public plane has no limit. **Each server process opens four connections
more**, the counter's own, beside the up to ten its storage opens: a database whose
`max_connections` was sized to the server's ten a replica needs fourteen.

**If you call `createApp` yourself**, rather than running the server, open the counter with
`const rateLimits = createPostgresRateLimitStore(databaseUrl)`, pass
`rateLimitStore: rateLimits.store`, and call `rateLimits.end()` once the app is closed. It takes
the database's address rather than your pool because it opens connections of its own, so that a
counter which cannot answer holds none of yours. Give it a logger as `log` to be told when it
stops answering and when it answers again (`ratelimit.unanswered`, `ratelimit.answering`); without
one it says nothing, as `createApp` without one keeps no log. Without the store, `createApp`
counts in the process, as every release before this did, and behind N replicas each limit allows
N times what it says. The table comes from `bootstrapSchema`, as the others do.

**A client may see a new answer.** `POST /auth/login` and `POST /model/complete` answer `503`
with `{ "code": "RATE_LIMIT_UNAVAILABLE", "message": … }` when the request could not be counted
against its limit within a second; nothing was checked and nothing was asked, and trying again is
the remedy. The admin says so. The public routes never answer it: while the count cannot be had,
they go through uncounted.

## A response is sent with the token its form was handed out with (Unreleased)

**Why you cannot skip this.** A response sent twice — the retry a dropped connection forces, a
replay — was stored twice, with two ids and two webhooks, and nothing told the copies from two
respondents. Now a response is stored under the id its token names, once
([0169](docs/decisions/0169-a-response-is-stored-once.md)), and an anonymous submission without
the token is refused.

**What changes for a client.** Read the token where you already read the schema hash:

```
GET /f/:path           ->  200 { version, schemaHash, schema, submissionToken }   (no-store)
POST /f/:path/drafts   ->  201 { draftId, token, submissionToken }
GET /f/:path/drafts/:id ->  200 { outcome: "resumed", …, submissionToken }
```

and send it back:

```
POST /f/:path/submissions   X-Formancy-Schema-Hash: <hash>
                            X-Formancy-Submission-Token: <submissionToken>
```

Send the draft's once a draft has started or been resumed, and the form's otherwise. Without the
header an anonymous submission is `400 submission_token_required`; with one this server did not
sign for that form, `400 submission_token_invalid` — read the form again for a new one; with one
whose response is stored, `409 submission_token_spent` and the stored `id`. A `409` is therefore
two things now: switch on `error`. A signed-in submitter or an API key may leave the header out.
Nothing in `@formancy/react` or `@formancy/angular` changes: they send nothing.

**Keep a cache off `GET /f/:path`.** The reply is per reading and says `Cache-Control:
no-store`. A cache that keeps it anyway hands one token to everybody behind it, and every response
after the first is refused as already sent.

**The database.** Nothing changes: the token's id is the submission's id, which was already the
primary key. Submissions stored before keep their ids, and no token names them.

**If you implement `Storage` yourself**, rather than using `@formancy/server`'s PostgreSQL one:

| Method | Does | Must |
|---|---|---|
| `insertSubmission(record, deliveries?, claimFileIds?, audit?)` | Now returns `true` when it stored, `false` when a submission with `record.id` is already stored | Decide that **atomically**, and when it is `false` write nothing at all — no delivery, no claim, no audit row. Two sends of one response both pass every check before it |
| `hasSubmission(id)` | Whether a submission with this id is stored | — |

The PostgreSQL storage inserts the submission first with `ON CONFLICT DO NOTHING` and looks at
what came back, as `spendChallenge` does; `createMemoryStorage` is a second implementation to read
beside yours. `ServerDeps.draftSecret` keeps its name and now signs the token as well as a
draft's key.

## A form's examples are kept beside it (Unreleased)

**The database.** The server adds a table, `form_examples`, on start with `CREATE TABLE IF NOT
EXISTS`, as it creates every table: one row per form, its primary key the form's id and a
foreign key to `forms`, holding the examples and the sample as `jsonb`. There is nothing to run
and nothing to backfill: a database from before it gains the table empty, and every form has no
examples, which is what it had
([0166](docs/decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)).
If you grant the application's role privileges table by table, it needs `SELECT`, `INSERT` and
`UPDATE` on `form_examples`: a write is an insert that replaces the form's row when there is one.

**If you implement `Storage` yourself**, rather than using `@formancy/server`'s PostgreSQL one,
add two methods. `ExamplesRecord` is `{ formId, scenarios, sample, updatedAt }`, `sample` being
null when none was kept.

| Method | Does | Must |
|---|---|---|
| `getExamples(formId)` | Returns the form's record, or `undefined` when none was ever kept | — |
| `keepExamples(record, audit?)` | Replaces the form's record whole, and appends `audit` | Write both in **one commit**, as `publishVersion` does, and refuse a record for a form that is not there |

Nothing in the port reads the examples: whether they are examples is `keepExamples` in
`@formancy/server-core`'s question, asked before your method is called. `createMemoryStorage` is
a second implementation to read beside yours, and `packages/server-core/src/examples.test.ts`
says what each rule prevents.

**A client may see more warnings.** A publish's `201` may now carry, in `warnings`, a sentence
for each of the form's examples that held against the version it had and does not hold against
the new one, and one naming anything kept with them that is not an example and so was not run.
It is the same list 0097 put there, so a client that shows it needs nothing new; a
pipeline that fails on any warning will now fail on these too. And the audit log has one more
action, `form.examples.changed`.

## A file is received by one request at a time (Unreleased)

**The database.** `files` gains a nullable `receiving_until timestamptz`, which the server adds
on start with `ADD COLUMN IF NOT EXISTS`, as it added the access and webhook-health columns
before it. There is nothing to run and nothing to backfill: null means nobody is receiving the file, which is true
of every row that exists when you upgrade. The `CHECK` on `state` is unchanged — still
`offered`, `stored`, `claimed`
([0153](docs/decisions/0153-a-file-is-received-by-one-request-at-a-time.md)).

**If you implement `Storage` yourself**, rather than using `@formancy/server`'s PostgreSQL one,
remove `updateFile` and implement three methods. Each must be **one atomic conditional write**
that returns whether it matched — the shape of `spendChallenge`, and for its reason: two
requests for one file both pass every check made before it, and only the storage can decide.

| Method | Writes | Only when |
|---|---|---|
| `leaseFile(id, nowIso, untilIso)` | `receivingUntil = untilIso` | the file is `offered`, and `receivingUntil` is null or not after `nowIso` |
| `settleFile(id, untilIso)` | `state = 'stored'`, `receivingUntil = null` | the file is `offered`, and `receivingUntil` equals `untilIso` |
| `releaseFile(id, untilIso)` | `receivingUntil = null` | `receivingUntil` equals `untilIso` |

`settleFile` writes the state and the lease and **never the submission**. A file's submission is
written only by `insertSubmission`'s claim; the write that ended an upload setting it is the
defect this change removes. `getFile` and `abandonedFiles` return `receivingUntil`, null when
nobody holds the file, and `insertFile` stores it. `createMemoryStorage` in
`@formancy/server-core` is a second implementation to read beside your own, and the
*receiving a file* cases in the repository's `packages/server-core/src/uploads.test.ts` say what
each condition prevents.

**A client may see a new answer.** `PUT /f/:path/files/:id` can reply
`409 { error: "busy", message }`: another request is receiving that file, or this one took
longer than the server holds a file for one request. Either way this upload was not accepted,
and sending the bytes again is the remedy. A client that shows the server's `message` when an upload fails, as the
admin's does, needs nothing new.

## Drafts need a token (0.2.0)

**Why you cannot skip this.** The previous draft routes let anybody read or
overwrite anybody's part-filled form: both were unauthenticated and the id came
from the caller. If you autosave drafts on a public form, treat any draft written
before this change as having been readable
([0062](docs/decisions/0062-a-draft-carries-its-own-key.md)).

**What changes.** Start a draft instead of inventing an id:

```
POST /f/:path/drafts   ->  201 { draftId, token }
```

Then send the token on both of the routes you already use:

```
PUT /f/:path/drafts/:draftId    X-Formancy-Draft-Token: <token>
GET /f/:path/drafts/:draftId    X-Formancy-Draft-Token: <token>
```

Without the header both answer **401**. With a token that does not match, the
`GET` answers **404** — the same as a draft that is not there, on purpose, so the
reply cannot be used to find out which ids exist — and the `PUT` answers **403**.

**Keep the token wherever you kept the id**, and keep it instead of the id rather
than as well: the id is no longer a secret and the token is the only way back into
the draft. Losing it loses the draft, and there is no recovery path, because a
recovery path that works for whoever asks is the hole again.

**Drafts written before the change cannot be resumed**, since no token was ever
minted for them. They are swept on the usual schedule.
