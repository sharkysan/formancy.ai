# 11. Risks and technical debt

Written so that a reader can tell what is known-and-accepted from what is
merely not done yet.

## 11.1 The three riskiest pieces

### The builder

Larger than the spec, engine, React renderer and server thin slice combined. It
is imagined as "drag fields onto a canvas" and is actually: a nested-container
drop model, undo/redo over a document model, a property editor that **must be
generated from the spec's JSON Schema** because twenty-five hand-written panels
rot within two releases, a round-trippable logic authoring interface, live
preview, CSS isolation inside arbitrary host applications, and WCAG 2.2
SC 2.5.7, which legally requires a complete keyboard path for every drag
operation.

*Mitigation, already applied:* `@formancy/builder-core` exists and its commands
are keyboard-shaped — insert, move, remove, rename — because building the drag
affordance first is how the keyboard alternative ends up unfinished. The
document engine is done and tested before any canvas exists.

### Angular renderer parity

The reactivity impedance mismatch. Bind an external non-signal store naively
into zoneless `OnPush` Angular and you get either missed updates or a whole-form
re-render per keystroke, which destroys the performance claim outright.

*Mitigation, already applied:* Angular was built **second**, not last, which
forced the engine's subscription API to be framework-neutral rather than
React-shaped while there was still time to change it. Both renderers now pass
the same fixtures with no skips.

*Residual:* Angular users will demand a position on Signal Forms. The position
is interop, not inheritance — Signal Forms' schema is authored statically in
TypeScript and formancy's is dynamic runtime JSON — via a Standard Schema v1
adapter, plus `ControlValueAccessor` support for existing `ReactiveFormsModule`
code. Neither is built.

### Versioning and draft migration

Looks like a `version` column; is actually a distributed-systems problem; is
the one class of mistake that cannot be refactored once users have production
data.

*Mitigation, already applied:* immutability enforced by a database trigger
([0025](../decisions/0025-immutability-in-the-database.md)), binding by both
foreign key and hash ([0026](../decisions/0026-bind-by-fk-and-hash.md)),
declared renames ([0011](../decisions/0011-declared-renames.md)), lazy
migration with an `__orphaned` bucket that never deletes
([0027](../decisions/0027-lazy-draft-migration.md)), and `diffSchemas` built
before there was any data to corrupt
([0015](../decisions/0015-diff-before-server.md)).

*Residual:* `diffSchemas` is load-bearing for data integrity and an adversarial
review already found one critical defect in it. It is the place where a future
defect would be most costly.

## 11.2 Known technical debt

| Debt | Why it exists | What it costs |
|---|---|---|
| **Uploaded files are not scanned** | A `ScanHook` with a ClamAV sidecar is designed and not built | A file is trusted the moment its bytes land. They are only ever served as authenticated attachments, so the exposure is to whoever downloads one deliberately ([0055](../decisions/0055-files-are-claimed.md)) |
| **No resumable or multipart upload** | Deferred | The deployment's byte ceiling is also the largest single file, and a dropped connection restarts the whole thing |
| **Only a local-disk file store** | `docker compose up` has to work | It does not survive more than one replica; the `FileStore` interface is shaped so an S3 adapter replaces one file |
| **Async validators do not exist** | Deferred; they need a new rule kind, which is a spec 2 change | The version line exists for it, and `runsOn` is in place so the ordering question can be answered without restructuring ([0043](../decisions/0043-runs-on.md)) |
| **A `recheck` verdict of `unknown` is accepted** | Refusing on undecidable would reject patterns that are fine | Every `pattern` is analysed at publish time and a vulnerable one refused — the check found a polynomial case in formancy's own email format the first time it ran — but an analysis that times out lets the pattern through ([0045](../decisions/0045-reject-backtracking-patterns.md)) |
| **Rate limiter store is per-process** | `@fastify/rate-limit`'s default | Wrong behind more than one replica; documented rather than fixed |
| **The image is not published or signed** | No registry chosen yet | It builds locally from `docker compose up`. Signing it with cosign belongs in the release workflow once there is somewhere to push it |
| **`@formancy/builder-react` is not on npm** | Written after 0.1.0 was cut | Ten packages are published with provenance; the builder is reachable only by cloning, which is the package a prospective adopter most wants to see |
| **No manual accessibility audit, no VPAT** | Requires assistive-technology testing that has not been done | The accessibility claim rests on automated checking, which covers roughly 57% |
| **`@marcbachmann/cel-js`: 118 known corpus failures** | The library implements most, not all, of CEL | Enumerated in `CEL-CONFORMANCE.md`; a form using an affected construct behaves incorrectly |
| **No requirements traceability matrix** | Requirements live as fixtures and budgets, not as a numbered list | A regulated consumer must construct traceability themselves |

## 11.3 Accepted architectural risks

These are not debt. They are consequences of decisions that were made with the
downside understood.

**Two renderers to maintain, forever.** The cost of
[0004](../decisions/0004-headless-core.md). Paid down by the conformance suite,
which makes drift a test failure rather than a discovery.

**The server is locked to Node.** The cost of
[0006](../decisions/0006-one-engine-build.md). A future Go or Java
implementation must reimplement the engine against the spec — which is part of
why a portable expression language was chosen.

**Expressions cannot reference runtime-computed paths.** The cost of
[0018](../decisions/0018-static-dependencies.md). Dynamic indirection is simply
not expressible, in exchange for cycles being impossible.

**Visibility rules fail open.** The cost of
[0022](../decisions/0022-fail-open-fail-closed.md). A form whose visibility
rules are quietly failing looks as though it works and shows more than it
should. This is the residual risk most worth a consumer's attention.

**TypeScript is pinned below `latest`.** The cost of supporting Angular as a
co-first target ([0039](../decisions/0039-pin-typescript.md)). It will look
arbitrary in six months, which is why it is written down.

**Apache-2.0 permits a competitor to operate formancy as a service.** The cost
of [0002](../decisions/0002-apache-2-0.md), accepted on purpose; the answer is
the open-core line, not a licence restriction.

## 11.4 The spec freeze, and what it locked in

The spec froze to `"1"` on 2026-09-20 ([0042](../decisions/0042-freeze-the-spec.md)).
All three of the semantics it was waiting on were settled first: hidden-field
answers ([0013](../decisions/0013-hidden-field-semantics.md)), repeater row
identity ([0041](../decisions/0041-repeater-row-identity.md)) and where a
validation check runs ([0043](../decisions/0043-runs-on.md)).

That converts several open questions into locked-in bets. The ones worth
knowing about, because they are now expensive to revisit:

- **A page contributes nothing to a data path**
  ([0012](../decisions/0012-pages-scope-nothing.md)). Moving a field between
  pages never moves data, and that is now permanent.
- **`_id` is reserved** and no field may use it
  ([0041](../decisions/0041-repeater-row-identity.md)).
- **CEL is the expression language** ([0016](../decisions/0016-cel.md)), with
  its 118 known corpus gaps.

The packages are **not** frozen and are nowhere near 1.0. Conflating the two is
the likeliest misreading of the freeze.

## 11.5 Open decisions

Genuinely undecided, and recorded as such rather than quietly defaulted:

- **CLA or DCO.** A contributor licence agreement preserves the option of
  proprietary enterprise builds but reads as "they plan to relicense" and
  measurably suppresses contributions on a young project. A DCO is lighter but
  makes relicensing effectively impossible once there are contributors. This
  must be settled **before the first external pull request**, because
  retrofitting a CLA is effectively impossible.
- **Trademark registration.** Cheap now, effectively impossible after adoption,
  and it is what preserves the commercial hosted option without relicensing.
- **`@formancy/builder-react` is not published.** The scope is claimed and ten
  packages are on npm at `0.1.0` with provenance; this one was written after
  that release was cut. It is the package a prospective adopter most wants to
  *see*, so the gap is worth closing in the next release rather than the one
  after.
