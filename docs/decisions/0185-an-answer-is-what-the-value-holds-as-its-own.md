# 0185 — An answer is what the value holds as its own, and `__proto__` names none

- **Status:** accepted
- **Date:** 2026-10-19
- **Extends:** [0041](0041-repeater-row-identity.md), which reserved the first key, and
  narrows [0042](0042-freeze-the-spec.md)'s promise that a document valid today stays valid,
  for documents holding a key no release could store an answer under
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/own-properties.test.ts`: `getAt` reads nothing at
  `constructor`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf` and `__proto__` in a
  value that does not hold them, still reads what a value holds there, and reads no key out of a
  list — its own `length` among them — and no index out of an object; a required field keyed
  with each inherited name and left empty refused as `required`, and one keyed `length` refused
  where a list arrives for its group or for the whole submission; its snapshot holding no value;
  a visibility rule reading it unanswered reading null, so the field it hides stays hidden; a row
  holding a member keyed `constructor`, answered or not, read by its `validate`, `computed` and
  `visible` rules and by a rule reading the member, and a group holding an answered one read by a
  rule on its other member; a check named `constructor` or `toString` that the deployment does not
  have answered `check_unavailable`; `stripPaths` keeping the root's identity for a key the value
  does not hold; a member somebody put on `Object.prototype` or `Array.prototype` not spread into
  a group or a row a write creates, and not answering a required matrix's row; `formatPath` and
  `parsePath` refusing `__proto__` anywhere in a path and admitting `proto`, `_proto_`,
  `prototype` and `constructor`; and `createFormEngine` refusing a document holding a field keyed
  `__proto__`. Every case for a defect failed against the engine before the change, each for its
  reason; the cases that read what a value does hold are the controls, and passed before as
  after. Each change was then reverted on its own and caught: `write`'s object and array halves,
  the list rule, the strip, the bag, the checks, the matrix, and each refusal in the path model.
  `packages/expressions/src/own-members.test.ts`: a map holding its own `constructor`, bound as
  null or answered, read member by member, at any depth and in every row of a list, given back as
  the plain value it went in as, and charged a step for every member read out of it and every
  entry iterated; and a declared `constructor`, `toString` or `valueOf` the bag lacks reported as
  `missing_variable`. Each failed before but the control, a top-level variable so named, and the
  charge in `get` and the one in the entries were each reverted on its own and caught.
  `packages/spec/src/validate.test.ts`, *a key that can name no answer*: a field keyed
  `__proto__` at the top and inside a group, and a matrix row valued `__proto__`, refused at
  the key with `key.unstorable` — all three valid before; a field keyed `_id` refused with
  `key.reserved`, which 0041 said was pinned in this file and was not, watched failing with
  the check taken out, as was the row's; and six names an object inherits, accepted.
  `packages/spec/src/i18n.test.ts`, *a message id or a locale named after what every object
  has*: a translation a locale lacks falling back to the default, a locale with no catalogue of
  its own read as the default, and a default naming no catalogue resolving nothing — each failed
  before, and each of the three reads reverted on its own was caught.
  `packages/builder-core/src/rules-overview.test.ts`, *a field keyed after a name every object
  has*: a rule on the form and one in a row that read an unanswered `constructor` and
  `toString`, and a rule in a row with a member keyed `constructor` it does not read, decided as
  the engine decides them, where each was explained as undecided before.
  `packages/server-core/src/own-properties.test.ts`: the export's empty cell, a rename to
  `constructor` carried across at the top and inside a group, nothing set aside for a removed
  `toString`, a source named `constructor` refused at publish against a deployment that
  configures others and refused as unavailable at submission, and the walks that find a
  submission's sourced answers and its files reading no member somebody put on every object —
  each failed before, and each change reverted on its own was caught.
  `packages/server/src/own-properties.test.ts`, over HTTP: `422` with `required` to an anonymous
  `{}` for a required field keyed `constructor`, with nothing stored; `422 invalid_schema` with
  `key.unstorable` to a publish holding `__proto__`; and `422` with `required` to a group sent as
  a list, and to a whole submission sent as one, for a required field keyed `length` — each
  answered `201` against the code before the change. A good row of a repeater with a member keyed
  `constructor` is stored with `201`, which a first version of this change refused `422` by
  binding the member as null before the expression library was handed a `Map`. And the residuals,
  asserted so that closing them is deliberate: a version stored before with a field keyed
  `__proto__` answers its read `200` and every submission `500`, watched answering `201` with the
  path model's refusal taken out; one with a matrix row so valued opens, refuses half an answer
  `required`, and a body answering the row is refused `400` by the parser.

## Context

CodeQL reported two `js/remote-property-injection` alerts, 30 and 31, on the writes in
`packages/core/src/value.ts` at lines 41 and 47, opened on 2026-10-18 and open on the analysis
of `bd59450`, the 0.6.0 release. The flow it draws starts at the body of `POST /forms` and
reaches `setAt` through a published document's `computed` targets, which 17c7681 (#270) began
stripping from a value with `stripPaths`. The alerts are not prototype pollution, and the reasons were
checked on 2026-10-18 against the published 0.6.0 packages: `write` assigns into a fresh
object — a spread or a new array — so a `__proto__` segment replaces the prototype of a copy
nobody else holds, and `Object.prototype` had the same own names after every request; Fastify
refuses a body that carries `__proto__`, or an object under `constructor` with a `prototype`
member, with a `400`; and the paths come from the published document, never from a
submission.

Behind them was an older defect, in `getAt` since the commit that founded the path and value
model (5c8acef, 2026-09-19): a path was walked with `value[segment]`, which reads what every
object inherits as readily as what it holds. The spec's key pattern admits `constructor`,
`toString`, `valueOf`, `hasOwnProperty` and the rest, and only `_id` was refused. Measured on
2026-10-18 and 2026-10-19 against 0.6.0's code — the published packages for the required field
and `__proto__`, the release commit built from source for the rest:

- A required field keyed `constructor` and left empty counted as answered by `function
  Object`. An anonymous `POST` of `{}` was stored with `201`, where the same form keyed
  `contractor` was answered `422 required`.
- The renderer was handed `function Object` as that field's value, and a rule reading it could
  not be evaluated: a visibility rule that cannot be evaluated shows its field
  ([0022](0022-fail-open-fail-closed.md)), so a field meant to wait for `constructor == "yes"`
  was shown from the start. The builder's rule overview explained the same rule as undecided.
- The export printed `function Object() { [native code] }` in every row that left the field
  empty. A draft's declared rename to `constructor` was never applied, because the rename asked
  `key in data`, and every object answers `constructor`; a removed field keyed `toString` was set
  aside under `__orphaned` as `Function.prototype.toString`.
- A list or a check the deployment supplies is looked up by the name the document gives. A
  `select` sourced from `constructor` was published against a deployment that configures other
  sources, and its answers were stored unchecked: `function Object` was found as the source, and
  it has no `members`. A check named `toString` answered `"[object Undefined]"`, and one named
  `constructor` answered with the request it was handed.
- A group, a row or a matrix answer holding an answered `constructor` could not be read by any
  expression. `@marcbachmann/cel-js` 8.0.0 tells a map by `value.constructor`, so an object holding
  a member of its own by that name was `Unsupported type` to it, and every rule reading the object
  failed whatever member it asked for: a `validate` rule refused the submission, a `visible` rule
  showed what it hides, and a `computed` field was not written.
- A list holds a member of its own, `length`. A required field keyed `length` in a group was
  answered by a list sent in the group's place — `{ "address": [] }` was stored with `201` — and
  one at the top by a whole submission sent as a list, `[1, 2]` stored as the submission.
- A message id is a name the author chooses too. A French reader of a form whose message
  `toString` was written only in English was handed `Function.prototype.toString` as the label,
  where the English words are the fallback.
- `__proto__` is a key no object keeps. Written, it replaces the object's prototype: `setAt({
  name: 'Ann' }, ['__proto__'], 'typed answer')` gave `{ name: 'Ann' }`, and a computed
  `outer.__proto__.total` was shown on the snapshot and never stored. What a person typed into
  a field so keyed was dropped before it was sent, and a body that carried the key anyway — a
  matrix answer, which the renderers write with the row's value as a member — was refused by
  the server's parser with a `400`. Such a form was valid, published and filled in, and its
  answers went nowhere.

## Decision

**An answer is what the value holds as its own.** `getAt` reads a segment only where
`Object.hasOwn` says the value holds it, and a key only out of an object and an index only out
of a list, as `setAt` writes them; `setAt` recurses into the same; `stripPaths` asks
`Object.hasOwn` rather than `in`; the bag an expression is evaluated against, a matrix's rows
and every reader outside the engine that walked a value by a field's key — the export, a
draft's migration, the builder's rule overview, and the server's walks for a submission's
sourced answers and its files — read through `getAt` or `Object.hasOwn`. The deployment's
checks and lists are looked up among their own names, at publish and at submission, a
catalogue's messages among its own ids, and a declared variable among the names of the bag
`evaluate` is handed. And because the expression library tells a map by its `constructor`,
`@formancy/expressions` hands it an object holding a member of its own by that name as a `Map`,
the library's other map, every member read out of it charged a step as any read is. So every
other name an object inherits is a key like any other.

**`__proto__` names no answer.** `validateSchema` refuses it as a field's key and as a matrix
row's value, which is a key of the row's answer, under the code `key.unstorable`, at the key.
`UNSTORABLE_KEY` in `@formancy/spec` names it once, and the engine's path model reads it from
there: `parsePath` and `formatPath` refuse it as they refuse a key with a `.` in it, so an
engine handed a document no validator saw refuses to open rather than lose what a person
types.

**Refused although every version is frozen**, because the freeze promises that a document
which works keeps working, and no document holding this key ever did. That is the difference
from [0097](0097-a-publish-may-warn.md), which warned rather than refused because a rule
reading a path the model does not define still runs as written.

## Consequences

**What it buys.** A required field is answered by an answer, whatever the author called it,
in the browser and in the server's replay alike ([0006](0006-one-engine-build.md)); the export
and a resumed draft say what was given and nothing else; a deployment's list or check is one it
configured; a rule reads a group or a row whatever its members are called. A key that cannot
hold an answer is refused where the author writes it, in their language, rather than found by
the person whose answers it lost. And the alerts can be judged against tests that fail, rather
than against prose.

**What it costs.** A form version published before this change with a field keyed
`__proto__` is still stored, and is now refused by the engine whenever it is opened. Its
public read answers `200`, `createFormEngine` throws for it in the browser as on the server, and
every submission is answered `500` with a line at `error`, where before it was stored without
that one answer — the read and the submission held by a test that puts such a version straight
into the in-memory storage. That is fail-closed on purpose: the alternative is a form that keeps
losing an answer without a word. The operator republishes it without the key; nothing finds such
versions for them, and an operator who wants to know searches their stored documents for the key.

A stored version with a matrix row valued `__proto__` is not refused, because nothing is lost
in it without a word: a row's value is a key of the answer and not a path, the engine reads
that key as the answer's own, and Fastify's parser refuses a body answering the row with a
`400`. So it opens; a required one takes no submission, refused `required` without the row
and `400` with it, and an optional one takes every submission that leaves the row alone, which
refusing to open it would refuse as well. A test asserts it.

A document that validated under every frozen version no longer does, which is what
[0042](0042-freeze-the-spec.md) said would not happen. A reader older than this change
still accepts it, and a host that validates with an older `@formancy/spec` and opens the
engine from a newer `@formancy/core` gets the engine's refusal rather than the validator's
message.

Every read of an answer pays an `Object.hasOwn` and an `Array.isArray` per segment, and the
store reads every subscribed field on every keystroke. Measured with the engine's
`bench/perf.mjs` on 2026-10-19, alternately against the engine before and after, seven runs
each on one Windows machine with Node 24 and other sessions running: a keystroke over 5,000
subscribed fields went from 0.32–0.38 ms to 0.49–0.60 ms, and to 0.91 ms in one run of the
seven after, against a budget of 1 ms. Every object an expression reads is asked whether it
holds a `constructor`, and one that does is copied into a `Map` once per evaluation; that cost
is not measured, since no benchmark here evaluates an expression. The engine's bundle grew
0.3 kB and the spec's barrel 0.3 kB, of which about 0.1 kB each is code and the rest the JSDoc
the bundler keeps ([§9.3](../architecture/09-quality-requirements.md)).

**What it does not do.** A group keyed `constructor` holding a field keyed `prototype` —
or a matrix keyed `constructor` with a row valued `prototype` — is still valid, and the server's
parser refuses any body that answers it with a `400`, measured on 2026-10-19; the spec does not
refuse the pair, because the limit is one server's parser and not the format's. The renderers
still look up a host's option sources with `sources[name]`, so a field sourced from `constructor`
in a browser whose host supplies none by that name fails as a source that cannot answer, rather
than as one that is missing. The builders' translation views read a catalogue by id as they
did: `missingMessages` does not list a message `toString` that French lacks, because the
French catalogue answers `toString` as every object does — measured on 2026-10-19 — though a
person filling the form in French reads the English. A map an expression builds holds no
`constructor`, `prototype` or `__proto__`, because the library leaves those keys out of a
literal as a defence of its own: `{"constructor": 1}` evaluates to `{}`. A submission's
members that the form does not define are kept as they were, `toString` among them; no record
decides that either way. And nothing says a submission is an object: one sent as a list is
answered `422` only where a required field asks it something, and `[1, 2]` was stored with
`201` for a form with none, measured on 2026-10-19. Whether CodeQL still reports the two
alerts after this change can only be seen on the next analysis of `main`.

## Alternatives considered

**Dismiss the alerts as false positives, and change nothing.** Rejected: the write they point
at is harmless, but the read beside it was the defect, and dismissing the alert would have
left a required field answered by `function Object`.

**Store answers in a `Map`, or in objects with no prototype**, as CodeQL's help suggests.
Rejected: a submission is JSON, read by the renderers, the server, the export, the webhook and
every host, as plain objects; one created with `Object.create(null)` stops being one the moment
it is serialised and parsed again, and every reader would still have to read it as its own.
The guard belongs where the value is read.

**Leave a row's member keyed `constructor` unbound**, as 0.6.0 did by reading it through
inheritance, so the library still sees a plain object. Rejected: a rule reading that member
then fails as one reading a key nobody declared, and a row or a group whose `constructor` was
answered still failed every rule on it. The library's limit is met where the library is called,
once, rather than in each place that builds a value for it.

**Refuse every name `Object.prototype` has**, `constructor` and `toString` with `__proto__`.
Rejected: once an answer is read as the value's own, each of them works — an answer under
`constructor` was always stored as given — so refusing them would make documents of a frozen
version invalid for nothing they did wrong.

**Make `__proto__` work**, writing it with `Object.defineProperty` and reading it as its own.
Rejected: it would work only in a reader as careful as this one. `Object.assign` and every
assignment invoke the setter, and the server's parser refuses the key at the door — as a
defence against exactly this, which it should keep.

**Warn at publish, as 0097 does for a path no field provides.** Rejected: a warning lets a form
be published whose answers to that field are lost on every submission. 0097 warns because the
document works as written, and this one cannot.

**Refuse it in the validator only, and leave the path model alone.** Rejected: the engine opens
documents no validator has seen — a host's own, a stored version older than the refusal — and
would go on dropping what was typed into that field. The path model is the one translation
point between a key and a value, which is where a name that cannot round-trip is already
refused.
