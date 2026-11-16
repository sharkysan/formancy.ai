# 0237 — A time or an instant declares its precision, and every answer to it has that width

- **Status:** accepted
- **Date:** 2026-11-16
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0067](0067-a-temporal-answer-is-one-fixed-width-string.md), its "never a
  fractional part" and its one width per type, for a field that declares a `precision`. One width
  per *field* stays, and so does everything 0067 says of a field that does not.
- **Extends:** [0236](0236-a-temporal-field-compared-with-text-not-in-its-shape-is-named-at-publish.md),
  whose check this one refuses where 0236 warns, and whose `has()` for a field at the top it
  corrects; and
  [0125](0125-a-mask-stores-what-was-typed.md), whose mask core the typed control is built on.
- **Verified by:**
  - `packages/spec/src/temporal.test.ts`, *the canonical shapes*: each type and precision accepts
    its own width and refuses its neighbours; answers of one width sort as text in the order they
    happen, generated from the shape function for every width, and *answers of two widths do not*;
    the schema's bound patterns are the function's output, compared as patterns rather than as key
    names; the bound descriptions' examples are each at the precision they name, which failed
    against the descriptions that gave `09:30` alone. *Whether an answer in its shape names a day
    the calendar has* pins `temporalDateExists`.
  - `packages/spec/src/precision.test.ts`: `precision` on `time` and `datetime` in a version 6
    document, 0 and 9 accepted, refused on a `date`, a `text` and a `number`, out of range, and in
    a version 5 document by name; adding, changing and removing it are each `field.changed`, lossy.
  - `packages/spec/src/temporal-bounds.test.ts`: a bound at another width is `bounds.width`, at
    either end and finer or coarser; a version 5 `time` bound with seconds is still refused; on a
    field with a precision, a bound on 30 February or in month 13 is `bounds.noSuchDay`, 29 February
    2028 is not, and a field without a precision is not looked at. The day cases failed before the
    check.
  - `packages/core/src/temporal-precision.test.ts`: the engine accepts
    `2026-10-08T10:34:56.789012Z` under precision 6 and refuses it without one, accepts
    `10:34:56.7890121` under precision 7, refuses 30 February only on a field with a precision, and
    writes a computed instant padded to the width and not at all when a non-zero digit falls beyond
    it. `packages/core/src/default.test.ts`: a `default` of the wrong width keeps the form from
    opening.
  - `packages/core/src/temporal-widths.test.ts`: a literal not at a precision field's width, and two
    fields of different shapes where either declares a precision, are reported, each told what
    works for its two kinds and `timestamp()` only between two dates and times, and *each
    expression a refusal offers runs on answers at the fields' widths*, which failed on the old
    sentence's `timestamp(a) < timestamp(b)`, written on no field of the form, as the cases for a
    time did while a time was offered `timestamp()`; shapes are compared, not lengths (a `date`
    and a precision-1 `time`); a field without a precision is left to 0236; an empty literal is
    answered with the test that asks, `==` with its opposite, each idiom compiled.
    `packages/server-core/src/use-cases.test.ts`, *refuses a rule comparing a temporal
    answer across widths, and persists nothing*; `packages/mcp/src/tools.test.ts` and
    `packages/builder-core/src/authoring.test.ts` report it as publish refuses it.
  - `packages/core/src/default.test.ts`, *of the wrong shape on a time or an instant says how an
    answer there is written*: it failed before the refusal named the width, and a field without a
    precision keeps 0.13.0's sentence.
  - `packages/expressions/src/evaluate.test.ts`, *compares timestamps to the millisecond, cutting
    the rest, as the documents say*: a cel-js release that compared finer, or rounded, would fail
    it.
  - `packages/spec/src/temporal-entry.test.ts`: the mask, the conversion between a local wall
    clock and the stored instant with the fraction copied digit for digit, an incomplete entry held
    as typed, the night the clocks go back, a year before 100, and `pasteOutcome` against each
    paste the reviews found read wrongly.
  - `packages/react/src/fields/typed-temporal-field.test.tsx`,
    `packages/angular/src/typed-temporal-field.test.ts` and
    `packages/angular/material/src/controls.test.ts`: the typed control in each renderer, Material's
    being the default control's; in React and Angular, *a dropped UTC instant is stored as that
    instant, in Zurich*, which failed an hour off while a drop reached the mask as typing.
  - `packages/conformance/fixtures/temporal-precision.json`, run by every driver: a supplied
    six-digit instant and seven-digit time submitted byte for byte, typed digits stored at the
    width, and an entry that stops short refused as `shape`. Removing the typed control from a
    renderer failed it. `scripts/temporal-entry-browser-test.mjs`, in `pnpm test:browser`: the
    starter's precision-0 time typed key by key in Chromium, in both renderers.

## Context

A form can be asked to record when something happened to the second, or to a fraction of one: a
test run's start, its end and the steps between, where a minute is too coarse to be useful. The
values come from a person, typed from a clock or a stopwatch, and from a machine — a device's
log, an import, an API — which carries more digits than anybody types.

Through 0.13.0 a `time` answer was `HH:MM`, a `datetime` answer `YYYY-MM-DDTHH:MM:SSZ` whose
control shows minutes, so an edit set the seconds to `00`, and nothing could hold a fraction of a
second. 0067 made that a decision: one width per type, because text orders as time does only
between strings of one shape, and a rule or a bound compares an answer as text.

Two things constrained any answer. The first was measured on 2026-11-16 against the built
`@formancy/expressions` (`@marcbachmann/cel-js` 8.0.0, Node 24.21.0) by a throwaway probe:

| expression | values | result | right? |
|---|---|---|---|
| `a < b` as text | `…:56.000Z`, `…:56Z` (the same instant) | `true` | no |
| `timestamp(a) == timestamp(b)` | `…:56Z`, `…:56.000000Z` | `true` | yes |
| `timestamp(a) < timestamp(b)` | `…:56.789012Z`, `…:56.789013Z` | `false` | no, a is earlier |
| `timestamp(a) == timestamp(b)` | `…:56.7890121Z`, `…:56.789Z` | `true` | no |
| `a < b` as text | `…:56.789012Z`, `…:56.789013Z` | `true` | yes |

Text compares rightly within one width and wrongly across two; `timestamp()` compares rightly
across widths, but only to the millisecond, cutting what follows (`…:56.7899Z` is `…:56.789Z` to
it). The second is the browser's own controls: without a `step` they hold minutes, and an HTML
time string stops at three digits after the seconds, so none of them can show a seventh.

## Decision

**A `time` or `datetime` field may declare `precision`, an integer from 0 to 9: how many digits
follow the seconds, counted as a database counts them in `timestamp(p)`.** It is spec version 6.

| `precision` | `time` answer | `datetime` answer | control |
|---|---|---|---|
| absent | `HH:MM` | `YYYY-MM-DDTHH:MM:SSZ` | the browser's, to the minute, as in 0.13.0 |
| `0` | `HH:MM:SS` | `YYYY-MM-DDTHH:MM:SSZ` | typed, to the second |
| `n`, 1–9 | `HH:MM:SS.` and n digits | `YYYY-MM-DDTHH:MM:SS.`, n digits, `Z` | typed, every digit |

Every answer to one field has its one width, so 0067's ordering holds within a field. One
function, `temporalShape(type, precision)` in `@formancy/spec`, gives the pattern, and
`temporalExample` an answer in it. The engine, the publish check, the bound check and, for a field
with a precision, the error under the control, the printed type and a model's briefing read them;
the schema's bound patterns and its bound descriptions' examples are held to them by tests.
`TEMPORAL_SHAPES` stays as the no-precision case.

**What a field with a precision is held to:**

- **The engine checks an answer at the field's width**, in the browser and on the replay, and
  refuses a day the calendar does not have (30 February, month 13) as `shape`, which the digits
  alone let through. A field without a precision keeps 0.13.0's check, and accepts such a day as
  it did: widening a released version's check is what this decision rules out.
- **Its bounds are written at its width**, or the document is refused (`bounds.width`), and on a
  day that exists (`bounds.noSuchDay`). The schema's patterns admit every width of the type,
  because a bound cannot see its field's precision; `validateSchema` can.
- **A `default` of another width keeps the form from opening**, as any default the field would
  refuse does (0197).
- **A computed instant is written padded to the width.** One with a non-zero digit beyond it does
  not fit, and is not stored (0189): never rounded, never cut.
- **A rule comparing it across widths refuses the publish** (`invalid_logic`): a literal not at
  its width, or two temporal fields of different shapes where either declares a precision. The
  check compares shapes, not lengths. The publish, the MCP check and the builder's authoring loop
  all apply it. **The sentence says what works for what is compared**, written on the rule's own
  reads where it is an expression: a literal at the field's width; one precision for two fields of
  one type; `timestamp()` only where both sides are a date and time, because on a time or a date it
  is an error and a `visible` rule that errors shows its field; and for a date against a date and
  time, or a time against either, nothing to write. Which day an instant falls on depends on a time
  zone the rule does not have, and a time of day names no day. The instant's first ten characters,
  offered for a date while this was built, are its day in UTC, and an instant late at night in New
  York is the next day there: a rule copied from the sentence held on the wrong day for part of the
  world, which is worse than no remedy. An empty literal, `opens != ""`, is refused too, and the
  sentence gives the test that asks whether the field was answered, on the read the rule wrote:
  `opens != null` at the top, `item.at != null` in a row, `has(stay.at)` in a group; for `==`, the
  opposite, since the answered test copied into it would turn the rule round. That corrects 0236,
  which gave `has()` for a field at the top, where it does not compile. Refusing is possible here
  where 0236 could only warn: no valid document could declare a precision before version 6, so
  nothing valid becomes invalid. A field without a precision keeps 0236's warning.

**Its control is typed**, in React and Angular, on the mask core (0125): every declared digit is
shown and typed into, a `time` as stored and a `datetime` as the person's own
`YYYY-MM-DD HH:MM:SS` and its digits. A `datetime`'s whole seconds cross the zone through `Date`;
its fraction is copied digit for digit, and never passes through `Date`, which keeps
milliseconds. The control writes only on the person's input, so a supplied value nobody touched is
submitted byte for byte, and a read-only one never writes. An entry that stops short is stored as
the text typed, which the shape check refuses, and never completed by a guess. **Angular
Material draws such a time with the default control**, as it does a masked text: 0132 is followed
rather than superseded, since a mask is the default control's there.

**A paste is decided once, by `pasteOutcome` in `@formancy/spec`,** for every control, and **a
drop is decided by it too**, as a paste over the whole field: where a drop lands is a pointer
position, which a binding cannot turn into a place in the text and no gate here could check. Read
as typing instead, through `input`, a dropped `2026-11-15T13:03:27.415Z` lost its `Z` to the mask
and was stored in Zurich an hour off. The rules:

1. a whole time, or a whole instant with `Z`, `±HH`, `±HHMM` or `±HH:MM` and a space or a `T`
   (in lower case too), pasted on its own at any width, is the answer wherever it lands; a time
   with a zone is none. An offset becomes the same instant in UTC, and a width other than the
   field's becomes the field's where that is exact (zeros padded, only zeros cut) and stays its
   own otherwise, for the shape check to refuse;
2. a paste of nothing, or of the selected text over itself, changes nothing;
3. digits that fit the mask, or text with each separator exactly where the mask writes it, are
   typing;
4. anything else changes nothing, as a key the mask cannot place does.

## Consequences

**A test run timed to the second, and a device's log to the microsecond, are collected as they
are, and come back as they went in.** A field without a precision renders, stores, validates and
diffs as in 0.13.0, and a form that never declares one is version 5 in everything but its version
line.

**What it costs:**

- **A rule using `timestamp()` cannot tell apart two answers closer than a millisecond.** The
  publish sentence offers it for two dates and times of different widths, and nowhere else, and
  it is exact only to the millisecond in this build of `@marcbachmann/cel-js`, which cuts the
  rest. Named in `SOUP-DECLARATION.md` as the library's anomaly and in arc42 §11.
- **A computed instant above precision 3 is padded, not measured.** A rule computes through
  `Date`, which keeps milliseconds, so one second after `…:56.789012Z` is stored, on a field of
  precision 6, as `…:57.789000Z`: three zeros that read like digits a device gave, and the
  `012` it started from gone. Measured on 2026-11-16 by a probe against the built
  `@formancy/core`, pinned by *from an answer finer than a millisecond keeps the millisecond,
  padded to the width* in `packages/core/src/temporal-precision.test.ts`, and named in
  `SAFETY-ANALYSIS.md`, B12.
- **A comparison through a list rule's own variable is not seen.** `steps.all(s, s.at >= startedAt)`
  publishes whatever the two precisions are, and compares as text: wrongly, if they differ.
  `@formancy/expressions` takes `s.at` for no field, as 0236 chose, and teaching it what a
  comprehension's variable stands for is what 0236 avoided. The builders' condition editor writes
  no list rule, so only a hand-written one reaches it. The advice, given wherever this is
  documented: give fields compared in a list rule one precision, or, for two dates and times,
  compare them with `timestamp()`.
- **One form's submissions can hold two widths.** Submissions never migrate, so changing a
  field's precision leaves the answers already stored at the width they were written in, and an
  export or a sort across that change mixes them. The diff calls every change to `precision`,
  its removal included, `field.changed` and lossy; it stays out of `CONSTRAINT_DIRECTION`, which
  would call a removal a relaxation.
- **The typed control has no clock picker**, looks unlike a field without a precision, and its
  shape is fixed and ISO-like rather than the person's locale.
- **What it does not keep, at its edges** (each in `SAFETY-ANALYSIS.md`, B12): a supplied value
  wider than its field shows the digits that fit, and an edit drops the rest; a wall clock that
  happens twice, on the night the clocks go back, is the earlier instant, so a one-digit edit there
  can move the answer by an hour; an instant whose local year leaves 0000–9999 shows an empty
  control.
- **A field without a precision keeps its old losses.** A version 5 `datetime` still resets
  supplied seconds to `00` when edited. Declaring a precision is the remedy.
- **The error under the control cannot tell a missing digit from a missing day.** Both are
  `shape`, and the sentence is chosen without the answer, so on an instant with a precision it asks
  for both: "Enter it as 2026-10-08T09:30:00.000Z, on a day the calendar has." That example is the
  stored form, in UTC with a `T` and a `Z`, under a control where the person types their own clock
  with a space; saying it in the typed form is left to the builders' change.
- **The builders follow separately.** Their property panels offer `precision`, read from the
  schema; their condition editors still write a time to the minute and an instant to the second,
  so a rule they write on a time with a precision, or on an instant with one above 0, is refused at
  publish, loudly, rather than published wrong.
- **A document declaring version 6 cannot be read by 0.13.0 or earlier**, whether or not it uses
  `precision`, which refuses it as a validation error, as at every version; and this source writes
  `"6"` for every new form.

## Alternatives considered

**One wider shape for all of version 6**, nine digits always and a time always with seconds.
Rejected: every answer changes width, so a form republished from 5 to 6 mixes widths in one export
and one sort; every typed answer carries `.000000000`; and the released types would change meaning
by document version.

**Letting an unedited value pass unchecked**, so a machine's digits survive whatever the field
says. Rejected: the server cannot tell an unedited value from a forged one, and a value that skips
the shape check skips the bound with it, which is 0067's hostile-payload path.

**Carrying the digits without showing them.** Rejected by Daniel (2026-11-15): an edit to the
minute would reset seconds the person never saw.

**The browser's own time control with `step`**, for a field with a precision. Rejected by Daniel
(2026-11-15): it is not the same in every browser — as far as known, and not measured here, the
iPhone's picker offers no seconds — only Chromium is gated, and an HTML time string stops at three
digits, so a six-digit value could never be shown whole.

**Material's own typed time.** Planned in the design, and dropped when built: a typed control is a
mask, and 0132 gives a mask to the default control in a Material form. One policy for one mask core.

**A paste read once per control**, or kept as typed text the shape check refuses. Both tried while
building: three controls reading one paste three ways is 0091's silent divergence, and holding text
nobody could have typed showed an empty control under an error. Ignoring a paste that is neither an
answer nor typing is what an impossible keystroke already does, and it never stores a combination
of pasted and existing digits that nobody wrote.

**Rounding to the field's width**, for a computed instant or a paste. Rejected: a rounded value is
a reading the device never gave, and the next sort places it wrongly. Exact or refused.
