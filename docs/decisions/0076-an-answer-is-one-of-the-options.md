# 0076 — An answer is one of the options

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/engine-validators.test.ts` (7 cases: a refused value
  on each of the three types that offer options, every offered value accepted, one bad
  tick in an otherwise correct list, a field with no options saying nothing, emptiness
  left to `required`, a scalar where a list belongs, and the value compared rather than
  the label). Written before the check and observed failing on three of them. The check
  lives in `modelViolations`, which is the one function the browser and the server both
  run, so a test of it is a test of both.

## Context

`formancy.schema.json` documents `widget: "typeahead"` with **"The answer is still one of
the options offered"**, and `types.ts` says **"Still one offered option value."** Neither
was true. Measured against the built engine — the same build the server runs, so this is
the hostile-payload path and not a question about the UI:

```
submit() returns: {"ok":true,"errors":{}}
validate():       {"valid":true,"errors":{}}
value:            {"country":"XX","colour":"plaid","extras":["nope"]}
```

A `select` offering `CH` and `DE` accepted `XX`. A `radio` offering only `red` accepted
`plaid`. A `selectboxes` offering only `gift` accepted `["nope"]`. `required` was
satisfied, because `"XX"` is not empty.

**The controls could not produce any of it**, and that is why it survived. Each reaches
`setValue` with an option's own value or with `null`, in both renderers — structure rather
than validation. But a payload posted straight at the server is not a control, and
[`SAFETY-ANALYSIS.md`](../regulatory/SAFETY-ANALYSIS.md)'s hazard A6 already said the
quiet part: *"the engine validates the value rather than its provenance."*

So the guarantee was a property of the components, described in the format's own
documentation as a property of the format.

## Decision

**`modelViolations` refuses a value that no option offers, with the code `option`.**

**There, and not in a renderer**, because it is the one function the browser and the
server both run — the property this whole architecture rests on. A check in a control
protects the people using that control; a check here protects the submission.

**Only when the document carries options.** A `select` may have none: the schema adds
`options` through an `if`/`then` branch and `$defs.field` requires only `key` and `type`,
so a field with no list has nothing to be outside of. That is deliberate and it is the
seam remote options will need — a list that lives outside the document cannot be checked
against the document.

**The value, never the label.** What somebody sees is not what the form stores; a check
that matched labels would accept `"Switzerland"` and refuse `"CH"`, which is the answer
inverted.

**One code for a list, not one per bad tick.** `selectboxes` reports `option` once. Naming
the index would describe the payload rather than the question, and the field is wrong
either way.

## Consequences

**This can refuse data that was accepted before, and that is the point.** A stored
submission is never revalidated, so nothing already collected changes. A **draft** is
different: resume one that holds a value whose option the author has since deleted, and it
now reports `option` where it used to say nothing. That is the honest outcome — the draft
holds an answer the form no longer offers — and it surfaces through the same
`migrationReport` path a removed field does. It is called out in `CHANGELOG.md` because an
integrator reading only the code would not expect a validator to arrive.

**A form that means to accept anything must say so** by leaving `options` out, which today
means the control renders with nothing to choose. A field that wants both a list and a
free answer is not expressible, and that is not a gap this record closes.

**The code surfaces raw**, as `pattern` and `min` do. `option` is a stable machine word
for a catalogue to translate, and nothing in this repository translates any of them yet.

**It does not check anything about a component a consumer registers.** A6's residual
narrows rather than disappears: `registry.byType` can still put a component in the slot
that stores whatever the engine accepts — and the engine now accepts less, on this one
class of field.

## Alternatives considered

**Softening the prose instead.** Delete the sentence from the schema and the types, and
say the guarantee belongs to the controls. Rejected: it is the property that makes a
`select` worth having, every consumer will assume it, and the cost of providing it is one
comparison in a function that already runs on both sides.

**Checking in the renderers.** Where the guarantee actually lived. Rejected because it
cannot see a payload that never went through a renderer, which is the case that matters.

**Generating a data JSON Schema per form and validating against it on the server.** The
thorough version, and it would catch more than this. Rejected as a much larger piece of
work that would give the server a second validation path — and "client and server cannot
drift" holds precisely because there is only one.

**Coercing rather than refusing — dropping an unoffered tick, or clearing the field.**
Rejected on the reasoning `span` and `width` already use here: silently changing what
somebody sent is how a wrong answer becomes an invisible one. A refusal names the problem.
