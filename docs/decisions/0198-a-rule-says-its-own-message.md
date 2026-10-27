# 0198 — A rule says its own message, in the form's language, for its code on its field

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0194](0194-spec-5-opens-with-a-fields-description.md), as the fifth construct of
  the version it opened; [0191](0191-an-error-is-said-not-coded.md), whose one function now says
  an author's words as well as the catalogue's
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/spec/src/rule-message.test.ts`.** A message on a validate rule with a code
    validates as text or a catalogue reference; one without a code, one on another kind of rule
    and one in a version 4 document are refused; two rules on one field sharing a code, either
    with a message, are refused as `rule.codeShared`, and the same code on another field is not.
  - **`packages/core/src/rule-message.test.ts`.** The snapshot carries the field's messages by
    code, resolved in the form's language, on every row's field for a row rule; `errorSentence`
    says the message for its code, a verdict from the server included, and still says a code
    with no message as itself. Four of the five cases failed before the change.
  - **Both renderers' `rule-message.test`**: the message is said under the field and in the
    error summary, never the code, in English and in German. Angular's failed again with its two
    call sites put back.
  - **`packages/builder-core/src/logic.test.ts`**: a validate rule composed with a message carries
    it under `condition`, or the next code free on its field; without one it carries no code;
    the editor will not add one without a message where it asks; and `ruleTakesMessage` agrees
    with the validator at every spec version — it failed with its threshold moved to 4.
  - **Both builders' `logic-panel.test`**: a rule that rejects an answer asks what it says, is
    not added until it does, and carries it; a version 3 document is not asked.
  - **`packages/builder-core/src/session.test.ts`, `translate.test.ts` and `logic.test.ts`**: a
    rule's message is extracted for translation, listed among the live messages after the
    questions, and placed for a model translating it as what the person reads when an answer is
    refused. Each failed before the logic was walked.

## Context

A `validate` rule names a `code`, and the field carries that code while the rule fails. 0191 made
the engine's own codes said rather than shown, from the renderers' catalogue — but a rule's code is
the author's word, which no catalogue knows, so it was shown as it is written: `notPositive` under
a quantity. The schema said the message "is looked up from this code per language"; nothing did.

The builder made it worse. Its editor gave every validate rule the code `condition`, so every rule
written there told the person filling the form in that their answer was `condition`.

## Decision

**`message` on a validate rule** — text or a catalogue reference, read in the form's language. It
is said for the rule's code wherever its field carries that code: under the field, in the error
summary, and for a verdict the server sends back, since the message is the document's and not the
evaluation's. A rule that runs only on the server is said in the reader's language by a browser
that never ran it.

**It needs a `code`, and no other rule on its field may share it.** The message is keyed by code,
because a code is what an error list holds; a message without one would be said for `invalid`,
which is also what a rule that cannot evaluate reports. Two rules sharing a code, either with a
message, would be two sentences for one code.

**The engine resolves it, as it resolves a label**, onto the snapshot as `messages`, and
`errorSentence` — the one function both renderers and both summaries call — says it first. The
codes stay what they were: the engine's vocabulary and a report's.

**The builder asks for it.** A rule that rejects an answer is not added without saying why, where
the document can hold a message; it is given `condition`, or the next code free on its field. Where
the document is older than spec 5 the editor does not ask, and the rule carries no code — the
engine's `invalid`, said in the reader's language, rather than `condition`. The message is
extracted for translation with every other text.

## Consequences

**A rule's error reads as a sentence, in the form's language.** A document written before spec 5
still has its codes said as themselves; upgrading it and adding messages is the author's.

**A message wins for its code on its field, whoever raised it.** A rule whose code is one the
engine reports itself — `min`, `required` — words that error too. Nothing refuses it: the spec does
not know the engine's codes, and saying the author's words for the author's code is what was asked.

**`FieldSnapshot` left `engine.ts` for `snapshot.ts`**, which paid for the lines: it changes for
the renderers' reasons, as this did.

**One more construct in an open version**, which a version 4 reader refuses.

## Alternatives considered

**Look the code up in the form's catalogue by convention** — `error.notPositive` — as the schema
claimed happened. No property, and a rule that some other text describes by naming convention: a
builder has to know the convention to write the entry, a translator to read it, and a typo in
either is an untranslated code with nothing to say why.

**A message per code on the field**, which would reword the engine's own errors as well. A larger
construct for a question nobody had asked; this one leaves room for it.

**Refuse a message on a code the engine reports itself.** It would need the engine's codes in the
format package, for a collision the builder never makes.
