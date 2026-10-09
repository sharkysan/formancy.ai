# 0149 — A Material date keeps the platform's calendar button

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `scripts/material-date-browser-test.mjs`, in `test:browser` — Chromium
  draws the starter, and the last 28 pixels of its "Date of travel" input must hold the
  button's glyph. Without the starter's rule it found 0 dark pixels there.

## Context

Asked of the live site: the Angular page's form had no calendar button on its date. The
Material adapter draws a date as the platform's date input inside Material's field rather
than as Material's datepicker, which converts a calendar day through a `Date`
([0132](0132-material-draws-what-it-has-an-equivalent-for.md)). Material's text-field
stylesheet hides `::-webkit-calendar-picker-indicator` on every input it styles, because its
datepicker brings a toggle of its own — so nothing took the button's place.

Measured on the date above, the same starter in Playwright's three engines: **Chromium** drew
no button, where a plain date input beside it drew one; **Firefox** kept its own button, since
the rule names a pseudo-element only Chromium has; **WebKit** drew no button on the Material
field or on a plain one. So the defect is Chromium's — Chrome and Edge — where a date could
only be typed, and a time the same way, since it is the same pseudo-element.

## Decision

**Put Chromium's button back rather than add one.** One rule, in the application's stylesheet
after Material's theme, restores the pseudo-element for date and time inputs inside a Material
field. The starter carries it, and the Angular guide gives it to every application using the
adapter, which ships no CSS (0132).

## Consequences

**Chrome and Edge show the calendar button the platform draws**, and open the picker the
platform opens; a typed date works as it did.

**An application that does not copy the rule still has no button in Chromium.** The adapter
cannot ship it without shipping CSS, which 0132 decided against, so the guide says it in words
and the starter shows it. Nothing checks an application that is not in this repository.

**The check reads pixels, not the cascade.** The button is a pseudo-element, and Chromium's
`getComputedStyle` for it answers with the input's own values — measured, `inline-block` and
the input's width, with the button hidden. The check counts dark pixels where the button is
drawn, on Material's light field; a theme with a dark field would need the threshold turned
round.

**Firefox and WebKit were measured once, not gated.** `test:browser` runs Chromium only; if
Firefox's button ever moved into the pseudo-element Material hides, nothing here would notice.

## Alternatives considered

**A calendar button of the adapter's own, in the field's suffix, calling `showPicker()`.** It
works without CSS, for every application — and draws a second button in Firefox, which keeps
its own.

**Material's datepicker with an adapter that never converts through `Date`.** The equivalent
Material has, at the cost of a `DateAdapter` written and held to the fixtures for a control the
platform already provides; 0132 chose the platform's input for that reason.
