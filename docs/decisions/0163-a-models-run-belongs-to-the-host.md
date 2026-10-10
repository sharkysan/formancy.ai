# 0163 — A model's run belongs to the host, and outlives the pane that asked

- **Status:** accepted; that the translations pane's run and the drafting part's are not
  carried superseded in part by
  [0164](0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)
- **Date:** 2026-10-10
- **Supersedes:** in part, what [0157](0157-a-models-turn-can-be-stopped.md) decided about a
  pane going away, for a run the host holds; and, of
  [0160](0160-a-person-carries-the-models-turn.md), the consequence that a turn lives as
  long as the prompt pane, and that every turn a relay pane draws takes the focus to Copy,
  for a turn found waiting when the pane is drawn — nothing else of either
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/prompt-run.test.ts`, which failed against
  `main` with no holder to import. Then, with the holder changed one thing at a time: one
  that stops its run when the last pane stops listening — 0157 moved into the holder —
  fails *outlives the pane that asked* with the host told to cancel, and *through a relay,
  keeps its turn waiting* with the turn cleared; one that keeps a single stop for its life
  fails *an answer to a stopped run, arriving while the next one waits*, whose second run
  ends before it asks; a Stop that does nothing fails that case and *is stopped by Stop from
  any pane showing it*; an instruction that can change while a run waits fails *keeps the
  instruction it was asked with*; a state rebuilt on every read fails *is the same object
  until it changes* and the Stop case; the examples left off the proposal fail *runs the
  form's examples before it is held*, and the attempts left off the run *asks as many times
  as the pane was told to*; a refused Apply that discards fails *is kept, with the
  refusal, when the form moved while it waited*; and a discard that leaves the run in
  flight, or one whose run's ending still lands after it, fails *is discarded whole*. Both
  builders' `prompt-pane.test`, *when the host holds the run*: against panes that ignored
  `run`, all four cases failed in each. With the pane stopping whichever run it draws when
  it goes, *a pane taken off the screen leaves the run waiting* (React) or *a pane that is
  destroyed leaves the run waiting* (Angular) and *a run still waiting is drawn waiting*
  fail in each. *A pane taken off the screen stops its run* (React) and *a pane that is
  destroyed stops its run* (Angular), 0157's own cases, still hold the pane's own run, and
  fail in each with the pane's own run left running. Both builders' focus cases, *hands
  focus back to Write when Stop is pressed* and *when the run ends by itself while Stop has
  focus*, fail in each with the focus read taken out of the pane's subscription, where it
  moved. `apps/playground/src/two-builders.test.tsx`, *a turn being carried while the
  visitor looks elsewhere*: before the playground held the run, all five cases failed —
  the three journeys finding no turn waiting after the Schema view and back, another tab
  and back, and the Angular builder; *a proposal held for review in one builder is the same proposal in the
  other* finding no review in Angular; and *choosing another form ends a turn about the
  last one* finding the starter's turn still waiting above the wizard. With the React
  prompt pane holding its own run, all five fail; with the Angular one holding its own, the
  Angular journey fails on an empty instruction box and the shared-proposal case finds no
  review; without the discard on another demo, the last case fails. Each journey spies
  `fetch`, `XMLHttpRequest.prototype.open`, `navigator.sendBeacon` and `window.open`, and none
  is called. `scripts/request-browser-test.mjs`, under `pnpm test:browser`, asks a third
  turn in the Angular builder, switches the Builder select to React while it waits, checks
  that React's relay pane shows the same request, and pastes the answer there, reviews it
  and applies it, counting every request the page makes on the way; against the playground
  without this change it fails on that step. The words a review answers:
  `prompt-run.test.ts` *keeps the words it was asked with beside its proposal, whatever is
  typed after* failed with no `asked` in the state, as did the assertions on it added to *is
  kept, with the refusal* and *is applied as one step*; each builder's `prompt-pane.test`, *a
  review names the words it answers, whatever the box says since*, failed with the review
  drawn without them; and *a proposal held for review in one builder is the same proposal in
  the other*, which now types new words into the React box and reads the review in Angular,
  failed the same way against the builders without it. A turn found waiting: each builder's
  `relay-pane.test`, *but a turn found waiting when the pane is drawn leaves the focus where
  the person put it*, failed with Copy focused against the panes that focused every turn they
  drew. In `two-builders.test.tsx` the journeys back from *Schema* and into the Angular
  builder now assert that the focus is still on *Build* and on the Builder select, and *in
  the Angular builder, choosing another language while a turn waits leaves the focus on the
  Language select*; against those panes all three failed with Copy focused. The same case
  in the React builder passed before and after, since React does not draw its relay pane
  again for another language.

## Context

A run of `authorForm` — asking a model, checking its answer, asking again — belonged to the
pane that asked. 0157 made it stoppable, and decided that a pane taken off the screen stops
its run, so that a host's request did not run on for an answer nothing would show. For a
host's own model that is right: the request costs money, and an answer for a pane nobody
can see is waste.

Through a relay a turn is not a request a machine answers in seconds. It is a person
copying a request into a chat, waiting for the answer, and pasting it back
([0160](0160-a-person-carries-the-models-turn.md)): minutes, during which they do other
things. On formancy.ai the prompt pane is under *Build → Fields* in each builder. A visitor
who, while their chat was answering, looked at the JSON under *Schema*, opened another tab,
or switched between React and Angular took the prompt pane away. That stopped the run, the
stop cleared the relay's turn, and the answer they pasted afterwards found nothing waiting.
§11 recorded it as debt ("a turn being carried is lost when the pane that asked goes"), and
0160, 0161 and 0162 each named it.

The fault is not the stop. It is that the run had nowhere to live but the pane. The relay,
the blocks and the examples already live at the page, for exactly this reason: the Build
view is unmounted on the way to *Schema*, and the builder on screen can change.

## Decision

**A prompt pane's run is held by whoever the host chooses.** `createPromptRun()` in
`@formancy/builder-core` returns a `PromptRun`: the instruction as typed, whether a run
waits, the words the last run was asked with, what it came to, the proposal held for review
and what Apply said when it refused, as one snapshot that is the same object until something in it changes, with
`subscribe` — the shape a session and a relay have. `instruct(text)`, `write(ask,
session, { examples, attempts })`, `stop()`, `apply(session)` and `discard()` are the
pane's buttons. `write` is what the pane did: `authorForm` with a new stop for each run,
then `proposeEdit` against the document as it was when Write was pressed, with the
examples in force then.

**Both builders' prompt panes take one, and only draw it.** `PromptPane` takes `run`,
`<formancy-prompt-pane>` takes `[run]`. Given one, the pane subscribes while it is on
screen and stops listening when it goes, and its going ends nothing: the run goes on, and
the pane drawn next — under another tab, in the other builder, after the *Schema* view —
shows it waiting, with Stop, or shows what it came to. Given none, the pane makes its own
and stops it when it goes. **That is 0157, unchanged, for a host that wants it**: `ask`
alone still means a run that is the pane's. The run, the proposal, Apply and Discard are
decided once, for both builders and both kinds of host
([0091](0091-a-second-builder-is-a-binding.md)). The panes are the markup, the focus and a
subscription.

**Stop stops it from any pane showing it; nothing else a pane does.** One run, so two panes
drawing it — the playground's two builders over one session
([0096](0096-two-builders-one-session.md)) — show one instruction, one Stop and one
proposal. A proposal reviewed in React is applied in Angular.

**One run at a time, and the words it answers kept with it.** `write` while a run waits
asks nothing, and `instruct` while a run waits changes nothing. Once the run has answered,
the box is the person's again: they may be typing the next instruction, here or in the other
builder, while the proposal is still held, and the box no longer says what it answers. So
the run keeps the words it was asked with, as `asked`, for as long as what it came to is
held, and both panes draw them in the review under its heading — *In answer to “add a phone
number”*. A proposal read in a pane that did not ask, beside a box that says something else
by then, still says which words it answers (SAFETY-ANALYSIS D10). Each run has its own stop,
so an answer to a stopped run is never held as the next one's.

**`discard()` forgets a run still waiting, too.** It stops it — the host told, the relay's
turn cleared — and nothing it answers later is held, nor is its ending said. A pane offers
Discard only with a proposal held; the case is a host opening another form. **The
playground discards its run when another demo is chosen**: a run is about the form it was
asked over, and held across another its request would wait above a builder showing
something else.

**The playground holds one at the page,** beside its relay, `useState(() =>
createPromptRun())`, and hands it to both builders' prompt panes. The relay pane was
already drawn above the tabs in both. So a turn asked under *Fields* in React is still
waiting — its request still in the relay pane — after the *Schema* view and back, after
another tab and back, and after switching to Angular, and the answer pasted then is
proposed and can be applied there.

**The focus is read where the run ends.** A pane gave Write the focus back when the run
ended with Stop focused, reading the focus after awaiting the run. A run the host holds
ends in a promise no pane awaits — the pane that pressed Write may be gone — so each pane
reads it in its subscription, as the run reports the change and before the framework draws
it, while Stop is still in the document.

**A turn found waiting moves no focus.** 0160 had every turn a relay pane draws take the
focus to Copy, and until now a turn was drawn only as it arrived: a pane that went took its
run, and the turn, with it. Held by the host, a turn outlives the panes, and a relay pane is
drawn over one that waited all along because the person used another control — *Build* after
*Schema*, the Builder select, and in the Angular builder the Language select too, since the
playground draws that builder anew over every session. Taking the focus from that control is
a change of context on input (WCAG 3.2.2) that tells them of nothing new, and it happened in
one builder and not the other. So each relay pane remembers the turn it found when it was
drawn, and takes the focus only for a turn that arrives after: a first turn, or a retry after
an answer that failed. Under another tab the relay pane was never taken away.

**The translations pane's run and the scenario pane's drafting are not carried,** and keep
0157's rule: each still ends when its part goes. A holder of the same shape — a run, its stop
and what it came to, as a snapshot — would fit either; what it would not settle is a
decision each needs first, and neither is this one. A translation is
a run *for a language*: 0161 ends it when another language is chosen, and the translations
pane opens on the default language, where no review is drawn — held by the page, a French run
would come back to a pane showing English, unless the language shown were held too. The
drafts are tagged with the session they were drafted over, because another session is
another form ([0162](0162-an-example-is-drafted-from-what-the-author-said.md)) — and the
playground opens a new session over the same text every time *Build* is shown again, so a
held list would be dropped on the first return from *Schema* unless "another form" is
decided some other way. §11 carries both.

## Consequences

**What it buys.** On formancy.ai a visitor can look at anything while their chat answers,
and paste the answer when they come back: from another tab, from the *Schema* view, or in
the other builder. The answer is reviewed and applied as it would have been had they
stayed.
A host with its own model gets the same choice: hold the run where its prompt pane comes
and goes, or leave it to the pane, as before. The two prompt panes lost their copies of the
run, Apply and Discard, so those can no longer disagree.

**What it costs.** **A run the host holds is the host's to end.** Nothing stops it because a
pane went; a host that holds one and stops drawing every pane over it, for good, has a
request running for an answer nothing will show — the waste 0157 removed — unless it calls
`stop()` or `discard()`. Through a relay that costs nothing; through a host's model it costs
what the request costs. A host that does not want that leaves `run` unset.

**A proposal outlives more of the form's edits.** A run held across the *Schema* view
outlives edits made there, and the proposal is still held against the document the run was
asked over. Apply refuses it then, as it refuses any proposal whose form moved
([0109](0109-an-ai-edit-is-reviewed-before-it-lands.md)), and keeps it on screen with the
refusal. Nothing merges.

**Coming back to a waiting turn leaves the focus where the visitor put it.** A keyboard user
back from *Schema*, or in the other builder, reaches Copy from there, as they reach any other
part of the builder; nothing moves them to it. `two-builders.test.tsx` holds the three
journeys and the Language select to that.

**The prompt pane's held turn now meets the translations pane.** Leaving *Fields* used to
stop the prompt pane's run, so the translations pane never met its turn. Now it can: while a
model's edit waits to be carried, *Ask a model* under *Translations* ends `busy` and says
another request is waiting, as 0162 decided for any two panes on one relay.

**Two panes over one run share the instruction box.** What is typed in one is in the other.
That is the point when they are one builder seen two ways; a host that wants two independent
prompts gives each pane its own run, or none.

**`PromptRunState` is a new public type, and `proposalStatus` reads it.** It is a superset of
what `proposalStatus` takes, so nothing about that function changes. No existing prop or
input changed meaning: `run` is new and optional. The review gains a line in both builders,
the `prompt-asked` part, dressed in the workbench theme, with its sentence in English, German
and French; a host's own theme sees an unstyled paragraph until it dresses it.

## Alternatives considered

**Keep the pane mounted and hide it.** The editor pane already keeps Monaco mounted for its
scroll and undo. Lost because it fixes one page: the Build view would have to stay mounted
under *Schema*, the Angular builder — another application — alongside the React one, and
every tab's panes behind every other; and a host whose prompt pane comes and goes for any
other reason would meet the same defect.

**Keep the run in the relay.** The relay already outlives the panes. Lost because 0160
decided the relay is a model like any other, and declined to make the run a case of it; and
because a host with its own model, drawing the prompt pane under a tab, has the same defect
with no relay in sight.

**Stop the run when the last pane stops listening.** A reference count, so a run with a pane
somewhere stays alive. Lost because it is 0157 moved into the holder: with one prompt pane on
the page — the playground's case, one builder and one tab at a time — the pane going is the
last one going.

**Let the pane go, and hand a late answer to whichever run is asked next.** Lost because it is
the hazard 0157 exists to prevent: an answer reviewed as the answer to an instruction it never
saw (SAFETY-ANALYSIS D10).

**A `keepRunning` flag on the pane.** Lost because the pane would still hold the state, and the
pane drawn next is a different instance that cannot see it. The run has to live outside the
pane for anything to find it.

**One generic holder for all three kinds of run, now.** `createModelRun<Asked, Outcome>()` with
the prompt, the translation and the drafts as instances. Lost for now because only one of the
three is carried here, and a generic shape with one use is an abstraction for a second use
nobody has designed: each of the other two needs a decision about its subject — the language,
the session — that would shape what is generic. When they are held, what they share is
extracted from three working holders rather than guessed from one.

**Discard the proposal when the box is typed into, or lock the box while one is held.** Either
would keep the box saying what the review answers. Lost because the first loses a review that
took a round trip by hand to a stray keystroke, and the second makes a person discard a
proposal before they may word the next instruction; the words drawn in the review cost
neither.

**Keep moving the focus to a turn found waiting, and say so.** Lost because it takes the focus
off a select the person is still using, which WCAG 3.2.2 names, and because whether it
happened depended on whether a builder is drawn again, so the two builders did different
things for the same act.

**Make `ask` itself the switch** — a pane given a relay keeps its run. Lost because no pane
knows its `ask` is a relay, and 0160 declined to teach it; and whether a run outlives its
pane is about where the host draws the pane, not about which model answers.
