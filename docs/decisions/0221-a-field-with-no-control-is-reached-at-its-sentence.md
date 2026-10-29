# 0221 — A field drawn with no control is reached at the sentence that says why

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Builds on:** [0186](0186-a-fields-control-id-names-its-group-or-its-control.md), which put a
  field's control id on its group or its control, and
  [0213](0213-a-host-can-take-a-person-to-a-question.md), whose `useGoToField` moves focus by it
- **Verified by:**
  - **Each renderer's `control-id.test`**, *every field drawn with no control*, by the same names:
    a file field where the host takes no uploads; a select, and one drawn as a typeahead, whose
    source the deployment lacks; and a list of ticks, and one drawn as a tag picker, whose source
    the deployment lacks. Each *is reached by its control id, and focus moved by it lands on the
    sentence it draws*. All five failed in both renderers before the change: four had no
    element with the id, and the list of ticks's fieldset had it with nothing inside to focus.
  - **`packages/angular/material/src/controls.test.ts`**, the file, the select and the list of
    ticks, with Material's registry provided, which hands a sourced choice back to the default
    control. All three failed before the change.

## Context

0186 held every field drawn with a control to having one element with its control id, where focus
can land. The error summary's links, a failed submit without a summary, and `useGoToField` and
`injectGoToField` (0213) all move focus by that id.

Some fields are drawn with no control at all, because the deployment cannot take their answer: a
file field where the host provides no uploader, and a choice whose options come from a source the
deployment does not have. Each draws a sentence saying so. No element carried the id, measured on
2026-10-20. So a required file field in a deployment that takes no uploads was named in the
summary by a link that did nothing, and the field's label pointed its `for` at an id nobody drew.
A list of ticks is a group whose fieldset carries the id, but with no tick box inside, focus moved
by it found nothing to land on. Hazard D4 and the SOUP declaration have listed it since `0.7.0`.

## Decision

**The sentence in a control's place takes the control's place for focus.** It carries
`tabindex="-1"`, so focus can be moved to it and Tab passes it by, and:

- **where the field is not a group** (a file field, a select, a typeahead, a tag picker), the
  control id, so the summary's link, a failed submit and `useGoToField` land on it;
- **where it is a group** (a list of ticks), the fieldset keeps the id, as 0186 has it, and
  `focusControl`, which already falls back from an element that takes no focus to the first
  control inside, falls back to the sentence when there is no control.

A screen reader landing there hears why the question has no control, such as *This form cannot accept
files here, because no upload destination has been configured.*, where it heard nothing.

## Consequences

Every field the summary can name is one its link takes a person to, drawn with a control or not.

**What it costs.**

- **A label whose `for` names a paragraph.** The field's label still points at the control id, now
  the sentence's, which is not an element a label labels: clicking the label does nothing, and an
  HTML validator reports it. Before, it named an id nothing carried.
- **`focusControl` knows the parts** `file-unavailable` and `options-unavailable`, by their common
  ending, in both renderers.

**What it does not do.**

- **The question still cannot be answered.** A required file field in a deployment that takes no
  uploads still refuses to be sent. The person is now taken to the sentence saying why, and the
  fix is still the deployment's.

## Alternatives considered

- **Make the field's wrapper focusable.** A screen reader would announce the wrapper, with no role,
  and not necessarily the sentence inside.
- **Leave such a field out of the summary.** It is still unanswered and still blocks the send, so
  the summary would no longer say why the form refuses.
- **Drop the label's `for` when there is no control.** One more condition in the shell both
  renderers share, for a validator's warning about a label that clicks nowhere.
