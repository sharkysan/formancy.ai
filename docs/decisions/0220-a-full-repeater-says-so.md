# 0220 — A full repeater says so where its Add button was

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Builds on:** [0184](0184-a-repeater-is-validated-as-a-field-is.md), which draws no Add button at
  a repeater's `maxItems`, and [0219](0219-focus-follows-a-row-a-person-adds-removes-or-moves.md),
  which takes focus into the row a person adds
- **Verified by:**
  - **Each renderer's `repeater-bounds.test`**, by the same names:
    - *a repeater at its maxItems says so where its add button was, in a region drawn before it
      filled*: the status region is drawn, empty, with one row of two. After Add it is the same
      element and says *No more can be added: 2 at most.* After a removal it is empty again. This
      failed in both renderers before the change, finding no status region.
    - *a repeater with no maxItems, or one a rule computes, says nothing of one*: written with the
      change to keep the region off repeaters with no maximum to report. It passed before, when
      no repeater drew one.
  - **Each renderer's `words.test`**, *says a full repeater is full in German*: written after the
    change, and seen failing in both with the German word set to the English sentence.
  - **`apps/docs/src/themes.test.ts`**: every theme styles `repeater-status`, which failed for each
    of the four before its rule.

## Context

0184 made a repeater's bounds the engine's, and both renderers stop offering the Add button once the
repeater holds its `maxItems`. It is absent rather than disabled, as the move buttons are at the
ends. Nothing said why. A person who had added the third of three recipients saw the button go, and
arc42 §11.2 recorded that they were not told the reason unless the author wrote it into the label.

0219 moves focus into the new row when Add is pressed, so a screen reader is in that row when the
button goes. It hears nothing about the button leaving.

## Decision

**Where the Add button was, a full repeater says *No more can be added: 3 at most.***

- **It is a polite status region**, `role="status"`, drawn whenever the repeater has a `maxItems`.
  It is empty below the maximum and says the sentence at it. A region that exists before its text
  arrives is announced when the text does; one created with its text often is not. The select's
  and the list of ticks' status regions are drawn the same way, and every theme sets the empty one
  to `margin: 0`, never `display: none`, which would take it out of the accessibility tree.
- **Asked of the engine**, as the button is: the region speaks when `canAddRow` says no, so the
  sentence and the missing button cannot disagree.
- **Not on a repeater a computed rule writes** (0218). Nobody adds to one, and a maximum is not why.
- **The renderer's word**, `repeater.full`, in English, German and French, since no spec version
  has a property for it. The number is the document's.

## Consequences

A person at a repeater's maximum is told the reason the Add button went, on the screen and by a
screen reader as it happens.

**What it costs.**

- **A new part, `repeater-status`**, which every theme styles. A host's own theme has one more part
  to style, or leave as plain text.
- **A host's test that counts status regions** finds one more on a repeater with a `maxItems`.
- **Bytes**: `@formancy/react` measures 16.08 kB, from 16.05 kB, and `@formancy/core/words`
  9.97 kB, from 9.90 kB, both within §9.3's figures.

**What it does not do.**

- **The sentence is in the reader's language, the button in the author's.** A document's `addLabel`
  is a plain string in every spec version (§11.2).
- **Nothing says the maximum before it is reached.** A person learns it at the last row. Saying
  *Up to 3* from the start would be a second sentence beside every bounded repeater, and an author
  who wants it writes it into the repeater's `description`.

## Alternatives considered

- **Draw Add disabled at the maximum, with the reason as its description.** Every other button
  that cannot act is absent, here and at the ends of a row, because a disabled button is still
  reached in some browsers and announces a control that does nothing.
- **Say it only on the screen, without a live region.** A screen reader's focus is in the new row
  (0219), so it would hear nothing at the moment the button goes.
- **Use the repeater's error region.** A full repeater is not an error, and the error region is the
  engine's verdict on what was sent.
