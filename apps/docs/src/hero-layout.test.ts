import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The hero holds still while somebody plays with the demo.
 *
 * Reported as "the text on the start page should not jump if the form changes
 * (e.g. fields visible)", and measured at 1440x900 before the fix: the headline
 * sat 279px down the page, choosing the pass that reveals a field moved it to
 * 362, and adding the company field on top of that moved it to 410. A visitor
 * who touched the demo was reading a page that rearranged itself.
 *
 * The cause was `align-items: center` on the hero: two columns in one grid row,
 * so the row's height is the preview's height, and centring the words inside it
 * makes their position a function of how many fields are showing. The fix is not
 * a smaller number -- it is removing the dependency. The words are placed against
 * the hero, the preview grows downward from its own top, and neither can move the
 * other.
 *
 * jsdom has no layout, so this cannot measure the jump. What it can do is fail
 * when the coupling comes back, which is the thing that caused it.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
/*
 * Every sheet the page is drawn from, because the cascade does not care which
 * file a rule is in. `shell.css` joined the list when the tokens and the bar
 * left `site.css` for it: the four cases below went red that day reading a
 * `--shell` that was no longer where they looked, which is the right failure —
 * a guard that follows a moved fact silently would be a guard reading nothing.
 */
const stylesheets = ['shell.css', 'site.css', 'hero-studio.css'].map((name) => ({
  name,
  css: readFileSync(join(repo, 'apps', 'site', 'src', name), 'utf8'),
}))

/**
 * Every rule in source order, innermost first: `@media` preludes fall out.
 *
 * A selector is what follows the last `}` **or `;`**: a statement at-rule ends in a
 * semicolon, and when `shell.css` began with `@import`s for its faces (0154) the text
 * before `:root` read as one long selector and every case below lost the tokens.
 */
function rulesFor(selector: string): Array<{ where: string; body: string }> {
  return stylesheets.flatMap(({ name, css }) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]*)\{([^{}]*)\}/g)]
      .filter((match) => (match[1] ?? '').trim() === selector)
      .map((match) => ({ where: name, body: match[2] ?? '' })),
  )
}

/** What a property ends up as, the later rule winning, as the cascade has it. */
function settles(selector: string, property: string): string | undefined {
  const found = rulesFor(selector).flatMap(({ body }) =>
    [...body.matchAll(new RegExp(String.raw`(?:^|;)\s*` + property + String.raw`\s*:([^;]*)`, 'g'))].map((match) =>
      (match[1] ?? '').trim(),
    ),
  )
  return found.at(-1)
}

describe('the hero holds still while the demo changes', () => {
  test('is reading the stylesheets at all', () => {
    // A guard on the guard: a selector that matched nothing would make every
    // assertion below vacuously true.
    expect(rulesFor('.hero').length).toBeGreaterThan(2)
    expect(rulesFor('.hero-copy').length).toBeGreaterThan(0)
  })

  test('the words are placed against the hero, not against the preview', () => {
    // `center` is the defect: it makes the row's height -- the preview's height --
    // decide where the headline sits.
    expect(settles('.hero', 'align-items')).toBe('start')
    expect(settles('.hero', 'align-content')).toBe('start')
  })

  test('and are still placed deliberately, rather than pinned to the top edge', () => {
    // The offset that replaces centring. Without it the words land against the
    // hero's padding and the page reads as starting before the visitor is ready --
    // which is why centring was chosen in the first place.
    expect(settles('.hero-copy', 'padding-block-start')).toBeDefined()
  })
})

/**
 * One measure, and it grows with the screen.
 *
 * Reported as "the start page is still really small on wide screens", and
 * measured at 2560x1440 before the change: every section capped at **1760px**
 * and centred, so 392px of empty margin down each side — while the sticky bar
 * was full-bleed with an 80px gutter, putting its own contents 312px OUTSIDE the
 * column everything else lines up to. That mismatch is most of the effect: the
 * page does not read as a page with margins, it reads as a narrow card under a
 * wide header.
 *
 * Two things follow, and only the second is about width. The chrome uses the same
 * measure as the content, and the measure stops being a constant.
 *
 * jsdom has no layout, so none of this can be measured here. What it can do is
 * fail when the measure goes back to a constant or the bar stops sharing it,
 * which is the shape of the defect rather than its size.
 */
describe('the page uses a wide screen', () => {
  const shell = (): string | undefined => settles(':root', '--shell')

  test('has one measure, declared once', () => {
    expect(shell()).toBeDefined()
  })

  test('and it grows with the viewport rather than being a constant', () => {
    // `max-width: 110rem` is a number chosen against the screens somebody had. A
    // viewport term is what makes it an answer for the screens they did not.
    expect(shell()).toMatch(/vw/)
  })

  test('and stays bounded, because a line of prose is not improved by 2500px', () => {
    // The bound is the reason paragraphs keep their own `--measure` and only the
    // demos and card grids take the extra room. Without an upper limit this would
    // be a stylesheet that trades one complaint for the opposite one.
    expect(shell()).toMatch(/clamp\(|min\(/)
  })

  test('the bands that hold the content use that measure and not a literal', () => {
    // Two bands, one measure. They carried the same literal twice, which is how
    // one of them gets widened alone.
    for (const band of ['.wide', '.duo']) {
      expect(settles(band, 'max-width'), band).toBe('var(--shell)')
    }
  })

  test('and the sticky bar lines its contents up with them', () => {
    // Full-bleed background, content on the measure: the bar keeps its blur across
    // the whole width while its logo and its links sit where the headline below
    // them starts. Expressed as a padding rather than an inner wrapper, so the
    // background does not need a second element to survive.
    const padding = settles('.bar', 'padding-inline')
    expect(padding).toBeDefined()
    expect(padding).toMatch(/--shell/)
  })
})
