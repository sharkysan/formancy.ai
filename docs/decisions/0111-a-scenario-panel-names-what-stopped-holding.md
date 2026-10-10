# 0111 — A scenario panel names what stopped holding, and the scenarios are the host's

- **Status:** accepted
- **Date:** 2026-10-08
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/scenario-runs.test.ts` for what counts as a
  regression, `scenario-pane.test.tsx` and `scenario-pane.test.ts` for the two panes, and
  `apps/playground/src/two-builders.test.tsx` for the whole of it through the
  application — the starter's five scenarios hold, a field is deleted in the builder's
  own tree, and the panel names the example that stopped holding. **Eleven mutations were
  watched to redden their own cases.** A twelfth reddened nothing and found a branch that
  could not change an answer; it was deleted rather than tested.

## Context

[0110](0110-a-form-is-checked-against-examples.md) published `runScenarios` and said
plainly what it did not do: *"saving a scenario in a builder, rerunning it after an edit
and showing which ones stopped holding is the half somebody actually touches, and it is
not here."* This is that half.

Two questions had to be answered before any of it could be built, and only one of them
is a matter of interface.

**Where scenarios live.** Three answers were on the table — inside the form document
(spec 4 is open, so a `scenarios` section is possible), beside it and owned by the host,
or on the server in a table of their own.

**What a panel should say.** A standing total — *"3 of 5 fail"* — is a number somebody
reads once and then stops reading.

## Decision

**Beside the document, owned by the host.** The panes take scenarios as a prop or input
and hand changes back out, exactly as `ask` and the uploader do. This package decides
nothing about where they are kept; a host putting them in a `.scenarios.json` next to the
form gets a CI gate out of the same file, which is the shape the starter templates have
carried since they shipped ([0105](0105-templates-are-documents-with-examples.md)).

The alternatives both cost more than they return. **In the document**: test data in every
published, immutable version, a section every renderer has to ignore, and a reader
contract that forbids it in versions 1 to 3 ([0051](0051-spec-2-adds-types.md)). **On the
server**: a migration, endpoints, permissions and audit, for a capability that is useful
before a server exists — an agent checking a form it has just written has no server, and
that is the moment the check is worth most.

**The panel names what stopped holding.** `comparedToLastRun` in
`@formancy/builder-core` compares a run with the one before it and answers with
regressions and repairs. That is what gets acted on; a total is what gets glanced at. It
is in the core rather than in either pane because two builders deciding separately what
counts as a regression would eventually tell two people different things about one edit
([0091](0091-a-second-builder-is-a-binding.md)).

Three rules in it, and each is a way a panel stops being read:

- **A form that arrives with failing scenarios has not regressed.** Greeting somebody
  with a list of things they are not responsible for is how a panel whose value is
  speaking up only when it matters stops speaking.
- **A new scenario that fails is not a regression.** Writing one and watching it fail is
  the normal way to write one.
- **Repairs are reported too.** A panel that only ever delivers bad news is one people
  learn to ignore, and somebody fixing a rule needs to see that it worked in the same
  glance that tells them nothing else broke.

**Identity is the scenario's name.** Position would make inserting one at the top report
every scenario below it as both regressed and repaired. The cost is that renaming loses
the history, which is the lesser mistake and the same trade a field key makes.

**And an MCP tool, `check_scenarios`.** Local, no server: an agent writes a rule from a
sentence, and an example is the one thing that catches it writing the opposite rule. It
**refuses an empty set** rather than answering that all nought scenarios hold, which is
true and is the single most misleading sentence the tool could give an agent about to
publish.

## Consequences

**The panes grew an `initialValue`, and the playground is what found it.** A document
with required fields is invalid before a scenario has set anything, so every scenario
against the real starter reported the same six `required` errors and none of them was
about the rule the scenario was for. The templates have carried the same thing as
`sample` all along; pointing the pane at a three-field form would never have shown it.

**The playground's scenarios are checked by being mounted.** Five of them, each pinning a
rule that compiles whichever way round it is written. They are not decoration: if one
stops holding, the panel says so on the page an evaluator opens.

**Deleting the field a rule reads is refused, so the demonstration deletes another one.**
Worth recording because it reads like a limitation and is the opposite: the builder will
not leave a condition pointing at nothing
([0093](0093-a-rule-follows-the-path-it-reads.md)). The edit that breaks a scenario in
the test is therefore one the builder is perfectly happy with — which is the honest case,
since the dangerous edits are the ones nothing else objects to.

**The Monaco mock in the playground's test became writable.** It was read-only, which is
fine while every case reads the JSON and silently does nothing the moment one tries to
write — and the first version of the scenario case passed against an unedited form
because of it. A mock that cannot do the thing under test is a test asserting about a
form nobody changed.

**Nothing writes a scenario yet.** The panes list, rerun and remove; composing a new one
from the form in front of you is the next piece, and it is a different kind of work — a
small editor over an example rather than a report. Said plainly, because a panel that can
only delete is a panel somebody has to fill from a text editor first.

> **Later, and not a change to this decision:** a model drafts examples from what the
> author says the form should do, shown the form's fields and never its rules; the engine
> judges each draft, and a person keeps them one at a time, into the host's list through
> the same `onChange` — [0162](0162-an-example-is-drafted-from-what-the-author-said.md).
> Composing one by hand, the editor this paragraph names, is still not here.
>
> **Later, and not a change to this decision:** on a deployment the host is formancy's own
> server, so it keeps them — per form, with the sample they start from, beside the form and not
> in a version — and the admin's panes take them from it. Publishing runs them, and the `201`
> names each that stops holding — [0166](0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md).
> The panes still decide nothing about where they are kept.

## Alternatives considered

**Keep the previous run in state rather than a ref (React).** Simpler to read, and it
schedules a second render after every edit — which is a re-render per keystroke on a
panel sitting beside a form somebody is typing into. The ref is read to compare and never
rendered on its own, which is what makes it the right shape rather than a shortcut.

**Report a diff of the two runs rather than regressions and repairs.** More information,
and the question is not *what is different between these two runs* but *what did I just
break*. The two lists are that question's answer; a diff is the raw material for it.

**Let the pane own the scenarios and persist them.** It would make the feature work out
of the box with no host integration, and it would put a storage decision inside a
component — `localStorage` in a package meant to be embedded in somebody else's
application, or an invented endpoint. The prop is the same answer the uploader and the
model get, for the same reason.
