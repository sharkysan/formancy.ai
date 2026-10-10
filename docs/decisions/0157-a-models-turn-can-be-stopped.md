# 0157 — A model's turn can be stopped, and an unreachable model is not a document that failed

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/authoring.test.ts`, the cases under *a host
  that cannot ask its model*, *stopping a run* and *what the model receives on each turn*.
  Against `main` the first set failed with the host's own error, because `authorForm`
  rejected with it, and the last with `attempt` and `limit` undefined. With parts of the fix
  reverted one at a time: without the race, *ends it at once* and *a host that ignores the
  stop* fail with the run still going; without the call to a late `onCancel`, *a host that
  asks to be told only after the stop* fails; without the check before a turn, *a stop
  before the run asks nothing* fails; without the stop forgetting a turn that answered, *a
  stop after the run has ended* fails; without the catch around a host that throws instead
  of rejecting, *one that throws* fails; and with the error's message taken as it is, *an
  error with no message* fails. *One with nothing to say* failed on this record's first
  version with `reason: 'undefined'`. `answers.test.ts` holds the stop handle.
  `proposal.test.ts` holds the new sentences in English, German and French, the one without
  a reason included. Both builders'
  `prompt-pane.test` have *a model that cannot be reached*, *can be stopped*, and *a pane
  taken off the screen stops its run* (React) or *a pane that is destroyed stops its run*
  (Angular). Against `main`, the first failed on the status *"Nothing was applied. 0
  attempts, and …"*, the second found no Stop button, and the third saw the host never told.
  Both `language.test` cases fail with the Stop label written into the pane.
  `apps/playground/src/demo-model.test.ts` failed against `main` with a cancelled dialog
  running three attempts. `scripts/install-fixture/consume.ts`, under
  `pnpm test:e2e:install`, stops a run from outside the repository through the packed types;
  against `main`'s packages it did not compile. *A host that ignores the stop* and that fixture both
  type a one-parameter `AskModel`, so the compiler checks the shape every existing host has.
  **That half cannot be watched failing.** TypeScript accepts a function with fewer
  parameters wherever a function type is expected, so it would fail only if `AskModel`
  stopped being one.

## Context

`authorForm` asks the host's model for a form, checks the answer, and asks again with the
complaint, up to three times ([0056](0056-agents-get-the-checks.md)). `AskModel` was
`(prompt) => Promise<string>`, and three things followed from that shape.

**A host's error was reported as a document that failed.** When the network was down or a
key was refused, the promise rejected and `authorForm` let the rejection through. Both prompt
panes caught it and built a failure by hand: `attempts: 0`, the error's message filed as a
`not-json` problem, an empty last answer. `proposalStatus` read the count and the flag and
said *"Nothing was applied. 0 attempts, and the document still did not work."* So a person
reworded an instruction that had never reached a model. And the same wrong decision was
written twice, once in each builder, which is the shape
[0091](0091-a-second-builder-is-a-binding.md) exists to prevent.

**A run could not be stopped.** A turn can take tens of seconds, and there are up to three.
The pane stayed busy for as long as the host's request took, with nothing to press. A pane
taken off the screen mid-run left the request running, for an answer nothing would show.

**Every turn looked the same.** The prompt was a system briefing and a stateless user
message carrying the instruction and the latest complaint. A host that keeps a conversation
with its model could not tell a correction from a fresh request, so it sent the instruction
and the whole document again on every turn.

`@formancy/builder-core` compiles against `ES2023` alone, with no DOM or Node types
([0008](0008-layered-packages.md)), so there is no `AbortSignal` type to hand a host.
`@formancy/core`'s uploads met the same limit and took a callback
([0130](0130-each-file-is-its-own-upload.md)).

## Decision

**A run can be stopped, and how it ended is part of its result.** `AskModel` takes a second
argument, an `AskTurn`. Its `onCancel` hands the host a callback for the moment the person
stops the run. `authorForm` takes a `stop` from `createStop()` and races each turn against
it. The run ends the moment the stop is pressed, whether or not the host listens, and
whatever that turn answers later is discarded.

**A host's error resolves the run instead of rejecting it.** The failure carries `ended`:
`gave-up` when every attempt answered and none worked, `stopped`, or `unreachable` with the
error's message as `reason` when it has one. `proposalStatus` reads the result whole rather than a count and
a flag each pane derived, and says each ending in the author's language. Both panes drop
their hand-built failure, show a Stop button while a run waits, and stop the run when they
go away.

**Each turn says which it is.** The prompt gains `attempt`, `limit` and, from the second
turn, `followUp`: the complaint alone, for a conversation that already holds the last
answer. `user` is unchanged, so a host that keeps no conversation loses nothing.

The loop and the answer reader moved out of `authoring.ts` into `answers.ts`
(`askChecked`, `readAnswer`), because the next requests to a model reuse them, and they hold
no sentence.

## Consequences

**What it buys.** A network failure says so, in the host's words. A Stop button ends a run
at once in both builders, and closing a builder mid-run stops it too. A host that wants to
abandon the request wires the callback to a signal in one line:
`const c = new AbortController(); turn.onCancel(() => c.abort())`. An answer arriving after
the stop never becomes a proposal. Without that, it would have read as the answer to
whatever the person asked next.

**What it costs.** It is breaking for anyone calling `authorForm` directly. A `catch` around
it stops firing, because a host's error now resolves, and code that read `ok: false` as "the
document did not work" has to read `ended`. `proposalStatus` takes the run's `result` in
place of `attempts` and `failed`, which is a compile error for a caller rather than a silent
change. An `AskModel` written with one parameter still compiles and is still stopped.

**Stopping the run does not stop the host's spending.** A host that ignores `onCancel` keeps
paying for a request the person abandoned. The run ends and the request does not. The race
makes the pane honest; it cannot reach into the host. Nothing fails for this: it is the
host's to wire, and the documentation shows how.

**The reason is the host's text, shown as written.** It is not translated and may say more
than a person needs: a URL or a status code. It is shown as text, never as markup. An error
with no message is named by its `name` instead. Something thrown with no words of its own —
`undefined`, the event an `onerror = reject` hands over, an empty string — gives no reason,
and the pane says the sentence that has no place for one. The first version took
`String()` of whatever was thrown, which read *"…reached: undefined"*, ended an empty string
on the colon, and threw on an object with no prototype, inside the handler that ends the run,
so the run never ended. The error is read by its shape rather than by `instanceof Error`,
which an error from another realm fails.

**A stopped or unreachable run counts the turn it abandoned.** `attempts` is the number of
turns asked, so a stop during the second turn reports two. The panes do not say the count
for those two endings, because it is not what went wrong.

## Alternatives considered

**An `AbortSignal` in the prompt.** Lost to the layering. builder-core has no DOM types, and
giving it some to get one type would let DOM code compile in a package that runs in Node
too. The callback costs a host one line.

**Hand the host the callback and let it end the turn by rejecting.** No race in the run. Lost
because every `AskModel` written before this one ignores the callback. A host that never
rejects would hold the run open, and a host that rejects late would be read as unreachable
rather than stopped.

**Keep rejecting, and give the panes a proper sentence for a caught error.** The decision
would still live in two panes, which is how it came to be wrong in both. And a direct caller
would still need a `try` around a function that otherwise answers with a result.

**A problem kind, `unreachable`, in `problems`.** `problems` is what was wrong with an
answer, shown as the model was told it. A refused key is not something the model was told,
and the count of attempts would still be wrong.

**Hand back the open document from the playground's stand-in on a cancel,** as its comment
said it did. It would have had to read the document back out of the prompt's English, which
is not a contract. The stand-in rejects instead, and the pane says nobody answered.
