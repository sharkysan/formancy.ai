# 0189 — Every answer has the shape its type says, and the format says it once

- **Status:** accepted
- **Date:** 2026-10-26
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/core/src/answer-shapes.test.ts`.** A value of the wrong shape is refused as
    `type` for every answering type, constrained or not; `null` is unanswered for a single
    answer and refused for a list, a matrix and files; `''` is refused for a number, a date,
    a time and a choice; `NaN` and the infinities are refused; a value handed in or set for
    a `static` field is dropped; a computed result of the wrong shape is not written, at the
    top level and in a row; a decimal computed into a number field is stored as the number
    it writes, and not written when no double holds it exactly. Twenty-eight of its cases
    failed against the engine before the change.
  - **`packages/server-core/src/use-cases.test.ts`**, *refuses an answer of the wrong shape on
    a field with no constraints*: an object posted for an unconstrained text field and a
    string for an unconstrained number, straight at the replay. Before the change it was
    stored.
  - **`apps/docs/src/answer-table.test.ts`.** The answer table in `concepts/schema.md` lists
    every answering type once, and its *Unanswered* column says `null` exactly where
    `ANSWER_KINDS` makes a type nullable and `''` exactly where its answer is text. Watched
    failing with `null` claimed for `selectboxes`, and with `ranking`'s row removed.
  - **The compiler.** `ANSWER_KINDS` is a `Record` over every field type, so a type added to
    `FIELD_TYPES` without an answer shape does not build.

## Context

What each field type stores was written down once, as a table in the documentation, and
decided nowhere in code. The engine's model validators read a value's type only where a
constraint needed it: a list, a choice, a signature, a matrix and the temporal shapes were
checked, and so was a `number` with `min`, `max` or `step`, or a `text` with a length,
pattern, format or mask. Everything else was stored as it arrived. An object posted for an
unconstrained text field went into the database as an object, and the replay that exists so
the server is the authority on what is valid ([0030](0030-never-trust-client-state.md)) had
nothing to say about it.

Two measurements made it concrete. A computed rule returning `42.0` into a text field
stored the number `42`, and `submit()` reported success. A computed rule using the decimal
type — the documented way to add up money — stored a `Decimal`, whose units are a `bigint`,
so `JSON.stringify` on the form's value threw and the form could not be submitted.

The occasion was a type per form: a TypeScript type for what a form's submissions hold. A
type printed from the documentation table would have been wrong about stored data in exactly
these cases, and a wrong type is worse than `unknown`, because it answers the question
incorrectly instead of leaving it open.

## Decision

**The format states each field type's answer as data, and the engine refuses an answer of
another shape.** `ANSWER_KINDS` in `@formancy/spec` gives each type a shape — text, temporal,
number, boolean, choice, choices, matrix, files, signature, nothing, group, page or rows —
and whether `null` means unanswered for it. `fitsAnswerShape` says whether a value has a
shape. The engine asks that first, for every field, before any constraint; a value that
fails is `type`.

- **`null` is unanswered for a single answer**, because a cleared control writes it, and
  **refused for a list, a matrix and files**, whose empty is `[]` or `{}`, as the format
  already said and nothing checked.
- **`''` is an answer only to a field whose answer is text.** A cleared number, date or
  choice is `null`; an empty string there is a value no control writes.
- **A number is finite.** `NaN` cannot arrive as JSON, but a host's prefill can hand one
  over, and every bound compared against it is vacuously satisfied.
- **A `static` field collects nothing**: a value handed in for one is dropped and a value
  set on one does not take, through the mechanism a computed field already used
  ([0181](0181-a-computed-value-is-the-engines.md)).
- **A computed result is stored only in its field's shape**, and otherwise not written, as
  when its expression cannot be evaluated ([0054](0054-expressions-that-never-work.md)). A
  decimal into a number field is stored as the number it writes when a double holds it
  exactly — up to fifteen significant digits — and not written when one does not.

`StoredFile`, the answer a `file` field stores per attachment, moves into `@formancy/spec`
with its guard. It was declared three times — in each renderer, and privately in the engine
— and the renderers now re-export the one.

## Consequences

**A submission that was accepted can be refused.** A deployment posting a number as a
string, an empty string for an unanswered select, or `null` for an empty list gets `422`
with `type` where it used to get `201`. Every form version is enforced from now on,
including those published before; nothing stored is re-examined.

**A computed field can now stay empty where it used to hold something.** A rule whose
result does not fit its field leaves it unwritten, and a `required` on the field then says
so. Before, the field held a value of the wrong type, or — for a decimal — the form could not
be submitted at all. Nothing at publish yet reports a computed rule whose result can never
fit; the field staying empty is how an author finds out.

**Four readers, one decision.** The engine's check, the documentation table and — next — the
type a form's submissions are given all read `ANSWER_KINDS`. If the table and the engine ever
disagree, `answer-table.test.ts` fails; the engine cannot disagree with itself.

**What an answer holds beyond its shape is unchanged.** A text field with no constraints
accepts any string, as before. This decides what kind of value an answer is, never which
values of that kind are acceptable.

## Alternatives considered

**Type only what is enforced.** Leave the engine alone and give a field the type `unknown`
wherever the replay does not check its shape. True on the day, and of little use: an
unconstrained text field — the commonest field there is — would be `unknown`, and the type
would improve only as checks were added one by one.

**Print the documented shapes and say the server does not enforce all of them.** The
smallest change, and it ships a type that can be wrong about stored data, which is the
outcome this record exists to avoid.

**Coerce instead of refusing** — `"3"` to `3` for a number field. A replay that changes what
was sent stores something nobody submitted, and two clients that coerce differently are the
split implementation [0006](0006-one-engine-build.md) prevents.
