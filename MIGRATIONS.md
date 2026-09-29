# Versioning and migration policy

## Two version lines, on purpose

**Package versions** (`@formancy/*`) move together as one number. Before 1.0,
breaking changes may land in minor releases; every one is documented here with
what changed, why, and how to move.

**The spec version** (`specVersion` inside every form document) is independent
of package versions, because it is the artifact with real switching costs:
your forms and your submissions are written against it. Packages 0.9 and 1.4
can both speak spec `"1"`.

## Spec version 3 is OPEN

Spec `"3"` is the version this release writes, and it is **not frozen**: it is open until
a release freezes it, the way version 2 was open until `0.2.0`. A document may declare it
today and the constructs below will not change underneath it — what is not yet settled is
what else version 3 will contain before it closes.

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

One rule kind:

| Kind | What it does |
|---|---|
| `check` | Asks the deployment about an answer — whether this email is registered, whether this reference exists. It names a check rather than carrying an expression, and the deployment answers it |

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
cannot see the reader that would refuse it.

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
- `@formancy/cli migrate` rewrites documents from version N to N+1 — schemas
  are data, so the migrator is cheap to provide and it is the single strongest
  trust signal we can offer,
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
