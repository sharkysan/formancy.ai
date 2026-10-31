# 0227 — The row arrowed to in a typeahead's list is scrolled into view, the page with it if it must

- **Status:** accepted
- **Date:** 2026-10-30
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`scripts/typeahead-browser-test.mjs`**, in `pnpm test:browser`: on the starter at 1440×1000,
    after End and after Home, the row the box names lies inside the list's visible box, in each
    renderer. It failed on the site as built before the change, with the last of twelve languages
    168 px below the list in both.
  - **Each renderer's `typeahead-widget.test`**, *scrolls the list only as far as the option arrowed
    to, and only when it moves*: the row End goes to is asked to scroll with `block: 'nearest'`, and
    a keystroke asks for nothing. It failed in both before the change.

## Context

A typeahead keeps DOM focus in its text box and names the row arrowed to with
`aria-activedescendant` ([0072](0072-a-typeahead-is-a-combobox-over-the-same-answer.md)), so the
browser scrolls nothing on its own. A theme draws the list shorter than a long page of options:
Blueprint's is 14rem. 0072 recorded that the active option was not scrolled into view, and
[0177](0177-a-source-may-say-its-list-goes-on.md) recorded it again for a source's page of fifty.
A keyboard person who arrowed past the last row the list showed heard each row named and could not
see it.

## Decision

**When the row arrowed to changes while the list is shown, the renderer asks that row to scroll
into view, with `block: 'nearest'`**, after the row is drawn: React in an effect on the active row,
Angular in an `afterRenderEffect`. `nearest` moves the list only as far as the row needs, and not
at all while the row is already in view, so arrowing among the rows on screen does not jump the
list. A keystroke makes nothing active, and scrolls nothing.

**The call is optional.** jsdom has no `scrollIntoView`, and a host's own tests run the renderers in
it: a required call would throw in every one of them that arrows through a typeahead.

## Consequences

The row a keyboard person hears is the row they see, in both renderers.

**What it costs.**

- **The page can move.** `scrollIntoView` scrolls every scrollable box around the row, the window
  among them. A list that runs past the bottom of the window, which it can since nothing flips it
  above the box (0072), scrolls the page to bring the row into view.
- **Two places implement one behaviour**, one per renderer, as 0072's controls already are. The
  browser check measures both.

**What it does not do.** A pointer moving over the rows makes none of them active, so it scrolls
nothing. A tag picker's list has no row arrowed to, since Enter adds its first match, so it has
nothing to scroll to and is unchanged.

## Alternatives considered

- **Set the list's `scrollTop`.** It keeps the page still, and leaves the row below the window when
  the list runs past it, which is the case where the person most needs to see it.
- **A scrolling library.** It computes what `block: 'nearest'` already asks the browser for, at the
  price of a dependency in both renderers.
