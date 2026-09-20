# 0041 — A repeater row carries its own identity

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** the `row identity` block in
  `packages/core/src/repeater.test.ts` — eight tests covering minting,
  distinctness, survival across a removal, non-reuse of a deleted id, seeding,
  adoption of id-less data, and preservation of an id that arrived with the
  data. `validateSchema` refuses a field keyed `_id`, pinned in
  `packages/spec/src/validate.test.ts`. Both renderers key on it:
  `packages/react/src/form.tsx` uses `key={rowId}` and
  `packages/angular/src/form.ts` uses `track row.id`.

## Context

A repeater's rows were addressed only by position. That is enough until a row
is removed, at which point every row after it renumbers — and three separate
things break.

A renderer keyed by index makes the framework reuse the wrong DOM nodes, so
focus lands in a different row than the one the person was working in and
animations play on the wrong element. A stored submission has no way to say
which row an answer belonged to, so an export or an audit read two years later
can describe row 2 but cannot identify it. And anything holding a reference to
a row — a draft, a log line, a per-row comment — is silently pointing somewhere
else after a deletion.

This was one of the three semantics the spec freeze was explicitly waiting on
([0009](0009-independent-spec-version.md)), because it is a question about the
shape of stored data rather than about rendering.

## Decision

Every row carries `_id`, minted by the engine, **inside the row object** and
therefore inside the submission. `_id` is reserved: `validateSchema` refuses a
field that tries to use it as a key.

Ids come from a per-repeater counter rather than a random source, because the
engine has no ambient randomness to draw on
([0019](0019-injected-capabilities.md)) and uniqueness is only ever needed
within one repeater of one submission. The counter is monotonic for the
engine's lifetime and is never decremented on removal, so a deleted row's id is
never reissued — a new row wearing a dead row's id would be indistinguishable
from it in any record that mentioned the first.

Rows that arrive without an id are adopted on load, so data written before this
decision is not stranded. An id that arrives is kept, and the counter advances
past it so the next row cannot collide with what is already there.

## Consequences

**What it buys.** Renderers key on identity, so focus and animation follow the
row rather than the position. A submission is self-describing: the row is
identifiable from the stored data alone, without the engine that wrote it,
which is the same property that makes binding a submission to its schema
version worth doing ([0026](0026-bind-by-fk-and-hash.md)).

**What it costs.** `_id` is now reserved, and no field may use it — a real
restriction on form authors, enforced at save time so it is refused rather than
discovered. Row ids appear in the submission payload and in CSV exports, which
is noise for a human reading one; that is accepted, because an export that
cannot identify its rows is the failure this exists to prevent. The conformance
runner strips ids before comparing payloads, since the engine mints them
identically for every renderer and making each fixture spell them out would
test nothing about the renderer under test.

## Alternatives considered

**Keep identity outside the data**, in a structure the engine maintains.
Rejected: it dies with the engine instance, so the stored submission is back to
having no answer, and a draft resumed in a new session would renumber.

**Use a random or UUID id.** Rejected: the engine has no ambient randomness by
construction, and routing id generation through the injected capabilities would
make capabilities mandatory for any schema containing a repeater — a large
ceremony increase for a guarantee (global uniqueness) that is not needed.

**Reuse the lowest free number after a deletion.** Rejected: it makes a new row
indistinguishable from a deleted one in any log or export that recorded the
first, which defeats the purpose.
