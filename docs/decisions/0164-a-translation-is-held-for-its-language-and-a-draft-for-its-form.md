# 0164 — A translation is held for its language, and a draft for its form

- **Status:** accepted
- **Date:** 2026-10-10
- **Supersedes:** in part, of [0161](0161-a-model-translates-only-what-is-missing.md), that the
  run belongs to the review part and ends with it, for a run the host holds; of
  [0162](0162-an-example-is-drafted-from-what-the-author-said.md), that a draft lives as long as
  the part and its session, for a run the host holds; and, of
  [0163](0163-a-models-run-belongs-to-the-host.md), that the translations pane's run and the
  drafting part's are not carried — nothing else of any of them
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/translation-run.test.ts` and `draft-run.test.ts`,
  which failed against `main` with no holder to import, as did `relay.test.ts`'s *holds across
  the three runs a host may hold*. Then, with the code changed one thing at a time: a holder
  that stops its run when the last pane stops listening — 0157 moved into the holder — fails
  *outlives the part that asked* and *through a relay, keeps its turn waiting* in all three
  holders' tests, the prompt run's included; a holder that keeps one stop for its life fails
  *an answer to a stopped run, arriving while the next one waits* for the prompt run and the
  translation; one that lands any run's ending, not only the run in flight's, fails *is
  discarded whole* in all three and *a run waiting for one form is not drawn waiting over
  another, and asking there ends it*. `translationOn` handing the run to every language fails
  *says where it waits, and holds nothing out to review or apply there*, and *says nothing
  elsewhere about a run that came to nothing to review*; naming a run elsewhere whether or not
  it waits fails the second; `translationStatus` without its sentence for it fails the first;
  *Translate the rest* asked over the form as it is rather than the proposal held fails *asks
  for the rest over the proposal it holds*. `draftsOn` ignoring the form fails *another form
  shows none of them* and the case of a run for another form; drafts tagged with their session,
  as 0162 had them, fail *a new session over the same form shows the drafts* and four more;
  Keep that does not ask which form fails *they cannot be kept into its list*; a Draft over
  another form refused behind the run for the last fails *asking there ends it*; and the
  attempts left off a translation, or the names taken, the sample or the attempts left off a
  draft, fail each holder's *what the part asks with*. Both builders' `held-runs.test`:
  against panes that ignored the run they were given, five of the seven cases the file was
  written with failed in each — the two that passed hold what a pane does with no run, and
  that another form's drafts are not drawn, which fails in each with the part drawing the run without
  `draftsOn`. A translations pane that opens on the default language fails *the pane drawn next
  opens on its language* and *a run still waiting is drawn waiting*; a review part drawing the
  run under any language fails *on another language it says where the run is*. A view that
  never says the run's language has left the form fails `translation-run.test.ts`'s *whose
  language has left the form is said so on every language, and found again when it is added*,
  as does `translationStatus` without its two sentences for that; both builders' *whose language
  has left the form can be stopped, or discarded, from every language* fail with the part
  drawing no Stop there, and with Stop kept but no Discard; Stop drawn wherever the run waits
  fails *on another language it says where the run is* in each. An `apply()` that lands the
  first half while *Translate the rest* waits fails *applies nothing while the rest waits*. What a pane
  given no run does is held by cases that predate this: with the part's own translation run
  not stopped when it goes, *a pane given none still stops its own run* (new) and
  `translations-pane.test`'s *stops the run when the language changes* fail in each builder;
  with the drafting part's own run not ended by another session, `scenario-drafts.test`'s
  *another session is another form* fails in each; not ended when it goes, *taken off the
  screen* (React) and *destroyed while a run waits* (Angular) fail; and with the drafting
  part's focus no longer moved from where the run reports its end, *Stop ends a run that is
  waiting*, which asserts the focus on the part's heading, fails in each. Both builders'
  `language.test`, *a model's translation under review*, now draw a held German run from the
  default language under the pseudo-language, and fail with its sentence written in English.
  `apps/playground/src/two-builders.test.tsx`, *a translation and drafts being carried while
  the visitor looks elsewhere*: with the page handing neither builder the two runs, six of its
  seven cases failed — French asked for and
  found gone after the *Schema* view, another tab and the Angular builder; the French turn
  drawn under English; and drafts asked for in either builder gone after the *Schema* view.
  Without the discard of the translation's run, or of the drafting's, on another demo,
  *choosing another form ends a translation's turn about the last one, and its drafts'*
  fails. Each journey spies `fetch`, `XMLHttpRequest.prototype.open`, `navigator.sendBeacon`
  and `window.open`, and none is called. `scripts/request-browser-test.mjs`, under
  `pnpm test:browser`, asks for the starter's French in the React builder, switches the
  Builder select to Angular while the turn waits, checks that the Angular tab opens on French
  over the same request, and pastes the answer there, reviews it and applies it, counting
  every request the page makes; against the playground with the translation's run left to the
  part it fails on that step. `scripts/install-fixture/consume.ts`, under
  `pnpm test:e2e:install`, holds a translation and drafts with the packed packages, and fails
  with `translationOn` handing the run to every language built into them.

## Context

[0163](0163-a-models-run-belongs-to-the-host.md) let a host hold the prompt pane's run, so that
on formancy.ai a turn carried through the relay survives the visitor looking at the JSON,
another tab or the other builder while their chat answers. It left the two other runs a
builder asks of a model where they were, each with its part, each ended when its part goes
([0157](0157-a-models-turn-can-be-stopped.md)):

- the translations pane's review part, which asks for the messages a language is missing and
  holds the answer for review message by message
  ([0161](0161-a-model-translates-only-what-is-missing.md)), and is keyed by the language, so
  choosing another, like leaving the tab, ended its run;
- the scenario pane's drafting part, which asks for examples from what the author says the form
  should do ([0162](0162-an-example-is-drafted-from-what-the-author-said.md)), and tagged its
  drafts with the session they were drafted over, so another session showed none of them.

So a visitor who asked for the French messages, or for examples, and looked at the form, the
JSON or the other builder while their chat answered, came back to nothing: the turn stopped,
the request gone from the relay pane, and the answer they pasted afterwards had nowhere to go —
the defect 0163 fixed, in two more places. 0163 said why each needed its own thought before it
could be held. A translation is a run *for a language*, and the translations pane opens on the
default language, where no review is drawn: held by the page, a French run would come back to a
pane showing English. And the playground opens a new session over the same text every time
*Build* is shown, so drafts tagged with their session would be dropped on the first return from
*Schema* however long the run lived.

## Decision

**The shape `createPromptRun` set carries both; what each is held *for* is the variation.**
`createTranslationRun()` and `createDraftRun()` in `@formancy/builder-core` are holders of the
same kind — a snapshot that is the same object until something in it changes, a subscription,
and the part's buttons as calls. A part given one draws it, and its going ends nothing; a part
given none holds its own. Three interfaces rather than one, because the buttons differ:
*Ask* and *Translate the rest* for a translation; the author's words, *Draft*, *Keep* and
*Discard* one draft at a time for examples.

**What the three share is written once, and stays inside.** 0163 declined to guess a generic
holder from one; with three working, what they had in common is `createRunHolder` in
`run-holder.ts`: the snapshot and its listeners, a stop of its own for every run, and an ending
that lands only while its run is still the one in flight, so an answer to a stopped or
forgotten run is never held as the next one's (SAFETY-ANALYSIS D10). `createPromptRun` is
rewritten on it with its tests unchanged. It is not exported: a host makes each run by name.

**A translation is held for its language.** The run keeps the language it was asked for,
`locale`, with what it came to, the proposal, and *Translate the rest*'s basis, which is that
proposal: `rest()` asks over its document and holds the answer written over it and against its
basis, so the two land together or neither does. Which language a part shows of a run is
decided once, `translationOn(state, locale, document)`: under its own language, the run as it is; under
any other — the default included — only that it waits, or holds a proposal, and for which
language. A part there draws that one sentence in its live region, *A model is translating into
fr. Choose fr to follow it, or to stop it.* or *…is waiting for review*, and no review, no Stop
and no *Ask*, because asking would forget the French. A run that came to nothing to review is
over, and a part on another language is drawn as though there were none.

**A language can leave the form while its run waits**, when the person undoes adding it. A pane
offers only the form's languages and falls back to the default when the one chosen goes, so no
part could be drawn under it: every language would say *choose it*, none would offer Stop, and
the turn would wait for good. A part given no run never gets there, because it stops its own when
its language goes. So `translationOn` is given the form, and when the run's language is not among
the form's languages it says so, `elsewhere.gone`. A part on any language then says *A model is
translating into it, which is no longer one of the form's languages. Stop it here, or add it again
to follow it.*, or, once it has answered, that its translation can be discarded here or reviewed
once the language is added again. Beside the sentence it draws the run's Stop, or its Discard,
and still nothing of the proposal. Added again, the language is the run's once more. Apply waits
for *Translate the rest*: pressed while the rest waits, it would land the first half and forget
the language, and the rest would be held for none and drawn under every language.

**A translations pane
given a run opens on its language**: one waiting, or holding a proposal, or that came to
nothing, is where the person was. Once open, the language is theirs.

**A draft is held for its form, and a form is its id.** The run keeps the id of the form it was
asked over, `form`, with the drafts and the words. `draftsOn(state, session)` is what a part
over a session shows: everything, when the session's form has that id — a new session of the
same form included, its drafts judged by the engine against that session's document as it is,
as they always were after an edit; and when it has another id, only the words. Keep asks the
same question and refuses another form's draft. A run waiting for one form is not drawn waiting
over another, whose part would otherwise offer nothing it could press; *Draft* there forgets
it, stopping it and clearing its turn, and asks for this form. The spec calls the id the form's
stable identifier, the one its links and its submissions hang on; it is what stays when a page
opens the same text in a new session, and what changes when it opens another form.

**A part given no run behaves as before.** The translations review part's own run is stopped
when the part goes, and the part is keyed by the language, so choosing another ends it (0157,
0161). The drafting part's own run is ended when the part goes, or is handed another session:
for a host that holds nothing, another session is still another form (0162). The words typed
there stay, as they did.

**One relay, one turn, still.** Nothing about the relay changes: a run asking while another's
turn waits is refused with `ModelBusyError` and ends `busy`, and its part says another request
is waiting. Held by the page, any of the three can wait while the visitor is anywhere, so any
of them can now meet any other.

**The playground holds all three at the page**, beside the relay, hands each to both builders'
parts, and discards all three when another demo is chosen.

## Consequences

**What it buys.** On formancy.ai a visitor can look at anything while their chat answers a
request for French or for examples, and paste the answer when they come back — from the *Schema*
view, another tab or the other builder. The Translations tab opens on French, waiting or with
its review; the drafts are under *Fields*, judged against the form as it is now. A host with its
own model gets the same choice 0163 gave it for the prompt pane.

**What it costs.** **Each run the host holds is the host's to end**, now three times: a host
that stops drawing every part over one, for good, has its request running for an answer nothing
will show, unless it calls `stop()` or `discard()` — and a host that opens another form must
discard each, or their turns wait above it. The playground does all three.

**The form's id is trusted to be the form.** Two documents with one id are one form to the
drafts: a document replaced wholesale under *Schema* with its id kept shows the drafts drafted
for the last one, judged against the new one. The engine says what each does there, and Keep
refuses one that names a field the form lacks; one that names fields both have can be kept into
a form it was not drafted for, and only reading it shows that. An id changed in a session hides
the drafts, as another form. The playground's demos each carry their own id, and its examples
are kept by demo.

**One run is one language.** While French waits or is held, German shows where it is and offers
no *Ask*: a person who wants German goes to French and applies, discards or stops it first. Once
French has left the form there is no French to go to, so German, like every language, offers its
Stop or its Discard. That is the one case where a run is ended from another language than its
own, and its proposal is discarded there unseen unless the person adds French again to read it.
The relay would refuse a second turn anyway.

**A held proposal outlives more edits, and is refused for them.** A translation's proposal is
held against the form as the session it was asked in had it when the answer came, and Apply in
any session compares that with the form there; an edit made anywhere since — under *Schema*
too — refuses it (0109). Nothing merges.

**The drafting part's own run is discarded on another session rather than hidden by a tag.**
What is drawn is the same, and the words survive as before. One thing differs: a host that hands
the part another session and then the first one again no longer finds the first one's drafts.
The tag would have shown them again; the part's own run has forgotten them.

**New public surface.** `createTranslationRun`, `translationOn`, `TranslationRun`,
`TranslationRunState`, `TranslationRunOptions`, `TranslationView` and `TranslationElsewhere`;
`createDraftRun`,
`draftsOn`, `DraftRun`, `DraftRunState` and `DraftRunOptions`. `run` on `TranslationsPane` and
`TranslationReview`, `drafting` on `ScenarioPane` and `ScenarioDrafts`; `[run]` and `[drafting]`
in Angular. `translationStatus` takes an optional `elsewhere`. Four sentences, in English, German
and French: a run waiting or held under another language, and each once its language has left
the form. No new part: the sentence is the review part's own status, and Stop and Discard are its
own buttons.

## Alternatives considered

**One public holder for all three, `createModelRun<Subject, Outcome>()`.** Lost because what a
part presses differs for each, and so does the question each must answer before it draws: which
language, which form. A generic interface would be a layer every caller forwards through to a
subject check of its own. What does not differ — the stops — is shared inside.

**Let choosing another language end a held translation, as 0161's key did.** Lost because it is
the defect again: a person who glances at German while French waits loses the turn.

**Draw a French review under any language, headed French.** Lost because the part's preview
renders the language the pane is on, and Apply under German would land French: one review, one
language, as 0161 had it.

**Let a part on any language offer the run's Stop and Discard, whether or not its language can
be chosen.** Lost because Discard there throws away a French review the person has not seen and
could see with one choice. Where the language has gone that choice is not there, and the sentence
says how to bring it back first.

**End a held translation when its language leaves the form.** Lost because the holder does not
see the session's edits, so a part would have to end the run as it draws. A run held by a page
with no translations part on screen would then wait until one was drawn. And a person who undid
too far and redid would find their turn ended.

**Hold one translation run per language.** Lost because the relay carries one turn, and a person
carries one request at a time; a run per language is a map of holders for one turn.

**Open the translations pane on the default language and only name the run there.** Lost because
the person who asked was on French, and coming back to it is coming back to their work; the
sentence is for a language they choose afterwards.

**Keep drafts for their session.** Lost because the playground opens a new session every time
*Build* is shown; the drafts would be dropped on every return, however long their run lived.

**Keep drafts for the document's content.** Lost because an edit, in the builder or under
*Schema*, would drop them; 0162 judges a draft against the form as edited, on purpose, so that an
edit made while a draft waits changes its verdict rather than its existence.

**Let the host move the run to the new session, `run.adopt(session)`.** Lost because every host
would have to call it at the right moment, and a part drawing a run would be changing it; the
form's id already says what the host would be saying.

**Ask the host how to tell forms apart, `createDraftRun({ formOf })`.** Lost for now: an option
with one value nobody needs another for.

**Refuse *Draft* over another form while the last form's run waits.** Lost because the part
would show an enabled button that does nothing — or a run waiting about a form not on screen.
