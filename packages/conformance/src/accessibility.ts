/**
 * What the accessibility audit checks, and what it deliberately does not.
 *
 * The policy lives here rather than in a driver because it is part of the
 * contract: two renderers audited against two different rule sets are not
 * being held to the same standard, and the drift would be invisible — both
 * suites would be green. A driver supplies the auditor; this says what to ask
 * it (see `RendererDriver.audit`).
 *
 * Data, not code, and no dependency on any auditor. axe-core is what the
 * formancy renderers use, and a third party certifying their own renderer may
 * use something else entirely; the tags below are the WCAG conformance levels
 * every auditor names the same way.
 */

/**
 * The standard being claimed: WCAG 2.2 Level AA, and everything it subsumes.
 *
 * `best-practice` is excluded on purpose. Those rules are frequently good
 * advice and are not the standard — folding them in would mean the suite
 * failed a renderer for something no conformance claim covers, and the first
 * time that happened somebody would turn the whole audit off.
 */
export const ACCESSIBILITY_TAGS: readonly string[] = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
]

/**
 * Rules a form fragment cannot meaningfully be held to, with the reason each
 * one is off. The reason is mandatory and the shape enforces it: an
 * unexplained exclusion is how an audit quietly stops covering things.
 *
 * Every entry here is a rule about a PAGE. A conformance run mounts a form,
 * not a document — there is no `<html>` to carry a language, no `<main>` for
 * content to sit inside, no heading outline. A renderer that shipped its own
 * `<h1>` would be the bug. These are checked where they belong, on the real
 * pages: `apps/site` and `apps/admin` are documents and are audited as such.
 */
export const ACCESSIBILITY_EXCLUSIONS: Readonly<Record<string, string>> = {
  'html-has-lang':
    'A mounted form has no <html> element. The host page owns the document language.',
  'landmark-one-main':
    'A form is not a page and must not invent a <main>; the host page has one.',
  'page-has-heading-one':
    'A renderer that shipped its own <h1> would be imposing a document outline on its host.',
  region:
    'Every-region-is-a-landmark is a page-level rule. A form fragment has no landmarks to be outside of.',
  'landmark-unique':
    'Only reachable via the rule above, and meaningless without a page to hold the landmarks.',
}

/**
 * Rules that an auditor running outside a real browser cannot decide.
 *
 * Kept apart from the exclusions above, because these are not "does not
 * apply" — they are "cannot be measured here", and the distinction is the
 * difference between a scope decision and a gap. jsdom has no layout and no
 * computed colour, so contrast is unknowable; axe reports such a rule as
 * *incomplete* rather than as a violation, which means it costs nothing to
 * leave on and would silently pass if it ever could run.
 *
 * The gap is real and is closed elsewhere, not here: the reference theme's
 * contrast is checked in a browser, and the manual audit tier covers what no
 * automated tool reaches. axe finds roughly 57% of machine-detectable issues
 * by Deque's own figure, and only about 30% of WCAG criteria are
 * machine-testable at all. This suite is a floor.
 */
export const ACCESSIBILITY_UNMEASURABLE_IN_JSDOM: Readonly<Record<string, string>> = {
  'color-contrast': 'jsdom has no layout and no computed colour. Checked in a browser instead.',
  'target-size':
    'WCAG 2.2 SC 2.5.8 is a measurement in CSS pixels, and jsdom measures everything as zero.',
}
