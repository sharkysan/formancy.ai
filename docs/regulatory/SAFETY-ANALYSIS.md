# Software failure mode analysis

What this software can do wrong, how each failure could arise, and what in the
design constrains it.

**This is not a risk management file.** It assigns no severity, no probability
and no acceptability, because those are properties of a device in a use
context, not of a component. A failure that is an inconvenience in a newsletter
sign-up may be significant in a clinical intake form, and only the manufacturer
knows which. Read [`MDR-CONTEXT.md`](MDR-CONTEXT.md) for the boundary.

It is written to be usable as an **input** to an ISO 14971 analysis: each entry
names a software failure mode precisely enough that a manufacturer can trace it
to a hazardous situation in their own device.

## How to read the table

**Constraint** names what in the repository prevents or limits the failure, and
is a claim you can check. **Residual** says what is still possible, stated
plainly. Where a constraint is a design decision, it links to the record that
explains why it exists.

---

## A — Wrong data is accepted

### A1. A submission is accepted that violates the form's own rules

*How it arises:* a client is modified, or a request is made directly to the
API, bypassing browser-side validation entirely.

*Constraint:* the server rebuilds the engine from the exact version the client
declared and revalidates every rule
([0030](../decisions/0030-never-trust-client-state.md)). Client validation is
treated as a user-experience feature and never as a check. Verified by an
integration test that posts directly to the API.

*Residual:* a rule the form author did not write is not enforced by anything.
The software validates what it was told to validate.

### A2. Client and server disagree about whether a submission is valid

*How it arises:* the classic split-implementation defect — two codebases
implementing the same rules, drifting apart over time.

*Constraint:* structurally prevented rather than tested against. The *same
compiled engine* runs in the browser and on the server
([0006](../decisions/0006-one-engine-build.md)), and it reads no ambient clock
or random source, so a replay is byte-identical
([0019](../decisions/0019-injected-capabilities.md)). An engine constructed
without a capability source throws rather than falling back to `Date.now()`.

*Residual:* none known today, because every validator runs in both places —
the `runsOn` property that would let an author mark a rule client-only is
designed but **not in the spec**. When it lands, a rule marked
`runsOn: 'client'` will by definition not be enforced on the server, and that
will need to be understood by whoever authors rules.

### A3. A calculated value is supplied by the client rather than computed

*How it arises:* a computed field's value is attacker-controlled in the request
body like any other field.

*Constraint:* every `computedValue` is recomputed on the server and whatever
arrived is overwritten, not merged
([0030](../decisions/0030-never-trust-client-state.md)). What is stored is the
canonical result, not the request body.

*Residual:* none known for computed fields. A field that is *not* declared
computed is stored as sent, which is correct behaviour and not a defect.

### A4. Data is smuggled into a branch of the form the person could not see

*How it arises:* a client sends values for fields that a visibility rule hid.

*Constraint:* the server evaluates visibility from its own context and strips
values under server-hidden subtrees
([0013](../decisions/0013-hidden-field-semantics.md)). Verified by an
integration test that posts a value in a hidden branch and asserts it is absent
from the stored row.

*Residual:* none known.

### A5. An expression fails at runtime and the failure is interpreted as a pass

*How it arises:* an expression type-checks at save time but throws when
evaluated — a null where an object was expected, or an exhausted budget.

*Constraint:* deliberate and asymmetric. Metadata expressions fail **open**;
validation expressions fail **closed**
([0022](../decisions/0022-fail-open-fail-closed.md)). A validation rule that
throws rejects the submission rather than accepting it. Verified by tests that
drive a real runtime failure through all four rule kinds, and confirmed by
inverting each branch and watching them fail.

Worth noting for an assessor: those tests did not exist until writing the
decision record revealed that nothing enforced the split. That is the process
described in [`LIFECYCLE.md`](LIFECYCLE.md) working as intended, and it is also
a reason to read the **Verified by** field on every record rather than assuming
a stated behaviour is covered.

*Residual:* **a form whose visibility rules are failing looks as though it is
working, and shows more fields than intended.** This is the most
consequential residual risk in this document. Since 2026-10-09 an author can see it
before publishing: the builders' rules overview, given a preview's answers, marks a rule
that cannot be decided and says that its field is shown because of it — tested to agree
with the engine ([0128](../decisions/0128-a-form-says-why-a-field-is-hidden.md)). A rule on
a field in a repeater row had no verdict there until it was given one per row, evaluated
with the row bound as the engine binds it and tested to agree with the engine row by row
([0147](../decisions/0147-a-rule-in-a-repeater-row-is-explained-row-by-row.md)); before that,
such a rule failing in every row could not be found this way. That is a way to find one,
not a guarantee that one is found. In a context where a hidden field
must stay hidden for reasons other than tidiness, a manufacturer should not
rely on `visible` expressions alone.

*And the condition most likely to be failing is one written defensively.* An
unanswered field is `null`, and so is an unopened group, so `!needsVisa` errors
(CEL has no `!` for null) and `address.country == "CH"` errors (the group is
null, so reading a member of it fails). The obvious repair,
`address.country != null && address.country == "CH"`, **errors identically** —
it has to read the path in order to compare it. Only `has(address.country)`
answers. Both of the failing shapes shipped in this project's own demonstration
form and were found by evaluating it rather than reading it; a manufacturer
writing visibility rules should expect the same and test for presence rather
than against null. Measured and held by
`apps/docs/src/empty-answer-guards.test.ts`, which parses the table in the user
documentation and evaluates every row.

*And the builder wrote those shapes itself, until 2026-10-09.* Its condition editor
compiled "City is Bern" on a field inside a group to `address.city == "Bern"` and "Age is
more than 18" to `age > 18.0` — the second throws on an empty number, since CEL has no
`>` between null and a double. A `visible` rule written in the builder on either kind of
field showed its target on every form nobody had touched. Measured before the fix: the
target of a builder-written rule on a group child was visible on an empty form. The
editor now asks first — `has()` before reading into a group, `!= null` before ordering or
searching a value, and a length for a list, which the checker will not compare with null
— and `condition-draft.test.ts` runs each comparison it builds against an empty form in
the engine ([0127](../decisions/0127-a-condition-nests-one-level.md)). **Rules written by
an earlier builder keep their expression**, since the CEL is the stored truth and nothing
recompiles it; they are corrected only when written again, and the table above is how to
recognise one.

*And a repeater row presents an empty answer differently from the top level.* Measured
2026-10-09: a fresh row has every key, null until answered — so an untouched list there is
null, where at the top level it is `[]`. The compiler's list shape, a length or `in` with
no null test, is right at the top level and threw in a row; `compileCondition` already
accepted a row path and is exported, so a `visible` rule it wrote on a list in a row showed
its field on every new row. It now tests `!= null` first in a row. The user documentation
had the opposite advice — `has()` "for a path inside a group or a row" — and `has()` is
always true in a row. Both are corrected, and `apps/docs/src/empty-answer-guards.test.ts`
evaluates the row cases of the guide's table and asks the engine whether a fresh row is
presented as that table assumes ([0129](../decisions/0129-a-row-rule-is-written-in-the-row.md)).

### A6. A presentation hint changes what the field collects

*How it arises:* a widget replaces a control with one that can express more than the
field can store. The concrete case is `widget: "typeahead"`, where the control is an
editable text box over a `select`: the obvious handling of "somebody leaves the field
with `ital` typed in it" is to keep the text, and the submission then carries a string
no offered option produced, which every reader downstream will treat as an answer.

*Constraint:* the rule is stated as a format rule — a widget may change how a field
looks and may not change what it collects
([0065](../decisions/0065-a-widget-is-authored-not-registered.md)) — and it is made
structural in the controls rather than remembered: in both renderers the typeahead
reaches `setValue` from two places, with an option's own value or with `null`
([0072](../decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)). Each
renderer's widget test asserts a submission byte-identical to the default control's,
and asserts that typing, Escape, and leaving with an unmatched query store nothing.

*And the same constraint made structural in the ENGINE, which is the half that was
missing.* Until [0076](../decisions/0076-an-answer-is-one-of-the-options.md) the
guarantee was a property of the controls only: measured against the built engine, a
`select` offering CH and DE accepted `XX`, a `radio` offering only `red` accepted
`plaid`, and `validate()` returned `{"valid":true,"errors":{}}` — while this format's
own schema documented "The answer is still one of the options offered". `modelViolations`
now refuses a value no option offers, with the code `option`, in the one function the
browser and the server both run.

*An input mask is the case where a control is meant to store less than it shows*
([0125](../decisions/0125-a-mask-stores-what-was-typed.md)): the brackets and spaces are
drawn, not stored. What keeps that from becoming this hazard is that the control's text is
always rendered *from* the stored answer — `formatMasked` after every edit, written to the
control by both renderers — so a character that was refused, cut off or not stored is not on
screen either; and the engine refuses, with `mask`, an answer that does not fill the mask,
so a payload carrying the formatted text is not stored as an answer. Held by both
renderers' `masked-text` tests and the `masked-answer` conformance fixture, which fails in
both without the engine's check.

*A picture on an option is presentation, and is refused where it would be inert*
([0126](../decisions/0126-an-option-may-carry-a-picture.md)): the answer is still the
option's value, and a dropdown or a tag picker, which cannot show a picture, is a document
the validator refuses rather than one that validates and shows nothing.

*Residual:* the engine checks a value against the options **the document carries**. A
field that carries none has nothing to be outside of, by design — it is the seam remote
options will need. And a component supplied through `registry.byType` or
`registry.byPath` renders in the same slot and can still store whatever the engine
accepts for every other kind of field; nothing in the renderers constrains a consumer's
own component, and the engine validates the value rather than its provenance. **An
answer stored before a mask was added**, and not fitting it, is shown position by position
and refused by the engine; the first keystroke in that control drops the characters no
position takes. An author adding a mask to a field with stored drafts should expect those
answers to need retyping — which is why `diffSchemas` reports adding one as lossy.

---

### A7. An answer is accepted that the list it came from does not offer

*How it arises:* `optionsSource` lets a `select` name a list the deployment resolves
rather than carrying its answers in the document
([0077](../decisions/0077-options-may-come-from-a-named-source.md)). The legal set is
then **not in the frozen document**, so the check A6 relies on has nothing to compare
against — deliberately, because a list living outside the document cannot be checked
against the document.

*Constraint:* the server asks the deployment. `ServerDeps.optionsSources[name].members`
is given the submitted values and returns the ones it does not offer; a non-member is
refused with the same `option` code a document option produces, after the engine has run
and **before anything is written**. At publish time a document naming a source the
deployment has never configured is refused outright, so a form cannot be frozen with a
list nobody can resolve. A source that throws fails the submission **closed** — 503 and
retryable — because an accepted bogus value is undetectable afterwards while a refusal
leaves the draft holding the answers.

*Residual, and it is the point of the hazard rather than a footnote:*

- **`members` is optional.** A deployment may declare a source and not supply one, which
  means *this source exists and I cannot check membership*. Then nothing checks, and the
  stored value is whatever was sent.
- **Membership NOW, never membership THEN.** A value legal when it was chosen can be
  refused minutes later; there is no re-offer path, because a published version is frozen
  and `staleVersionPolicy` does not negotiate.
- **A stored answer cannot be re-judged.** `schemaHash` no longer determines what a valid
  answer was for such a field, so an auditor cannot reconstruct the legal set of the day.
- **The answer may stop being readable.** A document with `options` carries value→label
  forever in an immutable record; a source is under no such obligation, and recording the
  label would change what the field collects.

A manufacturer incorporating formancy should treat `optionsSource` as an explicit,
per-field weakening of A6's guarantee — greppable in every published version, and named in
the `form.published` audit row's `optionsSources` detail, sorted and once each — rather
than as an equivalent alternative to a listed `select`. That detail was claimed here before
it existed: the record held the version and the hash and nothing else, so an operator told
to compare a form's lists against their configuration had nowhere to read them. It is now
written, and asserted in `packages/server-core/src/use-cases.test.ts` both ways round — a
form naming sources records them, a form naming none records no such field.

### A8. One response is stored twice

*How it arises:* the answer to a submission never reaches the page — a dropped connection, a
proxy that timed out, a phone that changed networks before the `201` arrived — and the page,
or the person, sends it again. Or a request is replayed as it was sent. Until the change below,
each copy was stored: without `FORMANCY_CHALLENGE_SECRET` an exact replay was accepted as often
as the rate limit allowed; with it, a retry asked for a fresh challenge, solved it and was
accepted, since a challenge proves work per attempt and cannot say two attempts are one
response; and a signed-in submitter is never asked to solve one. Every copy is a
submission with its own id, audit row and webhook. A delivery's event id lets a receiver drop
a delivery it got twice; nothing let anybody tell a response sent twice from two people who
gave the same answers — two intake records, two orders, two appointments.

*Constraint:* **a response is stored once, under the id it was handed with its form**
([0169](../decisions/0169-a-response-is-stored-once.md)). `GET /f/:path` hands out a token,
new on every reading, naming that id and signed for that form with `FORMANCY_AUTH_SECRET`; a
draft hands out one naming the draft, the same on every resume. An anonymous submission without
it is refused, `400 submission_token_required`; one the server did not sign for that form is
`400 submission_token_invalid`. The id is the submission's primary key: the insert is written
first, with `ON CONFLICT DO NOTHING`, and when it conflicts nothing else is written — no
delivery, no claim, no audit row — and the send is answered `409 submission_token_spent` with
the stored id. A lookup before the replay gives a second send that answer rather than "unknown
file" for the attachments the first one claimed. A refused attempt spends nothing. Held by
`packages/server-core/src/submitting.test.ts` and, on real PostgreSQL, by *a response is stored
once* in `packages/server/src/server.integration.test.ts` — including two sends held at the
insert until both are there, which a plain insert answers with a `500` (observed) — and by
`apps/admin/src/fill-pane.test.tsx`, *sending the response*, for the one browser client in the
repository: it sends the draft's token once it has one, and once the response is stored — a
`201`, or a `409 submission_token_spent` — forgets the draft and lets no save that was still
waiting or still starting its draft leave one behind (each watched failing). The token does not
expire, which the server-core cases hold by sending, a month on, the tokens a form and a draft
handed out — watched failing under a seven-day expiry that every other case passed.

*Residual:* **a signed-in client that sends no token is stored as often as it sends**, as
before: an integration posting with an API key was handed no form, and is not asked for one. **A
new reading is a new response**: a host that reads the form again for every attempt, or a
person who reloads a page that kept no draft and sends again, makes a second response, and
nothing here can tell it from a second person. **A page holds two tokens once a draft starts**,
and a host that keeps sending the form's has a duplicate back through the reload that resumes
the draft — the documentation says to send the draft's, and the admin does; nothing makes a
host. **A draft can outlive its response** in a host that keeps the draft's key after the
response is stored, or lets a debounced save fire after the send: the first resumes a finished
draft whose every send is refused, the second starts a new draft holding the stored answers and
sends its unspent token on the next visit — the duplicate again. The documentation says to
forget the draft on a `201` and on `409 submission_token_spent` and to drop the pending save,
and the admin does; nothing makes a host. And the token is not an anti-automation measure: a
script reads the form for one like anybody else (C1's residual, and 0059's reasoning).

---

## B — Correct data is lost or altered

### B1. Answers are orphaned when a field is renamed

*How it arises:* a form author changes a field's key, and every answer already
filed under the old key becomes unreachable.

*Constraint:* keys are immutable identity, separate from labels, and a rename
must be **declared** with `renamedFrom`
([0011](../decisions/0011-declared-renames.md)). A declaration whose old key
still exists elsewhere in the form is refused, because that is a copy rather
than a rename.

*Residual:* an author who deletes a field and creates a new one with a
different key has not renamed anything, and the software cannot tell the
difference from intent. Publishing reports this as a lossy change.

### B1a. Logic is orphaned when a field is renamed, and nothing reports it

*How it arises:* a form author renames a field, or unwraps a group so the fields
inside it move up a level. A rule's `target`, its `cel` condition and the
metadata the visual editor reopens from each name a data path, and a path left
behind names a field that no longer exists.

This is **B1 seen from the other side**, and the quieter of the two. An orphaned
*answer* is detectable — the data is there under a key nothing reads. An orphaned
*condition* is not: the engine types an unknown leaf as `dyn`, so the rule still
compiles and still publishes, and `postcode == "8000"` becomes `null == "8000"`,
which is `false` for the life of the version. A conditionally visible field is
then simply never shown, and nothing at authoring time, publish time or run time
says so.

*Constraint:* a path rewrite moves all three
([0093](../decisions/0093-a-rule-follows-the-path-it-reads.md)). The condition is
rewritten by splicing the spans the CEL parser reports, never by matching source,
so a field whose name is a prefix of another's is untouched and a field name
inside a string literal is left as the data it is. A rewrite that cannot be made
safely — an unparseable condition, or a new name a comprehension would capture —
**refuses the whole command** and names the rule, rather than applying half of it.
The rewrite is verified by comparing what the result reads against what the input
read with the rename applied, so a splice that lost, invented or captured a
reference is refused rather than written.

*Constraint, for a document the builder did not write:* publishing **reports** a
rule reading a path the model does not define, as a warning on a successful
publish ([0097](../decisions/0097-a-publish-may-warn.md)). The depth matters and
was measured rather than assumed:

| What the rule reads | At publish |
| --- | --- |
| an unknown **root** — `gone == "8000"` | **refused**, `invalid_logic` |
| an unknown member of a group — `address.nope` | published, **warned** |
| an unknown member of a row — `item.nope` | published, **warned** |

The root is refused because the engine compiles each rule against declarations
for the fields that exist. The other two type-check, because a member of a `map`
is `dyn`, and they are the cases a rename inside a group leaves behind — inside a
group the data path and the builder's tree path differ.

*Residual, and a manufacturer should read it as the main one here:* **a warning is
not a refusal.** A document with such a rule is published, and the rule evaluates
to nothing for the life of that immutable version. Refusing is not available: it
would make documents that are valid today invalid tomorrow, and what a reader
accepts is the frozen version contract. A manufacturer whose process requires that
such a document never reach production must **treat the publish warnings as a
gate** in their own pipeline — the API returns them on the `201`, so this is
mechanisable, but nothing in formancy does it for them.

There is also no *detection* pass over documents already published this way, and
the warning is computed from the document rather than from the stored version, so
a form published before this existed is not revisited.

### B1b. A reused piece of a form arrives with logic reading the wrong fields

*How it arises:* an author saves a group as a block and inserts it into another form, or
into the same one again ([0135](../decisions/0135-a-block-is-a-field-with-its-rules.md)).
Its rules name fields by path, from where it was saved. Copied as they are, a rule reading
`address.country` reads nothing once the group is called `address2`; and a rule reading a
field **outside** the block — `region` — reads whatever the new form happens to call
`region`, which may be a different question entirely. The first is B1a; the second is worse,
because the condition still evaluates, against the wrong answer.

*Constraint:* a block carries only the rules that are about a field inside it **and** read
nothing outside it; the rest are left behind, counted, and the count is said when the block is
saved. A carried rule is re-rooted to where the block lands and renamed with any key that had
to change, through the same rewrite as B1a — so a rewrite that cannot be made safely refuses
the insert rather than applying half of it. Keys the form already uses are renamed, and so is
a word id the form already uses for other words, so a label never silently takes the form's
words. A block with rules is refused inside a repeater row, where they would apply to every
row, and the builders offer only places where the insert validates. The insert is one edit,
undone in one step. Tested in `packages/builder-core/src/blocks.test.ts`, and end to end by
`apps/playground/src/blocks.test.tsx`, which inserts the playground's address block into a
form that already has every one of its keys and checks the canton is still shown only for
Switzerland.

*Residual:* **a rule left behind is gone from the copy.** A field that was required on a
condition reading outside the block arrives never required by it; the builder says how many
rules stayed behind at save time, and nothing says it again at insert time. Carried rules are
carried as written, so a condition that failed open where it was saved fails open where it
lands (see A5). And a block is a copy: a correction made to a block reaches no form that
already used it.

### B2. A saved draft loses answers when the form changes underneath it

*How it arises:* a form is republished while somebody has a draft in progress.

*Constraint:* drafts migrate lazily on resume, driven by the severity that
`diffSchemas` reports
([0027](../decisions/0027-lazy-draft-migration.md)). Answers belonging to
removed fields move to `data.__orphaned` and are **never deleted**. A breaking
change leaves the draft read-only against its original version rather than
guessing.

*Constraint, added later:* **the person is told.** The migration report the
server returns was not shown anywhere, so somebody resumed a draft, found some
answers no longer on the form, and submitted believing everything they had typed
was in it. The answers were never lost from storage — they were lost from view,
with no notice. Both renderers now ship a `resume-notice` component that names
what was set aside, says the answers are still kept, and takes focus so it is not
missed on a form somebody has scrolled.

*Residual:* orphaned data persists indefinitely, which is a data-retention
question a deployment must answer. And **a library cannot make a host render the
notice**: resuming a draft is the host's call, because the host holds the
transport. The component exists and is documented, and showing it is the
deployment's responsibility. That is weaker than a guarantee, and this sentence
is the honest version of it — the earlier residual mentioned only retention,
which read as though the person being told was already handled.

### B3. A published form version changes after submissions were bound to it

*How it arises:* a maintenance script, a migration, or a console session
updates a `form_versions` row.

*Constraint:* enforced by a **database trigger**, not by application code, so
it holds on every path into the database including ones nobody anticipated
([0025](../decisions/0025-immutability-in-the-database.md)). The submission's
foreign key uses `ON DELETE RESTRICT`, so the version cannot be deleted while
submissions reference it.

*Residual:* a superuser can drop the trigger. Database administration is
outside this software's control.

### B4. A schema is altered without detection

*How it arises:* the stored schema and the submission that references it are
tampered with together.

*Constraint:* a submission stores both the foreign key and a sha256 over the
canonical serialisation ([0026](../decisions/0026-bind-by-fk-and-hash.md)).
Canonicalisation **throws** rather than silently dropping undefined, NaN or
Infinity, because a dropped field would let two different schemas share one
hash — defeating the purpose of having one
([0010](../decisions/0010-canonical-hash.md)).

*Residual:* the hash detects alteration; it does not prevent it, and nothing
checks it on a schedule. A manufacturer wanting continuous integrity monitoring
must add it.

### B5. Exported data is altered by the spreadsheet that opens it

*How it arises:* a value beginning with `=`, `+`, `-` or `@` is interpreted as
a formula when a CSV export is opened.

*Constraint:* such string values are prefixed with an apostrophe on export,
type-aware so that a numeric `-5` stays `-5`
([0032](../decisions/0032-csv-formula-neutralisation.md)). Found by an
adversarial review, not during implementation.

*Residual:* an exported string that legitimately begins with `=` carries a
leading apostrophe.

---

### B6. A control destroys an answer already given

*How it arises:* a control that tracks a gesture across several events holds state between
them, and an event that means "the gesture is over" can arrive when there is no gesture. The
signature surface ended a stroke on `pointerup` **and** on `pointerleave` — the second
because a pen that crosses the edge with the button down never sends `pointerup` to that
element, so without it the next press would extend a stroke from minutes earlier. With
nothing in progress the handler fell through to restoring the strokes recorded before the
last one, which with one stroke drawn is nothing. Measured in the built playground: one
stroke on screen after the button came up, none once the mouse left the box, and the stored
answer back to `null`.

*Severity:* the answer was given, was on screen, and was then removed by a movement nobody
would connect to it. Worse than a control that refuses input, which at least prompts a
second attempt: here the person signed, saw the mark, moved their hand, and the form is as
it was. On a consent or a declaration that is the answer the whole document exists to
collect. It reached both renderers identically, so a deployment on either was affected.

*Constraint:* the handler returns when no stroke is in progress, in
`packages/react/src/form.tsx` and `packages/angular/src/fields.ts`. Held by
`signature.test.tsx` and `new-types.test.ts` — the sequence a person performs, which is
draw, lift, and move away — with the two behaviours the fix must not take with it asserted
beside it: a pen leaving mid-stroke still ends that stroke, and a tap that never moved still
counts as not having signed. Observed failing in both renderers before the change.

*Residual, and it is the general one:* **every case that existed used the one sequence that
could not show it.** Down, move, up, assert — which is the gesture as a developer describes
it rather than as a hand performs it. Nothing gates against that: the conformance fixtures
speak filling in and clicking by accessible name and cannot say "draw", so pointer
behaviour is held by hand in each renderer, twice over, and a gesture whose tail nobody
thought of is a gesture nobody tested. This one was found by a person using the playground.

### B7. An attachment is recorded against the wrong row of a repeater

*How it arises:* a file field inside a repeater row, and the row moves while one of its
files is uploading. A row that moves remounts its controls in both renderers, and the field
wrote the finished file to the position it had held when the file was picked. Measured
2026-10-09 in the React binding, before the change: an expense claim with a taxi row and a
hotel row, the taxi row moved down while its receipt uploaded, and the taxi receipt was
recorded on the hotel row. The Angular binding's code captured the path the same way; that
was read, not run. The first version of the fix, which kept the uploads with the control, was
measured too: the move cancelled the upload with the control, and nothing was attached
anywhere.

*Severity:* the submission is valid and wrong. Every answer is present and every file is a
real file; one of them is evidence for a different line than the one it is attached to, and
nothing about the submission says so. Of the two first-version outcomes, the silent loss is
the less bad, and it is still a file somebody believes they attached.

*Constraint:* uploads belong to the form, not to the control, found by the row's identity
rather than its position; a finished file is written to its own row wherever that row now
is, and to none if the row was removed. A cancelled upload is not recorded even when the
uploader completes it, and its bytes are left to the collector
([0055](../decisions/0055-files-are-claimed.md),
[0130](../decisions/0130-each-file-is-its-own-upload.md)). Held by
`packages/core/src/uploads.test.ts` and by a case in each renderer's `file-upload.test`
that moves the row mid-upload and asserts where the file landed, observed failing in the
React binding before the change.

*Residual:* an upload whose row was removed runs to its end; its result is dropped and its
bytes collected, but the transfer is not stopped. And an uploader that ignores the cancel
signal goes on sending: the field does not record the file, the bytes still reach storage,
and storage keeps them until the collector runs.

---

### B8. A ranking stores an order the person did not choose

*How it arises:* a `ranking` field (spec 4) stores an order of options. If it began in the
options' written order, a person who never touched it would submit the author's order as
their own preference, and the submission could not be told apart from one where they agreed
with it. A payload posted at the endpoint could also carry an order no control produces — one
option twice, an option the form does not offer
([0138](../decisions/0138-a-ranking-stores-the-order-chosen.md)).

*Constraint:* a ranking starts **empty**, and `required` is satisfied only by something
ranked. The engine refuses a repeated value (`duplicate`), a value not offered (`option`) and
a non-list (`type`) in client and server mode alike, and the document refuses two options
sharing a value. Tested in `packages/core/src/ranking.test.ts` in both modes, and in both
renderers by the conformance fixture for rankings.

*Residual:* **a partial ranking is an answer.** Without `minItems`, a person who ranks one of
five options has answered, and nothing distinguishes "the other four do not matter" from
"stopped halfway". A form that needs a complete order must set `minItems` to the number of
options; the builder says so in the property's description, and nothing enforces it.

### B9. A matrix is accepted with a row nobody answered

*How it arises:* a `matrix` field (spec 4) asks one question per row and stores the column
chosen under each row answered. If "required" meant "something answered", a required matrix of
ten rows with one answered would be accepted as complete, and the nine missing answers would
look like nine rows the person had no view on
([0139](../decisions/0139-a-matrix-answers-one-question-per-row.md)). A rule reading one row of
an untouched matrix would also fail to evaluate if the answer were null, and a visibility rule
that fails shows the field it was meant to hide (A5).

*Constraint:* a required matrix is answered only when **every** row is, in client and server
mode; a row the matrix does not have, a column it does not offer and anything but a map of
strings are refused. An untouched matrix is `{}` to a rule, so `has(rating.taste)` answers
false rather than erroring. Tested in `packages/core/src/matrix.test.ts`, in both renderers by
the conformance fixture for matrices, and in the playground starter's scenarios, where a row
left blank is refused.

*Residual:* **an optional matrix may be answered in part**, and its stored answer does not say
whether a missing row was skipped or overlooked. The condition editor's "is answered" means
*any* row is; a rule that needs every row is written in CEL. A radio cannot be unticked, so a
row answered by mistake stays answered unless the author offers a column for "does not apply".

### B10. An accepted submission's attachment changes or is collected

*How it arises:* two requests send the bytes of one offered file. The clients this repository
supplies do not: the file field's **Try again** runs the host's uploader again, and the
admin's — the only uploader here that sends to the server — offers the file anew before every
`PUT`, so a second attempt is a second file with its own id (`packages/core/src/uploads.ts`,
`apps/admin/src/api.ts`). Two `PUT`s for one file come from a proxy or HTTP library retrying
the request, which HTTP allows because it calls `PUT` idempotent; from an integrator's
uploader that sends the bytes again without offering again; or from whoever holds the file's
id, on purpose, since the `PUT` asks for the form's path and the id and nothing else. How
often any of these happens is not known. Before 0153, the request that finished last wrote
back the row it had read before its write — and, with a scanner, before its scan: `stored`,
with no submission. If the faster request's file had been claimed by a submission in between,
the slower one put the claimed row back to `stored` with no submission and wrote its bytes
over the ones the submission was accepted with, and the collector deletes an unclaimed file
after a day. Reproduced on real PostgreSQL with a scanner double holding the first request
open — the row read `stored`, its submission was null, and the store held the slower request's
bytes — and, with no scanner, with the first request's write held open instead. The releases
this affects are in [`SOUP-DECLARATION.md`](SOUP-DECLARATION.md).

*Severity:* the submission was accepted with an attachment, then carried a different one, then
none, and nothing in the submission records either change. It still names the file; the file is
gone when somebody asks for it. On evidence attached to a claim or a declaration, that is the
answer the form existed to collect.

*Constraint:* one request at a time receives a file's bytes. It takes a lease on the row with a
conditional update, a second request is refused as `busy` before its bytes are scanned, the
lease is checked again before the write, and the row is settled by a conditional update that
sets the state and clears the lease — never the submission — and only while the file is
`offered` and the lease is still that request's, so a request receiving bytes cannot write a
claimed row
([0153](../decisions/0153-a-file-is-received-by-one-request-at-a-time.md)). Held by
`server.integration.test.ts` on real PostgreSQL — the sequence above observed failing before
the change, the same with no scanner and the write held open, two leases taken at once and
every condition of the settle — and by `uploads.test.ts` against the in-memory storage, one
condition at a time.

*Residual:* **a lease bounds when a write may start, not how long it takes.** A request whose
scan and write together outlast its two minutes can write its bytes after the request that took
over, under the same key. Its settle is refused, so the row stays claimed by the right submission,
but the store can hold the late request's bytes — scanned, and the size offered. **The supplied
adapters do not rule this out.** The object store abandons a `PUT` after 30 seconds, as a whole,
but the clamd adapter's 30 seconds are an idle timeout, restarted by any traffic on the
connection: it abandons a clamd that has gone quiet, not a scan that is still moving, so
nothing bounds how long a scan takes (`clamd-scanner.test.ts` holds it to that, so the
statement fails if the adapter changes). A scan that ends just inside the two minutes followed
by a write that crosses them reaches this residual with the supplied clamd adapter and object
store alone; so can a deployment's own scanner or store, or a stalled disk under the directory
store. **Nothing tells it apart** from any other `409` on that route — the request log (C3)
records the status, not which refusal it was — and a test asserts the residual so that closing
it is deliberate.



### C1. An account's existence is disclosed by a failed login

*Constraint:* `authenticateLocal` verifies against a decoy hash when no user
exists, so both paths do the same work and return the same error
([0031](../decisions/0031-enumeration-resistant-login.md)).

Login is limited to 10 attempts per IP per minute and submission to 30, both
counting attempts rather than successes, and every limit is counted in the
database the replicas share, so it is the limit it says however many replicas
answer. While that count cannot be had within a second, a login is **refused**
with a `503` rather than admitted uncounted: guessing is what this limit is for
([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)).
`shared-rate-limits.integration.test.ts` holds the login limit shared by two
replicas on real PostgreSQL, and `rate-limit-store.test.ts` the refusal.

*Residual:* a distributed attacker with many addresses is not meaningfully
slowed by either limit. An embedding that calls `createApp` without the shared
store counts per process, as every deployment did before 0170, so behind N
replicas it permits N times what it says. The refusal that keeps guessing
limited while the count cannot be had also keeps everybody else out: nobody can
sign in then, and anonymous load that slows the database is enough (D19).
The address counted is the socket's unless `FORMANCY_TRUST_PROXY` names a proxy
(D14), and anything at a trusted address can write whichever client address it
likes — so trusting an address the operator does not control hands that
attacker as many addresses as they care to type. A compose network's range is
such an address: it holds the gateway Docker forwards published-port
connections from.

### C2. A submission is read by someone not entitled to it

*Constraint:* one table-driven `can(actor, action, resource)` function; the
management plane requires authentication and the public plane is separate. A
form is **private until opened**, and an origin allowlist — when set — is
matched exactly, with a missing `Origin` header refused
([0044](../decisions/0044-access-outside-the-document.md)).

*Residual:* **v0.1 has no multi-tenancy**. Authorisation is per-user and
per-form, and there is no tenant boundary. A deployment serving more than one
organisation must provide that boundary itself.

### C3. Submission content is written to logs

*How it arises:* a request log is where a body, a query string, a header or an error's
message lands by default, and each of those can carry an answer, a credential or a file's
name. A database error's message is the failing query followed by its parameters.

*Constraint:* **the server keeps a log, and a line is built from a list of fields**
([0168](../decisions/0168-the-log-is-built-from-a-list-of-fields.md)). `@formancy/server`'s
process writes a JSON line to standard output for every request — its method, its route as the
route table writes it (`/f/:path/drafts/:draftId`, never the path that was asked for), its
status, how long it took and its request id, at `error` when the status is a 5xx — and one for
every error that answered a request, naming what was thrown by its class and its code, never by
its message or its stack. Every request includes the ones Fastify answers past its own request
line: a URL it cannot decode and an over-long path parameter, refused before routing; a request
arriving while the server closes, refused with a `503` and written with only its id and status;
and a request whose client left before its answer was sent, written as `request.abandoned` with
no status. Every audit row a request writes carries its request id, the rows a publish, a
change of examples and a submission write inside their own transaction included. Anything else
a route or a background worker writes is an event from a fixed list. A line is made from the
listed fields only, each kept only when its value is of that field's kind, and the words of a
call are never written; so a body, a query string, a header (`Authorization`, a cookie, the API
key, the challenge, a draft's key, a response's token), a file's name, an answer, a password or
an email has no field to go in. The three background workers' failures go through the same rule, and so do the
database's notices. On by default at `info`; `FORMANCY_LOG_LEVEL` takes pino's level names or
`off`, and anything else stops the server at startup. `createApp` given no log keeps none, so a
host embedding it decides, and the libraries still write nothing
([0115](../decisions/0115-a-library-writes-nothing-to-its-hosts-console.md)).

Held by `packages/server/src/server.integration.test.ts`, *what reaches the log*, on real
PostgreSQL: every route family is driven — a login that fails and one that works, a user, an
API key used to publish, a draft written and read, an upload, a challenge, a submission sent
with its draft's token, its listing, export and file, a form's examples, a model that answers `401` — with values planted
in what each request sends, and a body that does not parse, a path no route has, a URL the
router cannot decode, a parameter too long for it and a database error whose message quotes a
planted id. What must not be logged is derived from what the requests carried and what the
server handed back, and none of it is in the log, which has a line for every request; and every
audit row of the swept form names a request with a line, the three written inside a
transaction on the routes that wrote them. The sweep was watched failing three ways: a body on
the request line, an error's message written, and the raw path written for the route — and
then twice more, with the refusals before routing left to Fastify, and with the routes not
passing the request's id to the use-cases. `server-log.test.ts` holds the line and each part of
the rule, a route's own 5xx at `error`, the `503` while closing and a client that left, the
last two over a real socket; `server-core`'s `audit.test.ts` holds the three use-cases to the
request id they are given; the three workers' tests plant a parameter in a failed pass and find
a line without it; the scanned-upload cases find no scanner address in the log;
`log-settings.test.ts` holds the setting's refusals.

*Corrected 2026-10-10.* This entry said **there is no request log**, which held until this
change: the integration test that asserted the logger was off is replaced by the sweep above.
The correction below listed six places the process wrote to its standard streams and missed a
seventh — postgres.js printing each notice the database sent, as a whole object, to standard
output, several on every start — found by running the server for this change; notices now go to
the log by their code. What the process still writes outside the rule: a few fixed sentences at
startup — that it is listening, which model it asks, that it generated an ephemeral
`FORMANCY_AUTH_SECRET` — and an error that stops it, which Node prints as it prints any: a
setting refused at startup, `DATABASE_URL` missing, a database it cannot reach at start. Those
carry configuration rather than anything a request sent.

*Corrected 2026-10-09.* This entry said the server emitted "no output of any kind". The process
wrote to its own standard streams in six places: refusing to start without `DATABASE_URL`,
warning that it generated an ephemeral `FORMANCY_AUTH_SECRET`, the line saying it is listening,
and an error from each of three background workers — the outbox, the file collector and the
challenge sweeper — when a pass failed. **Those three printed whatever was thrown, unredacted**,
and a Drizzle query error carries the failing query's text and its parameters in its message.

*Corrected 2026-09-28.* This entry previously said "structured logging with configurable
PII redaction; submission `data` is not logged by default". **Neither half was true:**
`logger: false` has been there since the server was written, and nothing in this repository
redacts anything — the word `redact` appears in no source file. The characterisation
described a design that was planned and never built, which is the failure this document's
own preamble warns about, found by review rather than by a gate. The guard above is the
gate it lacked.

*Residual:* **an error says what was thrown, not where or why.** A fault in a route is a line
naming its class on its route with a `500`; finding the line of code means reproducing it. A
database error keeps its SQLSTATE. A model provider's and a scanner's own words go nowhere, so
the log says the provider answered `401` or that clamd could not be asked, and not why. **The
log cannot say which form**: the route is the pattern, so every form's submissions are one
route; the audit log, which records a subject, is where a form is named. An error's class and
code are what the thrown error calls itself, kept only in an identifier's shape: a dependency
that put an answer in its error's code, in capitals and digits, would have it written, and the
sweep catches that on the routes it drives and no further. **A `500` still tells its client what
was thrown**: Fastify's default error reply carries the error's message — for a database error,
the query and its parameters — to whoever made the request (`server.integration.test.ts`
asserts a disk's `ENOSPC` reaching the client), which this change does not touch. **Two kinds of
line say less than the rest:** a request refused while the server closes is refused before it is
routed, and its line has no method and no route; one whose client left has no status, because
its answer was never sent. At `warn` and above neither a 4xx nor a client that left is written.
An exception nothing catches is printed by Node, message and stack, outside the rule. And a deployment that
forwards standard output somewhere sends it every line above: at `info`, one per request, a
draft's every save included.

### C4. Arbitrary script executes in the page

*How it arises:* the usual route in this product category is a library that
evaluates user-authored logic with `new Function`, which forces a relaxed
Content-Security-Policy on every page that embeds it.

*Constraint:* no `eval` and no dynamic function construction anywhere
([0040](../decisions/0040-no-eval.md)). CEL is interpreted over its own AST and
the schema validator is generated ahead of time as a committed artefact, asserted in
`packages/spec/src/csp.test.ts`. The result is that formancy runs under a strict CSP with
no configuration.

**"No configuration" covers `style-src` too, and it did not until 2026-09-28.**
`@formancy/angular` carried one component style — `:host { display: contents }` — which
Angular emits as a `<style>` element injected at runtime and `style-src 'self'` blocks
without a nonce. A nonce is configuration, and what the blocked declaration undid was the
grid layout of a whole renderer, silently
([0079](../decisions/0079-a-host-is-undone-without-a-stylesheet.md)). It is now set through
CSSOM, which no directive governs, and two guards hold it: the Angular layout test asserts
that no injected `<style>` says so while the host still computes `display: contents`, and
`apps/docs/src/themes.test.ts` asserts that no package below the component kit ships CSS in
a file **or in a decorator** — the wording the rule lacked, which is why the exception went
unnoticed.

Nothing else needs a directive: the renderers set styles through framework bindings, which
are CSSOM; a `qrcode` node is inline SVG built element by element rather than a `data:` URL,
so `img-src 'self'` suffices; a file's thumbnail is drawn on a canvas from its bytes rather
than loaded from a `blob:` URL, so it needs no `img-src` at all
([0130](../decisions/0130-each-file-is-its-own-upload.md)); and there is no worker, no font and
no outbound request the library makes on its own.

*Residual:* renderers emit the application's own markup. A consuming
application that injects unsanitised HTML into a form is outside this boundary. The
directives above are reasoned from what the code emits and asserted where a test can see
it; **no browser in this repository has been served a strict CSP and observed**, because
nothing here renders the Angular bindings in a browser at all ([§11](../architecture/11-risks-and-debt.md)).
A manufacturer shipping under a policy should verify it against their own page.

### C5. A part-filled form is read or altered by a stranger

*How it arises:* the public plane is anonymous, so a draft has no account behind
it. It was addressed by an id the **caller** supplied, on two routes with no
ownership check, no rate limit and no origin check — so knowing or guessing an
id was enough to read a stranger's part-filled answers, and to overwrite them.
Guessing was not hard, because a client that numbered its ids made every other
draft on that deployment readable.

The altering half is the worse one. The person resumes what they believe is their
own form, does not re-read the fields they had already filled in, and submits the
substituted content **under their own name**. Nothing in the submission, the
audit log or the draft records that the content was not theirs.

*Constraint:* the server picks the draft id and signs it, and both routes require
the signature ([0062](../decisions/0062-a-draft-carries-its-own-key.md)). HMAC
over form and id, verified before the write and before the lookup, compared in
constant time. A wrong token is answered exactly like a draft that is not there,
so the reply cannot be used to discover which ids exist.

*Residual:* **the token does not expire.** A leaked one is good until the draft
is swept, which is a weaker bound than an expiry. And this hazard was absent from
this document until the code was fixed — C2 covers a *submission* read by
somebody not entitled to it, and a draft is not a submission and took a different
route. An analysis that misses a live hole is a worse artefact than the code was,
and the omission is recorded here rather than quietly filled in.

Both draft routes are rate-limited on the same terms as the submission route,
keyed by IP. That was a second residual when this hazard was first written up and
is no longer one: a draft write is a database row per request and reachable
without an account, and the limiter was only ever pointed at submissions because
they used to be the only unauthenticated write. Like every limit on the public
plane they are counted in the database the replicas share, and **admitted
uncounted** while that count cannot be had within a second — so while the counter
fails, guessing at a draft's token is not limited at all, and the HMAC is what
holds ([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md);
`rate-limit-store.test.ts` holds every public limit to it).

### C6. Opening a form tells a third party who opened it

*How it arises:* an option may carry a picture
([0126](../decisions/0126-an-option-may-carry-a-picture.md)), and a picture at an
address on another site is fetched when the form renders — before the person has
answered anything, and whether or not they go on. The fetch carries their network
address and browser to whoever serves the picture. A form about a health condition
with a picture hosted elsewhere tells that host that this address opened it.

*Severity:* a disclosure of the fact of opening, not of any answer. Small for most
forms and not small for some, and invisible to the person filling it in.

*Constraint:* the format allows the two kinds of address that tell nobody — a path on
the site that shows the form, and the picture carried in the document as a
`data:image/` address — beside `https://` ones, and the schema's own description of
the field says what an address on another site does, which is where the builder's
property panel and the reference documentation both read it. Plain `http://` is
refused. Held by `option-image.test.ts`; the playground's own pictures are carried in
the document.

The playground on formancy.ai is the one page this project serves that renders documents
somebody else wrote — a visitor's, or a model's — so since 2026-10-09 it sets for itself a
policy of the kind recommended below: `img-src 'self' data: blob:; connect-src 'self'`. A document
naming a picture on another host shows a broken picture there instead of telling that host
who opened it. And formancy.ai's pages take their faces and the playground's editor from the
site itself, not from a font service or a CDN. Both are held by `pnpm test:browser`, which
opens one of each kind of page the site serves with every request to another origin aborted
and named, and asks Chromium, from inside the playground, to fetch a picture and open a
connection on another host: watched failing on `main` against Google Fonts and jsDelivr, and
with the playground's policy taken out of the built page
([0154](../decisions/0154-the-website-makes-no-request-to-any-other-site.md)).

*Residual:* nothing stops an author choosing a third-party address, and nothing tells
the person filling the form in that one was chosen. A deployment that must not disclose
it should refuse such documents at publish, which formancy does not do for it, or set
an `img-src` policy that names only itself. The playground's policy is the playground's:
the renderers ship none, and a form on a host's page is held to whatever policy the host
sets. The gate sees the pages it opens in the states it drives them to, and no others.

### C7. A file carrying malware is stored, and handed to whoever opens it

*How it arises:* an attachment is accepted on its declared type and size, stored, and later
downloaded by somebody reading the submissions — the person the file was always aimed at.

*Constraint:* files are served only to an authenticated reader, as attachments, with
`nosniff` and a sandboxing policy, so a file cannot act on the page that serves it
([0055](../decisions/0055-files-are-claimed.md)). Since 2026-10-09 a deployment may also have
every upload scanned before its bytes are kept, refused on a finding **and when the scanner
cannot be asked** — a refused file is never stored and cannot be claimed
([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)). Held by
`packages/server-core/src/uploads.test.ts` (fail closed), the clamd adapter's tests against
a protocol stand-in, and `server.integration.test.ts` on real PostgreSQL; removing the scan
from the route fails all four integration cases.

*Residual:* **without a configured scanner nothing is scanned**, and that is the default. With
ClamAV, detection is only as good as its signatures and their freshness, which are the
operator's; files stored before scanning was configured are not rescanned; and ClamAV's own
configuration says content past its `MaxFileSize` or `MaxScanSize` is answered clean unless
`AlertExceedsMax` is set, which this product documents and cannot enforce. The adapter was run
against a real clamd once, by hand, on 2026-10-09; no gate does.

### C8. A form leaves for a model provider

*How it arises:* a deployment configures a model for its builders
([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md)), and every
request a builder makes of it is sent on by the server to the provider the operator named:
Anthropic, OpenAI or xAI. Writing or changing a form sends the whole document, its rules
included. Translating sends the messages a language is missing, where the form uses each and
the translations into that language it already has. Drafting examples sends the form's title,
its fields with their labels and options, the error codes the engine reports and those the
form's rules name, the answers examples start from, the names of the examples already kept
and what the author said. Neither of the last two sends a rule. A form's own content can say
a good deal — the conditions a clinical intake form asks about, its options, a sample answer
somebody typed — and it leaves the deployment.

*Severity:* a disclosure of the form, to a company the operator chose, under that company's
terms. Not of a submission: no request is built from one.

*Constraint:* **off unless the operator sets all three variables**, and refused at startup
when only part of it is set, so no deployment sends a form anywhere by default or by half a
configuration (`model-settings.test.ts`; `compose.test.ts` holds both compose files to no
model without the `.env.example` block, and to the model it names with it). The server sends
to exactly one host per provider, named in the adapter, and not to wherever an ambient
`ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL` points; nor does it send an organisation or project
from the environment to xAI, or `ANTHROPIC_AUTH_TOKEN` beside the key, and an SDK's log level
set to `debug` in the environment does not write the form to the console
(`anthropic-completer.test.ts`, `openai-completer.test.ts`, `completers.test.ts`). Headers
the provider's SDK would add from `ANTHROPIC_CUSTOM_HEADERS` or `OPENAI_CUSTOM_HEADERS`
stop the server at startup (`model-settings.test.ts`). OpenAI and xAI are asked with `store: false`. The browser sends the
request only to its own server, never to a provider: the key is not in the page
(`apps/admin`'s `server-model.test.tsx`, *sends a turn to this server alone*). The admin says
which provider and model a request goes to, above the prompt pane, the scenario pane and the
Translations tab, before anybody asks (*is drawn when the server has one, and says where a
request goes*; for drafting, `examples.test.tsx`, *asks the server's model for the scenarios
kind*, which also holds that every request the page makes goes to its own server). The sample a
deployment keeps for a form's examples (0166) goes with every drafting request; it is meant to
be fictional, and nothing checks that it is. The
requests are built from the document alone — what each carries is held by `translate.test.ts`
and `scenario-prompt.test.ts` (D15, D16), and by `relay.test.ts`, which runs all three
([0167](../decisions/0167-the-relay-says-what-each-request-carries.md)). Every request is
audited, without its text (C9).

*Residual:* **what the provider does with the form is the provider's.** `store: false` is a
request to OpenAI and xAI; Anthropic's retention, and anything any provider keeps for abuse
monitoring, is under its own terms and invisible from here. The instruction is free text,
and a person can paste anything into it, a submission included; nothing reads it for that.
The admin's line naming the provider is English, as the admin is. A deployment that must not
let forms leave should not configure a model — or should wait for a base URL of its own
choosing, which 0165 defers. A host that writes its own `AskModel` sends what it decides; this
entry covers the admin and the server's route.

### C9. A cost is run up on the operator's key by somebody allowed to ask

*How it arises:* every request to the configured model is paid for by the operator, and
every editor's and admin's session — and every API key with one of those roles — may make one.
A person holding one can ask again and again, send the largest body the route takes, or use
the route for something other than a form: the briefing is pinned, the user part is theirs.

*Severity:* money, and the provider's rate limit for everybody else on the same key. No form
or submission is affected.

*Constraint:* the route takes `form.publish`, so a viewer is refused (403) and nobody without
a session reaches it (401); **the briefing is the server's**, so the endpoint answers the
three requests formancy makes and never a system part from the request, and an unknown kind is
refused before anything is asked; a body cap of its own, before the body is parsed, sized to
the requests about the largest form the server publishes and no more; ten requests a minute
per session, counted once the session is known, so one editor cannot spend another's budget,
and counted in the database the replicas share — refused with a `503`, and nothing asked, while
that count cannot be had, because the route needs no database and admitting it then would make an
outage an unlimited spend ([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md));
an answer of at most 64,000 tokens; and a browser that goes away stops the provider writing —
the route tells the adapter when the response closes before it was written, and the adapter
aborts the call; one that went while its session or API key was being checked is told at
once, and nothing is sent. Every request asked is recorded as
`model.asked` in the audit log, with who, the kind, the provider and model, the length of what
was sent, how it ended and the provider's status when it failed — never the text.
`model-route.test.ts` holds each of these through `createApp`, both disconnects over a real
socket; `model.test.ts` holds the pinning in the use-case; `shared-rate-limits.integration.test.ts`
holds the limit shared by two replicas on real PostgreSQL, and `rate-limit-store.test.ts` the
refusal while it cannot be counted.

*Residual:* **within those bounds a session can still spend**, and an API key can spend around
the clock. Under formancy's briefing, a person can still ask the model for something else and
read the answer; the endpoint is narrowed, not closed. There is no spending cap: the provider's own is the
backstop, and the audit log is how an operator finds out who used it. A host whose own
`AskModel` calls its own endpoint carries none of this.

---

## D — The form cannot be completed

### D1. Logic loops and the form never settles

*Constraint:* dependencies are extracted statically from each expression's AST
and the graph is cycle-checked **at save time**
([0018](../decisions/0018-static-dependencies.md)). A form that can loop is
never persisted. This is only possible because CEL's AST yields exact
references ([0016](../decisions/0016-cel.md)), and it converts a runtime hazard
into an authoring-time message.

*Residual:* none for cycles. Expressions cannot reference runtime-computed
paths at all, which is the price.

### D2. An expression consumes unbounded time or memory

*Constraint:* CEL is non-Turing-complete, so termination is guaranteed by
construction. The facade adds structural limits on AST size and depth, and
per-expression and per-submission wall-clock budgets
([0017](../decisions/0017-expression-facade.md)). An adversarial review of this
package found an unmetered `split()` — a small expression that could allocate
without bound — and it was fixed.

*Residual:* a pathological form can still be slow within its budget.

### D3. A form author's regular expression hangs the server

*Constraint:* every `pattern` is analysed with `recheck` at publish time and a
vulnerable one is refused, naming the field, the pattern and the complexity
([0045](../decisions/0045-reject-backtracking-patterns.md)). It has to be
caught there: a JavaScript regular expression cannot be timed out once it has
started matching. The check found a polynomial case in formancy's own built-in
email format on its first run, which is now fixed and pinned by a timing test.

*Residual:* a pattern recheck reports as `unknown` is accepted, deliberately —
refusing on an undecided analysis would make publishing depend on an analysis
timeout. Patterns stored before this gate existed were never analysed, so a
deployment carrying older forms should republish them.

### D4. A control cannot be reached by assistive technology

*Constraint:* the engine owns element ids and ARIA composition, so wiring is a
property of the architecture rather than of each renderer
([0021](../decisions/0021-engine-owns-aria.md)); and the conformance drivers may
resolve elements **only** by role and accessible name, so a renderer whose
markup is not navigable fails the test suite
([0034](../decisions/0034-accessible-name-only.md)).

*Residual:* automated checking is a floor. **No manual screen-reader audit has
been performed.** See [`SOUP-DECLARATION.md`](SOUP-DECLARATION.md).

*And a design system's controls are held to the same evidence.* The Angular Material adapter
runs the shared conformance fixtures through the same driver, axe included, with its registry
provided ([0132](../decisions/0132-material-draws-what-it-has-an-equivalent-for.md)). Writing it
found two ways a design system's control loses what the engine owns: Material's input never
showed an error without Angular forms, and an error summary's link did nothing when the
engine's id was on a component's host — both fixed, both held by tests. One divergence is kept
and said: Material does not mark an empty required field `aria-invalid`.

### D4a. A form is laid out differently by the two renderers, and nothing reports it

*How it arises:* the renderers emit their own markup on purpose, and a consumer's
stylesheet acts on it. A difference that changes no role, no accessible name and no
value therefore changes no test result — while changing what a person can see. Two
have occurred and both were found by somebody opening a page rather than by a gate.
A two-column table layout produced **one** column in Angular from the day it
shipped, because the layout component recurses and its host element was the grid's
only item ([0073](../decisions/0073-a-host-element-is-not-a-layout.md)); and the
typeahead popup opened over its own label and box, because an absolutely positioned
child of a grid container takes the container's origin and not its place in the flow
([0072](../decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)).

A third has occurred since, in an application rather than a renderer, and it is
recorded here because it is the same mechanism: the playground set the pane row's
`grid-template-columns` from the component, an inline declaration outranks every
rule in a stylesheet, and the narrow-screen rule asking for a single column was
silently losing. Every viewport below the breakpoint kept the desktop template, so
the page scrolled sideways by **187px** at 820px wide — measured in Chromium — with
the one visible pane 304px wide inside an 820px screen, and 602px of overflow at
390px. It shipped, passed every gate, and was reported by somebody using an iPad
([0100](../decisions/0100-a-pane-boundary-is-dragged.md)). Unlike the two above it
now has a structural contract rather than a proxy: the row may set only custom
properties inline, so no component can shadow a media query, asserted in
`apps/playground/src/panes.test.ts` and watched to fail.

A fourth was a difference of **which questions are on the screen**, which the conformance
suite can see and did not, because no fixture ever mounted a layout. A form with pages and a
layout was drawn whole on every step by React — a later page's questions answerable on the
first, and not checked by Next — and in model order by Angular, which dropped the layout and
showed a field it leaves out. Both now draw the layout a page at a time, asking one function
in `@formancy/spec` which nodes the page leaves empty, and a fixture naming a layout holds both
drivers to it ([0137](../decisions/0137-a-paged-forms-layout-is-drawn-a-page-at-a-time.md)).
It was found by reading the code, not by a person filling a form in.

*Severity:* a control that is covered or missing is a control that cannot be
operated, so this reaches the same outcome as D4 by a route D4's constraint does not
watch.

*Constraint:* each cause is replaced by a **structural** contract a test can hold
rather than by a promise: every element between a grid and the cells inside it takes
no part in layout, asserted in `packages/angular/src/layout.test.ts`; the typeahead
popup is positioned against an anchor that wraps the control and nothing else,
asserted in both renderers' widget tests; and every theme positions that anchor,
gives the popup an explicit offset, and lets the narrow-screen reflow beat a column
span, asserted in `apps/docs/src/themes.test.ts`. Each was reverted and watched to
fail.

*Residual, and it is the honest centre of this entry:* **those are proxies, and
appearance is largely reviewed rather than verified.** jsdom implements no layout
and resolves no media queries, so almost no test in this repository can ask where
a box is; the measurements quoted in the records above were taken by hand in a
browser.

**A narrow part of it is now verified rather than reviewed.** `pnpm test:browser`
loads the composed site in Chromium at four viewports — a phone, a tablet in both
orientations and a laptop — and asserts that nothing scrolls sideways, how many
columns the pane row computes, and the computed `touch-action` of **both**
renderers' signature surfaces with and without a theme
([0102](../decisions/0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).
Reverting either defect named above reddens it, which was checked by doing so.
That also corrects a claim this paragraph carried for longer than it was true:
the playground renders the Angular bindings in a browser, and the gate loads it,
so that renderer is no longer seen by review alone.

What stays reviewed is everything else: there are **no pixel baselines**, by
choice — the renderers ship no styling, so a baseline would be testing demo CSS,
and a baseline is a file somebody updates when it goes red. One engine, Chromium,
and not Safari; the defect behind D4c was reported on an iPad, which nothing here
can drive. And four viewports of one demo schema is not the conformance suite. A
manufacturer relying on visual correctness must still verify it in the browsers it
ships to. Listed as debt in [§11](../architecture/11-risks-and-debt.md).

### D4b. A control keeps its accessible name and loses its visible label

*How it arises:* a datagrid clips a cell's `<label>` rather than removing it, deliberately
— measured, `display: none` and `visibility: hidden` both compute the control's accessible
name to `""`, while clipping keeps the name and takes only the box
([0075](../decisions/0075-a-datagrid-is-drawn-not-tabulated.md)). The heading strip above
the column supplies the visible text instead. That trade is sound for a column holding one
answer and **false for a column holding several**: a `group` as a column was flattened into
its leaves by both renderers, so one heading named two controls and the clip took both of
their labels. Two date controls side by side with nothing to tell them apart.

*Severity:* a control nobody can identify is filled in wrongly rather than not at all,
which is worse than D4's outcome — the form is submitted and the answer is in the wrong
field. It is also invisible to every gate here: the accessible name is intact, so the
conformance drivers, the axe runs and the name-comparison test all pass. Sighted use is
what breaks, and WCAG 3.3.2 is what it fails.

*Constraint:* the arrangement is refused when the document is saved. `validateSchema`
rejects a grid whose child holds fields of its own, so a heading always names exactly one
answer and the clip's premise holds by construction
([0078](../decisions/0078-a-grid-row-is-flat.md)). Asserted in
`packages/spec/src/datagrid.test.ts`, including over every container type rather than the
one type it has to catch today. The first fix attempted was a CSS rule restoring a nested
label, guarded per theme and observed failing on all four themes before it — and it was
still wrong, because the markup it selected does not exist. That is recorded here because
it is the shape of mistake this section is for: a guard can fail for the right reason and
still assert nothing.

*Residual:* the clipping technique remains, and so does the reasoning it rests on — that a
heading names a column and a label names a control. Nothing checks that a theme's clip is
applied only where a heading exists; four themes each carry the rule and a fifth could get
it wrong. Appearance is reviewed rather than verified, as D4a's residual says at length.

### D4c. A control cannot be operated without a stylesheet

*How it arises:* the renderers ship **zero CSS** on purpose, so that a consumer's design
system owns the markup ([§8.7](../architecture/08-crosscutting-concepts.md)). That
boundary is about appearance, and a property can cross it without anybody noticing: the
signature surface needs `touch-action: none` or the browser resolves a touch drag as a
pan, in the compositor, before any handler runs. It was declared only in the four shipped
themes. So drawing worked in every context the demo was looked at, and failed for anybody
using the renderer with their own stylesheet — reported from an iPad as "unusable, it
scrolls while you sign". Measured in Chromium with the theme attribute removed: `auto` on
the surface, inside a container whose own `overflow` is `auto`.

*Severity:* the same outcome as D4. A signature that cannot be drawn is a field that
cannot be completed, and the keyboard route — typing a name — is the only one left, which
is a narrower product than the one documented.

*Constraint:* a control declares what it needs in order to *work*; a theme declares how it
looks ([0101](../decisions/0101-a-control-is-operable-without-a-theme.md)). Both renderers
now set `touch-action` on the element, each asserts it in its own suite, and
`apps/docs/src/themes.test.ts` asserts no theme declares it — an inline style outranks
every author rule, so a theme's copy would be dead and would read as load-bearing. Seven
mutations were observed failing, including the inert version of the fix: React's listeners
made `passive`, where `preventDefault` is ignored.

*Residual:* **the class is not closed, only this instance of it.** Nothing enumerates
which properties are operability rather than appearance, so the next control to need one
can repeat the mistake; a slider and a cropper both would. And the report came from a
device no test here can drive — what is verified is that the mechanism is present without
a theme and that the fallback fires, not that iOS Safari behaves as expected with it.
Listed as debt in [§11](../architecture/11-risks-and-debt.md).

### D4d. A form read right to left is laid out left to right

*How it arises:* this product ships no layout of its own, so a theme’s stylesheet is
the whole of the answer. A stylesheet that names a side — `padding-left` rather than
`padding-inline-start` — keeps that side whatever direction the document is read in,
so an Arabic or Hebrew form has its labels, its error marks and its repeater controls
on the wrong side of the control they belong to.

*Severity:* a form that is readable and wrong rather than broken. Nothing fails, no
answer is lost, and a reader who does not know what it should look like will complete
it — which is why it is an entry here rather than a styling preference. The specific
case measured was narrower and worse: four themes positioned a date icon at a fixed
side while the padding that made room for it moved with the reading order, so the icon
lands **on top of** the text.

*Constraint:* every shipped theme is written in reading order, and
`apps/docs/src/themes.test.ts` refuses one that is not — the physical properties by
name, plus a side named as a *value* that has no counterpart for the other direction
([0113](../decisions/0113-a-theme-is-written-in-reading-order.md)). Proved against
four physical properties and against removing a theme’s flip. The browser gate adds
that the rendered form responds to `dir` and does not overflow when mirrored.

**The builder is held to the same, and was not until 2026-10-09.** The source check
read only the stylesheets that style a form, so `workbench.css` — both builders' — was
never read; a bar drawn down one side by an inset shadow is a side named as a value and
was not looked for; and the drag surface measured a pointer from the left, so a field
aimed at the right of another in a right-to-left form landed on its left — the builder
doing something other than what its author pointed at (D11). Now the drag surface asks
the browser which way the form reads, every bar has a `:dir(rtl)` pair the source check
holds per rule, and the browser gate flips the builder and watches its selected node's
bar move ([0123](../decisions/0123-the-builder-reads-right-to-left.md)).

**And the bundler can undo all of it.** A build targeting browsers older than `:dir()`
rewrites `:dir(rtl)` as a list of right-to-left *languages*; Vite's default did, in this
repository's own site, so a page with `dir="rtl"` and any other `lang` got none of the
mirrored rules. The site and playground now build for the browsers the stylesheets are
written for, and the browser gate fails on the rewrite in what they serve.

**And a side has more than one spelling.** The source check knew `padding-left` and not
`padding: 0.25rem 0.375rem 0.25rem 0.625rem`, whose fourth value is the left whatever the
reading order, nor `float: left`. Ten such shorthands and two floats had shipped in the four form
themes — an error message, a file row, a drop cap, the chips of a tag picker — and the browser
gate found the first when the ranking control (spec 4) borrowed a chip's padding and was on
screen when the form was mirrored, where no chip ever had been. The source check now refuses an
asymmetric `padding`, `margin` or `inset` shorthand and a physical `float`, and the themes use
the block and inline longhands and `float: inline-start`.

*Residual:* the icon rules live inside `@supports (-webkit-touch-callout: none)` — iOS
WebKit alone — so **no gate here can execute them**; they are held by a source check
and nothing else. The browser gate holds the renderer rather than the themes: pinning
a side in all four themes left it green. And nothing checks a right-to-left
*language*: mirroring a layout is not translating a form. **A host's own build is
outside every gate here**: one that bundles the stylesheets with an older CSS target
gets the rewrite, and the themes README naming the target is the whole of the
mitigation. The browser gate runs Chromium alone.

### D5. A repeater shows the wrong number of rows

*How it arises:* `minItems` was originally seeded by each renderer in a mount
effect, and React's StrictMode double-invoked it, producing two rows where one
was declared.

*Constraint:* `minItems` is a model property, so the **engine** honours it and
neither renderer seeds rows
([0023](../decisions/0023-model-properties-in-engine.md)). Found by
screenshotting the playground, not by a test — recorded because it illustrates
the general rule that a property enforced in two renderers will eventually be
enforced differently in two renderers.

### D6. A device failure is presented as a wrong answer

*How it arises:* a field offers a camera route to its answer
([0071](../decisions/0071-a-scanner-is-supplied-not-built.md)) and the camera does not
work — permission refused, no camera, a stream that dies. The naive rendering puts that
message where the field's validation errors go, so somebody reads "camera permission was
refused" as a verdict on what they entered, and an error summary built from the engine's
errors sends them to a field whose value is fine.

*Constraint:* the message is rendered in the field's own `role="status"` region and never
in its error region, which is the control's `aria-describedby` target and carries the
engine's verdict only. A renderer has no way to write into it: the text comes from the
snapshot. The message names the recovery — type the value — and typing is always
available, because the scanner widget adds a button beside the default control rather than
replacing it. Verified by a case in each renderer's scanner test asserting the message in
the status region **and** the absence of an error region.

*Residual:* the two regions are distinguished by their content and their ARIA roles, not
by anything that stops a *theme* styling them identically. A consumer whose stylesheet
draws the status line like an error has reintroduced the confusion, and nothing here
detects that.

### D7. A control shows a state other than the one it is in

*How it arises:* an appearance dresses every control through one group —
`:is(input, select, textarea, [data-formancy-part='richtext-surface'])` — and the rule for
the pointer carries `:not(:disabled, :focus-visible)`. Both `:is()` and `:not()` take the
specificity of their most specific branch, so that rule reaches one step above
`input:is([type='checkbox'], [type='radio']):checked` and repaints it. Measured in the
Dusk appearance: a chosen radio sat at `rgb(124, 107, 245)` and turned `rgb(21, 26, 38)`,
the page's own dark, while the pointer rested on it. The value is set and the control says
it is not.

*Severity:* worse than a control that does not respond, because nothing prompts a second
look — the person sees an unchosen radio and chooses again, or leaves believing they
answered something else. It is invisible to every gate here: the element carries
`checked`, so the conformance drivers, the accessible-name comparison and the axe runs all
pass. The accessibility tree is correct and only the pixels disagree, which means sighted
use is the only use that breaks. The same rule left the two controls with no pointer
feedback of their own: a fill change measured at about 1.03:1 across an 18px circle.

*Constraint:* the shared rule excludes `[type='checkbox']` and `[type='radio']` by name,
and each appearance states those two controls' hover and press itself, with an edge and a
ring rather than a fill ([0080](../decisions/0080-a-choice-control-dresses-its-own-states.md)).
`apps/docs/src/themes.test.ts` derives both halves from the stylesheets: it fails when an
appearance has no hover or press of its own for the two, and when a rule that reaches them
through the shared group declares a property the chosen state also declares. Both were
observed failing before the change — the first on all four appearances, the second on two.

*Residual:* the guard compares property families, so a shared rule could still repaint a
chosen control with a property `:checked` does not use. And the numbers above were
measured in a browser by hand: no gate renders a stylesheet, so nothing will measure them
again. This is D4a's residual — appearance is reviewed, not verified — reaching a
different kind of defect than layout.

### D8. A field renders on a different step from the one it was authored on

*How it arises:* a page is a wizard step and pages are transparent for data, so a form
renders the same submission whether or not it is paged. The consequence is that a
top-level field which is not inside a page has no step of its own, and the engine gives
it the first. Measured against the built engine with `bare1`, `page one`, `bare2`,
`page two`: `pageOf` reports 0, 0, 0, 1 — `bare2` sits between the two pages in the
document and renders on the first. `validateSchema` permits the shape, so nothing refuses
it and nothing reports it.

*Severity:* the answer is collected and stored correctly, so no data is lost or altered.
What is wrong is that the form asks the question somewhere other than where its author
put it — a consent or a declaration authored on the final step appearing on the first,
before the context that was meant to precede it. It is a failure of the authoring tool
rather than of the engine, which is why it had no entry here until a builder could make
a wizard at all.

*Constraint:* the builder cannot produce the shape, in either direction. `addPage` takes
the top-level fields into the first page, so a form is either unpaged or fully paged, and
`validTargets` stops offering the bare top level once a form has pages — a field may go
inside a page and not beside one
([0081](../decisions/0081-a-page-absorbs-the-form-it-joins.md)). Taking a page away holds
the same invariant from the other side: `unwrapField` merges a page's questions into the
neighbouring page and only un-pages the form when the last page goes, so an unwrap in the
middle of a wizard cannot leave a question beside a page
([0089](../decisions/0089-a-page-is-unwrapped-into-its-neighbour.md)). Asserted in
`packages/builder-core/src/session.test.ts` and in `builder.test.tsx`, and the change
required correcting a test that asserted the opposite. The unwrap's own case — *'never
leaves a question beside a page instead of inside one'* — derives the invariant from the
document after each edit rather than naming the expected shape, because the shape differs
per case and the invariant does not; it was observed failing against the implementation
that spliced the questions onto the top level, which is the one that reads correct.

*Residual, and it is the substantial one:* **the format still permits it.** A document
written by hand, by an agent through `@formancy/mcp`, or by an older version of the
builder can place a field beside a page, and it validates. Refusing it is a spec change,
and versions `"1"` to `"4"` are frozen — so it would belong to **version `"5"`**, which is
not open ([0140](../decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)), where it would be a migration with a report rather than a
silent breakage. Opening one for it would not make it decided either: a version that only ever adds cannot refuse something an older one
allowed without breaking a document that validates today, so the honest form of this is a
warning on publish rather than a refusal
([0097](../decisions/0097-a-publish-may-warn.md)). Until then the constraint covers the
builder and not the format.

### D9. A form asks its questions in a language the reader did not choose

*How it arises:* text may be a reference into the message catalogue
(`label: { "$t": "section.1" }`), and `resolveText` resolves it in a locale the caller
supplies, falling back to the document's `defaultLocale` for anything a catalogue does
not carry. The fallback is correct. What was wrong is that both renderers handed
`resolveText` the document's default locale instead of the engine's at every call site
belonging to the **arrangement** rather than to a field: a section's heading, a group's
label, a tab strip's name, a code block's label. Field labels come through the engine
and were right. Observed in the templates gallery with the HR onboarding form chosen in
German: German fields under the English headings *Employee* and *Work setup*, with the
German strings present in the document and simply not read. Three call sites in
`@formancy/angular`, one in `@formancy/react`.

*Severity:* a heading is what scopes the questions under it, so a heading in another
language changes what those questions are understood to ask — *Employee* above fields
that a German reader will complete for themselves reads differently from
*Mitarbeitende Person*. It is worse than an untranslated form, because a form entirely
in one language announces itself: a reader who cannot read it stops. A form that is
translated everywhere except its headings looks finished, so the reader proceeds and
supplies the wrong thing. And it is invisible from inside: the document is correct, the
catalogue is complete, and a reviewer reading the JSON sees nothing wrong.

*Constraint:* every renderer resolves layout text in `engine.locale()`, which is fixed
for an engine's lifetime. `packages/react/src/layout.test.tsx` and
`packages/angular/src/layout.test.ts` each mount a document whose headings are
references, in a locale that is not the default, and require the translated heading by
role and accessible name **and the absence of the source-language one** — both were
observed failing before the change, in both renderers. A second case in each requires
the fallback to still produce the source language, not a message id, where a catalogue
has a gap.

Underneath that, the suite could not have found it: `MountOptions.locale` existed and
**neither conformance driver passed it on**, so no fixture could run in another
language and the one i18n fixture mounted in the default locale, where a form in which
nothing is translated looks exactly like one in which everything is. Both drivers now
honour it and resolve accessible names in the locale they mounted with, a `locale` field
on a fixture reaches them, and `translated-mounted-locale.json` runs a conditional form
in German under every driver. `validateFixture` refuses a `locale` the document has no
catalogue for, because the fallback would make such a case pass against the source
language ([0107](../decisions/0107-layout-text-is-read-in-the-engines-locale.md)).

*Residual:* the conformance fixture holds **field** labels, options and messages, because
every lookup in that suite is by accessible name. It does not reach a section heading:
the driver interface exposes layout text only through `ariaSnapshot()`, and there is no
fixture step that asserts against it. The headings are therefore held by the two renderer
tests named above — written twice, which is the cost
[0033](../decisions/0033-one-suite-n-drivers.md) accepts — and a third renderer would
not inherit them. A fixture step for the accessibility tree was rejected rather than
forgotten: a snapshot is a file somebody updates when it goes red, which is why pixel
baselines were refused for the same reason
([0102](../decisions/0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).

### D10. A form is changed by a model and nobody reads what it changed

*How it arises:* a person describes a change in words and a model answers with a whole
new document. Everything checkable is checked — parsed, validated against the spec's own
JSON Schema, compiled by the engine, every expression type-checked, and the model told
what was wrong and asked again ([0056](../decisions/0056-agents-get-the-checks.md)).
**Valid is not the same as wanted.** A document passes all of it with the condition
inverted that somebody asked to loosen, a field renamed whose answers are already in a
database, an option withdrawn that submissions already carry, or a bound the model
rounded while doing something else.

*Severity:* a form that is wrong in a way its author believes is right, which is worse
than one that is visibly broken. The edits above are all **lossy** rather than
breaking, so nothing downstream refuses them: drafts rebind, publishing succeeds, and
the first signal is a submission that went somewhere unexpected or an answer that no
longer has a field. The author's own instruction is what they will check it against,
and the instruction was satisfied.

*Constraint:* the answer is **shown rather than applied**. Both builder panes hold it
as a proposal and list what it would do — the list `diffSchemas` gives, marked where it
costs the answers already collected — and apply nothing until somebody presses the
button ([0109](../decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)). The list
is complete rather than a summary, which it was not until
[0108](../decisions/0108-the-diff-reports-everything-that-changed.md): before that, an
option withdrawn and three rules rewritten produced an empty change list, and a review
screen built on it would have shown nothing while being read as proof. For an agent the
same shape is `propose_form_edit`, which answers with the change list and publishes
nothing.

A run can be stopped ([0157](../decisions/0157-a-models-turn-can-be-stopped.md)), and that
makes a variant of this failure possible. Somebody stops a run and asks for something else.
If the first model's answer arrived late, it would sit on screen as the proposal for the
second instruction and be reviewed against the wrong one. So each turn is raced against
the stop. A stopped run ends at once, and whatever its model answers afterwards is
discarded rather than proposed, whether or not the host abandons its request. The same
holds when a pane holding its own run is unmounted or destroyed. `authoring.test.ts` (*stopping a run*)
holds it in `@formancy/builder-core`. In each builder, `prompt-pane.test` (*can be
stopped*) releases a working document after the stop and asserts that no review appears.
That alone is released while the pane is idle, so it cannot tell the constraint from a pane
that ignores answers only when idle. *An answer to a stopped run, arriving while the next one
waits* is the hazard as described: it stops a run, asks again, releases the first answer
during the second run and asserts that nothing is proposed until the second answers, and
then that the review lists the second answer's change. It fails, where *can be stopped*
does not, for a pane that keeps one stop for its whole life.

A host can hold the run instead of the pane
([0163](../decisions/0163-a-models-run-belongs-to-the-host.md)), and formancy.ai does, so
that a turn being carried survives the visitor looking at another tab, the other builder or
the JSON. Then a pane that goes stops nothing: the run waits for its answer, and the
proposal is shown in whichever pane is drawn next, which may not be the one where the
instruction was typed. That is not the variant above, because nothing else can be asked
meanwhile: the holder carries one run at a time, and the instruction cannot change while it
waits (`prompt-run.test.ts`, *keeps the instruction it was asked with while it waits*, which
also presses Write again and sees nothing asked). Each run has a stop of its own, so a late
answer to a stopped run is never held as the next one's (*an answer to a stopped run,
arriving while the next one waits*, now that the holder makes the stops). Since
[0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md) the translations pane's run and the drafting part's can be held the same way, and
the stops are written once for all three, in `run-holder.ts`: a run's ending lands only while
it is still the run in flight. The same case in `translation-run.test.ts` and
`draft-run.test.ts` holds it for the other two; with one stop for the holder's life the prompt
run's and the translation's fail, and with any run's ending allowed to land, *is discarded
whole* fails in all three.

Once a run has answered, though, the box is the person's again while the proposal is still
held. What they type next — the following instruction, or the same box in the other builder
minutes later — stands beside a review that does not answer it. So the run keeps the words
it was asked with, and the review names them under its heading, *In answer to “…”*, whatever
the box says by then. `prompt-run.test.ts` (*keeps the words it was asked with beside its
proposal, whatever is typed after*) failed without them; each builder's `prompt-pane.test`
(*a review names the words it answers, whatever the box says since*) failed with the review
drawn without them; and `two-builders.test.tsx` (*a proposal held for review in one builder
is the same proposal in the other*) types new words into the React box and reads the review
in Angular, and failed the same way. A run the host forgets is stopped and nothing it
answers later is held (*is discarded whole*); the playground forgets its run when another
demo is chosen, and `two-builders.test.tsx` (*choosing another form ends a turn about the
last one*) failed before that with the starter's turn waiting above the wizard. A proposal
held while the form was edited elsewhere — under *Schema*, say — is still held against the
document the run was asked over, and Apply refuses it (*is kept, with the refusal, when the
form moved while it waited*). What this does not cover is a person who reads the box rather
than the review: the words a proposal answers are drawn in the review, above its changes,
and reading them, and the changes, is theirs.

A request the format cannot express is this failure's sharpest case. Asked to email every
submission, a model had no answer but a document, and a document that does part of the
request — a field that mentions email, say — can pass every check while the instruction
looks satisfied. The briefing now tells the model not to write one, and offers it a decline,
`{"declined": "<why>"}`, which ends the run with nothing proposed and the model's reason shown
([0158](../decisions/0158-a-model-may-decline.md)). That is an instruction to a model, not a
control: nothing makes a model take it, no test here runs a real model, and a document that
does part of the request still reaches the review like any other. What is held is narrower.
`authoring.test.ts` (*a model that declines*) holds that a decline ends the run on its turn
with no document, and that a document is never taken for one — titled "declined", or with a
`declined` key beside its own, which the closed schema then refuses. It also holds that a
decline with no reason is answered with the briefing's example of one and none of the
schema's complaints. Checked as a form, it would be told to remove the key and supply the
four required properties: a push from declining towards exactly the partial document this
paragraph is about. Both builders' `prompt-pane.test` (*when the model declines*) hold that
nothing is applied.

On formancy.ai the model is a person carrying each turn
([0160](../decisions/0160-a-person-carries-the-models-turn.md)): the page shows the request,
the visitor copies it into a chat of their own and pastes the answer back. That puts a hand
between the prompt and the answer, and the hand can carry the wrong thing. What is held is
that the relay changes nothing about the run except who answers. `relay.test.ts` holds that
the turn shown is exactly the prompt a host's model would have been sent; that a stop clears
the turn, so an answer pasted after it is refused rather than proposed for whatever is asked
next — the variant above, through a person; that a second request while one waits is refused
rather than queued, so a paste meant for one cannot be taken as the other's; and that a paste
with no JSON object in it is held back without spending an attempt. The refusal ends the
second run as `busy` — another request is waiting — rather than as a model that could not
be reached, which sent a person to check a model nothing was wrong with
([0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)). The playground
asks one relay from its prompt pane and its scenario pane, so either can be refused while the
other's turn waits: `relay.test.ts` (*one turn at a time*) holds both directions, and
`two-builders.test.tsx` (*one relay, two panes*) holds that each pane says so from its
catalogue in either builder. Both fail with the refusal ended as unreachable. A translation
asked of a model (D15) runs on the same loop and the same relay, from the translations pane
under its own tab, and is refused the same way wherever it meets another pane's turn:
`relay.test.ts` (*a translation asked while a model's edit waits*) holds both directions, and
both builders' `translations-pane.test` that the part says so; each failed with the
translation's status saying nothing. The pane outlives the turn, so the same variant is held
one layer up, in both builders' `relay-pane.test`: an
answer pasted and held back, then a stop, leaves nothing in the next request's answer box
(*leaves nothing of its answer box to the next request*), and an answer edited after it was
held back is no longer offered "Use it anyway", which would send the new text unchecked
(*edited after it was held back*). Whatever is accepted is checked like any model's answer
and reaches the review like any other.

One thing does reach further than a review: an example with its answer written down.
`runScenarios` executes a form against saved examples and reports which stopped holding,
which is the only check in this product that can tell a condition that compiles from the
condition that was asked for — both spellings of an inverted rule are valid CEL
([0110](../decisions/0110-a-form-is-checked-against-examples.md)). Both builders carry a
panel that reruns them after every edit and **names** what broke, and `check_scenarios`
is the same check for an agent
([0111](../decisions/0111-a-scenario-panel-names-what-stopped-holding.md)). What broke is
measured against the last run over the same document only. Until a fix after `0.4.0`, a
panel kept on screen while its host opened another document compared runs across the two
by name. It could name examples as broken, or repaired, that had never run against the
document open. `scenario-runs.test.ts` and each builder's `scenario-pane.test` hold the
fix. An example's `absent` on a field inside a group or a repeater's row was looked up as a
key at the top of the submission, where no such key is, so it held whatever the form did: an
example that read as a check and checked nothing. Since 0162 the runner looks it up through
the path; `scenarios.test.ts` (*is looked for where the field is*) fails with the key lookup
put back, and also holds that a field hidden and cleared there passes.

The examples also run **before Apply**. Given the form's examples, each prompt pane runs
them against the document as it is and as the proposal would leave it, through
`runScenarios` and `comparedToLastRun`, the scenario panel's own two functions. The
review's heading names each example that would stop holding, and the status names those
and any that would hold again ([0159](../decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).
Apply is not disabled by a regression: a rule changed on purpose stops its old example, and
the person decides. What the tests show is this. `proposal.test.ts` (*what the form's
examples make of a proposal*) holds that a rule turned round names the examples it breaks,
that one put right names those that would hold again, and that an example already failing
is not put down to the edit. It holds that no examples, whether none are passed or the
list is empty, give no verdict rather than an empty one, and that the examples run from
the sample and in the mode given. Each builder's `prompt-pane.test` (*with the form's
examples*) holds that the review region is named by the example while the document is
unchanged and Apply is enabled. `two-builders.test.tsx`
holds the same through the playground in both builders, with the starter's canton rule
turned round and the answer pasted into the page's relay, as a visitor's is. No test runs a real model. The verdict uses the examples as they were when
Write was pressed, so one added while the review is open is not in it.

On a deployment the examples also run **at publish**, the last moment before a version is
frozen ([0166](../decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)).
The server keeps each form's examples and the sample they start from, beside the form, and
`publishForm` runs them against the version the form has and the one being published, in
`server` mode and from the sample, through `runScenarios` and `comparedToLastRun` again. Each
example that stops holding is a sentence in the `201`'s `warnings`, naming it, both versions,
and what was expected and what happened; the version is published all the same. What the tests
show is this. `examples.test.ts` in `@formancy/server-core` holds that a rule turned round names
each example it breaks and the version is there afterwards; that an example failing against
both versions, and one that holds again, are not named; that the examples run from the kept
sample and in server mode — a rule moved to the browser is named, and is not when they run as a
browser would; that a stored row that is not an example is left out and named, when they are
read back and at publish, and the others still run, rather than the publish failing; and that a
viewer may neither read nor change them. `examples-route.test.ts` holds the warning on the `201`
through `createApp`, and `server.integration.test.ts` across real HTTP and real PostgreSQL,
including that a change whose audit row cannot be written is not kept either. In the admin, the
scenario pane runs the kept examples in server mode and saves a removal back; a save that fails
is said and puts the server's list back, and no change made on the list it replaced is sent, so
the screen and the publish do not come apart over it. The prompt pane's review runs them as the
publish will, and the publish note draws the warning (`examples.test.tsx`). Each of these failed with the code it guards changed;
the publish note's case alone passed before, since the note already drew every warning, and
fails with the note dropping them.

*Residual:* the review shows what changed, not whether it is what was asked for — that
judgement is the person's and cannot be delegated to the thing being judged. Scenarios
narrow it rather than close it: they check the rules somebody thought to write an
example for, and a form has no way to know which rules those are not. It is a
change list rather than a side-by-side of the two documents, so an edit's *shape* is
visible and its wording is not. And pressing the button is one click: nothing here
distinguishes a reviewer who read the list from one who did not, which is the limit of
what software can assert about attention. That holds when the heading names an example
the edit breaks, too.

The check at publish is a report, not a gate: nothing in formancy fails a deployment over it,
and a person who reads the warning can publish anyway, which is the point of a rule changed on
purpose. It compares with the version the form has, so an example failing against both is not
named, and a form published before it had examples, or after the one that would have warned was
removed, is published with nothing said. The examples are kept with the last save winning: two
people changing one form's examples at once replace each other's list whole, and a removal can
come back or a kept example go, with nothing saying so. A change made while a save was failing
is lost, said only as the failure. And the examples run with no answer from
the deployment's `check` validators, in the panes as at publish, so an example cannot pin what a
check answers.

Through the relay a pasted answer is **not bound to the prompt it answers**. The page cannot
tell whether the text came from the request it showed, from an earlier turn, from a chat
about another form, or from a person's own hand; any object that passes the checks is taken
as the answer. The defence is the diff against the pinned basis — the document the run was
asked against, held by `proposeEdit` — read by the person before Apply. A paste written for
another form reads as an edit removing this form's fields, and is listed and marked as
costing answers; a paste that differs only subtly from what was asked reads as a subtle
edit, which is the residual above, unchanged by who carried it.

### D11. The builder tells its author it did something other than what it did

*How it arises:* every command on the structure tree is announced through one live region,
and for somebody building a form by keyboard with a screen reader that sentence is the
only evidence of what happened. Both builders worded those sentences by hand, from the
same copied logic, and two of them were false: a drag announced the row the field was
dropped on as the field that moved ("Moved City." when Customer moved), and unwrapping a
group in a form with pages announced "Removed the page …" for a group.

*Severity:* an author acts on a false account of their own edit — moves the field the
announcement named back to where it was, or believes a step of the form is gone when it
is not. The form that results differs from the one its author believes they built, which
is the consequence class of D10 reached without any model involved.

*Constraint:* the structure tree's sentences are decided once, in
`packages/builder-core/src/spoken.ts`, from the document before and after the command,
and `spoken.test.ts` holds each against the document. Each builder's own tests assert
that a drop names the field that moved, and both failed on the old code with "Moved
City." ([0116](../decisions/0116-what-a-builder-says-is-decided-once.md)).

The arrangement pane's sentences are decided the same way, in
`packages/builder-core/src/arrangement.ts`, and a drop there now names what moved — it
said only "Moved." ([0117](../decisions/0117-the-arrangement-pane-offers-the-same-in-both-builders.md)).

So are the drop surface over the rendered form, the prompt pane's status and the scenario
panel's (`arrangeDropAndSay`, `proposalStatus`, `scenarioStatus`), which both builders had
also written by hand.

A refusal is the other thing a builder tells its author about an edit, and the commonest
came from the validator in English inside a German builder — an author who does not read
English is told no without being told why. Every validator error now carries a code and
the values its sentence names, and a session refuses through `text.error`, from German and
French sentences typed as every code the validator has. `schema-errors.test.ts` holds both
translations to the English's placeholders and to the format's own words, and a German
session's duplicate-key refusal to its German sentence; the compiler holds every validator
call to the values its sentence names
([0122](../decisions/0122-a-validator-error-has-a-code.md)).

*Residual:* every sentence a builder announces after a command is decided in one place
now. What a sentence can still get wrong is the same in both builders at once — the cost
of one answer is that its mistakes are shared. A true sentence can still go unheard — a live region's
timing belongs to the browser and the screen reader — and no manual screen-reader audit
has been performed (D4). A translated refusal is checked for its shape and not its meaning:
that a German or French sentence gives the reason the English gives rests on its having
been written carefully, and no native speaker has reviewed either translation.

### D12. A valid arrangement that places a group cannot be drawn

*How it arises:* a layout node names a group's path, which the validator accepts and the
builder's arrangement pane offers. A renderer with no drawing for a group placed whole asks the
engine for a field at that path and throws `Unknown field`, and on a paged form throws earlier,
asking which page the group is on. Both renderers did, until 2026-10-09; found by the guard
that requires every placed field to name itself
([0150](../decisions/0150-every-field-an-arrangement-places-names-itself.md)).

*Severity:* the form does not render — in the builder's preview and in production alike — so
nothing can be filled in. Loud rather than silent: nothing is shown wrongly or collected
wrongly, and no answer is lost.

*Constraint:* both renderers draw a group placed whole as its fields, on the page its fields
are on, from one answer in `@formancy/core` (`placedGroup`, `placedPage`)
([0151](../decisions/0151-a-group-placed-whole-is-drawn-as-its-fields.md)). The conformance
fixture *a group a layout places whole is drawn as its fields, on the page it belongs to* holds
both renderers to it through their drivers, and failed each of them as they were. A group placed
beside one of its own fields is refused as `layout.placedInGroup`, so a field cannot be drawn
twice through its group.

*Residual:* a renderer outside this repository has the same obligation, and is held to it only
if it runs the conformance suite. Inside a placed group the order is the model's; an arrangement
that needs another order places the fields one by one.

### D13. A file of a text type cannot be attached

*How it arises:* a file's bytes are sent as the body of a request, under the file's own type.
Fastify parses `text/plain` and `application/json` bodies itself, and the server's catch-all
byte parser only ever saw the types with no parser of their own — so a `.txt` or `.json` file
reached the upload route as a string or an object and was refused as `no_body`, and a `.json`
file that was not valid JSON was refused as malformed before the route ran. The form's `accept`
list allowed both, and the offer said so. Every release with uploads, 0.2.0 to 0.4.0, does
this; fixed on 2026-10-09, after 0.4.0.

*Severity:* the field says the upload failed, so nobody believes the file was attached; but a
person with that file has no way to attach it, and a form that requires it cannot be
completed. Loud rather than silent: nothing is stored, and no answer is lost.

*Constraint:* the upload route has a Fastify context of its own, with every body parser
removed and one put back that hands over any body as bytes (`routes/files.ts`). Every other
route keeps Fastify's own parsers and is never handed raw bytes. `server.integration.test.ts`
uploads and reads back, on real PostgreSQL, a `.txt` file with and without a charset, a
`.json` file valid and not, and an empty one, and requires each to come back byte for byte;
the first four failed on the old code with `no_body` or Fastify's JSON error, and with the
parsers left in place beside the catch-all they fail the same way.

*Residual:* tested through Fastify's request injection rather than from a browser. A client
that sends an empty file with no `Content-Type` at all is still answered `no_body` — Fastify
reads a body with neither a type nor a length as absent — which the supplied uploader never
does, since it always names a type.

### D14. A respondent is refused for submissions that were not theirs

*How it arises:* every limit on the public plane — a submission, a draft's write and read, a
challenge, a file offer — counts the client's network address, and the deployment view puts a
reverse proxy in front of the server. Behind one, every request arrives from the proxy's
address, so a server that believes only the socket gives everybody one budget: thirty
submissions a minute between all respondents, and the next one is answered `429` for traffic
that was not theirs. It shipped that way until 2026-10-09: the server constructed Fastify
trusting no proxy, and had no setting to change that.

*Severity:* the form cannot be submitted, by anyone behind that proxy, until the minute is
out. Loud to the person refused. Until 2026-10-10 silent to the operator, because the server
wrote no request log; now each refusal is a `429` line in it (C3), which names the route and
not the address that was counted. Nothing is stored wrongly.

*Constraint:* `FORMANCY_TRUST_PROXY` names the proxies, as addresses and CIDR ranges, whose
`X-Forwarded-For` the server then believes, so each respondent is counted by the address the
proxy saw. `packages/server/src/trust-proxy.ts` reads it at startup and refuses anything that
is not addresses and ranges — a hop count too, which Fastify ignores; `true`, which believes
anybody; and names such as `uniquelocal` and netmasks, which spell a range nobody reading
the setting can see — so a value the server cannot read stops it, rather than starting one
that counts the wrong client ([0156](../decisions/0156-a-proxy-is-trusted-by-its-address.md)).
`trust-proxy.test.ts` holds those refusals and checks that Fastify still ignores a hop count.
`rate-limit-client.test.ts` drives the submission route through `createApp`: two
respondents behind a named proxy are counted apart and each still meets the limit, with
nothing named they share one budget, and a client that connects directly or writes its own
entries before the proxy's is counted by an address it did not choose.

The self-hosting guide tells an operator to name the proxy's own address, pinned, and to
stop publishing the server's port behind it, and **not** to name the compose network's
range. The range holds the network's gateway, and
Docker hands connections to a published port over from the gateway: measured on 2026-10-09
with Docker 29.8 on Linux, from the machine itself and from containers on other networks,
and with the range named, 31 submissions from the machine writing different addresses were
all admitted. `rate-limit-client.test.ts` holds the half that is Fastify's — a client at the
gateway is believed when a named range holds it and counted by the gateway when only the
proxy is named. The half that is Docker's is a measurement, not a gate: it needs Docker's
networking, and Docker Desktop and rootless Docker, which were not measured, may answer
differently.

*Residual:* **unset is still the default**, because trusting nothing is the only safe default,
so a deployment behind a proxy that does not set it has this failure and nothing detects it.
Set too wide — the network's range is the easy way to do it — it turns into C1's residual for
anything that arrives from the gateway. A proxy on the host itself arrives from the gateway,
so naming it leaves every process on that machine able to choose its address; the guide says
so. Respondents who really share one address — an
office, a school, a phone network behind carrier-grade NAT — still share one budget, which a
key made of an address cannot separate. And a trusted proxy is believed about
`X-Forwarded-Host` and `X-Forwarded-Proto` too; no route reads either (checked 2026-10-09),
and the first that does would take a client's word wherever the proxy passes those headers
on unset, as nginx 1.27 did when measured — `trust-proxy.test.ts` checks that Fastify still believes them.

### D15. A model's translation changes what a question asks

*How it arises:* a model asked for the messages a language is missing writes a target that
reads well and asks something else. A negation is lost (*Do not call me* becomes *Call me*),
a time frame or a unit moves, an answer's meaning shifts (*Rarely* becomes *Never*), an
option becomes a question, or the right words arrive in another language than the one
asked. Every check passes. The answer is a catalogue file for the language its tag names,
the document validates and compiles, no answer moves, and `diffSchemas` calls the change
compatible, because a catalogue says how a question reads and never what it stores.

*Severity:* D9's. A question in the reader's language that asks something other than its
source is answered as it was read, and the answer is stored as if it meant what the source
asked. That is worse than a message nobody translated, which falls back to the default
language and announces itself; a wrong one looks finished. And it is invisible from inside:
the document is valid, the catalogue is complete, and a reviewer reading the JSON sees French
where English was.

*Constraint:* the translation is **shown rather than applied**, message by message
([0161](../decisions/0161-a-model-translates-only-what-is-missing.md)). Both builders' review
lists every message it would write, with the source beside what was there and what is
proposed. It marks a target translated from a source that has changed since the model was
asked — the import's own stale rule, handed the source the request sent rather than the one
the model wrote back, which a model can translate or leave out — and one that is the same as
its source. It shows the form as the proposal would leave it, rendered at that locale. Apply
is `applyProposal`: refused when the form has moved since, one undo step otherwise
([0109](../decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)). The model is asked
only for messages nobody has written in that language, and only those still missing when the
answer lands are written, so a person's translation is never replaced. A target of nothing
but spaces is taken as one left empty and not written, because written, the question would
read blank where the default language's words fall back. The request carries the form's
words and where each is used, not its rules.
`translate.test.ts` holds the request (exactly the live, untranslated messages, each with a
context, and none of the rules' expressions, codes or checks, looked for as written and as the
request's JSON writes them), the checks (a catalogue for another language is asked for
again), and the proposal: an id not asked for is never written, a message a person translated
meanwhile is never overwritten, only the catalogue of the language asked changes, both marks
(the stale one judged by the source asked, in both directions), a blank target is not
written, and a stale proposal is refused. Each builder's `translations-pane.test` holds that
nothing is applied before Apply, that the review shows the source, what was there, what is
proposed and the marks, with the proposed form rendered in that language, that a refused
Apply keeps the review on screen, and that an answer that writes nothing says why and offers
Ask again. `two-builders.test.tsx` holds, through the playground's relay in both builders,
that the request names the language and carries none of the starter's rule expressions or
codes in either spelling, that every missing message is a row, and that nothing is applied
before Apply.

A host can hold the translation's run ([0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)), and the playground does, so a proposal can
outlive the pane that asked and be drawn after the visitor has chosen another language. That
makes a variant of this failure possible: a French proposal reviewed under German — the
preview in German, the rows read as German — and applied from there, landing French. So a run
is held for its language, and `translationOn` gives a part drawn on any other only that the
run waits and for which language: no review, no preview, no Stop and no Apply, and the part
says where it is. `translation-run.test.ts` (*says where it waits, and holds nothing out to
review or apply there*) fails with the run handed to every language, and both builders'
`held-runs.test` (*on another language it says where the run is*) fail with the part drawing
it so; in the playground, `two-builders.test.tsx` finds the sentence and no Stop under
English while French waits. A held
proposal is still refused at Apply when the form has moved since it was asked, in whichever
session Apply is pressed (*is kept, with the refusal, when the form moved while it waited*),
and an answer to a stopped translation is never held as the next one's (D10).

Two more ways a held run could reach the wrong language, or no language. **Its language can
leave the form** while it waits or holds a proposal — the person undoes adding it — and a pane
offers only the form's languages, so no part is ever drawn under it. Drawn like any run under
another language, every language would say *choose it* and none would offer Stop or Discard, and
the model's turn would wait with nothing able to end it. `translationOn` is given the form and says when the run's language
has left it; a part on any language then says so beside the run's Stop, or its Discard, and still
draws nothing of the proposal. `translation-run.test.ts` (*whose language has left the form is
said so on every language, and found again when it is added*) fails with a view that never says
so. Both builders' `held-runs.test` (*whose language has left the form can be stopped, or
discarded, from every language*) fail with the part drawing neither button there, and *on
another language it says where the run is* fails in each with Stop drawn wherever a run waits.
**Apply does nothing while *Translate the rest* waits.** Landed then, the first half would take
the language with it, and the rest, answering afterwards, would be held for no language and
handed to every one as its review. The panes disable Apply while a run waits; the holder does not
rely on that. `translation-run.test.ts` (*applies nothing while the rest waits*) fails without it.

*Residual:* **the review is only as good as its reader's command of that language.** A
mistranslation that reads fluently passes every check here, and nothing in software can tell
it from a right one. Both marks are hints. *The same as the source* flags words that are
the same in both languages and right (the starter's *Canton*), and says nothing about a target
that differs from its source and is wrong. Nothing checks that a target is written in the
language its file names. **Provenance is not recorded**: once applied, a model's message is
indistinguishable from a person's in the catalogue, the exported file, the diff and the next
review. A manufacturer who needs a qualified translator's sign-off per message, as a clinical
form in a regulated language may, keeps that record outside formancy. Pressing Apply is one
click, as in D10. No test runs a real model, and no native speaker has reviewed the German
or French words of the review itself (D11).

### D16. An example a model wrote agrees with the rule it was meant to check

*How it arises:* a model is asked for a form's examples (D10's last constraint is that they
exist). Shown the document, it reads the rule — `country != "CH"` where `country == "CH"` was
meant — and writes the example that rule passes. The example holds, the panel says it holds,
and every later check against it, the review of a model's edit included, agrees with the
inverted rule. The one check that tells a rule that compiles from the rule that was asked for
has been written from the rule.

*Severity:* the same as D10's, and harder to see. A form with no examples is a form nobody
claims to have checked; a form whose examples were copied from its rules is reported as
checked and is not.

*Constraint:* **the rules are withheld.** `scenarioPrompt` in `@formancy/builder-core` is the
whole request a drafting model is sent: the form's title; the fields an example can name, by
data path, with their types, labels and options; the error codes the engine reports, and those
the form's rules name, by name alone; where examples start; the names already taken; and what
the author said the form should do. No rule's CEL, no
check's name, no pattern, mask or bound, and not which fields are required; of the existing
examples, only their names ([0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
`scenario-prompt.test.ts` (*never carries a rule*) walks a form's rules and the properties
its `BOUNDS` list names, and finds none of their text in the prompt, written out or escaped
inside JSON. It fails with the document put into the request as `authorForm` sends one.
*Reads nothing about a field but what an example has to name* compares the prompt with the
one for the same form stripped to its fields' shape, and fails when the request says which
fields are required. `two-builders.test.tsx` (*examples drafted from what the visitor says*)
reads what the playground's Copy puts on the clipboard in either builder — the briefing and
the request together — and finds none of the starter's rules in it; with the document put
into the briefing it fails in both. It read the request box at first, which shows the second
half alone, and stayed green with that leak. The request does not claim more about codes than
the document says: a `validate` rule whose condition evaluates to a string reports that string
as its code, which is in the withheld condition, so the request says such a code may exist
rather than that the rules name none (*never says the rules name no codes*, which asks the
engine for the code).

Every draft is then judged by the engine: `draftVerdict` is `runScenarios` with the scenario
pane's own sample and mode, recomputed whenever it is drawn, so a draft shows the verdict the
panel will give it (`scenario-drafts.test.ts`, *a draft's verdict is the one the scenario
pane gives after Keep*). Nothing reaches the host's list until a person presses Keep, and a
draft that fails can be kept, because that failure is where the person decides whether the
example or the rule is wrong (both builders' `scenario-drafts.test`). Each builder's *is the
verdict the list gives it once kept* runs one draft that fails only from the sample and one
that fails only on the server, and fails with either dropped from the part or, in Angular,
from the pane's binding. A draft naming a field the form does not have cannot be kept, since
it would check nothing; one whose `absent` names a field inside a group or a row is checked
there, as D10 describes (`scenario-drafts.test.ts`, *a drafted `absent` … is checked where
the field is*).

A host can hold the drafting ([0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)), and the playground does, so drafts outlive the part
and the session they were drafted in. They are held for the form, by its id: a part over any
session of that form shows them, judged against that session's document as it is, and a part
over another form shows none, and Keep there is refused — another form's list is not where
they belong (`draft-run.test.ts`, *another form shows none of them, and they cannot be kept
into its list*, which fails with `draftsOn` ignoring the form and with Keep not asking).

*Residual:* **the examples are only as good as the intent described.** A model writes from
the author's words, and wrong words make wrong examples; right words can be misread. Told to
leave out what the words do not say, a model may guess anyway, and nothing checks that it did
not. No test here runs a real model. A person decides what is kept, and nothing distinguishes
one who read what a draft sets and expects from one who pressed Keep on every draft — D10's
limit on attention, again. Withholding the rules is a property of the request this package
builds: a person who pastes the form itself into the same chat has shown the model the rules,
and nothing here can see that. The drafting part says it as that — what the request carries —
and tells the person to start a new chat for it; the playground's prompt pane carries the
whole document through the same relay, so the case is one tab away. Both builders'
`language.test` require that advice to be drawn. The relay pane drawn above it said, until
[0167](../decisions/0167-the-relay-says-what-each-request-carries.md), that the request
included the form; it now says what a request for examples carries and that the rules are not
in it. `relay.test.ts` checks those claims against the request `draftScenarios` sends, and
pins the sentence beside them in each language, so it cannot be reworded without that case
failing; whether the new words still say what the claims say is read, not tested. Whether a
person follows the advice is theirs. Held
drafts take the form's id for the form: two documents with one id — a form replaced wholesale
under *Schema* with its id kept — are one form to them, and a draft naming fields both have can
be kept into a form it was not drafted for. The engine's verdict is computed against the form
on screen, and reading the draft is what shows the rest.

### D17. The deployment's model cannot be asked, or does not answer

*How it arises:* the provider is down or unreachable, refuses the key, limits the server, no
longer serves the model the operator named, declines the request, or writes until the output
limit cuts it off. Or the server was started with part of a configuration and has no model
while the operator believes it has one. Or the database cannot count the request against the
model's limit within a second, and the server refuses it rather than ask uncounted (0170).

*Severity:* the author cannot use the model, which is an inconvenience — the form can still be
edited by hand. Two variants are worse than that: an answer cut off at the limit handed over as
if it were the answer, and a failure that reads as the author's own mistake, which sends them
to reword an instruction that never reached a model ([0157](../decisions/0157-a-models-turn-can-be-stopped.md)).

*Constraint:* **half a configuration is refused at startup** — a key or a model without a
provider, an unknown provider, a provider without its key or its model — and there is no
default model to go stale (`model-settings.test.ts`). Each adapter reads how a response ended
before reading its text: a refusal becomes the route's `{ declined }`, which the admin hands
back as a decline, so the run ends on that turn with the provider's reason
([0158](../decisions/0158-a-model-may-decline.md)); an answer stopped at the output limit or
the context window is `truncated` and never handed over (`anthropic-completer.test.ts`,
`openai-completer.test.ts`). Every other failure is a 502 with a sentence chosen by the
provider's status — the key refused, the server limited, the model refused, or unreachable —
which the run ends on as *could not be reached*, with that sentence as the reason
(`model-route.test.ts`; the admin's `server-model.test.tsx`, *rejects with the server's
sentence*). A request the server could not count is a `503` whose sentence says so and asks for
another try, read the same way (`rate-limit-store.test.ts`, *the model is refused, and not
asked*); nothing is sent to the provider. With no model configured, the admin draws no prompt pane at all (*is not drawn
when the server has no model*). A stop aborts the browser's request and the server's call to
the provider (C9).

*Residual:* **no test reaches a provider.** The adapters are held against fake transports in
the shapes the SDKs parse; a provider that changes its responses changes what they read. xAI's
compatibility with OpenAI's client is xAI's documented claim. A retired or misspelt model is
found at the first request rather than at startup. The SDKs retry what they call temporary
failures twice, so a failing turn takes longer to say so. The provider's own words for a
failure are dropped, from the log as well (C3), and its status — audited, and in the log's
`model.unreachable` line — is what an operator has; a provider whose status means something other than the route assumes gets the
wrong sentence. With Anthropic, a model without adaptive thinking answers every request with a
400. **A translation can be too large to ask**: it repeats each question for every one of its
answers, so a form at the server's limit with long questions and many answers makes one past
the route's cap, refused with a 413 before it is read. The cap is shown to hold every request
about the largest form the server publishes when its questions are about a sentence long
(`model-route.test.ts`, *is taken for every kind*), and no further. **A browser and a server of different versions disagree silently**: the
browser names the kind from its own briefing, the model is briefed by the server's, and the
answer is checked as the browser's version expects. Nothing checks that the two match, so
answers can fail their checks, or pass them under rules the browser did not write, with
nothing to say why (0165).

### D18. A respondent's response is refused for the token their form was handed

*How it arises:* the deployment's signing key changed between the form being read and the
response being sent — `FORMANCY_AUTH_SECRET` rotated, or never set, so that every start
generates a new one and a restart does this to everybody filling in a form. Or a cache in
front of the server kept the form's reply and handed one token to everybody behind it, so every
response after the first is refused as already sent. Or a host does not send the token at all.
Introduced by A8's constraint, which is why it is written down with it
([0169](../decisions/0169-a-response-is-stored-once.md)).

*Constraint:* each is refused with its own `error` and a sentence a host can show as it
stands — `submission_token_invalid` saying to read the form again for a new token,
`submission_token_spent` saying the response is stored, `submission_token_required` naming
the header — and none clears anything: the answers are still on the page, and a refused attempt
spends no token. A new token is one read of the form away. The form's reply says
`Cache-Control: no-store`, asserted in *a response is stored once*. The server warns at startup
when it generates its key, and that warning now names drafts and forms being filled in, not
only sessions.

*Residual:* **the recovery is the host's.** A host that does not read the form again on
`submission_token_invalid` leaves the respondent with the refusal until they reload — and a
reload with no draft behind it loses the answers. **A cache that ignores `no-store` cannot be
worked around from the page**: reading the form again reads the same cache, and every response
after the first is refused until the cache is fixed. Nothing records either case beyond the
refusals themselves, and the request log (C3) has those, at `info`, only as statuses: a line
for each send names its route, `/f/:path/submissions`, and its `400` or `409`, but not which
refusal it was — the route answers a stale version `409` too, and a missing schema hash or an
unsolved challenge `400` — nor which form, since a line has no field for either.

### D19. The server stops answering because its rate limits cannot be counted

*How it arises:* every rate limit counts in a table in the database the replicas share
([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)).
When a count cannot be had quickly — somebody holds a lock on that table, or the database is slow
under load, which an anonymous flood on the public plane can bring about — every limited request
waits for one. Counting on the connections everything else uses, those waits take them: a count
waiting for a lock holds its connection, and the queries sent after it on that connection wait for
the lock too. Found in review, before release, in the counter's first version, which counted on
storage's connections: with the table locked, twelve submissions and a form's read after them had
no answer within five seconds.

*Severity:* nobody can open or submit any form, and nothing else that queries the database
answers, until the lock goes — an outage of everything, caused by a fault in a defence. Loud to
everybody; to the operator, one line on standard error.

*Constraint:* **the counter has connections of its own**, four a replica, which
`createPostgresRateLimitStore` opens from the database's address so that it cannot be handed
storage's pool. At most thirty-two counts are sent at once; one still waiting to be sent at the
bound is dropped unsent, and one sent is ended by the database at the bound, through those
connections' `statement_timeout`. A count not had within a second is decided by the route's own
declaration: submissions, drafts, challenges and file offers are admitted uncounted, so forms go
on being opened and submitted; a sign-in and a request to the model are refused with a `503`.
`shared-rate-limits.integration.test.ts` locks the table and holds that more submissions than
storage has connections are each admitted within the bound and that a form's read still answers —
red against the first version — that a count abandoned under the lock is ended by the database,
and that no more counts land once the lock goes than had been sent; `rate-limit-store.test.ts`
holds every registered limit to what it declares.

*Residual:* **while the counter cannot answer, nobody can sign in.** A login is refused with a
`503` whatever the password, so a form that needs a session cannot be completed by anybody not
already signed in, and an operator cannot sign in to the admin; sessions already issued keep
working. Anonymous load is enough to cause it: a flood on the public plane that slows the database
past the bound refuses every sign-in for as long as it lasts, where before 0170 a slow database
made a sign-in slow (`rate-limit-store.test.ts`, *a login is refused, and the answer says nothing
about the database*). Meanwhile the public plane has no limit (C1, C5), and each limited request
waits up to a second first. The counter's four connections count against the database's own limit
on connections; where `max_connections` leaves no room for them, the counter cannot connect and
every limit behaves as though it could not answer — a refused connection is what
`rate-limit-store.test.ts` counts over.

---

## E — Provenance is lost

### E1. A submission cannot be joined to the schema that produced it

*Constraint:* a real foreign key with `ON DELETE RESTRICT`
([0024](../decisions/0024-postgres-over-mongodb.md)), so orphaning is
structurally impossible rather than discouraged. Verified against a real
PostgreSQL instance rather than a mock.

*Residual:* none known at the database level.

### E2. A submission is silently migrated to a newer schema

*Constraint:* **submissions never migrate.** They stay bound to the exact
version that produced them, which is the property that makes an old submission
auditable at all. Only *drafts* migrate, and only on resume
([0027](../decisions/0027-lazy-draft-migration.md)).

*Residual:* none known.

### E3. A change that breaks stored data is classified as harmless

*How it arises:* `diffSchemas` reports a severity, and the draft-migration path
trusts it. A wrong answer here corrupts data quietly. **And there is a worse answer
than a wrong severity, which this entry did not describe until it was found: no
answer at all.** The function compared a field's identity, its type and its
`required` flag and nothing else, so an option withdrawn from a radio, a bound
halved, a rule added, a catalogue rewritten and a layout rearranged each produced
an EMPTY list — two materially different documents diffing to "nothing changed".
The option case is the one that loses data outright: a submission holding `"post"`
against a radio that no longer offers it carries a value outside the document's own
vocabulary.

*Constraint:* the diff walks **data paths** rather than the document tree
([0015](../decisions/0015-diff-before-server.md)). An adversarial review found
the critical defect in the first implementation — blindness to changes inside
nested containers, which would have classified a breaking change as compatible.
It was fixed and is covered by tests.

Every area of the document now has a comparator — options, bounds and patterns,
rules, catalogues, layouts, the form's own name and id — and **anything without one
is still reported**: a field property nobody compared as `field.changed`, a top-level
section nobody compared as `document.changed`, both `lossy`, because a change nobody
examined must not be called harmless
([0108](../decisions/0108-the-diff-reports-everything-that-changed.md)).
`packages/spec/src/diff.test.ts` holds fourteen edits against the kind and severity
each must be answered with, **and a case that none of them reaches either backstop** —
without which one catch-all would satisfy the whole table while classifying nothing.
Thirteen mutations were observed reddening their own cases; a fourteenth reddened
nothing and found dead code, which was removed.

*Residual:* this function is load-bearing for data integrity and is the place
where a future defect would be most costly. A manufacturer should treat it as a
focus area for their own verification. Three limits are known and deliberate.
**Every rule change is reported `lossy`, including ones that cost nothing**: deciding
otherwise means evaluating the rule against the data, which is the engine's work and
would make a pure comparison depend on a submission. **A rule has no id**, so identity
is its target, kind and code, and a rule moved between two targets reads as one removed
and one added. **The rename translation is textual**, because `@formancy/spec` is below
`@formancy/expressions` in the layering and carries no CEL parser; it is written to fail
towards "changed", so a substitution that is wrong reports a change rather than hiding
one.

### E4. One author's published form is replaced by another's without either being told

*How it arises:* two people open the same form in a builder. Both publish. The
second publish wins and nothing says the first ever happened. Because a
published version is immutable, the first author's document is **not destroyed**
— it is still a version, still readable, and every submission bound to it still
resolves ([0025](../decisions/0025-immutability-in-the-database.md)). What is
lost is that anybody noticed: `forms.current_version_id` moved past it, and the
first author's next page load shows a form they did not write, with nothing
saying why.

That the data survives is what makes this worth an entry. Nothing surfaces to
prompt the question, so the only signal is an author's memory of what they
wrote.

*Constraint:* a publish may **declare the version it opened**, and one declaring
a version that has since been replaced is refused with the current schema
attached, so the author sees what changed rather than being told no
([0092](../decisions/0092-publishing-declares-what-it-opened.md)). Declaring is
optional by design — a script composes a document rather than opening one — so
the guarantee is available to any client that opens a version, and the builder
does.

Two more clients declare now, and both are ones where the author is not
watching. `@formancy/mcp`'s `publish_form` takes a `basedOn` hash and refuses
when the server has moved past it, and `propose_form_edit` is what hands an
agent that hash along with what its edit would cost. Inside a builder the same
rule holds against the session rather than the server: an edit proposed by a
model is refused if the document changed while it sat on screen
([0109](../decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).

*Residual:* **a client that does not declare still overwrites silently**, and
that is deliberate: a non-interactive publisher has no version to declare — and
`basedOn` is optional for the same reason, since a form created for the first
time has nothing to be based on. An agent can therefore still lose an update by
omitting it, and what is done about that is the tool's description, which is
the only lever the protocol gives. A manufacturer whose process requires that
no published form can be replaced unnoticed must either restrict publishing to
clients that declare, or restrict `form.publish` to one role. There is also
**no merge** — the refusal shows the difference and a person decides. Nothing
detects two authors editing concurrently *before* one of them publishes.

---

### E5. A document declares a spec version its readers cannot read

*How it arises:* the spec version is a reader contract — a reader pinned to a version refuses
a document using a construct from a later one ([0051](../decisions/0051-spec-2-adds-types.md)).
The validator enforces the other side, refusing a construct newer than the version a document
declares. If it attributes a construct to the wrong version, it accepts a document that says
version N and that no version N reader can read: published, characterised as version N, and
refused by the reader a manufacturer pinned.

This happened in the code, and was found before it shipped: the version a **field type**
arrived in was computed as "1, else 2, else 3", which answered 3 for every type newer than
version 2. A version 3 document carrying a version 4 `ranking` was accepted
([0138](../decisions/0138-a-ranking-stores-the-order-chosen.md)). The widget check had had the
same shape and been fixed for widgets alone.

*Constraint:* each kind of construct is now attributed from each version's own list —
`SPEC_1_FIELD_TYPES`, `SPEC_2_FIELD_TYPES`, `SPEC_3_FIELD_TYPES`, and the widget and
property checks beside them. Asserted per construct: a version 3 document carrying a ranking
is refused and told version 4 (`packages/spec/src/ranking.test.ts`), and the migration guide's
section for each version is checked to name exactly that version's additions
(`apps/docs/src/claims.test.ts`).

*Residual:* **the newest version is the fallback in the check itself.** A construct in no
version's list would be attributed to version 4. Since version 4 froze, that is guarded from
outside: `packages/spec/src/spec-version.test.ts` fails when a field type or widget is in no
version's list, so a new one cannot be added without opening version 5 and its list
([0140](../decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)).

Properties, rule kinds and layout kinds had no such check until 2026-10-09: each was gated
by a line somebody remembered, a rule kind outside version 2's list was taken to be version
3's and a layout kind outside version 1's to be version 2's, and two version 2 properties —
`columns` on a repeater and `span` on a layout node — were never gated by name: a version 1
document carrying one was refused only through what carries it, the `datagrid` widget or the
`table`, or by a structural rule that said nothing about versions. Every one
of them now has its version in one ledger, keyed by the TypeScript type that lists them, so a
property added to `FieldDef` without a version is a compile error; `packages/spec/src/
version-ledger.test.ts` derives what a document may say from the document schema, requires
each to have a version, and requires the check to refuse it one version earlier
([0145](../decisions/0145-a-version-for-everything-a-document-can-say.md)). Watched failing
with the property gate removed, with a property added to the type alone, and with one added
to the schema alone. What it does not reach are the keys *inside* a property's value — a
datagrid column's, an option image's — which arrived with the property that holds them and
are compared with nothing.

## What a manufacturer must do with this

1. Map each entry onto a hazardous situation in the device, or record that it
   cannot produce one.
2. Pay particular attention to **A5** (visibility rules fail open), **C2** (no
   tenant boundary), **D3** (pattern linting not yet implemented) and the
   pre-release package versions. These are the entries where the residual risk
   is real rather than theoretical. Note which *spec* version you are
   characterising: `"1"` ([0042](../decisions/0042-freeze-the-spec.md)), `"2"`
   ([0051](../decisions/0051-spec-2-adds-types.md)) and `"3"`
   ([0088](../decisions/0088-spec-3-freezes-with-four-constructs.md)) are all
   frozen, so stored data written against any of them has a settled shape — and so is
   `"4"` ([0140](../decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)), what the source writes and 0.4.0 first releases. It is the
   software that is still moving; the format is settled in every version it has.
3. Decide whether automated accessibility checking is sufficient evidence for
   the device's intended users, and plan a manual audit if it is not.
4. Treat the 118 known CEL corpus failures as a functional limitation to be
   assessed against the expressions the device's forms actually use.

## Starter-template suitability

Gallery language input is mapped to the three supported locale literals before
translation lookup, and editor-link parameters are URI-encoded. An unexpected DOM
value must not crash the gallery or change another query parameter. The site test
injects such a value and checks both card and preview editor links; it failed with
an undefined translation lookup before the runtime validation was added.

*How it arises:* a general-purpose template is treated as an approved clinical,
legal or organisation-specific form because it can be imported and passes validation.

*Constraint:* catalogue adaptation notes identify decisions the host must make;
healthcare entries are administrative and include no clinical scores or triage rules.
Samples remain separate from form documents and the gallery and playground start
blank. `apps/docs/src/templates.test.ts` checks samples and scenarios against the
engine; the UI tests check that fictional sample names do not appear as defaults.

*Residual:* those tests establish the specified software behaviour, not the
appropriateness, completeness or translation accuracy of a real deployment's
questions. The adopting organisation must review the chosen content and workflow.
