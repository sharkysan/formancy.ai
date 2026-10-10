# 0167 — A request to a model names its kind, and the relay pane says what that kind carries

- **Status:** accepted
- **Date:** 2026-10-10
- **Supersedes:** the relay pane's one sentence about what leaves, in
  [0160](0160-a-person-carries-the-models-turn.md) — nothing else of it
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/model-requests.test.ts` (*the kind a request
  carries*) runs `authorForm`, `translateCatalogue` and `draftScenarios` for two turns each:
  all three cases failed with no kind on the prompt, and the translation's failed on its second
  turn alone with the kind left off the retry. `pnpm typecheck` fails in `translate.ts` with
  that same omission, because the field is required. `packages/builder-core/src/relay.test.ts`
  (*what the pane says leaves with a request*): before `relayLeaves` existed every case failed;
  with two kinds given one sentence, *a sentence of its own for each kind* fails in English,
  German and French, and with the German translation sentence left in English it fails in
  German. Each kind's case lists what its sentence claims and checks the request its run builds
  against that list, never against the words, and each check was watched failing with the
  request changed one thing at a time: the whole document put into a translation request, or
  into a request for examples, fails that kind's case on the fixture's rules; an edit sent
  without the form it changes fails the edit's case, and a form written from nothing sent with
  anything besides the person's words fails that one; the language's translations so far left
  out of a translation request, or the examples' names out of a request for examples, fails
  that kind's case. Each sentence is pinned, in English, German and French, in the case that
  lists its claims: with the English translation sentence reworded to say the request carries
  the whole form, its rules included — which every other gate passed — the translation case
  fails; with the German examples sentence saying the rules are included, the examples case;
  with the French edit sentence saying they are left out, both of the edit's. Both builders'
  `relay-pane.test`: with the pane drawing one sentence for every turn, as before, the
  translation and examples cases and *says what the next request carries when one of another
  kind follows* failed in each; in Angular, with the turn read untracked so the sentence was
  computed once, the last fails alone. Both builders' `language.test` (*the relay pane, for a
  request of each kind*) fail with one kind's sentence written into the pane in English — the
  translation's in React, the examples' in Angular — which every relay-pane case passed.
  `apps/playground/src/two-builders.test.tsx` (*what the relay pane says leaves, for each
  request*), a change under Fields, the French under Translations and examples drafted under
  Fields, in either builder: with both panes drawing one sentence and the packages rebuilt, the
  four cases for a translation and for examples failed and the two for a change passed.
  `apps/admin/src/server-model.test.tsx` (*refuses a system part formancy did not write …
  whatever kind the prompt names*) fails with `askServerModel` naming the request by the kind
  the prompt claims rather than by its briefing.

## Context

The relay pane ([0160](0160-a-person-carries-the-models-turn.md)) says one sentence about what
leaves the page: *"This pane sends the request nowhere. Copy puts the whole request on your
clipboard, including the form; pasting it into a chat gives it to that service under your own
account."* When it was written the prompt pane was the only thing that asked a relay, and a
model's edit does carry the whole document.

Two more requests came through the same relay. A translation
([0161](0161-a-model-translates-only-what-is-missing.md)) and a request for examples
([0162](0162-an-example-is-drafted-from-what-the-author-said.md)) each carry part of the form
and none of its rules — which the drafting part says, beside a relay pane telling the person
the opposite. Both records accepted the overstatement. A sentence about what leaves the page
that is wrong in either direction is one this repository will not make: an absent statement
prompts the question, a wrong one answers it.

The relay could not say anything better, because it did not know which request it held. It
had the prompt — a system part, a user part and the turn — and the request's kind existed only
as a name the server reads ([0165](0165-a-deployments-model-is-asked-through-its-server.md)),
recovered in the browser by comparing the system part with each briefing.

## Decision

**A request names its kind.** `AuthoringPrompt.kind` is one of `MODEL_REQUEST_KINDS` —
`authoring`, `translation`, `scenarios` — set by the run that builds the prompt, `authorForm`,
`translateCatalogue` or `draftScenarios`, on every turn. It is required, as `attempt` and
`limit` are ([0157](0157-a-models-turn-can-be-stopped.md)): an `AskModel` receives it and is
otherwise unchanged; a prompt built by hand has to say what it is.

**The pane says what that kind carries, decided once.** `relayLeaves(kind, text)` in
`@formancy/builder-core` chooses one of three catalogue sentences, which replace
`relay.leaves`, in English, German and French. In English:

- `relay.leaves.authoring` — *"This pane sends the request nowhere. Besides what the model is
  told about the format, the request carries your description and, when it changes a form,
  that whole form, its rules included. What you copy goes on your clipboard, and pasting it
  into a chat gives it to that service under your own account."*
- `relay.leaves.translation` — *"… the request carries the messages this language is
  missing, where the form uses each, and the form's translations into this language so far,
  but none of its rules. …"*
- `relay.leaves.scenarios` — *"… the request carries the form's title, its fields with their
  labels and options, the error codes it can report, the answers examples start from, the
  names of its examples and what you said it should do, but none of its rules. …"*

The table is a `Record` over the kinds, so a fourth kind does not compile until it has a
sentence. Both relay panes draw `relayLeaves(turn.prompt.kind, text)` and decide nothing
([0091](0091-a-second-builder-is-a-binding.md)). *What you copy* rather than *Copy puts the
whole request*: on a retry the first Copy puts only what was wrong on the clipboard.

**Each claim is checked against the request; the words are pinned beside the claims.**
`relay.test.ts` runs each kind's run through a relay on a form whose rules can be found in
either spelling, and reads the turn against a list of what that kind's sentence claims: an edit
carries the person's words and the canonical document, every rule in it; a form written from
nothing carries the words alone; a translation carries every missing message's source and
context and the language's translations, and no condition, check, code or document; a request
for examples carries the title, every label and option, the form's own codes, the starting
answers, the names already taken and the words, and no condition, check or document. A request
changed in its builder fails here until the list says what it now carries; whether the sentence
then changes with the list is the reading below. The sentence itself is not parsed: no test can
read *"none of its rules"* off a sentence in three languages. It is pinned, in English, German
and French, in the case that lists its claims, so a sentence reworded in any language fails
that case, and whoever rewords it has to read the list again against the new words. The tie
between the words and the list is that reading — review, made unavoidable, not automatic.

**The server path still names a request by its briefing.** `askServerModel` and the agents
guide's example read `modelRequestKind(prompt.system)`, not `prompt.kind`, because the server
pins the briefing for the kind it is told: a prompt claiming `authoring` beside a briefing
formancy did not write is refused, as 0165 decided.

## Consequences

**What it buys.** A visitor carrying a translation or a request for examples is told what that
request carries — less than the whole form, and not its rules — rather than that it includes
the form; one carrying an edit is told it includes the whole form with its rules, which it
does. The relay pane and the drafting part no longer contradict each other. Any host with a
relay gets the same, in the three languages the builders speak.

**What it costs.** **A prompt built by hand must name a kind.** A host test calling its own
`AskModel`, or a wrapper that builds a fresh prompt rather than passing the one it was given,
no longer compiles until it says which request it is. A wrapper that spreads the prompt keeps
the kind. This is the price 0157 paid for `attempt` and `limit`, for the same reason: a
field a run can forget is a sentence the pane can get wrong.

**A reworded sentence is a failed test.** Each sentence is pinned in full, in three
languages, so a typo fixed in one fails its case and has its new words copied in. The pin
makes reading the list unavoidable, not correct: whoever copies the new words in can do it
without reading what is beside them, and nothing here would know.

**Only formancy's three kinds have a sentence.** A host asking a relay for something of its own
has to name one of them, and the pane then says that kind's sentence, which may be untrue of
the host's request. Nothing checks a hand-built prompt's kind against what it carries; the
check is of the three runs.

**Two ways to know a request's kind.** `prompt.kind`, which the pane reads, and
`modelRequestKind(prompt.system)`, which the server path reads. They agree for every prompt
formancy builds — `model-requests.test.ts` runs each run and checks both — and a hand-built
prompt can make them disagree. Then the pane goes by what the prompt says it is, and the
server by what it was briefed as.

**The key `relay.leaves` is gone.** A host catalogue that overrode it, as an object literal
typed `BuilderCatalogue`, fails to compile with the key unknown; one for a language the
builders do not ship falls back to English for the three new sentences until it gives them.

**Longer sentences.** The examples' sentence names everything its request carries. Shortened,
it would leave something out, and what was left out would be the understatement.

**Still the pane's alone.** The sentences say what this request carries and that the pane
sends it nowhere. What the rest of a host's page sends is the host's, as 0160 said, and a
model that saw the form earlier in the same chat has seen its rules whatever this request
carries (SAFETY-ANALYSIS D16).

**"When it changes a form."** Every prompt pane formancy draws hands `authorForm` the current
document, so on formancy.ai an edit always carries one. `authorForm` called without `current`
writes a form from the person's words alone, and the sentence is worded to be true of both.

## Alternatives considered

**Derive the kind in the relay from the briefing**, with `modelRequestKind`, as the server
path does. No new field, nothing breaks. Lost because the sentence about what leaves would then
depend on several kilobytes of briefing arriving byte for byte: a host whose `AskModel` wraps
the relay's and adds a line to the system part gets no kind, and the pane has nothing true to
say about a request it can see perfectly well. The run knows what it is building; it says so
where it builds it.

**An optional kind, with a fourth sentence for a prompt without one.** Compatible with every
prompt built by hand. Lost because the only sentence true of any request says nothing about
this one, and every prompt formancy builds has a kind, so the fallback would exist for prompts
nobody here makes — while a run that left the kind off a retry would compile and say the
fallback mid-run.

**The kind on `RelayTurn` alone.** The relay cannot set it without the prompt carrying it or the
briefing being read, so this is one of the two above with a field in a second place.

**One sentence, worded for the least a request carries.** *"Copy puts the request on your
clipboard, as shown."* True of all three, and silent about the one that sends the whole form
with its rules — the understatement this decision exists to avoid in the other direction.

**What each kind carries as data in builder-core**, which the test checks the request
against and `relayLeaves` chooses the sentence by. One list instead of a list in the test.
Lost because the sentences are prose in three languages, so the data could choose a sentence
but not word one: whether the words say what the data says would still be a person's
reading, with the data as one more place to keep in step. Composing the sentence from the
data instead would make it a list of fragments, joined by each language's grammar.

**Each pane hands the relay its own sentence.** The relay pane is drawn above the tabs and does
not know which pane asked; and three panes in two builders each wording what leaves is the
divergence 0091 decides once.
