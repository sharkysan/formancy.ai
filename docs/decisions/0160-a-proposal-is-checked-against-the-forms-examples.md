# 0160 — A proposal is checked against the form's examples before it lands

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/proposal.test.ts`, the cases under *what the
  form's examples make of a proposal* and those under *what the prompt pane says* that name
  examples. Before this change `examples` was `undefined` and `proposalHeading` did not
  exist. Each of these mutations reddens a case: swapping regressions and repairs in
  `comparedToLastRun`; dropping `initialValue` or `mode` on the way to `runScenarios`;
  running the proposed document before the current one; answering an empty verdict when no
  examples were given; a heading that ignores the examples, or drops the costs when they
  stop; a status that leaves out either sentence. One mutation reddened nothing at first:
  `comparedToLastRun` counting every failure as a regression. *An example already failing
  is not one this edit would stop* was added for it, and fails under it. *Is the scenario
  panel's own verdict* states the equation and does not redden under a mutation to
  `comparedToLastRun`; the literal cases do. Both builders' `prompt-pane.test`, *with the
  form's examples*: before this change the review region was not named by the example. A
  pane that drops the examples, `initialValue` or `mode`, chooses its heading by hand as
  before, or disables Apply on a regression reddens a case. *Without them the review is
  what it was* fails for a pane that assumes examples were given. Both builders'
  `language.test`, *with an answer that stops an example holding*, fail with the heading
  written in English and with the examples not passed. `apps/playground/src/two-builders.test.tsx`,
  *a model's answer, against the form's examples*: in both builders, before the page passed
  its examples on, the review was not named by "Switzerland asks for a canton".
  `scripts/install-fixture/consume.ts`, under `pnpm test:e2e:install`, proposes against an
  example through the packed packages. Against `main`'s `builder-core` it did not compile.

## Context

A model's edit is reviewed before it lands
([0109](0109-an-ai-edit-is-reviewed-before-it-lands.md)). The review shows the change list
`diffSchemas` gives, and says whether any of it costs the answers already collected. A form
is checked against examples with their answers written down
([0110](0110-a-form-is-checked-against-examples.md)), and both builders' scenario panes run
them after every edit and name what stopped holding
([0111](0111-a-scenario-panel-names-what-stopped-holding.md)).

The two never met. Ask a model to change the canton rule and it may answer with
`country != "CH"` where `country == "CH"` was meant. That passes every check `authorForm`
makes ([0056](0056-agents-get-the-checks.md)). The review lists one change: *The visible
rule on "canton" says something else now*. The sentence is equally true of the fix and of
the inversion. The one check that tells them apart is the example, and it ran after Apply,
in the scenario pane. By then the rule was in the document, and in a shared session another
tab could publish it.

0110 named the gap, in the words of the residual 0109 left: *the review shows what changed,
not whether it is what was asked for*. The examples were there, and the playground keeps
them per form (#224). Nothing ran them at the moment somebody decides.

## Decision

**`proposeEdit` takes the form's examples, and the proposal carries their verdict.** The
third argument is `{ scenarios, initialValue?, mode? }`: the same three things a scenario
pane takes, with the same meaning. Given, `proposal.examples` is
`comparedToLastRun(runScenarios(current, …), runScenarios(proposed, …))`. Those are the two
functions the scenario pane runs after an edit, so the review cannot call something a
regression that the pane would not once it is applied. Not given, `examples` is
`undefined`, which is not an empty verdict: a check that never ran has not passed.

**The review's heading names what would stop holding.** `proposalHeading` in
`@formancy/builder-core` decides it, once, for both builders. They chose between two
headings by hand; with the examples there are four. *"Review these changes — 1 scenario
would stop holding: Switzerland asks for a canton"*, and when the edit also costs answers,
both. The heading is the region's accessible name, so it is what a screen-reader user hears
on arriving at the thing being decided.

**The status says both directions.** After the ready sentence, `proposalStatus` adds
*"Would stop holding if applied: …"* and *"Would hold again if applied: …"*, in the
scenario pane's order. A repair is good news, and it is said in the status, not in the
heading: a heading that grew with every outcome would bury the one to act on.

**Apply stays enabled.** A rule changed on purpose stops its old example holding, because
the example was written for the rule as it was. The review names it, and the person
decides.

**Both prompt panes take `scenarios`, `initialValue` and `mode`**, with the names and
meaning the scenario panes use, and pass them to `proposeEdit`. They are read with the
document when Write is pressed. The words are in the catalogue in English, German and
French.

**The playground hands both builders' prompt panes the open form's examples and sample**,
the list both scenario panes already run.

## Consequences

**What it buys.** An inverted rule that an example pins is named before Apply, in both
builders, in the region the person is deciding in. A rule put right names the examples it
makes hold again before it lands, not only afterwards.

**What it costs.** **It names only what an example pins.** A rule nobody wrote an example
for can be turned round, and the review says nothing about examples. This narrows the gap
0110 named; it does not close it.

**The verdict is taken once.** It uses the examples as they were when Write was pressed. An
example added or removed while the review is open is not in it. The scenario pane reruns
after Apply, so the next look is current.

**Each answer runs the examples twice**, in the browser, on the thread that draws the
pane: once against the current document and once against the proposal. How long that takes
for a large set of examples is not measured.

**A regression is not a refusal.** A person can apply an inversion with the heading naming
the example it breaks. That is the limit 0109 already states about attention, and nothing
here moves it.

**The heading grows with the list.** Every example that would stop holding is named in it,
so an edit that breaks many has a long accessible name.

**`EditProposal` has a new field.** `proposeEdit` fills it. A caller that builds an
`EditProposal` by hand, a test double say, must add `examples` before it type-checks again.

**The agent path is unchanged.** `propose_form_edit` in `@formancy/mcp` diffs against the
published form and runs no examples. An agent runs `check_scenarios` for that, as before.

## Alternatives considered

**Refuse, or disable Apply, on a regression.** Lost because a rule changed on purpose stops
its old example. A lock on the form would push somebody to delete the example to get the
edit through, and an example deleted to make a change land checks nothing afterwards.

**Tell the model, as a complaint in `authorForm`'s loop.** Lost because the examples are
about what the person meant, and the instruction may have been to change exactly that
rule. A model told that an example stopped holding would turn the rule back, against the
instruction. Whether to keep the change is the person's call.

**Leave it to the scenario pane after Apply.** What was there. The pane names the
regression after the rule has landed, when in a shared session it may already have been
published.

**Run the examples in each pane.** Lost to [0091](0091-a-second-builder-is-a-binding.md):
two builders deciding what the review says about the examples would eventually disagree.
The verdict also belongs with the proposal it describes, as the change list does.

**Name the repairs in the heading too.** Lost because the heading is what to decide on. A
repair is said in the status, beside what stops holding.
