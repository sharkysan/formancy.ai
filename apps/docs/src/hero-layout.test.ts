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
const stylesheets = ['site.css', 'hero-studio.css'].map((name) => ({
  name,
  css: readFileSync(join(repo, 'apps', 'site', 'src', name), 'utf8'),
}))

/** Every rule in source order, innermost first: `@media` preludes fall out. */
function rulesFor(selector: string): Array<{ where: string; body: string }> {
  return stylesheets.flatMap(({ name, css }) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)]
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
