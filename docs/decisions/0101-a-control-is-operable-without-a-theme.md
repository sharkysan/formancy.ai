# 0101 — A control owns what it needs in order to work; a theme owns how it looks

- **Status:** accepted
- **Date:** 2026-10-05
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/react/src/signature.test.tsx` and
  `packages/angular/src/new-types.test.ts` each assert the surface declares
  `touch-action: none` on the element, that a `touchmove` on it is cancelled, and
  that a `touchmove` anywhere else is not. `apps/docs/src/themes.test.ts` asserts no
  theme declares `touch-action`, because a stylesheet rule for it is now dead.
  Seven mutations were applied and each observed failing the case meant to catch it,
  including making the React listeners **passive** — jsdom honours `passive`, so the
  inert version of this fix is caught. One branch is deliberately unguarded and the
  code says so.

## Context

The signature control was reported unusable on an iPad: the page scrolls while you
sign.

A touch drag on a drawing surface is ambiguous — it could be a signature or it could
be a pan — and `touch-action` is how an element says which. The browser resolves that
ambiguity in the compositor *before* the first event reaches any handler, so no amount
of JavaScript can take it back afterwards.

**All four themes set `touch-action: none` on the signature surface, and nothing else
did.** That is why drawing worked everywhere the demo was looked at and nowhere else.
Measured in Chromium with the theme attribute removed from the host: `auto` on the
surface, inside a pane whose own `overflow` is `auto`, so a finger pans the pane
instead of signing.

This contradicts a claim the architecture makes about itself.
[§8.7](../architecture/08-crosscutting-concepts.md) says the unstyled kit is "semantic
HTML, zero CSS files" and that prop getters are the floor — "a consumer wanting zero
formancy markup uses only this and still gets correct a11y". A control that cannot be
operated without a stylesheet is not a styling preference. It is half a feature.

## Decision

**`touch-action: none` is declared by the control, in both renderers, on the element.**
Inline, which is heavy-handed and deliberate: a consumer who overrode it would be
turning the control off.

And the line it draws is the general rule:

> **A control owns what it needs in order to work. A theme owns how it looks.**

For the signature surface that means the control owns `touch-action`, and the theme
still owns the height, the border, the background and the cursor. The test for which
side a property falls on is not whether it is CSS — it is whether removing every
stylesheet leaves a control a person can still operate.

**The themes gave their copy up.** An inline style outranks every author rule, so a
theme rule for `touch-action` is now dead — and dead CSS that looks load-bearing is
worse than none, because the next person who needs it will find it already there and
conclude it works. A test keeps it out.

**There is a fallback, and it is honest about why.** Each control also cancels
`touchstart` and `touchmove` on the surface itself. Where `touch-action` is honoured
those events are not cancelable and this costs nothing; where it is not, this is the
only thing left. It is here because **the device this was reported on cannot be driven
from here**, and the property was already doing its job in the one browser that can
be — so the primary mechanism is verified and the fallback covers the case that is
not.

**Each renderer does the fallback in its own idiom, and that is not an
inconsistency.** Angular binds `(touchstart)` and `(touchmove)`, which go through
`addEventListener` on the element and are non-passive by default. React registers
`touchstart` and `touchmove` at the *root* and marks them **passive**, where
`preventDefault` is ignored and logs a warning — so the React control attaches its own
listeners with `{ passive: false }`. A template binding there would look exactly like
a fix and do nothing, which is why the mutation making them passive is one of the
seven.

## Consequences

**Only the surface cancels touches, and that boundary matters more than the fix.** The
form as a whole has to stay scrollable with a finger. Cancelling touches on an
ancestor — or on the document, which is the obvious way to write this — traps the
page, which is a worse bug than the one being fixed. Both suites carry a case
asserting a touch on the text input beside the surface is left alone, and the mutation
moving the listeners to `document` is caught by it.

**One branch is not covered by any test, and the code says so.** `preventDefault` is
called only when the event is `cancelable`, because Chrome otherwise logs "Ignored
attempt to cancel a touchmove event with cancelable=false" — which is precisely what
arrives when `touch-action` *was* honoured, so the common case would print a warning
per finger move. jsdom emits no such warning and `defaultPrevented` reads false either
way, so removing the check survives the suite. It is kept on the strength of the
browser behaviour rather than a test, and the comment in both controls states that
rather than leaving it looking verified.

**The inline style is one more property the cascade cannot reach**, which is the trap
[0100](0100-a-pane-boundary-is-dragged.md) was about. The difference is the direction:
there a component was shadowing a media query that needed to win, and the fix was to
stop. Here the control genuinely must win, because the alternative is a control that
works only for consumers who happened to load a stylesheet. Worth naming, because the
two records read as contradicting each other and do not.

**It does not prove the iPad is fixed.** What is verified is that the mechanism is now
present without a theme, that it is present in both renderers, and that the fallback
fires. Whether iOS Safari was ignoring `touch-action` on an `<svg>` is a question this
repository has no way to answer, and claiming the report is closed would be claiming
more than a test shows.

## Alternatives considered

**Leaving it in the themes and adding the fifth theme's copy.** The smallest change,
and it keeps the control broken for every consumer who brings their own design system
— which is the consumer this project is built for. Rejected on that alone.

**`preventDefault()` on `pointerdown`.** The obvious reach, and it does not work:
per the Pointer Events specification, cancelling `pointerdown` suppresses the
compatibility mouse events, not scrolling. Scrolling is governed by `touch-action` and
by cancelling the touch sequence. Worth recording because it looks like the fix and
would have shipped as one.

**A `<canvas>` instead of an SVG.** Would not help — the ambiguity is about the
gesture, not the drawing surface — and it would reverse
[0083](0083-a-signature-is-points-or-a-name.md), which stores points precisely so a
signature scales, diffs and means something to a reader that is not a browser.

**Putting `touch-action` in the prop getters**, so a consumer composing their own
markup gets it too. The right shape in principle, and deferred rather than rejected:
the getters currently carry ids and ARIA, and adding a `style` to them is a new kind
of thing for them to carry. Revisit when a second control needs it — a slider would.
