# formancy — architecture and decision documentation

Engineering documentation for the people who need to understand *why* formancy
is built the way it is: contributors, evaluators, and manufacturers
incorporating it into a regulated product.

This is distinct from the user-facing documentation in `apps/docs`, which
explains how to use formancy. Nothing here is a tutorial.

## Start here

| If you are… | Read |
|---|---|
| New to the codebase | [Introduction and goals](architecture/01-introduction-and-goals.md), then [Solution strategy](architecture/04-solution-strategy.md) — the five ideas everything else follows from |
| Looking for where something lives | [Building blocks](architecture/05-building-blocks.md) |
| Wondering why an obvious simpler thing was not done | [Decision records](decisions/) — the index is grouped by area |
| Evaluating formancy for a regulated product | [MDR context](regulatory/MDR-CONTEXT.md) **first**, then the rest of `regulatory/` |
| About to change something load-bearing | [Risks and technical debt](architecture/11-risks-and-debt.md) and the relevant decision record |

## Architecture

Structured as [arc42](https://arc42.org), because it is a recognised shape and
a reader who knows it can find things without being told.

| | |
|---|---|
| [1. Introduction and goals](architecture/01-introduction-and-goals.md) | What formancy is, the four problems it exists to fix, and the six quality goals **in priority order** |
| [2. Constraints](architecture/02-constraints.md) | What was not chosen — and what several decisions look arbitrary without |
| [3. Context and scope](architecture/03-context-and-scope.md) | The system boundary and everything across it |
| [4. Solution strategy](architecture/04-solution-strategy.md) | The five ideas the rest follows from |
| [5. Building blocks](architecture/05-building-blocks.md) | The layer cake, then inside each package |
| [6. Runtime view](architecture/06-runtime-view.md) | A keystroke, a submission and its replay, publishing, resuming a draft |
| [7. Deployment view](architecture/07-deployment-view.md) | What exists today, what is intended, and what a self-hoster needs to know |
| [8. Cross-cutting concepts](architecture/08-crosscutting-concepts.md) | Paths, snapshots, determinism, validation, hidden fields, accessibility, theming, i18n, errors, security |
| [9. Quality requirements](architecture/09-quality-requirements.md) | Scenarios and budgets, each stated so it can fail |
| [10. Verification](architecture/10-verification.md) | What is checked, how, and what each check proves — including the limits |
| [11. Risks and technical debt](architecture/11-risks-and-debt.md) | The three riskiest pieces, known debt, accepted risks, open decisions |
| [12. Glossary](architecture/12-glossary.md) | Terms that mean something specific here |

## Decisions

Forty records in [`decisions/`](decisions/), grouped in that directory's index
by product, architecture, spec, engine, server, verification and tooling.

Every record carries a **Verified by** line naming the test, lint rule, CI gate
or database constraint that fails when the decision is violated — or the words
"Not mechanically enforced", where nothing does.

That field is the point. It was also useful immediately:
[0022](decisions/0022-fail-open-fail-closed.md), on failing open for metadata
and closed for validation, originally read "Not mechanically enforced" because
no test drove a rule to a runtime failure. The tests were written in response
and the record now says so, with the earlier state left visible.

## Regulatory

| | |
|---|---|
| [MDR context](regulatory/MDR-CONTEXT.md) | **Read first.** What this set is and is not. formancy is not a medical device and claims no conformity |
| [SOUP characterisation](regulatory/SOUP-DECLARATION.md) | Identity, intended function, environment, dependencies, known anomalies and verification evidence, for IEC 62304 §5.3 and §7.1.2 |
| [Software failure mode analysis](regulatory/SAFETY-ANALYSIS.md) | What this software can do wrong and what constrains it. An **input** to ISO 14971, never a substitute |
| [Development lifecycle](regulatory/LIFECYCLE.md) | How the software is actually developed, mapped onto IEC 62304's process areas, including the areas that are absent |

## Reading these honestly

They were written after the software, from the real history. Where something is
designed but not built, they say so; where a claim rests on automated checking
that covers roughly 57% of what it might, they say that too. Every factual
claim points at something in the repository that a reader can open.

A tidier narrative was available and would have been worth less.
