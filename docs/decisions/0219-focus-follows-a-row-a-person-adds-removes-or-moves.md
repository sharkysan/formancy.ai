# 0219 — Focus follows a row a person adds, removes or moves

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Builds on:** [0046](0046-keyboard-before-drag.md), which made a row's buttons the keyboard's
  way to reorder, and [0184](0184-a-repeater-is-validated-as-a-field-is.md), which draws no Add
  button at a repeater's maximum and no Remove button at its minimum
- **Verified by:** **`packages/react/src/row-focus.test.tsx` and
  `packages/angular/src/row-focus.test.ts`**, by the same case names, each pressing a row's
  button as a person would:
  - *adding a row takes focus into its first question*;
  - *adding the last row the maximum allows takes focus into it, not to the page*;
  - *removing a row takes focus into the row now in its place*;
  - *removing the last row takes focus into the row before it*;
  - *removing the only row takes focus to the Add button*;
  - *moving a row keeps focus on its button, and on the other one at an end*;
  - *in a data grid as in rows*.

  All seven failed in both renderers before the change. Focus was on the page itself, or still on
  the Add button above the row the person had added. The move case failed at its second press,
  which takes the row to the end.

## Context

A repeater's rows are added, removed and moved by buttons, and neither renderer said where focus
went afterwards. Measured in jsdom on 2026-10-29:

- **Remove** draws its row out with the button pressed, so focus fell to the page, and the next
  Tab started from the top of the form.
- **Add** at the repeater's maximum draws the Add button out (0184), so focus fell to the page
  the same way. Below the maximum, focus stayed on Add, above an empty row the person had added
  to fill in.
- **Move** kept focus on the button pressed, which travels with its row, until the row reached an
  end. There that button is not drawn (0046), so focus fell to the page.

A person on a keyboard or a screen reader who removed a row had to find their place again from
the top of the page. WCAG 2.4.3 (Focus Order) asks that focus order preserve meaning; a removal
that sends focus to the page start loses it.

## Decision

**After a person presses a row's button or Add, focus goes where the change leaves their work.**

- **Add**: into the new row, at its first control, since a row is added to be answered.
- **Remove**: into the row now in the removed one's place, at its first control; when the last
  row is removed, the row before it; when no row is left, to Add. Not to the next row's Remove,
  where a second press would remove a row the person did not choose.
- **Move**: onto the moved row's button for the same direction, so pressing it again moves the row
  on; at an end, where that one is not drawn, onto the other.

A row is found by its position once the change is drawn, and its first control is the first thing
a person can operate in it, so a field a rule disables is passed over. Each renderer does it where
its repeater draws the buttons, by a helper of the same name, `focusRow`: React after the commit
that draws the change, as `useGoToField` does, and Angular in `afterNextRender`. One suite holds
both to the same cases (0033).

## Consequences

Removing a row, adding the last one allowed and moving one to an end keep the person in the
repeater.

**What it costs.**

- **`packages/react/src/form.tsx` is at 599 lines of its 600.** The repeater cannot leave it,
  since a slot and a repeater draw each other, and the file's own comment says mutual recursion is
  not a seam. The next change there splits by another seam, or makes room.
- **0.31 kB of React's barrel**, which measures 16.05 kB where it measured 15.74 kB, against a
  budget of 4 kB that is not a gate (0208); §9.3 has the figure.
- **A helper written twice**, `focus-row.ts` in each renderer, as `focus-control.ts` is: DOM code
  that core, which runs on the server, has no types for.

**What it does not do.**

- **A row moved by anything but its button**, such as a host's `moveRow`, still recreates its
  controls and loses focus held inside one, the limitation 0068 records and its tests still pin.
- **Nothing is announced.** A screen reader hears the control focus lands on, not that a row was
  removed. A live region saying so would be a word in each language and a second thing heard.
- **A host drawing its own repeater** from `useRepeater` or `injectRepeater` moves focus itself.
  The quickstarts say where the shipped one moves it.

## Alternatives considered

- **Focus the repeater's legend after a removal.** It keeps the person in the repeater, but at its
  top: a person removing the eighth of ten rows starts again at the first.
- **The next row's Remove button.** It's where a person removing several rows wants to be, but
  pressing twice removes a row they did not look at.
- **Leave Add's focus on Add below the maximum.** A person adding several empty rows before
  answering any keeps their place, but the common case, adding a row to answer it, takes a Tab
  through every row before it.
