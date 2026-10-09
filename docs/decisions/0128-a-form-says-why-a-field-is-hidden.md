# 0128 — A form says, rule by rule, why a field is hidden now

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/builder-core/src/rules-overview.test.ts` — every rule grouped
  under its field in the form's order, in words where the condition editor wrote it and as
  CEL where somebody did, "and" and "or" in the author's language; a verdict that says what
  each comparison found; a verdict that **agrees with the engine** about the same answers,
  shown and hidden; a rule that cannot be decided explained as showing its field, matching
  what the engine does; a required rule; nothing for a calculation; a rule in a repeater row
  listed under its field and given no verdict rather than a wrong one. Counting a throw as a
  failure, writing "or" as "and", and dropping the actual answer each fail a named case.
  Both builders' `rules-overview.test` — the list, the verdict given answers, and the empty
  form. `apps/playground/src/rules-tab.test.tsx` — the playground's rules tab says the canton
  is hidden, a country is chosen in the form pane, and it says the canton is shown; without
  the preview's clock it shows no verdict and fails.
- **Deciders:** Daniel Bacher

## Context

The logic-editor item asked for two things this record answers: a form-wide overview of the
rules, and an explanation of why a field is hidden or required.

A rule is written on the field it is about and read there. A form with twenty rules on twelve
fields had no place to see them together, and an author looking at a hidden field in a preview
could only open each rule and evaluate it in their head. The worst case is the one the format
makes on purpose: a `visible` rule that throws shows its field
([0022](0022-fail-open-fail-closed.md)), so the field is on screen, its condition says it should
not be, and nothing says why. The safety analysis names it the most consequential residual risk
in the set.

## Decision

**builder-core describes every rule, and explains each against answers it is given.**
`rulesOverview` lists the rules grouped by the field or page each is about, in the order the
form asks its questions, each with the words the editor offers its kind by ("Show this field
when") and its condition in words — read from the `editor` metadata the condition editor
stores, joined by the language's own list formats, a choice by its label and a checkbox by yes
or no. A rule somebody wrote by hand is shown as its CEL: no words are invented for an
expression the editor did not write.

**`explainRule` gives a verdict: holds, fails, or undecided — and what that does to the field
now.** For a rule the editor wrote, every comparison says whether it held and, where it did
not, what the answer actually was: "Country is Switzerland: no — it is Germany". An undecided
rule says what the engine does with it, measured per kind: a `visible` rule shows its field,
`required` and `disabled` leave it free and open, `skip` keeps the page, `validate` refuses the
answer.

**The answers and the clock are the host's.** A builder has no form to fill in; a host that
shows a preview has the answers, and the clock its engine reads. Both are props — absent, the
overview lists the rules alone — so an explanation of a rule about today's date uses the date
the preview used, and nothing in this package reads the time.

**Both builders draw it** — `RulesOverview` and `formancy-rules-overview` — and the playground
gives it a tab, fed from the form pane's engine, so a person changes an answer and watches the
reason change.

## Consequences

**An explanation is a second evaluation, and could disagree with the first.** It evaluates the
rule's CEL itself, with every top-level answer declared `dyn` as the engine declares them,
rather than asking the engine — which has no way to answer "why". The test that matters runs
the same rule and answers through both and requires them to agree; it is the reason this is
trustworthy, and the place to look first if they ever do not.

**Rules on fields inside repeater rows are listed, not explained.** A row's rule has one
verdict per row and reads `item`, which the form as a whole does not have; evaluated against
the whole form it would throw and be explained as undecided — "shown" — about a field the
engine hides in every row. So it has no verdict rather than a wrong one, and a test says so.

**Not a live region.** Every keystroke in the preview changes a verdict; announcing each would
be a commentary nobody asked for. A person reads the overview when they want to.

**The playground's `app.tsx` is off the size list.** Taking the preview's engine through to
the builder would have grown it past its ceiling, so its problem boxes moved to
`problems.tsx`, and it is now under the budget.

## Alternatives considered

**Ask the engine why.** It knows whether a field is visible and not which comparison decided
it; teaching it to report that would put authoring concerns in the runtime every form ships.

**Explain inside the logic panel, one field at a time.** That is where a rule is written, and
it answers "what does this field do" — not "why is that field hidden", which an author asks of
the preview, across every rule at once.

**Evaluate the comparisons only, and infer the rule's verdict from them.** A hand-written rule
has no comparisons, and the rule's own CEL is what the engine runs; the verdict comes from the
same CEL, and the comparisons are the explanation of it.
