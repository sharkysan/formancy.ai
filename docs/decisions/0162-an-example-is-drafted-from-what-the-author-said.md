# 0162 — An example is drafted from what the author said, judged by the engine, and kept one at a time

- **Status:** accepted; leaving *Fields* stopping the prompt pane's run in the playground
  superseded by [0163](0163-a-models-run-belongs-to-the-host.md); a draft living as long as its
  part and its session superseded in part by
  [0164](0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md), for a run the
  host holds
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/scenario-prompt.test.ts`. *Never carries a rule*
  walks a form's rules and every property its `BOUNDS` list names as bounding an answer,
  and finds none of their text in the prompt, written out or escaped inside a JSON string;
  with `canonicalize(document)` put into the request, as `authorForm` sends a form, it fails
  listing all of them. *Reads
  nothing about a field but what an example has to name* compares the prompt for that form
  with the prompt for the same form stripped to keys, types, labels and options, and fails
  when the inventory says which fields are required, which the first case cannot see. The
  example the briefing shows fails *holds against its own form* with its error code
  changed; the answers by type fail theirs with a time written `9:30` and with the wrong
  day; dropping the list of error codes, naming a repeater's row without its position and
  showing an existing example's expectations each fail their own case. *Never says the rules
  name no codes when a rule can work its own out* asks the engine for the code a `validate`
  rule's condition evaluates to, and failed against the first cut, which said the rules named
  none whenever no rule had a `code`.
  `packages/builder-core/src/scenario-drafts.test.ts`: reading the answer all or nothing
  fails *one broken item does not cost the others*; a complaint that drops the reasons fails
  *asks again only when nothing in the answer is an example*; taking the decline out of
  `askChecked` fails *a decline ends it*; dropping the taken-name, repeated-name or
  `errors`-shape checks each fails its case; `keepDraft` refusing every failing draft fails
  *a draft that fails can be kept*, and keeping one with a missing path or a taken name
  fails those; `draftVerdict` run without the pane's options fails *a draft's verdict is the
  one the scenario pane gives after Keep*. *A drafted `absent` on a field inside a group or a
  row is checked where the field is* failed against the first cut, whose runner looked
  `absent` up as a top-level key, so `home.street` held whatever the form did — as did
  `packages/core/src/scenarios.test.ts`'s *is looked for where the field is*, which also
  holds that a field hidden and cleared there passes. *Quotes the model's reason when it
  declined* fails with `draftQuotes` showing the last answer of a run that did not give up.
  *Every reason an item is not an example is said
  apart from the others* first passed with two reasons worded alike, because its items
  differed by name; they are one item now but for the reason, and it fails with
  `name-repeated` worded as `name-taken`, to the model or to the person. A stop said as a
  decline, a problem listed beneath a stopped run, and an answer with no list complained of
  as an empty one each fail their case. Both builders' `scenario-drafts.test`, each
  mutation in each builder: a part drawn without `onChange` (React) or without `removable`
  (Angular), drafts handed to the host on arrival, a failing draft refused, Keep that skips
  `keepDraft`, a verdict not recomputed on an edit, a verdict run without the sample, the
  unusable items not listed, the focus left to fall to the page after Keep, and the stop not
  passed to the run — each fails its case. *Is the verdict the list gives it once kept, with
  the pane's mode* runs a draft that fails only on the server: nothing failed with the mode
  dropped until it existed, and now dropping it from the part, or from the Angular pane's
  binding or the React pane's, fails it. *Quotes the model* fails in each builder with the
  decline's quote or the last answer taken out of the part, which every case passed before
  it. *Taken off the screen while a run waits* fails
  in React with the unmount's stop taken out, and *destroyed while a run waits* in Angular
  with the stop left out of the destroy hook; with the destroyed guard taken out the Angular
  case ends in `NG0911`, which the suite reports as an error. That guard was added for it:
  the first cut scheduled a render on a destroyed view. *Another session is another form*
  failed against the first cut in both builders, which went on offering the last form's
  drafts and left its run waiting; with the run's state no longer tagged with its session,
  or with a new session not stopping the run, it fails in each. Both builders' `language.test`,
  *the drafting part*, walk a run, a refused Keep, a Keep, a Discard, a decline, three
  answers with nothing to keep, a model that cannot be reached, a model that is busy and a
  stop under the pseudo-language, and fail with "Holds against the form as it is." written
  into either part, with the React status worded in English, with the Angular problems
  worded in English, and with a busy model's refusal ended as unreachable. They also require
  the decline's reason and the advice to start a new chat to be drawn; the second failed until
  the catalogue said it. `apps/docs/src/builder-layering.test.ts` failed with `ScenarioDrafts` and
  `FormancyScenarioDrafts` unaccounted for until they were paired, `workbench.test.ts` on
  the `scenario-drafts` parts until the workbench dressed them, and
  `builder-sentences.test.ts` on `scenario-prompt.ts` until it was named as speaking for
  itself. `apps/playground/src/two-builders.test.tsx`, *examples drafted from what the
  visitor says*, in either builder: without the relay handed to the scenario pane both
  cases fail finding no drafting box; a `fetch` on Draft (React), an `XMLHttpRequest` opened
  on Draft (Angular), a `sendBeacon` on Keep (React) and a `window.open` on Keep (Angular)
  each fail on its spy; a request carrying the document fails both on the starter's canton
  rule. It reads what Copy put on the clipboard: it read the request box at first, which
  shows the user half alone, and stayed green with the document put into the briefing, which
  now fails both. *One relay, two panes* fails in both builders with the relay's refusal
  ended as unreachable, and its second half with the prompt pane's busy sentence worded as
  unreachable. `packages/builder-core/src/relay.test.ts` (*one turn at a time*) holds the
  refusal in both directions and `authoring.test.ts` (*a model answering another request*)
  holds `ModelBusyError`, by class and by name; both fail with it not told from any other
  error. A translation meets the same relay since 0161: `relay.test.ts` (*a translation
  asked while a model's edit waits*) holds that refusal both ways, and failed with the
  translation's status empty, because `translationStatus` had no sentence for `busy`; its
  second half fails with the prompt pane's busy sentence worded as unreachable, and both
  halves with the relay refusing with a plain error. `translate.test.ts` (*a model
  answering another request is said to be busy*) holds the sentence in each language and
  over a proposal an earlier turn left, and both builders' `translations-pane.test` (*says
  another request is waiting while the relay carries the prompt pane's turn*) and
  `language.test` failed with the part's status empty. `pnpm typecheck` fails in
  `translate.ts` with `busy` taken out of `TranslationResult.ended`, or its case out of
  `endedStatus`. `scripts/install-fixture/consume.ts`, under `pnpm test:e2e:install`, drafts an
  example through a relay with the packed packages, judges it and keeps it; with the draft
  made to answer the email it fails on the verdict. The error codes: `pnpm typecheck` fails
  in `model-validators.ts` with `mask` taken out of `BuiltInErrorCode`, and in `engine.ts`
  with `required` misspelt; `BUILT_IN_ERROR_CODES` does not compile with a code missing or
  one too many. The error-code type left `@formancy/core`'s built `dist/index.mjs`
  byte-identical; the `absent` fix does not, and §9.3's figure, which `bundles.test.ts`
  recomputes, still rounds to 20.8 kB.

## Context

An example with its answer written down is the only check in this product that tells a
condition that compiles from the condition that was asked for
([0110](0110-a-form-is-checked-against-examples.md)). Both scenario panes run the form's
examples after every edit and name what stopped holding
([0111](0111-a-scenario-panel-names-what-stopped-holding.md)), and a model's edit is run
against them before Apply ([0159](0159-a-proposal-is-checked-against-the-forms-examples.md)).

All of that checks the examples a form has, and nothing wrote one. 0111 said so: *"Nothing
writes a scenario yet."* A form without examples gets nothing from any of it: the panel says
there are none, and the review of a model's edit says nothing about examples. In the
playground that is every form a visitor builds and the wizard.

A model can write examples. On formancy.ai it is the visitor's own, through the relay
([0160](0160-a-person-carries-the-models-turn.md)). The obvious way to ask is the way
`authorForm` asks: the whole document and an instruction. Shown the document, a model reads
`country != "CH"` and writes the example `country != "CH"` passes. That example agrees with
the rule whether the rule is right or wrong. It is green, it reads as a check, and it
checks nothing.

## Decision

**A model drafts examples from what the author says the form should do, and is never
shown a rule.** `scenarioPrompt(document, intent, { initialValue, existing })` in
`@formancy/builder-core` is the whole request. It carries:

- each field an example can name, by its data path, as `core`'s `formatPath` writes it,
  with its type, its label in the default locale, the option values with their labels, and
  whether the answer is a list;
- the path syntax, by example, from the same formatter;
- the error codes the engine reports by itself, and this form's own `validate` codes, by
  name only;
- where every example starts, the names already taken, and the author's words.

It never carries a rule's CEL, a check's name, a pattern, a mask or a bound, nor which
fields are required. Of the form's existing examples, only their names. The system part
asks for core's own `Scenario` shape, `{"scenarios": [{ name, because?, changes, valid,
errors?, visible?, values?, absent? }]}`, with real JSON values, how each type's answer is
written, the day every example runs on, and one typed example for a toy form. A test runs
that example against its form, and runs the answers by type and the day through the engine.

**The answer is read item by item.** `draftScenarios(ask, document, intent, options)` runs
on `askChecked`. The model is asked again only when nothing in the answer is an example: no
object, no `scenarios` list, or every item unusable. Then it is told why each item was not
one. Otherwise each item is read on its own, and the ones that are not examples are listed
with a reason: not an object, no name, a name taken or repeated, no `changes`, no `valid`,
an expectation of the wrong shape, or a key a scenario does not have. A decline ends the run,
as it does `authorForm`'s ([0158](0158-a-model-may-decline.md)).

**The engine judges every draft, every time it is drawn.** `draftVerdict` is `runScenarios`
with the scenario pane's own sample and mode, so a draft's verdict is the one the panel
gives it once kept, in the same words. It is computed whenever it is read and never stored.
`runScenarios` reads an `absent` path through the path, as it reads every other: it looked one
up as a top-level key, so an `absent` on a field inside a group or a row held whatever the
form did — and the briefing offers `absent` for any path.

**A person keeps each one.** `keepDraft` refuses a name already in the list, which also
stops one draft being kept twice, and a draft whose run fails because it names a path the
form does not have. **A draft that fails for any other reason can be kept.** That failure
is the question — is the example wrong, or the form? — and the person answers it. Nothing
reaches the host until Keep.

**Both builders draw it inside the scenario pane, and only draw it.** `ScenarioDrafts` in
`@formancy/builder-react` is drawn by `ScenarioPane` when both `ask` and `onChange` are
given; `formancy-scenario-drafts` in `@formancy/builder-angular` by `formancy-scenario-pane`
when `[ask]` is bound and `removable` is set. Keep calls `onChange`, or emits
`scenariosChange`, with the list and the draft. Both are exported and paired in the
layering test; their parts are dressed in the workbench; every word is in the catalogue in
English, German and French, in files of their own (`messages-drafts*.ts`). Which of the
model's own words are quoted beneath the status — its reason for declining, or its last
answer when no answer held an example — is `draftQuotes`, decided once. Keep and Discard
take the focus to the part's heading, and so does the end of a run that leaves it on Stop or
on the page's body, where the relay's pane drops it when its answer is taken.

**The engine's own error codes are a type.** `BuiltInErrorCode` in `@formancy/core` is a
union, and the codes `model-validators.ts` and `engine.ts` push are typed against it.
`builder-core`'s `BUILT_IN_ERROR_CODES` satisfies `Record<BuiltInErrorCode, true>`, so the
vocabulary a model is told cannot drift from the engine's. `ValidationReport` moved beside
it, which paid for the import in an `engine.ts` that has no lines to spare. `Scenario`
gained an optional `because`, which nothing runs.

**The playground hands the page's relay to both builders' scenario panes**, and a draft
kept goes into the page's examples for the open form, as one removed leaves them.

**A model answering another request is busy, not unreachable.** With one relay asked from two
panes, a run can find the other pane's turn waiting, in either direction. The relay rejects it
with `ModelBusyError`, exported from `@formancy/builder-core`; `askChecked` ends the run
`busy`, with no reason, and `proposalStatus` and `draftStatus` say from the catalogue that
another request is waiting. It ended `unreachable`, with the relay's English as the reason:
untrue, since nothing was asked, and shown as written under German and French. A translation
asked of a model (0161) runs on `askChecked` too, so `translateCatalogue` ends `busy` the same
way, and `translationStatus` says it in the prompt pane's sentence: nothing was applied in
either. This changes how 0160's refused run ends, and nothing else about one turn at a time:
the refusal stands.

## Consequences

**What it buys.** A form with no examples can get some, from a sentence, in either builder,
on formancy.ai with the visitor's own model. Each arrives with the engine's verdict on the
form as it is. A draft that does not hold is the interesting one: either the model misread
the author, or the form does not do what the author said. Kept, it goes on saying so in the
panel, and in the review of every model's edit after it (0159).

**What it costs.** **The examples are only as good as the intent described.** The model
writes from the author's words. Where they say nothing, it is told to leave the expectation
out, and nothing checks that it does. Where the author says something wrong, the example is
wrong with them. A model may also misread words that are right. That is why each draft is
shown with what it sets and expects, beside its verdict, and kept or discarded by a person.
Nothing here judges whether a draft is a good example. SAFETY-ANALYSIS D16 carries this as a
residual.

**Withholding the rules withholds what they would tell.** The model does not see that a
field is required, or its bounds, so it cannot write an example at a bound's edge unless
the author names the bound. It is shown option values and labels, so it can name an option.
That is the price of a draft that can disagree with the form: what the form says is what the
example exists to check.

**The request still leaves with the person.** Through the relay, Copy puts the request on
the clipboard: the form's title, its field paths, labels and options, the sample examples
start from, the names of the examples already kept, and the author's words. Not the rules,
but not nothing. A host's sample may hold real-looking data; the playground's is fictional.
That the rules are withheld is a property of the request, not of the chat: a model that saw
the form earlier in the same chat — the prompt pane's request carries the whole document,
through the same relay — has seen its rules. The part says it that way, of the request, and
tells the person to start a new chat for it; whether they do is theirs.

> **Fixed by [0167](0167-the-relay-says-what-each-request-carries.md):** the relay pane said
> beside the part that the request included "the form", which for examples overstated what
> leaves and contradicted the part. The request names its kind now, and for examples the
> relay pane says what one carries — the title, the fields with their labels and options, the
> codes, the starting answers, the examples' names and the author's words, and none of its
> rules. `relay.test.ts` checks those claims against the request `draftScenarios` sends, with
> the sentence pinned beside them.

**A draft lives as long as the part, and its session.** The drafts waiting are the part's
state, not the host's. Switching tab, builder or form takes the part away or hands it
another session, which stops a run (0157) and drops what was drafted: another session is
another form, and its list is not the place for the last one's drafts. Keep is how a draft
outlives it.

**One relay, one turn, both ways.** The playground's prompt pane and scenario pane ask one
relay. A draft asked for while a model's edit waits is refused, and so is an edit asked for
while a draft waits — 0160's own flow, which nothing could refuse before. Each ends `busy`
and says another request is waiting. The button that will be refused stays enabled while
the other turn waits: neither pane knows its `ask` is a relay, and 0160 declined to teach it.
`AuthoringResult.ended`, `Drafted.ended` and `TranslationResult.ended` gained `busy`, so a
host that switches over every ending has one more to word. The translations pane asks the
same relay from its own tab. Leaving Fields stops the other two panes' runs, so in the
playground it never meets their turns; a host drawing it beside them does, and it ends
`busy` there the same way.

> **Superseded in part by [0163](0163-a-models-run-belongs-to-the-host.md):** the
> playground holds the prompt pane's run at the page, so leaving *Fields* no longer stops
> it, and the translations pane can meet its turn and end `busy`. The scenario pane's
> drafting is still the part's, and leaving *Fields* still stops it.
>
> **Superseded in part by [0164](0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md):**
> a host can hold the drafting too, and the playground does, so leaving *Fields* no longer
> stops it and any of the three runs can meet another's turn. A held run is held for its form,
> by the form's id rather than the session: a new session of the same form shows its drafts,
> another form none of them. A part given no run keeps this record's rule: another session is
> another form, and the part going ends its run.

**Each draft is run on every edit**, beside the list the panel already runs. How long that
takes for many drafts on a large form is not measured.

**What the model can name is what the engine can.** A group or a repeater is not a path an
example sets; a field in a repeater's row is named by its position, as `items[0].note`, and
every key an example has — `absent` too — is read through that path. The codes a
deployment's checks answer with are not in the vocabulary, because the document does not say
them. Nor is a code a `validate` rule's condition works out: a condition that evaluates to a
string reports that string, `code` or not, and the string is in the condition, which is
withheld. Wherever the form has a `validate` rule, the request says such a code may exist and
that it cannot list it, and an example expecting that error can only guess its code.

**`Scenario` has a field it did not have.** `because` is optional and type-only. A host
that stores what `onChange` hands it stores the reason with the example.

## Alternatives considered

**Show the model the document, as `authorForm` does.** Lost to the one property that makes
a drafted example worth anything: one written from the rule agrees with it.

**Show the document without its `logic`.** Closer, and still wrong: bounds, patterns,
masks and `required` are rules too, written into the fields, and a model shown
`"pattern": "\\d{4,5}"` writes the example that pattern accepts.

**Add drafts to the list as they arrive, and let the person remove them.** Lost because a
draft is a model's reading of the author, and on arrival it would already be checking the
form — in the panel, and in the review of every model's edit — before anybody had read it.

**Refuse a draft that fails.** Lost because that decides, for the person, that the form is
right. A draft that fails is the one place the two can disagree.

**Read the answer all or nothing, as a document is.** A model that wrote five good examples
and one with a typo would be asked again for all six — through a relay, a round trip by hand.
Each item is an example on its own, so each is read on its own.

**Ask again whenever an item is unusable.** The same round trip for the same reason. The
unusable ones are listed with why, and the person can ask again if they want them.

**Keep the verdict the draft arrived with.** Lost because it would go on saying "holds"
about a rule somebody has since turned round.

**List the error codes as a constant in `@formancy/core`.** It would cost bytes in a bundle
already over budget (§9.3) for a list only the builder reads. A type costs nothing, and the
builder's constant is checked against it.

**Refuse a drafted `absent` that is not a top-level key.** It would have closed the hole for
drafts and left it open for every example written by hand, which `runScenarios` checked the
same way. The runner was wrong, so the runner was fixed.

**Give each pane its own relay.** Then two turns could wait at once, and the visitor would
carry two requests to one chat, with two relay panes above the tabs. One turn at a time is
the shape of one person with one chat.

**Leave the refusal `unreachable`, and say so.** Cheaper, and it left a German or French
visitor reading English that blamed a model nobody had asked.

**Disable Draft and Write it while the other pane's turn waits.** Each pane would have to know
its `ask` is a relay and whose turn is waiting — the relay as a case in the run, which 0160
declined. The refusal is immediate and says why, which is the next best thing.

**An editor for examples.** Not this. 0111 named composing an example by hand as the next
piece, and it still is; this is the half a model can do.
