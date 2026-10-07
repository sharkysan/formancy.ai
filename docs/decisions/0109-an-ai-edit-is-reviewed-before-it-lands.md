# 0109 — An AI edit is reviewed before it lands, and a stale one is refused

- **Status:** accepted
- **Date:** 2026-10-08
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/proposal.test.ts` for the rules,
  `prompt-pane.test.tsx` and `prompt-pane.test.ts` for the two panes,
  `packages/mcp/src/tools.test.ts` for the agent path, and
  `apps/playground/src/two-builders.test.tsx` for the whole of it through the
  application — the model answers, the tree does not change, the person presses apply,
  the tree changes. **Sixteen mutations were watched to redden their own cases**: five
  on the core rules, six across the two panes, five on the MCP tools. The pane tests
  also went red when the panes were made to apply directly, which is the behaviour this
  record replaces.

## Context

`authorForm` checks a model's answer as hard as anything in this repository checks
anything. It is parsed, validated against the spec's own JSON Schema, compiled by the
real engine and every expression type-checked, and when any of that fails the model is
told exactly what was wrong and asked again
([0056](0056-agents-get-the-checks.md)).

Then the React pane applied it.

**Valid is not the same as wanted.** A document passes every one of those checks with:

- the condition inverted that somebody asked to loosen,
- a field renamed whose answers are already in a database,
- an option withdrawn that submissions already carry,
- a `maxLength` the model rounded while doing something else.

Undo was the answer, and undo is the wrong shape. It puts a document back *after* the
change has been read, previewed, and — in a shared session, which this product has
([0096](0096-two-builders-one-session.md)) — published by somebody else in another tab.

Three surfaces had the problem and none had the step:

| | before |
|---|---|
| `@formancy/builder-react` | applied the answer, offered undo |
| `@formancy/builder-angular` | **no prompt pane at all** |
| `@formancy/mcp` | `validate_form` says a document works; nothing says what the edit does to what is published |

And neither pane was mounted by any application, so the React one was a feature in a
package and nowhere a visitor could reach — the documented-and-inert failure this
repository has shipped once.

## Decision

**Propose, show, decide.** The three pieces that decide anything live in
`@formancy/builder-core`, because two builders implementing the same decision is what
that core exists to prevent ([0091](0091-a-second-builder-is-a-binding.md)):

- `proposeEdit(current, proposed)` holds the answer against the document it was written
  for, and carries the change list and whether any of it costs the answers already
  collected.
- `applyProposal(session, proposal)` puts it in, or says why not.
- Both panes and the MCP tools read those; nothing re-decides.

**The change list is `diffSchemas`.** The same function the publish check, draft
migration and the consumer CI gate read. One thing decides what changed, rather than a
review screen holding a second opinion — and this is why the work had to follow
[0108](0108-the-diff-reports-everything-that-changed.md): until that landed, the review
screen for *"the model rewrote your options and three rules"* would have been an empty
list.

**Staleness is a hash, not a revision.** A revision moves on an undo-then-redo that
leaves the document exactly as it was, and refusing a proposal then would refuse one
that is still current. What matters is whether the form changed.

**Refused rather than merged.** A model answers with the WHOLE document, so applying a
proposal made before somebody added a field would silently discard that field. There is
no three-way merge here and inventing one would be guessing at which edit wins.

**The same rule for an agent, against a server rather than a session.**
`propose_form_edit` fetches what is published, diffs against it, and answers with the
change list and a `basedOn` hash without publishing anything. `publish_form` takes that
hash and refuses when the server has moved on. The tool descriptions carry it, because
a description is the only thing telling a model when to reach for a tool.

**And the playground supplies a stand-in model**, exactly as it supplies a stand-in
camera: the person plays the model through `window.prompt`, and everything after the
answer is real. A pane that renders nothing because nobody configured a model is honest
and invisible, which would have left this decision documented and unreachable.

## Consequences

**`PromptPane` changed behaviour, and it is published.** An integrator who mounted it
gets a review step they did not ask for. That is the point of the change and it is
still a surprise, so it is in the changelog with the reason rather than as a feature
line. The `ask` prop, the attempts and the refusal reporting are unchanged.

**`publish_form`'s `basedOn` is optional, so the unsafe path still exists.** A form
being created for the first time has nothing to be based on, and requiring the argument
would turn the first publish into a fetch of something that is not there. So an agent
can still lose an update by not passing it. What is done about that is the tool
description, which is the only lever MCP gives — stated here rather than left to look
like an oversight.

**The review shows a change list, not a document.** Somebody who wants to see the JSON
has to apply it and read the editor, or discard. A side-by-side diff of two documents
is a better review surface and a larger piece of work; what is here answers "what does
this cost me", which is the question that was unanswerable.

**Angular's pane is a second hand-written implementation.** Deliberate
([0033](0033-one-suite-n-drivers.md)), and the pair of test files is the cost. What is
*not* duplicated is any rule: both call the same three functions, and the layering test
in `apps/docs` now pairs the two panes instead of excusing React's as one-sided.

**That layering guard had to be rewritten, not just updated.** It encoded "the prompt
pane is React-only" twice — in a regular expression and in an assertion naming
`PromptPane` — so a fact that changed left a guard insisting the old prose stay. It now
derives both directions from the one-sided list: the README singles out a React-only
pane exactly when there is one. A guard that encodes today's answer rather than today's
question has to be edited every time the answer moves, which is the moment somebody
edits it wrongly.

## Alternatives considered

**Keep applying, and make undo louder.** Cheapest, and it is what was there. Undo is a
property of one session in one tab; the thing being protected is a document other
people and a server also hold. The moment a review is worth having is before the write,
not after it.

**Merge the proposal with whatever changed underneath.** It would turn a refusal into a
success, and a three-way merge of two whole documents has no principled answer for
"both edited the same field". A refusal that says *ask again* costs one round trip and
cannot be wrong.

**Have the model answer with a patch rather than a document.** Then staleness mostly
stops mattering, and the checks get harder: a patch cannot be validated against the
spec's own JSON Schema, compiled by the engine or type-checked until it has been
applied to something. The whole-document answer is what makes
[0056](0056-agents-get-the-checks.md) possible, and that is worth more than the merge.

**A real model in the playground, behind a key.** It would demonstrate the feature
properly and it would put a vendor, a key and a network call into a static site that
makes a point of having none of those. The stand-in is the same trade the scanner makes.
