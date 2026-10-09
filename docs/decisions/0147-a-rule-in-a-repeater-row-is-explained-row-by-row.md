# 0147 — A rule in a repeater row is explained row by row

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Supersedes:** the consequence of [0128](0128-a-form-says-why-a-field-is-hidden.md) that a
  rule in a repeater row is listed and not explained
- **Verified by:** `packages/builder-core/src/rules-overview.test.ts` — each row says what
  the rule does there and what each comparison found, in the row and in the form; every
  row's verdict **agrees with the engine** about the same answers, a row with no quantity
  included; `index` and a field nobody typed into are bound as the engine binds them (each
  watched failing with its binding removed); no rows says nothing; German row names; and
  nothing for a rule about the whole form. Both builders' `rules-overview.test` — the rows
  drawn under the rule, and a preview with no rows said in words — each failing on the
  overview as it was. `apps/playground/src/rules-tab.test.tsx` — the starter's
  `recipients[].note` rule says "Row 1 Not required now.", an amount of 1200 is typed into
  that row of the form pane, and it says "Row 1 Required now."; it fails with the React
  overview reverted. `apps/docs/src/workbench.test.ts` failed on the three parts the rows
  added until the workbench dressed them.

## Context

[0128](0128-a-form-says-why-a-field-is-hidden.md) gave every rule a verdict except one kind:
a rule on a field in a repeater row. Such a rule has one verdict per row and reads `item`,
which the form as a whole does not have, so evaluated against the form it throws and would
be explained as undecided — "Shown now" about a note the engine hides in every row. It was
given no verdict rather than a wrong one, and the roadmap carried the gap.

That left the case 0128 exists for unexplained wherever it sits in a row. A `visible` rule
in a row that cannot be decided shows its field in every row, the most consequential residual
risk in the safety analysis (A5), and the overview — the one place an author could find it —
said nothing about it. The playground's own row rule, a note required for a recipient whose
amount is at least 1000, was listed in words with no way to see which rows it applied to.

## Decision

**`explainRows` gives a rule in a repeater row one verdict per row**, each the shape
`explainRule` gives the form — what the rule does to the field now and what each comparison
found — under the row's name in the author's language. `explainRule` still gives such a rule
none, so a caller that reads only it is told nothing wrong.

**Each row is bound as the engine binds it.** The form's answers, `item` with every field of
the row present — null where nobody typed, because reading a missing key throws in CEL — and
`index`. A comparison on a field of the row reads the answer from the row, and one on a field
of the form reads it from the form.

**Both builders draw it** under the rule, a verdict per row, and say in words that a preview
with no rows has nothing to decide.

## Consequences

**An author can see which rows a rule applies to, and why**, and a row rule that cannot be
decided is marked as showing its field, as any other is.

**A third copy of how a row is bound must agree with the engine's.** The overview already
evaluated a rule itself rather than asking the engine (0128); for a row it now also rebuilds
the row the engine would — every field present, null where empty, `index` beside `item`. A
change to the engine's row binding that is not made here makes the two disagree. The test
that runs the same rule and rows through both is what would find it; it fails with either
binding here removed.

**It costs an evaluation per row on every change in the preview.** Compiled once per rule
and evaluated per row, a rule with two comparisons over fifty rows took 3.95 ms a call,
against 18.9 ms when it compiled per row — measured on one machine on the date above, and
re-measured rather than adjusted. A form with many row rules and many rows pays it per rule.

**Rows are named by their position**, "Row 2", not by anything in them: a row has no label of
its own, and naming it by its first answer would change its name as somebody typed.

## Alternatives considered

**Change `explainRule` to return per-row verdicts for a row rule.** One function to call, but
its return type would become a union, and every published caller reading `verdict.outcome`
would stop compiling for a case it never asked about.

**One verdict for the rule, summarising its rows** ("Required in rows 2 and 5"). Shorter, but
it drops the reason each row has, which is the half of 0128 that makes a verdict worth showing.

**Ask the engine.** It knows which rows are hidden and has no way to say why, which is the
reason 0128 evaluates the rule itself.
