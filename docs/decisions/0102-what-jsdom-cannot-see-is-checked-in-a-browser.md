# 0102 — What jsdom cannot represent is checked in a real browser, and not with screenshots

- **Status:** accepted
- **Date:** 2026-10-06
- **Deciders:** Daniel Bacher
- **Verified by:** `scripts/browser-test.mjs`, run by the `browser` job in
  `.github/workflows/ci.yml`. The evidence that matters is not that it passes: both
  defects it was built for were **reverted, rebuilt and watched to redden it**, as was
  the touch fallback behind the second. Twelve checks per viewport across four
  viewports. What it does not verify is stated in the consequences rather than left to
  be assumed.

## Context

Two defects shipped in one week, through every gate this repository has.

**The pane row's grid template.** The playground composed it in the component and set
it with an inline `style`. An inline declaration outranks every rule in a stylesheet,
including the narrow-screen rule asking for a single column — which had been correct
until something started shadowing it. Measured afterwards in Chromium at an 820px
viewport: the row demanded 992px, the page scrolled sideways by **187px**, and the one
visible pane was 304px wide inside an 820px screen
([0100](0100-a-pane-boundary-is-dragged.md)).

**The signature surface's `touch-action`.** It was declared only in the four shipped
themes, so a finger drag panned the page for anybody using a renderer with their own
stylesheet. Reported from an iPad ([0101](0101-a-control-is-operable-without-a-theme.md)).

Neither was a coverage gap. **jsdom applies no CSS, resolves no media queries and
performs no layout** — every box measures zero and every cascade question has no
answer. No number of additional cases in that environment could have found either,
and a reader comparing this repository against a competitor's documentation reached
the same conclusion independently.

## Decision

**A gate that loads what a host serves, in Chromium, and asks for computed values and
geometry.** `pnpm test:browser`, after `pnpm build:web`, in its own CI job.

- **The composed site, not a dev server and not a component.** `apps/site/dist` served
  over HTTP on an ephemeral port, navigating to `/playground/`. The same reasoning as
  `test:e2e:install`: every other gate looks at the code from inside, where the thing
  that broke cannot be seen.
- **Four viewports**, each in the list for a reason: a phone at 390px, where the first
  defect cost 602px of overflow; a tablet in portrait at 820px, where it cost 187px;
  the same tablet in landscape, which is above the breakpoint with about 5rem of room
  to spare across the columns' 59rem of minimums; and a laptop.
- **What is asserted is what the defects were.** No horizontal overflow. The pane row's
  computed column count — one below the breakpoint, five above, counted rather than
  string-matched because the string is `780.667px` at one width and three `minmax()`
  tracks at another. The computed `touch-action` of **every** signature surface on the
  page, with the theme attribute present and removed.
- **Both renderers, not the first match.** The playground renders one schema twice, so
  there are two signature surfaces; the first version of the gate used
  `querySelector` and checked React alone. The two controls are written by hand in
  each framework's idiom and are exactly the pair that can diverge unnoticed.
- **One positive assertion among the refusals.** Every other check is that something
  does *not* happen, and a surface that refused every gesture would satisfy all of
  them — so a pointer drag must also record one stroke of the points it was given.

**Not screenshots, and that is the decision rather than an omission.** The renderers
ship no styling, so a pixel baseline would be a test of demo CSS
([§8.7](../architecture/08-crosscutting-concepts.md)). And a baseline is a file
somebody updates when it goes red, which makes it the one kind of assertion that gets
quieter the more often it fails. What the two defects actually were is a computed
property, a column count and an overflow in pixels — all of which are numbers a test
can state.

**A plain script rather than a test file**, matching `install-test.mjs`: a gate that
needs a built artefact and an external tool is already outside the suite, and giving
it a second runner and its own vitest config would buy nothing over a named list of
checks that throws.

## Consequences

**CI grows a browser download.** Chromium is about 115 MB, cached on the lockfile hash
— which is the right key, because the playwright version and the browser revision are
tied, and a mismatch is the one failure here that would look like a defect in the
page. The job also runs `build` and `build:web` of its own rather than reusing
`verify`'s, which costs a couple of minutes and buys a check whose name says what is
wrong.

**It verifies one engine, and the defect that prompted it was reported on another.**
Chromium, not WebKit. The iPad that found the `touch-action` problem cannot be driven
from here, and adding WebKit to the matrix is a second browser download and a second
set of flakes for a platform no maintainer runs. So D4c's residual still says the
report is not closed by this, and this record says the same: what is verified is that
the mechanism is present, in both renderers, with and without a theme.

**Four viewports of one demo schema is not the conformance suite.** The gate checks
the two mechanisms that produced the defects and nothing wider. A field type added
tomorrow is not covered by it, and the honest place to notice that is here rather
than in a sentence claiming browser coverage.

**It can only fail for a reason somebody has to understand.** A browser gate that goes
red intermittently is a gate people learn to re-run. There is no network, no third
party and no timing beyond a `waitForSelector`, which is as far as that risk can be
reduced from here; if it starts flaking, the answer is to narrow what it asserts
rather than to raise a timeout.

**Three regulatory statements became wrong the moment it landed**, and were corrected
in the same change. `SAFETY-ANALYSIS.md` and `SOUP-DECLARATION.md` both said no test
here can ask where a box is; one of them also said no application renders the Angular
bindings in a browser, which the playground had already made false. A document that
still lists something as unimplemented after it ships is wrong in the same way as one
that claims too much.

## Alternatives considered

**Vitest browser mode** (`@vitest/browser`, already in the catalog). The right tool for
running *component* tests in a real browser, and the wrong one here: what needed
checking was the composed site a host serves, with its stylesheet, its media queries
and its build. Still worth adopting the day a control needs real layout to test on its
own.

**Playwright's own test runner** (`@playwright/test`). Better reporting and parallelism
than a script, and a second test runner in a repository that has one. Rejected on that
alone; the catalog already pins `playwright` the library, which is all a plain script
needs.

**Pixel screenshots against a reference theme.** The design document proposed exactly
this, narrowly — pin the reference theme, the builder and the admin on a containerised
Chromium. Not rejected in principle and not done here: it answers a different question
(*did this look change*) from the one the two defects asked (*does this work at this
width*), and it is the answer that needs a baseline. Worth revisiting when there is a
design somebody would notice regressing.

**Adding the checks to `verify`.** Fewer minutes, one install, and a red `verify` that
could mean a type error, a failing unit test, a packaging problem or a layout defect.
The CLA check is a separate workflow for the same reason: the name in the pull request
list is the first diagnostic anybody reads.
