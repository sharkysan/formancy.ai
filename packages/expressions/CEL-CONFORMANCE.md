# CEL conformance

formancy's expression layer wraps [`@marcbachmann/cel-js`][impl], which claims
to implement "most of the CEL spec" without publishing a score. This is the
audit that turns that claim into numbers, run against the **official**
conformance corpus shipped in `@bufbuild/cel-spec`.

It is reproducible: `pnpm --filter @formancy/expressions test`, in
`src/cel-spec-corpus.test.ts`. The counts below are asserted there, so a change
in any of them is a review item rather than a silent drift.

## Results

| | Cases |
| --- | ---: |
| In the official corpus | 2344 |
| **Run through formancy's facade** | **704** |
| — passed | 586 |
| — failed | 118 |
| Refused by formancy's own limits (by design) | 2 |
| Excluded, with a stated reason | 1638 |

**Of what is run, 83% passes.** The remaining 17% is not a single "we are
incomplete" number — it decomposes into five classes, and most of them are
formancy being deliberately *stricter* than CEL rather than failing to
implement it.

## What was excluded, and why

Exclusions are counted per reason, never skipped silently. The corpus tests all
of CEL; formancy exposes a deliberately smaller surface to form authors.

| Reason | Roughly |
| --- | --- |
| protobuf messages, enums, field selection, containers, Any/JSON dispatch | the bulk |
| extension libraries not registered (`math_ext`, `encoders_ext`, `bindings_ext`, `block_ext`, optionals) | large |
| `uint` literals and `uint()` — unsigned 64-bit is not a form value type | moderate |
| `bytes` / `b'…'` — not a form value type | moderate |
| `duration()` / `timestamp()` literals — bound at the value boundary instead | small |
| check-only cases, and cases declaring a proto type environment | small |

A form value is JSON. Unsigned integers, byte strings and protobuf messages are
not, so a conformance number that counted them would be measuring the wrong
thing.

## The 118 failures, by class

### 1. Undeclared variables — 50 cases (42% of failures)

```cel
x || true          // corpus expects: true
f_unknown(17) || true
```

CEL's runtime absorbs unknowns and errors when the other operand decides a
logical expression. formancy rejects an unknown identifier at **compile** time,
which is when a form author presses save.

This is the behaviour we want and would not trade: a typo in a field name
becomes a message the author sees immediately, instead of an expression that
silently evaluates to `true` for every person who fills in the form. The test
asserts this count stays at 50 — if it dropped, it would mean the check-time
guarantee had been weakened.

### 2. Parse-level rejections — 29 cases

`unexpected_character` (22), `unexpected_token` (6), `expected_token` (1).
Syntax outside the surface formancy accepts — largely protobuf message
literals and reserved-word edge cases the corpus probes deliberately.

### 3. Heterogeneous collection literals — 19 cases

```cel
['1', '2', null] == ['1', '2', '3']
{'k': 1, 'j': 2} == {'k': 1, 'j': null}
```

CEL infers `dyn` for a mixed-type list or map literal. formancy refuses it when
the form is saved.

A mixed-type literal inside a *form rule* is almost always an author mistake,
and the alternative is a rule whose behaviour depends on which branch a
particular submission takes. Documented as intentional; revisit if a real form
ever needs it.

### 4. Mixed numeric comparison — 6 cases

```cel
1.0 == 1           // CEL: true.  formancy: no_such_overload at check time.
[1] == [1.0]
```

Already known before this audit and pinned in `conformance.test.ts`. The
upstream implementation has no heterogeneous numeric equality overload.
Ordering (`1 < 1.5`) does work, which makes the gap inconsistent rather than
principled — it is an upstream limitation, not a formancy choice.

**Consequence for a form author:** compare like with like. `qty == 1` where
`qty` is a decimal field needs `qty == 1.0`.

### 5. Integer range — 3 cases, and the one real capability gap

```cel
-9223372036854775808     // int64 minimum
```

formancy normalises CEL's `int64` to a JavaScript number, so integers outside
±2^53 are unavailable. CEL proper carries the full 64-bit range.

**Consequence for a form author:** a field holding a large external identifier
(a 19-digit order number, a Snowflake ID) must be a `text` field, not a
`number` one. This is the only class here that is a genuine limitation rather
than a deliberate narrowing, and it is the one worth revisiting.

### Remainder — 11 cases

`invalid_logical_operand` (4), `cel_error` (3), ternary branch typing (1),
variable type mismatch (1), and two cases where a boolean came back inverted
under mixed-type comparison. Small enough to enumerate, not yet grouped into a
principle.

## What this audit does not cover

- **Only the evaluation corpus.** The separate parsing and checking suites in
  `cel-spec` are not run; formancy's checker is its own, layered over the
  implementation's.
- **No protobuf surface at all**, by design.
- **The safety policy is not measured here.** Structural limits, per-kind
  function allow-lists, metering and the decimal type have their own tests;
  only two corpus cases touched the limits, and both were correctly refused.

## Verdict

For the subset of CEL a formancy form author can actually write, the
implementation is sound. The failures are dominated by formancy choosing to
reject at save time what CEL would resolve at evaluation time — which is the
right trade for a tool where the author and the person filling in the form are
different people, hours or months apart.

The one item to carry forward is the integer range.

[impl]: https://github.com/marcbachmann/cel-js
