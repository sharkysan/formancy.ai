# 0196 — A placeholder is an example of the answer, never the label

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0194](0194-spec-5-opens-with-a-fields-description.md), as the third construct of
  the version it opened
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/spec/src/placeholder.test.ts`.** A placeholder on a text, long text and number
    field validates, as text or a catalogue reference; one on a date or a tick box is refused; a
    version 4 document carrying one is refused with `version.property` at its path.
  - **Both renderers' `placeholder.test`** — the same three cases in React and Angular. The
    attribute is on the text box, the long text box and the number box while each is still found
    by its label; it is read in the form's language; and on a masked field it replaces the
    `+41 __ ___ __ __` shape, which is still drawn when there is no placeholder. React's number
    case reaches the default number control, `NumberFallback`, which 0195 found is not the
    exported `NumberField`.
  - **`packages/builder-core/src/session.test.ts`**, *extracting every text in a document*: its
    list of text properties is read from the schema and now includes `placeholder`, and a
    placeholder in the fixture was left behind as a literal — both cases failed — until the
    extraction lifted it.

## Context

The gap survey behind version 5 found a placeholder among the things a person evaluating a form
library expects and does not find. It is also the construct most often misused: a placeholder
standing in for the label disappears the moment somebody types, is not announced by many screen
readers, and is drawn in a contrast no label would be allowed. WCAG's guidance on labels says so
in as many words. A format that offers one has to decide what it is for.

formancy already drew a placeholder of its own: a masked field shows its shape,
`+41 __ ___ __ __`, in the empty box. So the question was also which of the two wins.

## Decision

**`placeholder` on a text, long text or number field** — text or a catalogue reference, resolved
in the form's language by the engine as every text is, and drawn as the HTML attribute on the
native control by both renderers and Material. Not on a date, a choice or a tick box, which have
no empty box to put an example in.

**It is an example of the answer, and the label is still required.** The schema's description
says so, which is where the builder's property panel reads it: what the question asks belongs in
the label, how to answer it in the description (0194), and an example in the placeholder. Nothing
can make a placeholder the control's name, because the renderers name every control from its
label and the label is required.

**On a masked field the author's example wins over the drawn shape.** The author wrote it on
purpose, and an example — `+41 79 123 45 67` — says more than the underscores do. Without one,
the shape is drawn as before.

The builder extracts it for translation with every other text.

## Consequences

**A form can show an example in the box now**, in every language it speaks. One more text a
translator is handed.

**An author can still write a bad placeholder** — a question, say, that vanishes when somebody
starts to answer it. The format cannot tell an example from a question; the property panel's
description tells the author which it is meant to be.

**One more construct in an open version**, which a version 4 reader refuses.

## Alternatives considered

**No placeholder at all**, since it is so often misused. Then an author who wants an example in
the box puts it in the label, which makes the control's accessible name a paragraph — the defect
0194 removed for help text.

**On every field type.** A date's native picker, a select and a tick box have no empty text box;
a placeholder there would be ignored by the browser or drawn as a fake first option, which is an
answer the engine never heard about.

**Keep the mask's shape and ignore the author's placeholder on a masked field.** The shape is a
default; the author's text is a decision, and a default does not override a decision.
