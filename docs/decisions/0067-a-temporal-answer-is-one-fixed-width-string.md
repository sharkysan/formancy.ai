# 0067 — A temporal answer is one fixed-width string

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/temporal.test.ts` (25 cases: the shapes each
  accept and refuse, the version gate for both types *and* for the bounds, a bound in
  another type's form refused, an impossible range refused, and an assertion that
  sorting the strings gives chronological order — which is the property the whole
  design buys). `packages/core/src/temporal-validators.test.ts` (9 cases at the
  engine: shape before bound, which end a bound failed, and the `date` behaviour
  change). Widening any pattern in `TEMPORAL_SHAPES` fails the ordering assertion.

## Context

`time` and `datetime` were reserved names in `types.ts` and nothing else. The hard
part was never the string format; it was determinism and comparison.

**CEL has no time type.** A temporal answer binds as a `string`, so the only ordering
available to a rule or a bound is lexicographic — and lexicographic order equals
chronological order only under conditions the format has to guarantee. Measured
rather than assumed:

| comparison | as strings | chronologically |
|---|---|---|
| `'9:30' < '10:00'` | false | wrong — 9:30 is earlier |
| `'09:30' < '10:00'` | true | correct |
| `'2026-09-19T10:00:00+03:00' < '2026-09-19T08:00:00Z'` | false | **true** — the first is 07:00Z |
| `'2026-09-19' < '2026-09-19T00:00:00Z'` | true | false — they are the same instant |

The first two say an unpadded hour turns every bound into a coin toss. The third says
a numeric offset makes two answers to one field incomparable. The fourth says a date
and a datetime are not comparable at all, whatever anybody's intuition.

**And the engine is isomorphic.** `now()` is frozen per transaction and the server
pins the clock per submission, so a value whose meaning depends on who is reading it
cannot be compared with the clock on both sides and agree. This repository had already
decided that for expressions: `bindTimestamp` in `@formancy/expressions` refuses a
zoneless string outright, with the reason in its comment — "a submission that
evaluated in the browser must replay byte-identically on a server whose zone the
browser never knew".

## Decision

**One canonical form per type, at one fixed width, declared once.**

| type | shape | width |
|---|---|---|
| `date` | `YYYY-MM-DD` | 10 |
| `time` | `HH:MM`, 24-hour | 5 |
| `datetime` | `YYYY-MM-DDTHH:MM:SSZ` | 20 |

`TEMPORAL_SHAPES` holds the patterns, the JSON Schema carries the identical strings,
and the engine compiles them from the same source. Two closed descriptions of one rule
is the drift this repository keeps finding.

**`datetime` is an instant; `time` is a wall clock.** A `datetime` records a moment,
always UTC, always `Z`, always with seconds, never a numeric offset and never a
fractional part. A `time` carries no zone and is therefore *not* an instant: it cannot
be compared with `now()`, and that is what a time of day **is** rather than a gap in
the design.

**There is no per-field `timezone` property, and the absence is the decision.** Two
real cases exist and neither wants one. An instant already carries its zone. A
wall-clock commitment's zone belongs to the *answer* — which clinic, which branch —
so a per-field constant is wrong for every form where it varies by row. And a zone
*name* would put the host's IANA data into the replay contract: two runtimes with
different ICU versions would disagree about the same answer, which
[0019](0019-injected-capabilities.md) and the safety analysis's A2 forbid. When the
wall clock is the commitment, a `date` field and a `time` field say it.

**Bounds are `earliest`/`latest`, not `min`/`max`.** Those are `number` and gated to
number fields; widening them to `number | string` would let TypeScript accept
`min: "5"` on a field the schema refuses — the types-versus-schema drift this
repository keeps finding. One pair per meaning is the existing habit:
`minLength`/`maxLength`, `minItems`/`maxItems`.

**A bound is a literal, never an expression and never the clock.** `now()` inside one
would let the same submission pass in the browser and fail on the server by the width
of the trip. "Must be in the future" stays a `validate` rule, where the race belongs
to the author and is visible to them.

**The shape is checked before the bound**, and a value of the wrong shape fails with
`shape` rather than being compared. Comparing it produces an ordering nobody
predicted, and on the server that is the hostile-payload path: a bounded field becomes
unbounded for anyone who sends a value the bound cannot order.

## Consequences

**`date` now has its shape checked, which is a behaviour change to a frozen type.**
Version 1 fixed `date` as a date-only ISO 8601 string and nothing ever enforced it, so
a deployment posting `19/09/2026` has been accepted until now and starts failing.

Taken deliberately rather than slipped in. The freeze promises a version 1 *document*
keeps validating; it does not promise a malformed *answer* keeps being accepted — and
an unchecked date cannot be bounded, sorted, or exported without the reader guessing
which of `03/04` is the month. It is in the changelog and in the test that asserts it.

**`date` also gains the bounds, in version 2.** Not a contradiction with the freeze,
for the same reason `widget` landed on `checkbox`: an optional property only a version
2 document may carry takes nothing from any version 1 document. It is *not* additive
within version 1 — the schema is closed, so a version 1 reader answers `Unknown
property "earliest"` and refuses everything, which is why `versionErrors` gates it.

**The renderers had to ship in the same change.** A field type with no component
renders nothing and drops the answer, which is precisely
[0051](0051-spec-2-adds-types.md)'s silent failure. So both renderers gained controls,
and the `datetime` one carries the only genuinely subtle code here: no browser has a
zoned datetime input, so the control shows a local wall clock and the component
converts in both directions. Rendering the stored instant with `toISOString()` would
show UTC in a box the browser labels local, and the reader would see an hour they did
not type.

**A person's answer always has `00` seconds**, because the control offers none. The
format keeps the seconds because a machine-supplied answer has them and one fixed
width is what makes ordering work.

**Two guards caught this addition and one of them was the wrong shape.** The
conformance package's total `Record<FieldType, true>` failed to compile, exactly as its
comment promises. The site's landing page carried a literal `15` field types with a
test guarding it — the test worked, and the literal was the mistake: it is derived from
the spec's own list now, like the decision-record count beside it, rather than
corrected to 17 for somebody to correct again.

## Alternatives considered

**A zoneless wall-clock `datetime`.** Rejected on measurement:
`timestamp("2026-09-19T10:00:00")` is `invalid_timestamp` in this build, so such a
value could never be compared with `now()` — the one thing anybody wants to do with a
datetime — and `bindTimestamp` already refuses it for the replay reason.

**Accepting any offset and normalising on read.** Rejected because the stored answer
is what a consumer reads years later with none of this code, and because two answers
to one field would sort wrongly against each other. Normalising on *write* is what
this does.

**Seconds optional in `datetime`, or a fractional part allowed.** Rejected: a second
width is a second ordering. `'…T08:00Z' < '…T08:00:00Z'` is true, so the abbreviated
form sorts before the expanded form of the same instant.

**Reusing `min`/`max`.** Rejected above on the types-versus-schema asymmetry.

**Storing an epoch number.** Rejected: unreadable in a stored submission, and it
throws away the distinction between an instant and a wall clock that this record exists
to keep.

**Leaving `date` unchecked** to avoid the behaviour change. Rejected as the more
dishonest option: the type would keep a documented shape that nothing enforced, and
the first `earliest` bound on a `date` field would then be comparing against values
that may not be dates at all.
