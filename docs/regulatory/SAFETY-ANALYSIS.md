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

### B2. A saved draft loses answers when the form changes underneath it

*How it arises:* a form is republished while somebody has a draft in progress.

*Constraint:* drafts migrate lazily on resume, driven by the severity that
`diffSchemas` reports
([0027](../decisions/0027-lazy-draft-migration.md)). Answers belonging to
removed fields move to `data.__orphaned` and are **never deleted**. A breaking
change leaves the draft read-only against its original version rather than
guessing.

*Residual:* orphaned data persists indefinitely, which is a data-retention
question a deployment must answer.

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

*Constraint:* structured logging with configurable PII redaction; submission
`data` is not logged by default.

*Residual:* a deployment that raises the log level, or an unhandled exception
carrying a payload, can defeat this. Log configuration is a deployment
responsibility.

### C4. Arbitrary script executes in the page

*How it arises:* the usual route in this product category is a library that
evaluates user-authored logic with `new Function`, which forces a relaxed
Content-Security-Policy on every page that embeds it.

*Constraint:* no `eval` and no dynamic function construction anywhere
([0040](../decisions/0040-no-eval.md)). CEL is interpreted over its own AST and
the schema validator is generated ahead of time as a committed artefact. The
result is that formancy runs under a strict CSP with no configuration.

*Residual:* renderers emit the application's own markup. A consuming
application that injects unsanitised HTML into a form is outside this boundary.

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
is swept, which is a weaker bound than an expiry. The two routes also still have
no rate limit of their own, unlike the submission route. And this hazard was
absent from this document until the code was fixed — C2 covers a *submission*
read by somebody not entitled to it, and a draft is not a submission and took a
different route. An analysis that misses a live hole is a worse artefact than the
code was, and the omission is recorded here rather than quietly filled in.

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
trusts it. A wrong answer here corrupts data quietly.

*Constraint:* the diff walks **data paths** rather than the document tree
([0015](../decisions/0015-diff-before-server.md)). An adversarial review found
the critical defect in the first implementation — blindness to changes inside
nested containers, which would have classified a breaking change as compatible.
It was fixed and is covered by tests.

*Residual:* this function is load-bearing for data integrity and is the place
where a future defect would be most costly. A manufacturer should treat it as a
focus area for their own verification.

---

## What a manufacturer must do with this

1. Map each entry onto a hazardous situation in the device, or record that it
   cannot produce one.
2. Pay particular attention to **A5** (visibility rules fail open), **C2** (no
   tenant boundary), **D3** (pattern linting not yet implemented) and the
   pre-release package versions. These are the entries where the residual risk
   is real rather than theoretical. Note that the *spec* is frozen
   ([0042](../decisions/0042-freeze-the-spec.md)), so stored data has a settled
   shape; it is the software that is still moving.
3. Decide whether automated accessibility checking is sufficient evidence for
   the device's intended users, and plan a manual audit if it is not.
4. Treat the 118 known CEL corpus failures as a functional limitation to be
   assessed against the expressions the device's forms actually use.
