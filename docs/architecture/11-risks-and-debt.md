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
| **Spec version 0 is unstable** | Three properties were undiscoverable without a renderer and a server in the loop | Anyone building on it now may have to migrate documents |
| **Repeater rows carry no identity** | Never settled; `addRow` pushes `{}` and both renderers key by index | **Blocks the spec freeze** — see below |
| **`runsOn` and `async` are not reserved** | Intended to be, and were not | `logicRule` is `additionalProperties: false`, so adding either is a spec bump rather than an additive change |
| **`recheck` pattern linting is designed, not implemented** | Deferred past the walking skeleton | A form author's regular expression can still hang the server ([SAFETY-ANALYSIS D3](../regulatory/SAFETY-ANALYSIS.md)) |
| **Rate limiter store is per-process** | `@fastify/rate-limit`'s default | Wrong behind more than one replica; documented rather than fixed |
| **No server container image** | Distribution work not started | `docker compose up` gives a database, not a product |
| **No release artefact signing** | Not started | npm provenance, cosign and a CycloneDX SBOM are designed and absent |
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

## 11.4 What the spec freeze is actually waiting on

The plan named three things as undiscoverable without a renderer and a server
in the loop, and therefore as the reasons to ship `specVersion: "0"` and freeze
later. Their current state:

| Gate | State |
|---|---|
| What happens to a hidden field's answer | **Settled.** `clearOnHide`, specified, property-tested, and applied identically on the server ([0013](../decisions/0013-hidden-field-semantics.md)) |
| Repeating-group item identity | **Not settled.** Settled by default as *no identity*, which is the answer the design argued against |
| Async validation versus submit ordering | **Not settled**, because async validators do not exist |

Row identity is the one that blocks. It is a question about the shape of stored
data, not about rendering: a row is `{}` today, and giving rows a generated id
later adds a key to every row of every submission already collected. After the
freeze that is a migration of user data or a permanently dual-shaped reader.
Before it, it is a decision.

Keying by index also has a present-tense cost the design predicted — removing a
row renumbers every row after it, which moves focus and breaks animations.

The other two are cheaper. Reserving `runsOn` and `async` as optional
properties with safe defaults is a small change that makes the async ordering
question answerable at v2 instead of forcing a v2 to ask it.

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
- **The `@formancy` npm scope is unclaimed.** Every package manifest is
  prepared for publication, but the scope itself has not been registered.
