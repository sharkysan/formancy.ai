# 0218 — A repeater a computed rule writes is the rule's, row by row

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0216](0216-a-computed-answer-is-read-not-operated.md), which left a
  computed repeater drawn as an ordinary one
- **Verified by:**
  - **`packages/core/src/computed-targets.test.ts`**, *a repeater a computed rule writes is the
    rule's, row by row*:
    - each field in its rows is read-only;
    - its rows have ids, the same each time the rule runs;
    - it offers no row to add or remove;
    - a row added and typed into does not take while the expression cannot be evaluated, nor once
      it can;
    - none is added to meet its minimum, so the server stores no row the rule did not write.

    Each failed before the change, except *nor once it can*, which passed: the rule's next run
    wrote its rows back over the change. Without the ids, the case on ids threw `Row 0 of "lines"
    has no _id`.
  - **`packages/react/src/control-id.test.tsx`, `packages/angular/src/control-id.test.ts` and
    `packages/angular/material/src/controls.test.ts`**, *written by a computed rule, has nothing
    in it a person can change, and a read-only box to read*, now over the repeater too, as its
    default control and as a data grid. The rule writes it two rows. Against the engine before
    the change, React's case threw. Once the engine gave the rows ids and refused their changes, a move button
    in each row was left in all three, so the case failed until the renderers left them out.
  - **`packages/core/src/review.test.ts`**, *name no question left unanswered in the rows of a
    repeater a rule computes*, which failed before the change with the row's empty question
    listed.
  - **Each renderer's `computed-field.test`**, *as a whole repeater is read-only in every row, with
    nothing to add, remove or move one*: a text box reads *A* and *B*, a tick box *Yes* and *No*,
    all read-only, and no button adds, removes or moves a row. Against `0.10.0`'s engine and
    templates both threw `Row 0 of "doses" has no _id`.

## Context

A `computed` rule may write a whole repeater: its expression returns the rows. 0181 made a computed
field the engine's: its snapshot says `readOnly`, `setValue` on it does nothing, and a value handed
in for it is dropped. All of that looked at the field the rule names and at nothing inside it.

0216 recorded what that left as drawn wrong: the add and remove buttons and the rows' controls of
an ordinary repeater. Measured on 2026-10-29, on `0.10.0`'s code, it was worse in four ways:

- **A computed repeater with rows could not be drawn.** The rows a rule writes carry no `_id`. A
  renderer keys each row by its id, and `rowId` throws for a row without one. React and Angular
  both threw `Row 0 of "doses" has no _id` as soon as the rule had written a row.
- **Its rows' fields said they were not read-only**, so the renderers drew them to take an answer.
- **While the expression could not be evaluated**, which it cannot while an input it reads is
  empty, the rule wrote nothing back. So a row a person added, and what they typed into it, stood
  in the browser. The server drops what arrives for a computed field and stored none of it. The
  screen showed rows the stored record did not have (hazard A3).
- **A repeater's `minItems` is met by adding empty rows** as the form opens (0184). For a computed
  one with an expression that could not yet be evaluated, the server's replay of a submission that
  sent nothing stored `[{ "_id": "r1" }]`: a row nobody computed and nobody answered.

## Decision

**What a computed rule writes is the rule's all the way down.** In the engine:

- **A field inside a field a computed rule writes is read-only**, as the field is, and `setValue`
  on it does nothing. `withinTarget` in `computed-targets.ts` decides both, and decides for a
  computed group's fields the same way.
- **The rows of a repeater a computed rule writes are its rows and no others.** `rows.ts` is told
  which repeaters a rule writes. Such a repeater is not topped up to its minimum, and `addRow`,
  `removeRow` and `moveRow` do nothing, as `setValue` on a computed field does nothing (0181).
  `canAddRow` and `canRemoveRow` say `false`, so both renderers, which ask before drawing those
  buttons (0184), draw neither.
- **The rows a rule writes are given ids each time it runs.** They are positional, `r1` for the
  first row and so on. The rule writes its rows afresh each run and nobody can move one, so a row's
  position is who it is, and the same id each run keeps a renderer from drawing every row anew.

**In the renderers**, a repeater whose snapshot says `readOnly` draws no button to move a row,
beside its ends, where none is drawn already. Its rows' fields are drawn by 0216's rule: a box
read-only, and every other control as its answer in words.

## Consequences

A computed repeater is drawn, in both renderers and under Material, as rows of read-only answers
with nothing to add, remove or move. What it shows is what the form holds and what the server
stores. And the review before sending says *Not answered* of no question in its rows, since a
computed field is not the person's to answer (0214); what the rule wrote is listed, as it will be
sent.

**What it costs.**

- **A stored submission changes shape.** A computed repeater's rows are stored with an `_id`, as
  every other repeater's are, where they were stored without one. A submission stored earlier
  keeps its rows without, so a consumer reading the rows by their ids has to allow for both. The
  type `answersTypeScript` writes for a form's answers already declares an `_id` on every row.
- **What a host sees changes.** `canAddRow` and `canRemoveRow` say `false` for a computed repeater,
  and a host's own repeater, drawn from `useRepeater` or `injectRepeater`, draws no add or remove
  button by asking them. A host drawing its own move buttons has to read the repeater's `readOnly`,
  since the engine has no `canMoveRow`. [`MIGRATIONS.md`](../../MIGRATIONS.md) says so.
- **An id is a position here, not an identity.** A rule that reorders its rows gives each position
  the same id it had, so a row that moves from first to second takes the second's id. Nobody can
  move one, and a renderer keeps a row by its id: when the rule reorders them, the boxes stay where
  they are and their answers change.

**What it does not do.**

- **A host's `setValue` on a whole row or group** still writes a computed member's value with it,
  as 0181 records. This record makes a field inside a computed one read-only; a computed member of
  an ordinary row is not inside anything computed.
- **No shipped theme styles a computed repeater apart.** Its rows look like any repeater's rows,
  with read-only boxes in them and no buttons.

## Alternatives considered

- **Refuse a computed rule on a repeater.** The document is valid in every frozen spec version, and
  a list a form derives, such as the doses a protocol prescribes, is the reason to compute one.
- **Throw from `addRow`, `removeRow` and `moveRow` on a computed repeater**, as `addRow` does past
  the repeater's maximum. A row past the maximum is the caller's mistake to report. A change to a
  computed value is refused without a word, by 0181, because a stray change event should not take
  a form down. Rows are values like any other here.
- **A `canMoveRow` on the engine**, so a renderer asks for the move buttons as it asks for the
  others. A third method, and both renderers' types, for the one case the snapshot already says.
  The move buttons were never asked of the engine: they are drawn by position.
- **Ids that survive a rule's rewrite**, matched by content. A rule's rows have no identity of
  their own to match by: two rows can be equal, and a row whose value changes is the same row.
