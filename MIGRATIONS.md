# Versioning and migration policy

## Two version lines, on purpose

**Package versions** (`@formancy/*`) move together as one number. Before 1.0,
breaking changes may land in minor releases; every one is documented here with
what changed, why, and how to move.

**The spec version** (`specVersion` inside every form document) is independent
of package versions, because it is the artifact with real switching costs:
your forms and your submissions are written against it. Packages 0.9 and 1.4
can both speak spec `"1"`.

## Spec version 5 is OPEN

Spec `"5"` is open as of 2026-10-27, and is the version this package writes: a new document
declares it, and `upgradeSpecVersion` moves an older one to it unchanged but for the version
line. **It is not frozen.** A document written against it today is a document of a version that
may still gain constructs; pin a reader to it knowing that, and freeze nothing on it until it
says FROZEN here ([0194](docs/decisions/0194-spec-5-opens-with-a-fields-description.md)).

It is a superset of version 4 and removes nothing. A reader pinned to spec 4 **refuses** a
version 5 document rather than ignoring the part it does not know, as at every version before
it ([0051](docs/decisions/0051-spec-2-adds-types.md)).

### What version 5 adds so far

- `description` on a field — help text under its question, read out with the control rather
  than as part of its name. Text, or a reference into the catalogue; on a group, a page or a
  repeater it describes the whole set. A version 4 document carrying one is refused, naming the
  property ([0194](docs/decisions/0194-spec-5-opens-with-a-fields-description.md)).
- `autocomplete` on a text, long text, number, date or choice field — the input purpose
  WCAG 1.3.5 asks a field about the person to say (`email`, `given-name`, `postal-code`), set on
  the control for a browser to fill. A closed list: the standard's purposes without the password
  and payment-card ones. A version 4 document carrying one is refused, naming the property
  ([0195](docs/decisions/0195-a-field-says-what-its-answer-is-for-autofill.md)).
- `placeholder` on a text, long text or number field — an example of the answer in the empty box,
  never instead of the label. Text, or a reference into the catalogue; on a masked field it
  replaces the drawn shape. A version 4 document carrying one is refused, naming the property
  ([0196](docs/decisions/0196-a-placeholder-is-an-example-never-the-label.md)).
- `default` on a text, long text, hidden, number, tick box, date, time, date and time or choice
  field — the answer a new form, a new row, or a field shown again after its hiding cleared it
  starts with, of the answer's own JSON type. Never applied to what is handed in. A document
  whose default its field would refuse is refused by the engine; a version 4 document carrying
  one is refused, naming the property ([0197](docs/decisions/0197-a-default-is-where-something-fresh-starts.md)).
- `message` on a `validate` rule — what the person reads while it fails, text or a reference into
  the catalogue, said for the rule's `code` in the form's language. Needs a `code`, which no other
  rule on the field may share when either has a message (`rule.codeShared`). A version 4 document
  carrying one is refused, naming the property ([0198](docs/decisions/0198-a-rule-says-its-own-message.md)).

## Spec version 4 is FROZEN

Spec `"4"` is frozen as of 2026-10-09, and first released with `0.4.0`. A document that
validates today will validate against every future release that speaks spec 4, save one that
keys a field or a matrix row `__proto__`, which no release could store an answer under
([0185](docs/decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)). Version 5,
opened by the next construct that needed one as 0140 said it would be, is open above
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
today will validate against every future release that speaks spec 3, save one that keys a field
`__proto__`
([0185](docs/decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)).

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
today will validate against every future release that speaks spec 2, save one that keys a field
`__proto__`
([0185](docs/decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)).

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
validate against every future release that speaks spec 1, save one that keys a field
`__proto__`
([0185](docs/decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)).

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

- Every spec version is frozen; the PACKAGES are not. Their APIs will still change
  before 1.0, and those changes are documented here.
- An asynchronous validator is not a property on a rule. It is `kind: "check"`, a rule kind
  in spec 3 that names a check the deployment answers
  ([0086](docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)), because a CEL
  expression is synchronous by construction.

## Every answer has the shape its type says (unreleased)

**If anything posts submissions to the server other than the shipped renderers, check what it
sends.** The engine checks every answer's shape first, in the browser and on the server's
replay, whether or not the field has a constraint, and refuses another shape as `type` with
`422` ([0189](docs/decisions/0189-every-answer-has-the-shape-its-type-says.md)). Every form
version is enforced from the next submission, without a republish.

- A number is a JSON number: `"3"` is refused for a `number` field.
- An unanswered number, date, time, choice or tick box is `null` or absent, never `""`: `""` is
  an answer only to a text field.
- An empty list is `[]` and an untouched matrix `{}`, never `null`.
- A group's value is an object, and so is the answer a rule hid but kept with
  `clearOnHide: false`, which is now checked for its shape though for nothing else.
- A value posted for a `static` field is dropped.
- A computed result that does not fit its field is no longer stored; a decimal into a number
  field is stored as the number it writes.

A prefill (`initialValue`) is held to the same: one that writes `""` for a date shows a `type`
error on it after a submit. Submissions already stored are not re-examined.

## An error is said, not coded (unreleased)

**If you wrote a conformance driver, or styled the error text, read this.** A field's error text
is now one sentence per code, each a `span` carrying `data-formancy-code`, where it was the codes
joined with commas ([0191](docs/decisions/0191-an-error-is-said-not-coded.md)). The codes are
unchanged in `submit()`, the API and every fixture.

- A driver that split the error text on `", "` reads each `[data-formancy-code]` instead, and
  the suite fails a message whose text is its own code.
- A theme that styled `[data-formancy-part="error"]` still matches it; the sentences inside
  are separated by a space.
- A host that reworded `errors.entry` and used `{codes}` still gets them; the shipped wording
  uses `{problems}`, the sentences.

## A radio group, a set of tick boxes and a signature carry the field's control id (0.7.0)

**If a test of yours finds a signature by the field's label**, it finds two elements now, and
Testing Library throws. The label always pointed at the control id, which nothing carried, so
`getByLabelText('Signature')` found only the drawing surface, by its `aria-label`; the box a name
is typed into carries the id now, so the label labels it too
([0186](docs/decisions/0186-a-fields-control-id-names-its-group-or-its-control.md)). Find each
by its role and its own name:

```ts
screen.getByRole('textbox', { name: 'Type your name' }) // the typed box, in English
screen.getByRole('img', { name: 'Signature' }) // the drawing surface, named by the field's label
```

**If you style or select the markup**: a radio group's and a set of tick boxes' fieldsets carry
the control id, in both renderers and in Material, and so does a signature's typed box. Every
option keeps its own, `<control id>:<value>`.

**If you move focus by `ids.control` yourself**, you now find an element for all three, but a
fieldset takes no focus: focus it, and where focus did not land, focus the first control inside,
as the renderers' `focusControl` does. That helper is not exported.

**If you draw a field through the registry**, put the id on your control, or on the group around
several; the React and Angular start pages say how. A component that draws it nowhere is a field
the error summary names and cannot take anybody to, as before.

Nothing is stored differently, no document changes and the spec version does not move.

## An answer is read as the value's own, and `__proto__` names none (0.7.0)

**If a form keys a field or a matrix row `__proto__`, republish it under another key.** No
release could store an answer under it: the engine wrote it into the object's prototype, and the
server's parser refuses a body that carries it. `validateSchema` now refuses it with
`key.unstorable`, so publishing such a document is a `422`. The engine refuses to open one with
a field so keyed — a version stored before answers its public read, and every submission to it
is a `500`, with a line at `error`, until it is republished ([0185](docs/decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)). One with a matrix row so valued
opens as it did, and takes no submission answering that row, which the parser refuses with a
`400`; a required one takes none at all. Their answers were never stored, so there is nothing
for `renamedFrom` to carry.

**If a form keys a field after a name every object has** — `constructor`, `toString`,
`valueOf`, `hasOwnProperty`, `isPrototypeOf` and the rest of `Object.prototype`'s — it is read
as the answer now, on the next submission, without a republish:

- a required one left empty is refused with `required`, where it was stored as answered;
- a rule reading it unanswered reads `null`, so a field a `visible` rule shows only for an answer
  stays hidden until there is one, where it was shown from the start;
- the export's cell for it is empty where nobody answered, not the source of a function;
- a draft renamed to it carries its answer across, which it did not.

**If a group, a repeater's row or a matrix holds a member keyed `constructor`**, a rule reading
it decides now. The expression library told a map by its `constructor`, so once that member was
answered every rule reading the object failed: a `validate` rule refused the submission and a
`visible` rule showed what it hides. Read again any submission refused for
such a rule, and any field shown that such a rule should have hidden. A map an expression writes
out itself still holds no `constructor`, `prototype` or `__proto__`.

**If a form keys a field `length`**, a list sent where its group or the whole submission should
be answers it no more: a required one is refused with `required`, where the list's length was
taken for the answer and the list was stored.

**If a form's messages are named after what every object has** — `toString`, `valueOf` — a
locale missing one reads the default's words, where the engine handed the renderer a function.
The builders' translation views still count such a message as translated in every locale.

**If your deployment supplies lists or checks**, a name the document gives is looked up among
the ones you configured, as the object's own members, and nothing else. A `select` sourced from
`constructor` is refused at publish where you configure sources, and its answers
`503 source_unavailable` at submission, where they were stored unchecked; a check named
`toString` answers `check_unavailable`. So hand them in as an object's own members: a list or a
check an object holds through its prototype — a getter or a method its class defines, a member
an `Object.create` inherits — is not found, and is refused as above. That is read from the code, not
measured.

**If you call the path model or read a value yourself**: `parsePath` and `formatPath` throw on
`__proto__`, and `getAt` reads only what a value holds as its own, a key only out of an object and
an index only out of a list, so `getAt({}, ['constructor'])` and `getAt([], ['length'])` are
`undefined`. `evaluate` reports `missing_variable` for a declared name the bag does not hold as
its own, `constructor` among them.

**If your builder speaks a language of its own**, `key.unstorable` is a new sentence of the
validator's. `SCHEMA_ERRORS_DE` and `SCHEMA_ERRORS_FR` say it. A catalogue of yours typed as
`SchemaErrorSentences`, which asks for every code, does not compile until it says it too; one
typed as `SchemaErrorWords`, which takes any subset, compiles and shows the English.

Nothing is stored differently, and the spec version does not move.

## A repeater is validated as a field is (0.6.0)

**If a published form says something about a repeater, read it again before you upgrade.** A
form version is immutable and the engine that reads it is not, so these are enforced on the next
submission, without a republish, in the browser and on the server
([0184](docs/decisions/0184-a-repeater-is-validated-as-a-field-is.md)):

- `maxItems` — more rows are refused with `maxItems`, and a draft saved with more rows is refused
  until it loses one. No add button is offered at the maximum.
- `required` on the repeater, or a `required` rule aimed at it — no rows are refused with
  `required`. A row is enough; what a row must hold is still said by the fields in it.
- A `validate` rule whose target is the repeater — it runs now, reading the form as a field's
  rule does, and refuses with its `code`, or `invalid` when it cannot be evaluated. **It has never
  run before**, so nothing has ever shown it to be right: one written wrong refuses every
  submission. Run it against the form's examples, or a submission you know is good.
- `minItems` — a short list is still topped up as the form opens, and a row cannot be removed
  below it. No remove button is offered at the minimum.

And two things that hid less than they said, now hide what they say: a field inside a group a
`visible` rule hides is not drawn and not validated, so a submission refused for a required one
there is accepted; and `clearOnHide: false` on a group or a repeater keeps its answers, where they
were cleared whatever it said.

**If you keep examples for a form** — in the admin, through `PUT /f/:path/examples`, or as
`check_scenarios` input: one that expects the form to be invalid lists every error, and a
repeater outside its bounds now has one at its own path. Add it, as
`"errors": { "items": ["maxItems"] }`; `errors` and `visible` may name a list now, and setting
one whole is still refused.

**If you add or remove rows yourself**, through `engine.addRow`, `removeRow`, `useRepeater` or
`injectRepeater`: past a bound they throw a `RangeError`. Ask first —

```ts
if (engine.canAddRow(['items'])) engine.addRow(['items'])
```

— or read `canAdd` and `canRemove` from `useRepeater` and `injectRepeater`.

**If you read the engine's errors by field**, from `validate`, `submit`, `visibleErrors` or
`firstInvalid`: a repeater's own path, `items`, appears beside its rows' — `{ items: ['maxItems'] }`
— and `getFieldSnapshot(['items'])` answers for it with `type: 'repeater'`.

**If you style or replace the repeater's markup**: its fieldset has the engine's `id` for it, a
`data-state` of `valid` or `invalid`, an `aria-describedby`, a `required-hint` when it is required
and a `data-formancy-part="error"` paragraph when it is invalid, between the rows and the add
button. The Angular renderer no longer tops the rows up to `minItems` in an effect; the engine
does it, when the form opens and when a repeater a rule hid is shown again.

Nothing is stored differently, no document changes and the spec version does not move.
## A deployment with no model says so in a 200 (0.6.0)

**A client may see a new answer.** `GET /model` on a server with no model answers `200` with
`{ "provider": null, "model": null }`, where it answered `404` with
`{ "error": "model_not_configured" }`. With a model it answers `{ "provider": …, "model": … }` as
before, and who may ask is unchanged
([0183](docs/decisions/0183-no-model-is-an-answer.md)).

**If a page of yours asks it** — to decide whether to draw the prompt pane — read the provider
rather than the status: a string is a model, `null` is none. Keep reading a `404` as none while
the page may meet a `0.5.0` server, which is the only release that answers it that way:

```ts
const response = await fetch('/api/model', { headers: { authorization: `Bearer ${session}` } })
const body = response.ok ? ((await response.json()) as { provider: string | null; model: string | null }) : undefined
const model = typeof body?.provider === 'string' && typeof body.model === 'string' ? body : undefined
```

The admin needs nothing: every release that has the route already reads the new answer as none.
`POST /model/complete` on a server with no model still answers `404` `model_not_configured`.
Nothing is stored differently.

## A source may answer a page (0.6.0)

**If you implement an options source, nothing has to change.** A list of rows is read exactly as
before, its true total included. To say that a list goes on without counting it, answer one page:
read one row more than `limit` and say whether you got it
([0177](docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).

```ts
resolve: async ({ kind, query, values, limit, signal }) => {
  if (kind === 'labels') return yourRowsByValue(values, { signal })
  const rows = await yourSearch(query, { limit: limit + 1, signal })
  return { options: rows.slice(0, limit), more: rows.length > limit }
}
```

A row you matched and cannot hand over — a value longer than the 200 characters a select can
store, say — is left out of `options` and counted in `withheld`. A page is read strictly: `more` is
required and a boolean, `withheld` a whole number of 0 or more, and any other key, a `total`
included, refuses the whole answer, which the field shows as a source that failed.

**If you call `resolve` yourself** — a test, or a source that wraps another — its answer is now a
list or a page, and code that treated it as an array does not compile. Narrow it with
`Array.isArray(answer) ? answer : answer.options`, or read it through `acceptRemoteAnswer` from
`@formancy/spec`, which refuses what the controls refuse.

**If you reworded the options words**, in `FormancyProvider`'s `words` or
`provideFormancy(engine, { words })`: a plain select no longer says `options.failed`,
`options.capped` or `options.tooShort`. It says `options.failedListed`, `options.cappedListed` and
`options.searchOnly`, and the new `options.moreListed`; a typeahead says the new `options.more`, and
either control `options.withheld`. Add your words for them; a language you added says them in
English until you do. `options.capped` and `options.tooShort` keep their ids and their parameters,
for the typeahead.

**If your source answers `labels` with nothing**, counting on a search to name what a field holds:
a field a rule disables no longer searches, so it shows the stored value itself. Answer `labels`
with the rows for the values asked.

Nothing is stored differently, no document changes and the spec version does not move.

## A computed field is the engine's (0.6.0)

**Only its rule writes a field a `computed` rule targets**
([0181](docs/decisions/0181-a-computed-value-is-the-engines.md)).

- **If you put a value into one** — `initialValue` as a prefill, or `setValue` — it is no longer
  kept. `setValue` on a computed field does nothing, and the field's value is taken out of the
  initial value before the first pass. It only ever stood while an input the rule reads was empty;
  as soon as the rule could be evaluated it was overwritten.
- **If you draw your own controls** through the registry or `useField` / `injectField`, the field
  snapshot has a new `readOnly`. Draw the field read-only when it is set, as the built-in controls
  do, or a person types into a box that keeps nothing. Code that builds a `FieldSnapshot` by hand,
  a test double say, does not compile until it sets `readOnly`.
- **What is stored changes in one case.** A submission whose computed field the server cannot
  compute, because an input it reads is missing, is stored without that field. Until now it was
  stored with whatever value was sent. A resumed draft in the same state shows the field empty
  rather than the value computed earlier.

No document changes, nothing stored is converted, and the spec version does not move.

## A NUL character is refused (0.5.0)

**A client may see new answers.**

- A request body with a NUL character, U+0000, in any string or any member's name is answered
  `400` with `{"error":"nul_character","pointer":"…","message":"…"}` before the route runs, where
  `pointer` is the JSON Pointer to where it sits
  ([0173](docs/decisions/0173-a-nul-character-names-nothing-and-a-body-with-one-is-refused.md)).
  Most such bodies were a `500`. Three were answered: a sign-in with one in its password (`401`,
  or a session for the user below), a model request with one in its text (`200`), and a submission
  with one only in an answer the form drops (`201`, stored without it). A management route answers
  it before it asks for a session, as it answers a body that does not parse.
- A NUL in an address — `%00` in a form's path, a draft's or a file's id — is answered as a name
  nothing has: `404 unknown_form` for a path, where it was a `500`.

**Users.** `POST /users` accepted a password with a NUL in it. Such a user cannot sign in now, and
nothing records which users they are: the password is stored as a hash. No route deletes a user
or changes a password, so their address stays taken.

**If you implement `Storage` yourself:** `getFormByPath`, `getDraft`, `getUserByEmail` and
`findApiKeysByPrefix` find nothing for a value no row could hold, rather than throwing, as
`getFile` does for an id.

**The database.** Nothing changes: no row ever held a NUL, since every write of one failed.

## A 5xx says nothing of what was thrown (0.5.0)

**A client may see new answers.**

- A 5xx the server did not answer on purpose is
  `{"statusCode":500,"error":"Internal Server Error","message":"Internal Server Error"}`: the
  status's name as both words, where `message` was the thrown error's own. A client that showed a
  5xx's `message` shows the status's name. A sign-in or a request to the model refused for want
  of a count keeps `"code": "RATE_LIMIT_UNAVAILABLE"`, and its `message` is now
  `Service Unavailable`. A 4xx is answered as before
  ([0172](docs/decisions/0172-a-5xx-says-nothing-of-what-was-thrown.md)).
- `GET` and `PUT /f/:path/files/:id` with an id that is not a uuid answer `404` with
  `{"error":"unknown_file"}`, a response naming such a file `422`, and
  `POST /deliveries/:id/replay` with one `404`, where each was a `500`.
- `PUT /f/:path/files/:id` is limited, thirty a minute per address, counted apart from the offers:
  past that it answers `429` with `Retry-After`. An uploader that resends a file's bytes in a loop
  meets it.

**If you implement `Storage` yourself**, rather than using `@formancy/server`'s PostgreSQL one:
`getFile` and `getDelivery` answer `undefined` for an id no row has, whatever its shape, rather
than throwing — the id arrives from a URL or a response, as anybody wrote it.

**The database.** Nothing changes.

## Every rate limit is counted in the database (0.5.0)

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

## A response is sent with the token its form was handed out with (0.5.0)

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

## A form's examples are kept beside it (0.5.0)

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

## A file is received by one request at a time (0.5.0)

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
