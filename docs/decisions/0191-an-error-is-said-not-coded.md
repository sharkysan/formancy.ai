# 0191 — An error is said, not coded, and the catalogue says it

- **Status:** accepted
- **Date:** 2026-10-26
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/core/src/error-words.test.ts`.** Every code the engine reports of its own
    accord has a sentence in English, German and French with no placeholder left unfilled; a
    sentence names the field's own limit, formatted in the reader's language (`1,500`,
    `1.500`, `2 MB`, `3 May 2027`); a list says what it is a list of — choices, files, rows —
    and a required tick box, repeater and file field each ask for what they need; a code the
    catalogue does not know is said as itself; and a host's word for an error wins, as for a
    button. `BuiltInErrorCode` is a `Record` key there, so a code added to the engine without a
    sentence does not build.
  - **`packages/conformance/src/runner.ts`.** An `expectErrors` step fails when a message's text
    is its own code. Watched failing for eight of the React renderer's fixtures with its error
    text put back to the codes.
  - **Both renderers' suites and Material's**, where every assertion that read `required`
    off the screen now reads the sentence — the error under a field, the repeater's own error,
    the error summary in English and in German, and the summary's links by name.

## Context

The renderers drew a field's errors as the engine's codes joined with commas: `required,
minLength` under a question somebody was answering, in English under a German form. The error
summary set the same codes into a translated sentence, "Name: required". The renderers' own
words had followed the form's language since
[0171](0171-the-renderers-words-are-the-forms-language.md), and that record left the errors out
on purpose: who words an error was a decision of its own, and arc42 §11 listed it as debt.

The conformance drivers read the codes off the screen by splitting the error text on `", "`,
which is part of why the codes stayed on the screen: changing what a person reads changed what
every driver parsed.

## Decision

**The renderers' catalogue says each code, and both renderers call one function to do it.**
`errorSentence(text, def, code)` in `@formancy/core/words` returns the sentence for a code in
the form's language, with the field's own limit in it — "Enter at least 5 characters", "Attach
at most 3 files", "Enter 3 May 2027 or later" — read from `def`. The sentences are words like
any other in `FORM_WORDS`, `FORM_WORDS_DE` and `FORM_WORDS_FR` (`error.required`,
`error.minLength`, …), so a host changes or adds a language for errors exactly as it does for
the buttons.

- **The codes do not change.** They stay the engine's vocabulary, what `submit()` and the API
  return, and what a fixture asserts.
- **Each sentence carries its code** as `data-formancy-code` on its own element inside the error
  text, and the drivers read the code there instead of parsing it out of words.
- **A code the catalogue does not know is said as itself.** That is a `validate` rule's own
  `code`, or the message its expression returned; either is the author's word, and the
  catalogue has nothing better to say.
- **The error summary's entry is `{label}: {problems}`**, with `{codes}` still supplied for a
  host whose own wording of `errors.entry` used it.

The React renderer's six copies of the error markup became one `ErrorText`, and the Angular
renderer's six, and Material's, one `[formancyErrorText]` component, exported so a host's own
control says its errors the same way.

## Consequences

**A host that styled the error text sees new markup inside it**: one `span` per sentence,
separated by a space, where there was one string. The element `aria-describedby` points at, and
its `data-formancy-part="error"`, are unchanged.

**A third-party driver that parsed codes from the text stops working.** The suite's contract
says how to read them now; a driver that reports a message's text is also held to that text not
being the code.

**An author's own codes are still shown as codes.** A sentence for a code the document defines
needs the document to carry it, translated, which is a spec change, and the author-written
message is the place that change belongs.

## Alternatives considered

**The document words its errors.** Correct for an author's own codes, and a spec version and
work for every author for the built-in ones, which no author should have to write again.

**The host words them.** Already possible through the words a host supplies, and the reason the
shipped words exist is that the host that does nothing should still get a form a person can read.

**Keep the codes on screen and put sentences beside them.** It would keep every driver working
unchanged and put the engine's vocabulary in front of every respondent, which is the defect.
