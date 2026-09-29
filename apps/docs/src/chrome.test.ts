import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The way out of the documentation.
 *
 * Asked for: *"can I have the https://formancy.ai/docs/ with links to the top level
 * page and github? (and the icon)"*. Measured in the built page before anything
 * changed — the header held one thing, a text link reading "formancy.ai" that
 * pointed at `/docs/`:
 *
 * ```html
 * <a href="/docs/" class="site-title"><span>formancy.ai</span></a>
 * ```
 *
 * So the reference was a place with no exit. Somebody reading it could reach the
 * landing page, the playground or the repository by editing the address bar and no
 * other way, on the three pages of one site where a visitor is most likely to be
 * deciding whether to use the thing at all.
 *
 * None of this can be checked by rendering: the docs are built by Astro and these
 * tests run before any build. What they can do is hold the configuration to the
 * facts it has to agree with — the repository the manifests name, and a home link
 * that leaves `/docs/` — which is the part that goes wrong silently.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const config = (): string => readFileSync(join(repo, 'apps', 'docs', 'astro.config.mjs'), 'utf8')

describe('the documentation has a way out of itself', () => {
  test('links to the repository the manifests name, rather than to a URL typed twice', () => {
    // Derived: the address comes from a published manifest, so a repository that
    // moved cannot leave the documentation pointing at where it was. The
    // manifest's `git+` prefix and `.git` suffix are the packaging form of the
    // same address.
    const manifest = JSON.parse(
      readFileSync(join(repo, 'packages', 'spec', 'package.json'), 'utf8'),
    ) as { repository?: { url?: string } }
    const url = (manifest.repository?.url ?? '')
      .replace(/^git\+/, '')
      .replace(/\.git$/, '')

    expect(url).toMatch(/^https:\/\/github\.com\//)
    expect(config()).toContain(url)
  })

  test('and the link home leaves the documentation, which the title alone did not', () => {
    // The whole defect in one assertion. Starlight points its own title at the
    // docs root, so a header link is not the same thing as a way out: this fails
    // if the home link ever becomes another path under `/docs`.
    const component = readFileSync(
      join(repo, 'apps', 'docs', 'src', 'components', 'SiteTitle.astro'),
      'utf8',
    )
    // The TEMPLATE, which is everything after the frontmatter fence. Written
    // against the whole file this read the doc comment above it — which quotes
    // the markup being replaced, `<a href="/docs/">`, and so failed on prose
    // describing the defect rather than on the defect.
    const template = component.slice(component.indexOf('---', 3) + 3)

    // Two plain facts about the template rather than a parse of it. The home link
    // is an expression — one origin in production, two servers in development —
    // so there is no literal to compare; what there is, is that nothing in the
    // markup points back inside the documentation.
    expect(template).toMatch(/href=/)
    expect(template).not.toContain('/docs')
  })

  test('and it is wired in, because a component nothing renders is a file', () => {
    // Starlight only uses an override it is told about. Written without this, the
    // component existed, the test above passed on its source, and the built page
    // was unchanged.
    expect(config()).toContain('SiteTitle')
  })

  test('the mark travels with it, from the file the favicon already uses', () => {
    // One drawing, not two: the header logo and the tab icon are the same four
    // rectangles, and a second copy is one that gets updated alone.
    const logo = readFileSync(join(repo, 'apps', 'docs', 'src', 'assets', 'mark.svg'), 'utf8')
    const favicon = readFileSync(join(repo, 'apps', 'docs', 'public', 'favicon.svg'), 'utf8')

    const shapes = (svg: string): string[] => [...svg.matchAll(/<rect[^>]*>/g)].map((m) => m[0])
    expect(shapes(logo).length).toBeGreaterThan(0)
    expect(shapes(logo)).toEqual(shapes(favicon))
  })
})
