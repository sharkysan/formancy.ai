# 0194 — Spec 5 opens with a field's description, for a batch that lands together

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0140](0140-spec-4-freezes-with-the-two-types-it-opened-for.md), which said version 5
  would open when a construct needed one, and [0088](0088-spec-3-freezes-with-four-constructs.md),
  whose batching rule this applies again
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/spec/src/description.test.ts`.** Version 5 is spoken and is the version a new
    document is written in; a description is text or a catalogue reference, on a field, a group
    and a page; a version 4 document carrying one is refused with `version.property` at its path;
    a version 4 document upgrades to 5 unchanged but for its version line. The ledger
    (`version-ledger.ts`) is a `Record` over `FieldDef`, so the property without a version there
    did not compile.
  - **`packages/core/src/description.test.ts`.** The snapshot carries the description resolved in
    the form's language, as the label is; the control's `aria-describedby` names it, only when
    there is one, and after a required group's hint. All three cases failed before the change.
  - **Both renderers' `description.test`** — the same four cases in React and Angular: a text box
    is described and not named by it, a radio group as a whole, a field without one points at
    nothing, and a page's is shown under the steps.
  - **`packages/builder-core/src/session.test.ts`**, *extracting every text in a document*, now
    reads which properties are text from the format's schema rather than from a list, with a
    case that the read finds them. Against the extraction as it was it named three literals left
    behind: the new `description`, and two the hand-written list had hidden since version 4 — an
    option picture's `alt` and a matrix row's label. All three are extracted now.
  - **`apps/docs/src/claims.test.ts`**: every version but the newest says FROZEN in
    `MIGRATIONS.md`, the newest says OPEN, and no other does; the landing page and every
    regulatory paragraph about the spec being frozen name version 5.
  - **`apps/docs/src/themes.test.ts`** — the `description` part is styled by all four themes.

## Context

Version 4 froze with no version open, and 0140 said the next construct that needed one would
open version 5. The gap survey behind this — what a person evaluating formancy expects and does
not find — named several, all changes to what a document may say: help text under a question,
the browser autofill hint WCAG 1.3.5 asks for, a placeholder, a default value, the message a
`validate` rule shows written by its author, and a choice's extras ("Other, please specify", an
exclusive "None", a shuffled order). Each is a version event for every consumer — a pinned
reader, a regulatory characterisation, a migration note — so the batching rule says they come
together.

Help text is the first because its absence is the most visible: the only place for "as on your
passport" was the label, which made every control's accessible name a paragraph. And the engine
had already reserved the id it needed — `ids.description`, between the hint and the error in
`aria-describedby`'s order — without anything that filled it.

## Decision

**Version 5 is open**, and is what this package writes. It holds, so far, **`description` on a
field**: text or a catalogue reference, drawn under the question and named in the control's
`aria-describedby`, so it is read out after the control's name rather than as part of it. On a
group, a page or a repeater it describes the whole set. The engine resolves it in the form's
language, as it does the label, so the two renderers cannot disagree about which language it is
in.

**Version 5 stays open for the rest of the batch** named above, and freezes when they are in.
The named list is a plan, not a promise: each still needs its own design, and one that turns out
not to be a document construct leaves the list rather than holding the version open.

The property is `description` because the engine's id for it was already called that; the
builder offers it in the property panel, which is generated from the schema, and extracts it for
translation with every other text.

## Consequences

**A document written against version 5 now is written against a format that may still change.**
MIGRATIONS.md, the landing page and the regulatory set say so, and a manufacturer is told to
characterise against a frozen version. Version 5 is in no release yet.

**A new document is refused by every released reader.** 0.7.0 speaks version 4; a form authored
in the builder now declares 5 and is refused there, loudly, as at every version so far. A host
on 0.7.0 that writes documents by hand is unaffected.

**Two gaps in translation extraction were closed on the way.** An option picture's `alt` and a
matrix row's label were never extracted, so a translator's catalogue never had them and those
words stayed in the author's language. Found by deriving the case from the schema, which is the
shape every later text property will be held to.

## Alternatives considered

**Put help text in the label, as before.** No format change, and the defect: a long accessible
name on every control, and no way for a renderer to draw the two differently.

**Open version 5 for the description alone and freeze it.** One construct for one version event,
then another event for the next — the cost the batching rule exists to avoid.

**Call it `hint`.** The engine's `hint` slot already says a required group is required; a second
meaning for the same word would put two things behind one id.
