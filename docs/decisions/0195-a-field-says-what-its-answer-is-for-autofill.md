# 0195 — A field says what its answer is, for autofill, from a list without passwords or cards

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0194](0194-spec-5-opens-with-a-fields-description.md), as the second construct of
  the version it opened
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/spec/src/autocomplete.test.ts`.** A hint on a text, long text, date and choice field
    validates; a word that is not an input purpose is refused; no password or payment-card token is
    in the list and `cc-number` is refused; a tick box carrying one is refused; a version 4 document
    carrying one is refused with `version.property`; and the schema's enum is exactly
    `AUTOCOMPLETE_TOKENS`, so the two lists cannot disagree.
  - **Both renderers' `autocomplete.test`.** The attribute is on the text box, the long text box,
    the date, the number and the select, and absent from a field with no hint. React's failed for
    the number field until the default number control — `NumberFallback`, not the exported
    `NumberField` — set it too.

## Context

WCAG 2.2's success criterion 1.3.5, *Identify Input Purpose*, is level AA: a field collecting
information about the person filling the form in must say which kind — given name, email, postal
code — in a form a browser and assistive technology understand, which on the web is the HTML
`autocomplete` attribute. formancy's pitch is accessibility by construction, and it had no way to
say it: the renderers drew no `autocomplete` on any field but the two that turn the browser's own
suggestions off. A form authored here could not meet an AA criterion however carefully it was
written. 0072 had already kept the name `autocomplete` free for exactly this.

## Decision

**`autocomplete` on a text, long text, number, date or choice field**, drawn as the HTML attribute
on the native control by both renderers and Material. A closed list, `AUTOCOMPLETE_TOKENS`, which
the schema's enum is held to: a misspelt hint is an authoring error rather than one a browser
ignores in silence.

**The list is the standard's input purposes without the password and payment-card ones.** A form
platform keeps what is typed into it, in a database, a webhook and an export. A hint inviting a
browser to put a saved card number or password into a field is inviting it into every stored
submission, which no adopter should take on by accident — and an adopter who means to collect
payment needs a payment provider, not a form field.

The type-ahead keeps its `autocomplete="off"`: the browser's own suggestion list would cover the
listbox it draws.

## Consequences

**A form can meet 1.3.5 now**, field by field, and the builder offers the hint from the schema. It
is the author's to set; nothing infers it from a label.

**No card or password field can say what it is.** One a person types those into anyway gets no
help from the browser, which is the intent.

**One more construct in an open version**, which a version 4 reader refuses.

## Alternatives considered

**The full list, cards and passwords included.** The standard's own, and the one a
general-purpose HTML form uses. Here every answer is stored, and that changes the arithmetic.

**Infer the purpose from the label or the format.** `format: "email"` could imply `email`, and a
label "First name" `given-name` — until the label is in another language, or the field asks for
somebody else's email. The purpose is what the author means, so the author says it.
