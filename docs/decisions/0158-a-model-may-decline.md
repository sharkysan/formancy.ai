# 0158 — A model may decline, and a decline ends the run after one turn

- **Status:** accepted; the playground’s stand-in dialog superseded by
  [0159](0159-a-person-carries-the-models-turn.md)
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/authoring.test.ts`, the cases under *a model
  that declines*. Before this change, *ends the run after one turn* failed with three
  calls ending `gave-up`. So did *a model that answers with the briefing's own example* and
  *in a code fence after a sentence*. *After an answer that failed* failed the same way, and
  *a host can end the run the same way* ended `unreachable`, because `declinedAnswer` did
  not exist. The cases about what is **not** a decline pass where nothing reads one,
  so each was watched failing against a looser reader instead. Reading any object that
  holds the key as a decline fails *an object with the key and anything else*. Reading the
  word anywhere in the text fails *a valid document titled "declined"*. Accepting a blank
  reason fails *nor is one with no reason to show*. *One with no reason is asked for the
  reason* failed against the first version of this change, which checked such an answer as
  a form: its problem was `invalid-document`, and the next turn told the model that
  `declined` was an unknown property to remove. It fails too with a non-string reason left
  to the schema, and with the complaint's example spelled differently from the briefing's.
  A `declinedAnswer` that does not throw fails *and is told at once*.
  `packages/spec/src/authoring.test.ts`, *shows how to decline*, reads the example out of
  the briefing as JSON. It failed before the briefing offered one, and again with a second
  key added to the example. `proposal.test.ts` holds the sentence in English, German and
  French. Before it, the status was `undefined`. Both builders' `prompt-pane.test` have
  *when the model declines*. Before this change, the status read *"Nothing was applied. 3
  attempts, and …"*. With the reason set as markup
  (`dangerouslySetInnerHTML`, `[innerHTML]`), the reason's text is not found. With the
  problem list left beside it, the list is. Both `language.test` cases fail with no
  reason on screen. `apps/docs/src/workbench.test.ts` failed on `prompt-declined` until the
  workbench dressed it. `apps/playground/src/demo-model.test.ts` failed with three dialogs
  without the line that shows how to decline. `scripts/install-fixture/consume.ts`, under
  `pnpm test:e2e:install`, declines through the packed packages. Against the packages
  before this change it did not compile.

## Context

`authorForm` asks the host's model for a form, checks the answer, and asks again with the
complaint until an answer passes or the attempts run out
([0056](0056-agents-get-the-checks.md), [0157](0157-a-models-turn-can-be-stopped.md)). The
briefing's last line told the model to answer with the JSON document and nothing else.

Some requests no document can satisfy. "Email me every submission" is one. The format says
what a form asks and checks; it has no construct for where an answer goes. A model asked for
it had no answer but a document. It wrote one, the checks refused it or it quietly did
nothing about email, and the model was asked again with a complaint about the document. The
run spent every attempt and ended *"3 attempts, and the document still did not work"*, which
sends the person to reword an instruction no wording can fix. The model's own view, that
this cannot be done, had nowhere to go.

Each wasted attempt is a call somebody pays for. Through the copy-and-paste relay planned for
formancy.ai, where the person carries each prompt to a model and its answer back, each one is
also two pastes by hand.

A host's model service can refuse a request itself, as a refusal in its response rather than
as text. An adapter had nothing to return for that but an error, which reads as a model that
could not be reached.

## Decision

**A model may answer `{"declined": "<why>"}`, and the run ends there.** `@formancy/spec`
exports `DECLINE_KEY`, and the briefing's last line offers the shape built from it. In
`@formancy/builder-core`, `readAnswer` reads an object whose only key is `DECLINE_KEY`,
holding a string that is not blank, as a decline. A form cannot have that shape:
`specVersion`, `id`, `title` and `model` are required. `askChecked` ends the run on it,
whatever was asked for, with `ended: 'declined'` and the model's reason, trimmed, as
`reason`. No further turn is asked. Problems from earlier answers stay in the result.

**A decline with no reason is asked for one.** The same shape holding a blank string, or
anything but a string, does not end the run, and is not checked as a form either.
`readAnswer` reads it as an `unexplained-decline`, and `authorForm`'s check answers it with
a problem of that kind. The next turn tells the model a decline needs a reason for the
person who asked, and shows the decline as the briefing does: answer that if the format
cannot express the request, the document if it can.

**A host can decline for its model.** `declinedAnswer(reason)` is the text a model would
have written. An `AskModel` returns it when its service refuses, and the run ends the same
way. It throws on a blank reason, because written out that is not a decline and the run
would ask again.

**The panes say so and show why.** `proposalStatus` says *"Nothing was applied. The model
declined this request."* in English, German and French. Both panes show the model's reason,
as text, in a `prompt-declined` blockquote in place of the problem list. The workbench
dresses it in ink rather than the problems' red. The playground's stand-in dialog shows how
to decline, with `declinedAnswer`'s example.

`describe_spec` is unchanged. It reads `authoringFacts`, not the briefing, and an agent
talking to a person through MCP can say "a form cannot do that" in its own words.

## Consequences

**What it buys.** A request the format cannot express costs one call, not the attempt limit.
The person reads the model's reason rather than schema complaints about a document nobody
wanted. A refusal by the host's model service ends the run as a decline, in the host's
sentence, rather than as an unreachable model.

**What it costs.** **A decline is the model's claim, and nothing checks it.** A model can
decline something the format does express: a phone number shown only on request is a
condition, and a model may still say a form cannot do it. The run ends after one turn, and
the person reads a wrong reason. Nothing lands, so the cost is a run, not a wrong form. The
person can reword and ask again.

**Offering a way out may make a model take it.** Whether a model declines more often than it
should, now that the briefing invites it, is not measured. No test here runs a real model.

**A model can still answer with a document that does part of the request.** The briefing
asks it not to, and nothing enforces that. A valid document that quietly leaves out the email
reaches the review like any other ([0109](0109-an-ai-edit-is-reviewed-before-it-lands.md)),
and the review is still what catches it.

**`ended` gains a member, and so does `AuthoringProblem.kind`.** A direct caller of
`authorForm` that handles each ending by name meets one it has not seen. TypeScript says so
only where that handling is checked to be exhaustive. Elsewhere a decline falls into whatever
the caller does for the rest. The same holds for a caller that switches on a problem's kind
and meets `unexplained-decline`.

**Every request asked through `askChecked` inherits the shape.** Whatever it asks for must
not itself be an object whose only key is `declined`. A form cannot be. A future request
whose answer could be is a reason to revisit this.

**The reason is the model's text.** It is untranslated, can run to a paragraph, and is in
whatever language the model wrote. It is shown as text, never as markup, so a model cannot
put an element into the builder. It is not in the status sentence. A screen reader
announces that the model declined, and the reason follows in the pane, as the problem list
follows *"the document still did not work"*.

## Alternatives considered

**A problem kind, `declined`, and the loop goes on.** Lost because the loop would ask again,
which is the waste this exists to end: a turn paid for to hear the same answer, or to talk
the model out of it.

**Let the form's check recognise it, as a third verdict.** Lost because a decline is about the
request, not about a form. `askChecked` is shared by every request to a model, and a decline
recognised in one caller's check would have to be recognised again in the next.

**Recognise a refusal in prose — "I cannot", "I'm sorry".** Lost to wording. It depends on the
language the model answers in, and it would misread a form whose own text says "I cannot
attend". A shape is checked; a phrase is guessed at.

**A `declined` property in the form document.** Lost because a document is not a message. A
property for a conversation would move the spec version, which is a reader contract
([0051](0051-spec-2-adds-types.md)), for a construct no form uses.

**Accept a blank reason as a decline.** Lost because "the model declined" with nothing after it
gives the person nothing to act on. Asked again, the model can say why, or write the form
after all.

**Check a decline with no reason as a form, like any other object.** This was the first
version of this change. Lost because the schema answers it with four missing properties and
`declined` as an unknown key to remove. That tells a model which judged the request
impossible to write a document anyway. Where the format cannot express the request, that
document is the partial one the briefing asks it not to write.

**Put the reason in the status sentence**, as an unreachable model's message is. Lost because
a host's message is the host's to keep short, and a model's reason is not. The live region
would read a paragraph every time it changed, and the pane would show the reason twice.
