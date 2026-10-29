# 0215 — A list of ticks draws its source's rows, as tick boxes or as a tag picker

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Builds on:** [0077](0077-options-may-come-from-a-named-source.md), which let a select name a
  source, and [0085](0085-a-tag-picker-is-a-widget-and-a-widget-has-a-version.md), which let a
  `selectboxes` name one and had the server check every value in it
- **Verified by:**
  - **`packages/react/src/selectboxes-source.test.tsx` and
    `packages/angular/src/selectboxes-source.test.ts`**, by the same case names. A list of ticks
    over a source:
    - draws a box for each row, named by its label;
    - stores every row ticked, in the order ticked;
    - ticks what the form already holds, named by the source, asked for in one request;
    - says so where the boxes would be when the deployment has no such source;
    - says a failed source in its status region and asks again from its button.

    A tag picker over a source:
    - asks the source what was typed, once per search, and offers what it returned;
    - adds a chip named by its row;
    - names the chips of what the form holds;
    - says so when the deployment has none;
    - says a failure and asks again on the next keystroke.

    Each of these failed in both renderers before the change. In Angular, a version that left the
    dispatcher asking failed the once-per-search case with two searches.

    A list of ticks asking again keeps the focus on its button until the rows arrive, then gives
    it to the first box. This case failed in both before the button was kept. *Says what its list
    leaves out, in a select's words* was written after the change and passed at once, since
    `optionsStatus` decides it.
  - **`packages/core/src/exclusive.test.ts`**, *on a list from a source keeps every answer, in the
    order ticked*, which failed before the change.
  - **`packages/core/src/options-status.test.ts`**, *a list of ticks that failed says only that,
    since a button asks again*, which failed before the change.
  - **Each renderer's `words.test`**: the failure and the button in German.

## Context

Spec 3 let a `selectboxes` name an `optionsSource`, as tick boxes or as a tag picker, and the
server checks every value of such an answer against the deployment's source (0085). Neither
renderer drew the source's rows. Both controls drew the document's options, of which a sourced
field has none, and said nothing. React asked the source nothing. Angular asked it for a page and
drew none of it, twice under the tag picker: the tick-box component that hands over to the tag
picker asked as well. A tag picker over a source was a combobox with nothing in its list, and
tick boxes over one were an empty group. arc42 §11.2 recorded this on 2026-10-18.

And had the rows been drawn, a tick would have stored nothing. `ticked`, which every list of ticks
calls so that no control stores what the engine refuses (0199), keeps what it is given in the
document's written order, and a sourced list has no written options, so its order was empty.

## Decision

**Both controls draw what the source returns**, through the lifecycle the select and the typeahead
already use: one hook in React, one function in Angular.

- **Tick boxes ask with the empty query, as a plain select does**, since nobody types into
  them, and draw a box per row.
- **A tag picker asks with what is typed, as a typeahead does.** It offers the source's rows
  without narrowing them again, and names each chip by its row.
- **The lifecycle now holds a list of what is stored**, a select's one answer being a list of one.
  Every value without a name is asked for in one `labels` request, and every value the rows lack
  is offered first, so a resumed answer is ticked and its chips are named.
- **A source the deployment lacks is said where the control would be**, as a select says it.

**A sourced list's answer is in the order ticked.** `ticked` keeps every answer of a field that
names a source, the new one last, since no order is written to keep them in. An answer to a list
with written options keeps the written order, as before.

**What a list of ticks says is a select's**, decided by `optionsStatus` under a third control kind,
`ticks`, except for a failure. A select's failure sentence says it is asked again when the person
moves to the field, and a list that did not arrive may have no box to move to. So a list of ticks
says only that the options could not be loaded, `options.failedTicks`, and draws a **Try again**
button, `options.retry`. The button stays while the source is asked again, and once the rows arrive
the focus moves from it to the first box. Removing the focused button would drop focus to the page,
where nothing is said, since success is not announced. The tag picker says what a typeahead says.

The two status lines are the parts `checkbox-status` and `tagpicker-status`, a failure carries
`data-state="failed"`, and the button is `checkbox-retry`. Each theme draws them as it draws the
select's and the typeahead's status lines and the signature's Clear button.

## Consequences

A form can ask for several answers from a list the deployment holds, ticked or picked, and what it
stores is what the server already checks.

**What it costs.**

- **Bundle size.** `@formancy/react` measures 15.52 kB, from 15.25 kB, and `@formancy/core/words`
  9.82 kB, from 9.75 kB, measured on 2026-10-29.
- **Two words more** in each catalogue: a host's own catalogue for another language says them in
  English until it adds them.
- **Order is not reproducible.** Two people ticking the same rows in a different order store
  different arrays, where a written list stores one.

**What it does not do.**

- **Tick boxes show the first page and nothing more.** They ask once, with the empty query, so a
  source with more rows than the control shows draws the first ones and says how many it shows.
  A field over such a list wants the tag picker, as a select over one wants the typeahead.
- **An exclusive answer cannot come from a source**: `exclusive` is an option's property, and a
  sourced field has no options.
- **Nothing under Material changes.** Material hands a sourced field to the default control, as
  it hands a sourced select. That is read from its code; no Material case draws a sourced field.

## Alternatives considered

- **Refuse `optionsSource` on a `selectboxes`.** Spec 3 is frozen and allows it, the server checks
  it, and refusing it now would make a valid document invalid.
- **Order a sourced answer by the source's rows.** The rows are a page of what one query matched;
  the full order is not known to the control, and a value outside the page would have no place.
- **Ask a failed list of ticks again when its group takes focus**, as a select does. A list that
  did not arrive may hold no box, and a fieldset takes no focus, so nothing would ask.
