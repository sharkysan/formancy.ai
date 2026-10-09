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
consequential residual risk in this document. In a context where a hidden field
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

---

## C — Data reaches the wrong party

### C1. An account's existence is disclosed by a failed login

*Constraint:* `authenticateLocal` verifies against a decoy hash when no user
exists, so both paths do the same work and return the same error
([0031](../decisions/0031-enumeration-resistant-login.md)).

*Residual:* `@fastify/rate-limit`'s default store is per-process, so behind
more than one replica every limit counts a fraction of the traffic and permits
a multiple of what it says. Login is limited to 10 attempts per IP per minute
and submission to 30, both counting attempts rather than successes — but a
distributed attacker with many addresses is not meaningfully slowed by either.

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

*Constraint:* **there is no request log.** `@formancy/server` constructs Fastify with
`logger: false`, so handling a request writes no request line and no error line —
submission content cannot reach a request log that does not exist. Asserted on the
constructed app in `packages/server/src/server.integration.test.ts`, which fails if a
logger is enabled.

*Corrected 2026-10-09.* This entry said the server emitted "no output of any kind". The
process writes to its own standard streams in six places: refusing to start without
`DATABASE_URL`, warning that it generated an ephemeral `FORMANCY_AUTH_SECRET`, the line
saying it is listening, and an error from each of three background workers — the outbox,
the file collector and the challenge sweeper — when a pass fails. **Those three print
whatever was thrown, unredacted**, and a Drizzle query error carries the failing query's
text and its parameters in its message. The queries those passes make today carry
identifiers, timestamps, delivery state and a delivery's last error rather than
submission content — but that is a property of today's queries, not a constraint, and
nothing fails if a worker starts handling content. The libraries are held to writing
nothing at all ([0115](../decisions/0115-a-library-writes-nothing-to-its-hosts-console.md)).

*Corrected 2026-09-28.* This entry previously said "structured logging with configurable
PII redaction; submission `data` is not logged by default". **Neither half was true:**
`logger: false` has been there since the server was written, and nothing in this repository
redacts anything — the word `redact` appears in no source file. The characterisation
described a design that was planned and never built, which is the failure this document's
own preamble warns about, found by review rather than by a gate. The guard above is the
gate it lacked.

*Residual, and it is larger than the constraint:* **no log means no diagnostics.** A
self-hoster debugging a failed webhook or a 500 has the audit log — which records
mutations, in the same transaction, including submission reads — and nothing else. A
deployment that adds a logger takes on the redaction question itself, and formancy offers
it no help: there is no redaction configuration to set, and an unhandled exception carrying
a payload would then be printed. A manufacturer needing operational logging must build it,
and must treat submission content as reaching it.

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
so `img-src 'self'` suffices; and there is no worker, no font and no outbound request the
library makes on its own.

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
they used to be the only unauthenticated write.

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

*Residual:* nothing stops an author choosing a third-party address, and nothing tells
the person filling the form in that one was chosen. A deployment that must not disclose
it should refuse such documents at publish, which formancy does not do for it, or set
an `img-src` policy that names only itself.

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
`apps/docs/src/themes.test.ts` refuses one that is not — nine physical properties by
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
and versions `"1"`, `"2"` and `"3"` are frozen — so it belongs to **version `"4"`, which
is open** ([0104](../decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)), where it
would be a migration with a report rather than a silent breakage. That it is open does not
make it decided: a version that only ever adds cannot refuse something an older one
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

One thing does reach further than a review: an example with its answer written down.
`runScenarios` executes a form against saved examples and reports which stopped holding,
which is the only check in this product that can tell a condition that compiles from the
condition that was asked for — both spellings of an inverted rule are valid CEL
([0110](../decisions/0110-a-form-is-checked-against-examples.md)). Both builders carry a
panel that reruns them after every edit and **names** what broke, and `check_scenarios`
is the same check for an agent
([0111](../decisions/0111-a-scenario-panel-names-what-stopped-holding.md)).

*Residual:* the review shows what changed, not whether it is what was asked for — that
judgement is the person's and cannot be delegated to the thing being judged. Scenarios
narrow it rather than close it: they check the rules somebody thought to write an
example for, and a form has no way to know which rules those are not. It is a
change list rather than a side-by-side of the two documents, so an edit's *shape* is
visible and its wording is not. And pressing the button is one click: nothing here
distinguishes a reviewer who read the list from one who did not, which is the limit of
what software can assert about attention.

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
   frozen, so stored data written against any of them has a settled shape.
   **Version `"4"` is open** and is what the source writes
   ([0104](../decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)): it may
   still gain constructs, so characterise a frozen version unless you are
   following the source deliberately. It is the software that is still moving —
   and, for version 4, the format with it.
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
