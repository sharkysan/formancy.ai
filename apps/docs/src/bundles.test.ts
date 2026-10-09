import { existsSync, readFileSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The bundle figures in the architecture document are the ones you get here.
 *
 * `§9.3` carried "gate configured" in its Actual column for both bundles, and nothing in
 * the repository runs `size-limit` — [0038](../../../docs/decisions/0038-esm-only.md) said
 * so plainly in its own *Verified by* line while three other documents, including the
 * regulatory evidence table, said the opposite.
 *
 * So the figures are measured by hand and dated. This guard exists because a hand-measured
 * number in prose is the thing this repository keeps finding stale: it recomputes the
 * sizes and fails when the document's numbers no longer round to them.
 *
 * **It is deliberately NOT a budget gate.** Choosing a threshold today would mean choosing
 * one that passes, which is a guard written green — the one shape this repository refuses.
 * What is checked is that the document tells the truth about what the bundles weigh, not
 * that they weigh little enough. The absence of a real gate is listed as debt in §11.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const brotliKilobytes = (packageName: string): number => {
  const file = join(repo, 'packages', packageName, 'dist', 'index.mjs')
  /*
   * Said out loud, because the alternative failure is a riddle.
   *
   * This measures BUILT output, so a missing or half-written `dist` makes the
   * figure wrong and the test then reports it as the document having drifted —
   * which sends somebody to edit §9.3 when what they needed was `pnpm build`.
   * Seen twice: once in CI before the build step existed, and once under
   * `turbo run test:coverage --force`, where a package this app does not depend
   * on was still writing its dist while this read it.
   */
  if (!existsSync(file)) {
    throw new Error(
      `${packageName} has no dist/index.mjs. This measures built output — run \`pnpm build\` first; the figures in §9.3 are not the problem.`,
    )
  }
  const built = readFileSync(file)
  if (built.length < 1024) {
    throw new Error(
      `${packageName}'s dist/index.mjs is ${String(built.length)} bytes, which is not a built bundle. Something is mid-write — run \`pnpm build\` to completion before this.`,
    )
  }
  /*
   * The barrel and every chunk it imports, each compressed on its own as it is served.
   *
   * This read index.mjs alone, and the spec's barrel imports a chunk the bundler shares
   * with `/validate`: "14.0 kB for the whole barrel" left 5.2 kB of the barrel out, and
   * the guard agreed with it, because both measured the same one file. Found 2026-10-09
   * when the validator's sentences moved into that chunk and the figure did not move.
   */
  const dist = dirname(file)
  const loaded = new Set<string>()
  const visit = (name: string): void => {
    if (loaded.has(name)) return
    loaded.add(name)
    const code = readFileSync(join(dist, name), 'utf8')
    // Static, side-effect and dynamic imports alike: each is a file an importer loads.
    for (const match of code.matchAll(/\b(?:from|import)\s*\(?\s*["']\.\/([^"']+\.mjs)["']/g)) {
      visit(match[1]!)
    }
  }
  visit('index.mjs')
  return [...loaded].reduce(
    (total, name) => total + brotliCompressSync(readFileSync(join(dist, name))).length / 1024,
    0,
  )
}

const quality = readFileSync(
  join(repo, 'docs', 'architecture', '09-quality-requirements.md'),
  'utf8',
)

describe('the bundle figures in §9.3', () => {
  test('are the figures a fresh measurement gives', () => {
    // One decimal place, because that is the precision the document quotes. A figure that
    // has drifted by more than that is a figure somebody has to re-measure, which is the
    // whole point of dating it.
    /*
     * The row, then the first number in its last cell — not a pattern per row.
     *
     * There was one regular expression per package, each carrying that row's
     * exact wording including whether the figure was in bold. Then a figure
     * went over budget, gained a `**`, and the guard reported "no figure for
     * @formancy/core in §9.3" — a true sentence about its own pattern and a
     * false one about the document. The eighth time a guard here has known one
     * spelling of a thing that has several.
     */
    for (const packageName of ['core', 'react', 'spec'] as const) {
      const row = new RegExp(String.raw`^\|\s*\`@formancy/${packageName}\` bundle\s*\|.*$`, 'm')
        .exec(quality)?.[0]
      const quoted = row === undefined ? undefined : /([\d.]+)\s*kB/.exec(row.split('|').at(-2) ?? '')?.[1]
      expect(quoted, `no figure for @formancy/${packageName} in §9.3`).toBeDefined()

      const measured = brotliKilobytes(packageName)
      expect(
        Math.abs(Number(quoted) - measured),
        `§9.3 says @formancy/${packageName} is ${String(quoted)} kB; it measures ${measured.toFixed(1)} kB`,
      ).toBeLessThan(0.15)
    }
  })

  test('are dated, because they are re-measured rather than incremented', () => {
    // The repository's rule for a number that cannot be derived at build time. Without the
    // date a reader cannot tell a figure one release old from one that was never right.
    expect(quality).toMatch(/measured 2\d{3}-\d{2}-\d{2}/)
  })

  test('do not claim a gate that does not exist', () => {
    // The TABLE CELL, not the phrase anywhere. The first version of this forbade the
    // words outright and failed on the paragraph that explains they were wrong -- a guard
    // that will not let the document describe its own correction, which is the same
    // prose-matching mistake made once before in this repository.
    expect(quality).not.toMatch(/\|\s*gate configured\s*\|/)
  })
})
