# 0166 — A deployment keeps a form's examples, and runs them at publish

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/examples.test.ts`, which failed against `main` with
  no `examples.ts` to import. Then, with the code changed one thing at a time: publishing that
  drops what the examples said fails *warns, naming each example the new version stops
  holding*, *says which versions*, *runs them from the sample* and *runs them as the server
  replays a submission*; the examples run in client mode fail the last of those; run without the
  kept sample, the first three; every failing example warned about, rather than those that stop
  holding, fails *says nothing of an example that did not hold before either, nor of one that
  holds again*; the run compared with nothing rather than with the published version fails four;
  the stored rows run as they are rather than as read fails *runs the kept examples that are
  examples, and names what it left out*, and so does the publish keeping quiet about what it left
  out; `readExamples` handing the rows on as stored fails *leave out, and name, what is kept and is
  not an example* and *read none from a kept list that is not a list*, and a kept list that is not
  one read item by item fails the second; the
  permission taken out of `keepExamples` or of `readExamples` fails *are read and changed only
  with the permission editing the form takes*; two examples with one name kept fails *refuses two
  examples with one name*; one reason worded as another fails *says each reason an item is not an
  example in words of its own*; a sample that is not a map kept fails *refuses a body with no list*;
  the names written into the audit row fail *is recorded in the audit log*. The memory storage
  accepting a list for a form that is not there reddened nothing at first, because the use-case
  looks the form up before it writes; *are refused by the storage itself for a form that is not
  there* was added for it, and fails under it. `packages/builder-core/src/scenario-shape.test.ts`
  failed with no `scenario-shape.ts`; `readScenario` that stops checking a reason is text fails
  its case and `scenario-drafts.test.ts`'s *an expectation of the wrong shape*; one that keeps the
  name untrimmed fails *trims the name*; a draft reader that takes an item `readScenario` refuses
  fails *is how a model's answer is read, item by item*. `packages/server/src/examples-route.test.ts`,
  through `createApp` with the memory storage: all five cases failed with no route, among them
  the publish's `201` carrying no warning, and *carry what is kept and is not an example as
  sentences* failed with `readExamples` handing the rows on as stored. `packages/server/src/server.integration.test.ts`, *a
  form's examples, kept in PostgreSQL*, against real PostgreSQL: bootstrap creating no
  `form_examples` fails five of its six cases; the audit row written after the transaction
  commits fails *a change whose audit row cannot be written is not kept either*, which has the
  audit insert refused by an id the log already has. *A change is audited*, which only counts
  the rows, passes under that change — this line said otherwise until a review ran it; the table without its foreign key fails *the
  database refuses examples for a form that is not there*; a second write that inserts rather
  than replaces fails *a second write replaces the first*; the sample not stored fails that and
  the publish case. `apps/admin/src/examples.test.tsx`: before this change nine of its ten
  first cases failed, finding no scenario pane. With the admin changed one thing at a time: the
  part not drawn fails eight; a change drawn and never saved fails four; saves sent side by side
  fail *two removals reach the server in the order they were made*; a refused save not read
  back fails *a save the server refuses says so*; a save queued behind a failed one sent anyway —
  the chain as it was first written — fails *a save that fails sends none of the changes queued
  behind it* and *nor one made while the server's list is being read again*; those dropped from
  the moment of the failure rather than from the read's answer fails the second, and every later
  change dropped with them fails the first; a read again that cannot reach the server clearing
  the list fails *a save and a read again that both cannot reach the server leave the list it
  last kept*; the sentence drawn only beside a list fails *a save whose read again the server
  refuses says why the list went*; the sentences of what the server could not read not drawn, or
  sent back with the next save, fail *what the server keeps and could not read as an example is
  named*; drafting offered without a model fails *is
  not offered when the server has no model*, and never offered fails *asks the server's model
  for the scenarios kind*; the pane or the prompt pane run as a browser would fails *are run as
  the publish runs them* or *the review runs them as the publish will*; the pane run without the
  sample fails two; the prompt pane not given the examples fails both review cases; examples
  asked for a form never published, or its hint not drawn, fail *a form never published has
  nowhere to keep them*; a refused read drawn as an empty list fails *are drawn nowhere when the
  server will not show them*, and a read that cannot reach the server left uncaught ends *nor
  when they cannot be read at all* in an unhandled rejection, which the suite reports as an
  error; a save that loses the sample fails three. *The publish note names an
  example the publish says stops holding* passed before this change, because the note already
  drew whatever warnings a `201` carries; it fails with the note dropping them.

## Context

An example with its answer written down is the one check in this product that tells a
condition that compiles from the condition that was asked for
([0110](0110-a-form-is-checked-against-examples.md)). Both builders run a form's examples in a
panel after every edit and name what stopped holding
([0111](0111-a-scenario-panel-names-what-stopped-holding.md)), a model's proposal is checked
against them before Apply ([0159](0159-a-proposal-is-checked-against-the-forms-examples.md)),
and a model can draft them from what the author says the form should do
([0162](0162-an-example-is-drafted-from-what-the-author-said.md)).

A deployment kept none. 0111 decided that the scenarios are the host's to keep and left
storage to the host, which was right for a library: an agent checking a form it has just
written has no server. But on a deployment the host is formancy's own server, and it stored no
examples. So the admin — a deployment's own builder host — mounted no scenario pane, its
review of a model's edit ran against no examples, and the server's model route served a
`scenarios` kind ([0165](0165-a-deployments-model-is-asked-through-its-server.md)) that nothing
on a deployment asked for. And publishing, the last moment before a version is frozen for good
([0025](0025-immutability-in-the-database.md)), ran nothing: an inverted rule that every example
would have named went out with nothing said.

## Decision

**A deployment keeps, per form, its examples and the fictional sample they start from** — the
pair the starter templates carry as `*.scenarios.json` and `*.sample.json`
([0105](0105-templates-are-documents-with-examples.md)). One record per form, beside it and not
inside a version: a version is immutable, and examples change while the form does not. Written
into one, every example added would mint a version. The record is replaced whole, because both
builders' scenario panes hand back the whole list.

**Storage is a port change.** `Storage` gains `getExamples(formId)` and
`keepExamples(record, audit)`, which writes the record and its audit row in one commit, as a
publish does. The PostgreSQL storage keeps them in `form_examples`: one row per form, its
primary key the form's id and a foreign key to `forms`, so there is one list per form and none
for a form that is not there. The table is added on start, as every table is. The memory storage
refuses a list for a form it does not have, as the foreign key does.

**What an example is, is decided once.** `readScenario` in `@formancy/builder-core` reads an
example from JSON somebody else wrote: core's `Scenario` shape and nothing beside it, the name
and reason trimmed. The drafting part's reader of a model's answer now reads each item through
it, and the server reads a list it is asked to keep through it, so a draft kept in a builder is
an example the server keeps. A list with any item that is not an example keeps nothing, and is
refused with one sentence per item saying which and why; so are two examples with one name — a
name is how an example's result is found — and a sample that is not answers by field. **What is
kept is read the same way on the way out.** The storage checks nothing, so a row edited around
the use-case comes back as it was written; wherever the examples are read back, what is not an
example is left out and named. The `GET` carries those sentences beside the examples as
`unreadable`, and the next save, which keeps only what it is sent, drops it. Handed on as an
example, the admin ran it while drawing the build tab, and the runner's throw took the whole
admin down — the form could not be opened there even to remove it. **Paths
are not checked** against the published form: an example is written for the form being edited,
which may name a field no version has yet, and the runner says so when it runs.

**Reading and changing them take the permission editing the form takes**, `form.publish`:
editors and admins, not viewers. Removing the example that would have named a broken rule is an
edit. **The use-case decides it.** `readExamples` and `keepExamples` in `@formancy/server-core`
take the actor and answer `forbidden`; the routes, `GET` and `PUT /f/:path/examples`,
authenticate — `401` with no session — and carry the use-case's answer as the `403` body
`requires` sends. A host composing its own HTTP over `server-core` gets the rule with the
use-case. A change is audited as `form.examples.changed`, with how many examples and whether
there is a sample, never what they say. A read is not audited: examples are not respondents'
data ([0057](0057-the-audit-log-records-reads.md)).

**Publishing runs them, and says which stop holding.** `publishForm` runs the form's kept
examples against the version it has and against the one being published — `runScenarios`, in
`server` mode, which is what the publish gate and the submission endpoint run, from the kept
sample — and compares the two runs with `comparedToLastRun`, the scenario panel's own verdict.
Each example that held against the version the form has and does not hold against the new one
is a sentence in the success's `warnings`, which the route carries on the `201` the way
[0097](0097-a-publish-may-warn.md)'s are:

```
The example "Switzerland asks for a canton" held against version 1 and does not hold against
version 2: "canton": expected to be visible, and it is hidden.
```

**Never a refusal.** A rule changed on purpose stops its old example holding, because the
example was written for the rule as it was; the person decides, as 0159 left Apply enabled. An
example that did not hold before either is not this publish's doing, and one that holds again
is good news; neither is a warning. A first publish runs nothing, since examples are kept beside
a form the deployment already has, and republishing the document already current says nothing
about them, since nothing about them changed. A stored row that is not an example is read out
before the run, as it is for the admin, and one warning names what was left out; the others
still run. Run as it was, it throws in the runner, and every publish of the form would be a
`500`. The use-case decides all of it; the route only carries it.

**The admin draws the scenario pane over them.** Opening a published form reads its examples;
the build tab draws `ScenarioPane` over them with the sample, in `server` mode so the panel and
the publish give one verdict. Remove saves the list back, and so does Keep on a draft, one save
after another, so two cannot land in the wrong order on the server where the publish reads them.
**A save that fails is said, and puts the server's list back.** The list is read again inside
the same chain, so no save is in flight when it arrives, and every change made on the list it
replaces — queued behind the failed save, or made while the read was out — was made on a list
the server never took, and is not sent. When the read cannot reach the server either, the
screen keeps the list the server last kept, and says that too. What the server could not read
as examples is drawn as its sentences. When the server
has a model, drafting asks it for the `scenarios` kind, with a line saying what of the form the
request carries and to whom. The prompt pane's review runs the same examples, in the same mode
(0159). The publish note draws the examples' warnings as it draws every warning. A form never
published says its examples are kept once it is, and a viewer, refused them, is drawn none.

The form's access route left `app.ts` for a plugin of its own to make room for this one's
registration, and the size budget's ceiling on `app.ts` went down with it.

## Consequences

**What it buys.** On a deployment, a form's examples outlive the tab they were written in, are
the same for everybody editing the form, and are run at the one moment nothing can be taken
back. An inverted rule that an example pins is named on the `201`, in the admin's publish note,
and in the answer `publish_form` hands an agent — which returns the server's body. The admin's
review of a model's edit, and its drafting, now have the examples to work with.

**What it costs.** **Every embedder implementing `Storage` must add two methods** before it
type-checks again — a breaking change to a published interface, for anybody not using
`@formancy/server`'s PostgreSQL storage. `MIGRATIONS.md` says what they must do.

**The last save wins.** Two people changing one form's examples at once each save their whole
list, and the later replaces the earlier: one's removal can come back, or one's kept draft go,
and nothing says so. Publishing has a version check for exactly this
([E4](../regulatory/SAFETY-ANALYSIS.md)); the examples do not. Recorded in §11 as debt.

**A change made while a save was failing is lost.** The person is told the save failed and is
shown the server's list; a removal made on the list before it is not kept, and has to be made
again. Replaying it onto the server's list would mean working out from two lists what the change
was — the second decision of what changed that the alternatives below decline.

**Nothing catches a throw from the runner at publish.** The catch that stood there first guarded
rows nobody had read. Every row is read before it is run now, no example the reader takes is
known to make the runner throw, and one that did would fail the publish rather than be said.

**It names only what an example pins**, as 0159 does. A rule no example covers can be turned
round, and the publish says nothing about examples.

**It compares with the published version, not with what the person saw.** An example that
fails against the version the form has and against the new one is not named, though the
admin's panel lists it failing. A form published before it had examples, or by somebody who
removed the one that would have warned, is published with nothing said.

**It is a report, not a gate**, as 0097's warnings are. A deployment that wants a pipeline to
fail over an example treats the `201`'s `warnings` as the hook; nothing in formancy does.

**The run blocks the request.** The examples run twice per publish, on the thread that answers
it. Measured on 2026-10-10 in this repository's sandbox, Node 22: the largest starter template,
4.8 kB, with its four examples, takes about 10 ms for both runs; with four hundred examples,
about 300 ms. Nothing bounds how many examples a form keeps except the server's body limit on
the request that saves them.

**The examples are run with no answer from the deployment's checks.** `runScenarios` takes
none, in the panes as here, so an example that depends on what a `check` rule's validator
answers cannot pin it. Both runs are alike in that, so it changes no verdict between versions,
but it means a check's answer is not something an example can protect.

**The sample is a fixture by intent and by nothing else.** It is meant to be fictional, as the
templates' are; nothing checks that it is. It is stored beside the form, readable by every editor
and admin, and sent with every drafting request to the model the operator chose (0165).

**The admin runs examples on the server's side; the playground on the browser's.** A form
whose rules differ by side can be called holding in one and failing in the other. In the admin
that is the point — the panel agrees with the publish — and the playground has no server.

**The admin holds none of the runs a host may hold** (0163, 0164), as before: its drafting run is
the part's own, so leaving the build tab ends it.

**One thing about drafting moved.** A model's item whose name is taken, or repeated, and whose
shape is also wrong is listed now for its shape: the shape is `readScenario`'s question and is
asked first, and the names are the drafting's own, asked after. Either way the item is not an
example; only the reason given for it changed.

## Alternatives considered

**Inside the document, or a published version.** 0111's own argument stands: test data in
every immutable version, a section every renderer must ignore, and a reader contract that
forbids it in the frozen versions. And a version per example added.

**A row per example, created and deleted one at a time.** It would narrow the last-save-wins
cost to two people touching one example. Lost because the panes hand back a whole list, so the
host would have to work out from two lists which example was added or removed — a second
decision of what changed, beside `comparedToLastRun`'s.

**Refuse the publish when an example stops holding.** Lost to 0097 and 0159: a rule changed on
purpose stops its old example, and a lock would push somebody to delete the example to get the
publish through, after which it checks nothing.

**Warn about every example that fails against the new version.** Simpler, and it repeats on
every publish what was already true, which is how a warning channel stops being read (0111).

**Check an example's paths against the published version when it is kept.** It would refuse
an example written for a field being added, which is the normal order of work: the example
first, then the field, then the publish.

**Leave the permission to the route, as `requires` does elsewhere.** One check fewer in
`server-core`, and a host composing its own HTTP over the use-cases would have to know to add
it. The routes here only authenticate, so the rule is in one place.

**A key of its own on the `201`, the examples' names as a list.** Mechanisable without reading
sentences, and a second shape for a fact `warnings` already carries; 0097 chose sentences, and a
gate that wants to fail can fail on any warning.

**Run in client mode, or in both.** Server mode is what the publish gate and the submission
endpoint run, so it is what the version will do to what it is sent; both would double the cost
for verdicts about a side the server never runs.

**A reader of the examples' shape in `server-core`.** Shorter, and it is the same decision as
the drafting part's reader of a model's answer: if the two drifted, the server would refuse a
draft the builder kept, or keep an example the runner reads as less than it says. So both read
through `readScenario`.

**Keep them in the admin's browser.** The host is the server: examples in one browser are
examples one person has, and the publish, on the server, could not run them.
