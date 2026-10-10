# 0110 — A form is checked against examples, and the runner is published

- **Status:** accepted
- **Date:** 2026-10-08
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/scenarios.test.ts`, and
  `apps/docs/src/templates.test.ts`, which runs the same function against all eighteen
  starter templates in both engine modes — about ninety scenarios that were passing
  before this change and pass through the shared runner after it, which is what makes
  the migration a check rather than a rewrite. **Six mutations were watched to redden
  their own cases**, one per comparison the runner makes. A seventh reddened nothing and
  found a defensive copy protecting against something the value store already prevents;
  it was deleted rather than tested.

## Context

A condition type-checks and is still the wrong business rule.

```
visible: leaveType == 'other'
visible: leaveType != 'other'
```

Both are valid CEL. Both compile, both type-check, both satisfy `validateSchema`,
`engineRefusal`, `expressionProblems` and every gate this repository has. One of them
asks a question nobody should be asked. **The difference is not in the document** — it
is between the document and what somebody meant, and no amount of checking the document
can see it.

The one thing that can is an example with its answer written down. This repository has
had those since the starter templates shipped: `*.scenarios.json` beside each form,
saying what happens when a branch is switched on, what error a bad date produces, what
is left in the submission afterwards ([0105](0105-templates-are-documents-with-examples.md)).

And the runner lived **inside one test file** — a `Scenario` interface and twenty lines
of `expect` in `apps/docs/src/templates.test.ts`. So a capability the product
demonstrably needs was available to this repository's own suite and to nobody else: not
to a form author, not to a consumer's CI, not to an agent about to publish. It is also
the gap [0109](0109-an-ai-edit-is-reviewed-before-it-lands.md) had to leave open in its
residual — *the review shows what changed, not whether it is what was asked for*.
[0159](0159-a-proposal-is-checked-against-the-forms-examples.md) later ran these examples
against a model's proposal before it lands, so the review names one that would stop
holding; for a rule no example pins, the gap is as this paragraph left it.

## Decision

**`runScenarios` in `@formancy/core`**, published, and it **reports rather than
asserts**. The caller is sometimes a test and sometimes a panel in a builder, and a
panel cannot be built out of `expect`. A failure says what was expected and what
happened, because *"3 of 5 scenarios fail"* sends somebody back to the document to work
out which rule they broke.

It runs **the real engine**, in the mode asked for — not a second implementation of
visibility and validation. A second implementation is a second opinion, and the one
thing a scenario must not do is disagree with the form. `server` mode matters: it is
what the publish gate and the submission endpoint run, and a scenario that passes in one
mode and fails in the other is the client/server drift this product exists to prevent.

**Four things a scenario can pin, and that is the number for a reason.** Validity alone
cannot tell a cleared branch from one that was never filled, and that distinction is the
whole of `clearOnHide` — so `visible`, `values` and `absent` sit beside `valid` and
`errors`.

**A path the form does not have is a failure.** A scenario naming `otherReson` would
otherwise set nothing, assert nothing and pass — green while checking a field that does
not exist, which is exactly how a renamed field leaves its scenarios behind. Every path
a scenario names is checked before anything is set.

**Time is fixed by default.** A form with a `today()` bound would otherwise pass until
the date it was written against goes by and then fail for a reason that is not a change
to anything.

**And the templates stopped having their own runner.** The eighteen of them now go
through this one, which is both the migration and the proof: ninety scenarios that
passed before pass after.

## Consequences

**`@formancy/core` is over its byte budget: 18.7 kB against a stated 18.** Reported in
[§9.3](../architecture/09-quality-requirements.md) rather than quietly raised. A browser
rendering a form never runs a scenario, so the obvious fix was a second entry point —
and it was tried and reverted, because `tsdown` code-splits a two-entry build and
`dist/index.mjs` then measures 2.8 kB of re-exports. **A measurement that improves
because the build changed shape is worse than a number over budget.** What would
actually fix it is measuring an entry point's dependency closure rather than one file,
which is a change to the guard and not to the code, and is not being made in the same
change that broke the number.

**It is in `@formancy/core` and not in the builder**, because a package is where the
reason to change lives: this changes when the engine's verdict surface changes, not when
a palette does. The cost is the paragraph above; the alternative was a consumer's CI
gate having to depend on the whole builder vocabulary to check a form against examples.

**`changes` is a map, so a path appears in a scenario once.** Setting a field and then
changing what decides its branch is two steps, and the second needs `initialValue`. That
is the shape the templates have carried since they shipped; a list of steps is the
honest alternative the day one of them needs it, and nothing has yet.

**This publishes the runner and not the authoring surface** — which
[0111](0111-a-scenario-panel-names-what-stopped-holding.md) then built, so read the
paragraph below as what was true on the day rather than as what is true now.  Saving a scenario in a
builder, rerunning it after an edit and showing which ones stopped holding is the half
somebody actually touches, and it is not here. What is here is the part both builders
and an MCP tool would have to agree about, in the one place they can share it — the same
order [0109](0109-an-ai-edit-is-reviewed-before-it-lands.md) went in. Said plainly
because a published function with no interface over it is a feature an evaluator cannot
find, which this repository has shipped once.

## Alternatives considered

**Leave it in the test file.** It worked, for the eighteen documents this repository
owns. The argument against is the whole of the context above: the product's own answer
to "your condition type-checks and is still wrong" was a private helper.

**Put it in `@formancy/conformance`.** That package already runs cases against a form,
which is the closest existing shape — and it runs them against *drivers*, through a
renderer, by accessible name. A scenario is an engine question with no interface in it,
and the two suites would have had to grow each other's vocabulary to share a home.

**Assert rather than report, as the test file did.** Shorter, and it would have made the
builder panel impossible: the panel is the point of publishing this, and `expect` throws
on the first failure rather than listing them. The test in `templates.test.ts` turns the
report back into an assertion in four lines, which is the right direction for that
conversion to run.
