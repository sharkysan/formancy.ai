import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { codecovConfig, coveredPackages } from '../../../scripts/codecov-config.mjs'

/**
 * Coverage is reported and never gated, and the report says which package moved.
 *
 * Both halves needed configuration, because Codecov's defaults are the opposite
 * of this repository's policy on each. With no `codecov.yml` it posts `project`
 * and `patch` statuses against an `auto` target — a failing check when the
 * number drops, which is a threshold arriving by the back door into a repository
 * that deliberately has none. And it reports one number for nineteen packages,
 * so a renderer losing coverage looks exactly like the server gaining it.
 *
 * The file is generated, so the interesting case here is the one that fails when
 * a package is added without a component. The rest guard the policy against the
 * edit somebody would make in good faith: a threshold, which from here always
 * looks like an improvement.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const committed = (): string => readFileSync(join(repo, 'codecov.yml'), 'utf8')

describe('the Codecov configuration', () => {
  test('is what its generator produces, so a new package cannot be missing from the report', () => {
    /*
     * The failure this prevents has a precedent in this repository: three
     * published packages sat on a weaker check than their twelve siblings until
     * somebody counted. A component list maintained by hand goes the same way,
     * and the symptom is absence — the package is not reported wrongly, it is
     * not reported.
     *
     * It also catches every hand edit to a generated file, which is the other
     * thing that has happened here: prose written into the generated spec
     * reference was overwritten by the next build and the change looked merged.
     */
    expect(
      committed(),
      'codecov.yml is not what the generator produces; run `node scripts/codecov-config.mjs --write`',
    ).toBe(codecovConfig())
  })

  test('declares a component for every package that measures coverage, and for no others', () => {
    // Stated directly rather than left to the case above, because the message is
    // the point: this one names the package. The two sides are independent — the
    // manifests on disk against the file on disk.
    const declared = [...committed().matchAll(/^      name: (\S+)$/gm)].map((match) => match[1])

    expect(declared).toEqual(coveredPackages().map((pkg) => pkg.path))
    expect(declared.length).toBeGreaterThan(10)
  })

  test('and leaves out the one package with no suite, rather than reporting it as untested', () => {
    // `packages/themes` is CSS. A component for it would report nothing forever
    // and read as a package nobody tests, which is a different claim from one
    // there is nothing to measure in.
    const themes = JSON.parse(readFileSync(join(repo, 'packages', 'themes', 'package.json'), 'utf8'))

    expect(themes.scripts?.['test:coverage'], 'themes gained a suite; regenerate codecov.yml').toBeUndefined()
    expect(committed()).not.toContain('packages/themes')
  })
})

describe('what nothing here is allowed to become', () => {
  test('a threshold on the Codecov side, which is what `informational` prevents', () => {
    /*
     * Every status Codecov is given must be informational. Dropping the flag is
     * a one-word edit that turns a report into a gate, and it would arrive
     * looking like rigour: a number nobody is allowed to lower.
     *
     * The argument against it is in CLAUDE.md and in `vitest.coverage.ts`, and
     * it is not that coverage does not matter. It is that a percentage is a
     * number somebody can raise without raising confidence, so the bar is a test
     * that fails without the behaviour it covers — which a threshold cannot
     * check and does not encourage.
     */
    const generated = codecovConfig()
    const statuses = [...generated.matchAll(/^\s*informational: true$/gm)]

    expect(statuses.length, 'a status was added without `informational`').toBeGreaterThanOrEqual(3)
    expect(generated, 'a coverage target is a threshold wearing another name').not.toMatch(/^\s*target:/m)
    expect(generated).not.toMatch(/^\s*threshold:/m)
  })

  test('or a threshold on the vitest side, which is the other place one would go', () => {
    /*
     * Read as source rather than imported, which is not the first choice. The
     * value would be better, but `vitest.coverage.ts` imports `vitest/config`
     * and vitest is not a root dependency — only each package's — so pulling
     * that file into this one's `tsc` project fails to resolve it. Declaring
     * vitest at the root to fix a test's import would be the test changing the
     * dependency graph.
     *
     * So: the key, anchored to the start of a line, which is a structure rather
     * than a wording. The file's prose says there is no threshold in several
     * places and none of them matches this.
     */
    const policy = readFileSync(join(repo, 'vitest.coverage.ts'), 'utf8')

    expect(policy, 'read the wrong file; this is not the coverage policy').toContain("provider: 'v8'")
    expect(policy, 'the shared coverage policy grew a threshold').not.toMatch(/^\s*thresholds\s*:/m)
  })
})
