# 0161 — A model translates only what is missing, answers with the catalogue file, and is reviewed message by message

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/translate.test.ts`, each case watched failing
  with the code it guards changed one thing at a time. *Lists exactly the live messages with
  no target* failed with every message sent, and with the catalogue's keys, the orphan among
  them, in place of the ids the document refers to. *Says where each message is used* failed
  with an option worded as a field's label. *Gives every row a context* failed with no words
  for a property the walk does not know. *Carries none of the form's rules* **passed** with
  every rule expression appended to the request: the request is JSON, which escapes the
  quote each expression in the fixture has, and the case looked for each only as written,
  so only the one rule code with no quote in it could ever match. It now looks for each as
  JSON writes it too, and fails with that. *Shows the translations the language already
  has* failed without them. *Asks again for a catalogue in the wrong language* failed with
  the locale not compared; *not JSON, or not a catalogue file* with the messages not read
  one by one; *asks for the reason when a decline has none* with that answer checked as a
  catalogue. *Keeps a partial
  answer* failed with a partial answer refused, and *takes a target of nothing but spaces as
  one left empty* with such a target counted as translated, written, and shown in place of
  the English. *Drops and lists an id it was not asked for* failed with those ids kept, and
  with one carried back with an empty target listed as dropped; *asks nothing when nothing
  is missing* when a model was asked anyway. At the proposal, *never writes an id it was
  not asked for* and *never overwrites a message a person translated* failed with the
  second filter removed; *keeps a
  target that is the same as its source, and marks it* without the mark; *marks a message
  translated from wording the form no longer has* with the import's stale report ignored.
  *Marks a message stale by the source it was asked with* failed with the import handed the
  source the model wrote back, which marked every row of a model that translated the
  sources too, with nothing moved; *and marks one whose English changed while the model
  answered* failed the other way round, with no mark on French for an English that became a
  negation while the model answered, from a model that left the source out.
  *Writes the missing messages, and only the catalogue of the language asked* failed with
  each target written into the English as well. *Continues an earlier one with the rest*
  passed with the rest held against the form as it is now rather than the first answer's
  basis, because nothing moved in between; *and the rest is refused with the first when the
  form moved in between* was written for that, and fails with it. *Says which half of the
  file was missing* failed with every malformed file called one with no locale. The heading
  and status cases failed with the heading never naming a mark, a held proposal said over a
  later run that stopped, a translation that gave up said in the form's sentence about a
  document, and nothing translated said as ready to review. *Says a model whose every
  translation was dropped did that* failed with that model said to have left every message
  untranslated, and *and says a model that wrote nothing translated nothing* with an empty
  target counted as a translation dropped. *Holds for review only a proposal that writes
  something* failed with no such decision in `builder-core`. Both builders'
  `translations-pane.test`, *asking a model for what is missing*: against a review that drew
  nothing, six cases failed in each. Then, one change at a time in each: the review not keyed
  by the language, or not stopped when it goes, fails *stops the run when the language
  changes*, which first went back to English, the default, where the review is not drawn
  anyway, and passed both; it now moves to German. A preview of the form as it is rather
  than as proposed, marks not drawn, or the column of what was there left out fails *asks
  for the missing messages, and shows the answer beside what was there*; the rest asked over
  the form fails *offers the rest*; a refused Apply that discards fails *refuses to apply
  once the form has moved*; and an answer applied on arrival fails five cases. *Offers Ask
  again when the model left every message empty* failed in each, finding no button: the
  part drew Ask only with no proposal, and everything else only inside a review drawn for
  rows. *Says what was dropped when a person translated everything the model wrote* failed
  in each finding no list of what was dropped, which was drawn inside that review. Both
  `language.test` cases, *a model's translation under review*, fail with a column heading or
  *Translate the rest* written into the part; their stale mark came from a source the model
  wrote back, and once the mark was judged by what was asked the React case failed with no
  mark on screen, so both now change the English while the model answers.
  `apps/docs/src/builder-sentences.test.ts` failed on `translate-prompt.ts` until it was
  named as speaking for itself.
  `apps/docs/src/builder-layering.test.ts` failed with `TranslationReview` and
  `FormancyTranslationReview` unaccounted for until they were paired, and `workbench.test.ts`
  on eight parts until the workbench dressed them. `apps/playground/src/two-builders.test.tsx`,
  *a model asked for the French the starter is missing*, in either builder: both cases failed
  finding no button to ask with before the playground gave the panes its relay; with a
  `fetch` in the React review's run the React case failed on the fetch spy, and with a
  `sendBeacon` in the Angular review's the Angular case failed on the beacon spy. Both
  cases looked for one typed phrase, `country == "CH"`, which the request's JSON could never
  hold as typed; they now look for every expression, code and check the starter's rules
  have, as written and as JSON writes them, and with every expression appended to the
  request and built into the package both cases failed on them.
  `apps/playground/src/accessible.test.tsx`, *Translations, with French to review*: with the
  proposed preview given no ids of its own, the name check found 35 controls with no name,
  each label naming the pane's preview's control instead. Axe, in jsdom, did not report it.

## Context

The playground's starter carries a French catalogue left half-finished on purpose, and the
Translations tab in both builders marks every message missing from it. Nothing helped fill
them: a translator typed each one, or downloaded the catalogue file, sent it to a vendor and
uploaded it back. The playground's AI runs through the relay
([0160](0160-a-person-carries-the-models-turn.md)): the page shows the request, the visitor
carries it to a chat of their own, and every check runs in the tab.

The prompt pane could already be asked "translate this form into French". `authorForm` sends
the whole document and takes a whole document back, and its review is `diffSchemas`, which
reports a catalogue as one line per language: *"The fr catalogue reads differently."* So the
review of a translation would have said nothing about any message. The model would also have
been free to rewrite a translation a person had made, or the English it translates from,
with every check passing, and it would have been sent the form's rules for no reason.

A translation is an edit to what a question asks, in a language the person reviewing may read
less well than the source. A wrong heading is how [D9](../regulatory/SAFETY-ANALYSIS.md)
describes the harm: a question in the reader's language that asks something else is answered
as read and stored as the source meant. Unlike a missing message, which falls back to the
default language and announces itself, a wrong one looks finished.

The catalogue file already existed for a translator's round trip: the source beside every
target, exported for every message the form refers to and never an orphan, and imported by
rules of its own. An empty target erases nothing, an id the form no longer has is not
written, and a target translated from wording that has since changed is written and named.

## Decision

**A model is asked only for what is missing, in the catalogue file's shape.**
`translationPrompt(document, locale)` in `@formancy/builder-core` takes a `FormSchema` and
nothing else, so no submission or sample answer can reach it. Its rows are the catalogue file
the export gives, `catalogueFile(document, locale)`, filtered to empty targets. Each row gains
where the form uses it, derived by a walk shaped like the one that finds the live ids, so a
message that walk finds is one this one places: *label of a select question "Country"*,
*option of "Country"*, *name of a tab*, and a property it has no words for named by its key.
The briefing says: keep every id and source exactly as given and write only the target; a
label stays a label; match the register of the translations the language already has, which
are listed; leave a target empty when unsure, since an empty target never erases anything;
answer with the catalogue file as JSON only; or decline. The rules and the document are not
sent. The request is model-facing English, in `translate-prompt.ts`, named in
`builder-sentences.test.ts` as speaking for itself for the reason `authoring.ts` is.

**The answer is checked on the shared loop.** `translateCatalogue(ask, document, locale)`
runs on `askChecked` ([0056](0056-agents-get-the-checks.md)). It asks again, with that
problem alone, for an answer that is not JSON, not a catalogue file (a locale, and a message
list whose every entry has `id`, `source` and `target` as strings), a catalogue for another
locale, or a decline with no reason in it. A decline ends the run on its turn, as for a form
([0158](0158-a-model-may-decline.md)), and a stop ends it at once
([0157](0157-a-models-turn-can-be-stopped.md)). The rest is kept, with notes: ids the
answer wrote a target for that were not asked for are dropped and listed, and ids asked for
that came back empty are listed as still missing. A target of nothing but spaces is one left
empty: the import would write it, and a form reads any target its language has before the
default language's, so the label would read blank where the English fallback stood. With
nothing missing, no model is asked.

**The answer lands through the import, and is held as a proposal.**
`proposeTranslation(session, answer)` filters the answer to ids still missing in the form
now, imports it into a scratch `createBuilderSession` opened on the form, and returns an
`EditProposal` from `proposeEdit`, plus `locale`, `rows` (`{ id, source, was, now, flags }`),
`dropped` and `stillMissing`. The import's own rules apply: a target translated from a source
that has since changed is flagged `stale` from the import's report. **What the import is
handed as each source is the request's**, carried in the answer as `asked`, and not the
one the model wrote back: the stale rule then compares what the model was shown with what
the form says now. The import reads a file's own sources because a translator's file brings
nothing else to compare with; a model's answer has the request beside it, and its echo of a
source is text it wrote, which can be translated too, or left out. A target equal to its
source is flagged `unchanged` and kept, because it is sometimes right: the starter calls a
canton *Canton* in French. Apply is the existing `applyProposal`: refused when the form has
moved since, one undo step otherwise. There is no second staleness rule. *Translate the rest*
is `proposeTranslation(session, answer, earlier)`. The rest is asked over the earlier
proposal's document, written over it, and held against the earlier one's basis, so the two
land together, or neither does if the form moved in between.

**Missing-only, in this version.** Only a message with no target is asked for or written. A
message a person translated while the model was answering is dropped rather than overwritten.
A model never replaces a translation nobody asked it to touch.

**What a pane says is decided once.** `translationHeading` names the review: the language,
and whether anything in it is marked. `translationStatus` is the live region's one sentence,
in the order `proposalStatus` keeps: busy, then a refusal, then a run that ended without an
answer (newer news than a proposal still held from an earlier turn), then what is ready and
what is still missing. When nothing is written it tells a model that left every message
empty from one whose every translation was dropped, which it names by count.
`translationToReview` decides which proposal is held for review: one that writes nothing has
nothing to apply or discard, so it is not, and a part offers Ask again in its place.

**Both translations panes gain `ask`, and draw nothing new without it**, as the prompt pane
draws nothing without one. The review is a part in its own file in each builder,
`TranslationReview` and `<formancy-translation-review>`, paired in the layering test and
dressed by the workbench, every word in English, German and French. It holds a button naming
how many messages are missing, Stop while a run waits, and a polite status, with the ids
dropped under it, outside the review, because when everything the model wrote was dropped
there is no review and the list is what says why. Its review is a region named by its
heading, with a table of the source, what was there, what is proposed and what to look at.
Under the table come the form as the proposal would leave it in that language, then Apply,
Discard and *Translate the rest*. The preview is the pane's own preview component, moved to
a file of its own in each builder and given ids of its own here (`formId`), so two
renderings of one form do not name each other's controls
([0095](0095-one-schema-two-renderers.md)). The part is keyed by the language: choosing
another ends the run and the review that belong to this one.

**The playground hands its relay to both builders' translations panes.** The turn is drawn
where a prompt pane's is, by the relay pane at the top of either builder.

## Consequences

**What it buys.** The starter's French can be finished by a model the visitor brings, and
every message is read beside its source before any of it lands. A host with its own model
gets the same by passing `ask`. Nothing the model writes reaches a message a person has
written, and nothing reaches the form's rules or structure. A translation proposal changes
only the catalogue of the language asked, which `translate.test.ts` holds.

**What it costs.** **The review is only as good as its reader's command of that language.**
A mistranslation that reads fluently and asks something else passes every check here. Both
marks are hints. *Unchanged* flags a word that is the same in both languages and is right,
and says nothing about a target that differs from its source and is wrong. Nothing checks
that a target is written in the language its file says.
SAFETY-ANALYSIS D15 carries this as a residual.

**Where a message came from is not recorded.** Once applied, a model's message is a message:
the catalogue, the export, the diff and the next review cannot tell it from a person's.
A manufacturer who needs a translator's sign-off per message keeps it outside formancy.

**Missing-only means a model never improves a translation that exists.** To have one redone,
a person empties it first. The *Before* column therefore always reads *Not translated* in
this version. It is drawn anyway, because what a message was is the question a reviewer
asks, and because a later version that lets a model touch a written message must not need a
new review to show it.

**A blank target is empty only when a model wrote it.** A translator's uploaded file with a
target of nothing but spaces is still written by the import, as it was before this record;
what that import accepts is a decision of its own, and this one did not take it.

**One request carries every missing message.** A large form makes a long request and a long
paste through the relay, and there is no batching. A model that runs out of room answers in
part, and the rest is asked for again.

**The request leaves with the person.** Copy puts the form's words, where each is used, and
the language's existing translations on the clipboard (not its rules), and pasting it into a
chat gives it to that service. The relay pane's own sentence says the request includes "the
form", which for a translation overstates what leaves rather than understating it.

**The run belongs to the review part.** Choosing another language, tab or builder ends it, as
the prompt pane's run ends with that pane (0157, 0160). After Apply the review goes, and the
focus with it falls to the page's body, as it does after the prompt pane's Apply.

> **Since [0163](0163-a-models-run-belongs-to-the-host.md)** a host can hold the prompt
> pane's run, and the playground does, so that one no longer ends with its pane. This part's
> run still does: held by the host, it would come back to a pane opened on the default
> language, and 0163 left that decision for later.

**Two renderings of the form are on screen while one is reviewed:** the pane's, of the form
as it is, and the review's, as it would be. In the playground that is four, counting the
form pane's two.

**`TranslationProposal` extends `EditProposal`**, so `applyProposal` takes it unchanged.
Its `changes` is `diffSchemas`'s one line for the catalogue, which is why the review shows
rows instead.

## Alternatives considered

**Through the prompt pane, as an instruction.** A whole document out and back. The review
would be one line per catalogue, a model could rewrite a person's translation or the
English, and the rules would be sent for nothing.

**Translate everything, or let a model replace a translation it judges wrong.** It might make
a language more consistent. It would also replace work a person did without anybody asking.
A later version could offer it as a separate request, reviewed with *Before* filled in.

**A patch of its own, `{ id: target }`.** Smaller to paste. But it would be a second format
with a second import, and it would lose the source beside each target, which a vendor's
translation memory matches on if the same file goes to a person instead.

**Judge stale by the source the model wrote back**, as the import judges a translator's
file. This version first did, and it was wrong both ways: a model that translated the
sources as well as the targets had every row marked with nothing moved, and one that left
the sources out had no mark when the English changed while it answered. A translator's file
brings nothing else to compare with; a model's answer has the request beside it. The
request's sources are kept with the answer instead, which costs the answer one more field.

**Hold an answer that writes nothing for review**, as every other answer is. There is nothing
in it to apply or discard. Held, it left both builders with a sentence and no button, and
nothing but another language or tab to get out.

**Refuse a partial answer.** That asks a model told to leave what it is unsure of empty to
guess instead. The rest is offered as another turn.

**Accept or reject each message separately.** It gives finer control, but costs an undo step
per message and a second way to apply. Apply is one step, and a message can be corrected in
the translations table after it lands.

**A translation service behind a key.** A vendor, a key and a request from the site, which
formancy.ai makes to no other site ([0154](0154-the-website-makes-no-request-to-any-other-site.md)).

**Send the document, for context.** The rules and structure would leave for nothing. Where
each message is used is derived and sent instead, and that is what a translator needs from
the document.
