import { readFileSync } from 'node:fs'
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
  const built = readFileSync(join(repo, 'packages', packageName, 'dist', 'index.mjs'))
  return brotliCompressSync(built).length / 1024
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
    for (const [packageName, shown] of [
      ['core', /`@formancy\/core` bundle \| 18 kB brotli \| ([\d.]+) kB/],
      ['react', /`@formancy\/react` bundle \| 4 kB brotli \| \*\*([\d.]+) kB\*\*/],
      // Tracked because it nearly doubled without anybody noticing: one module imported
      // the whole 40.6 kB JSON Schema to read one integer, and the bundler inlined it.
      ['spec', /`@formancy\/spec` bundle \| — \| ([\d.]+) kB/],
    ] as const) {
      const quoted = shown.exec(quality)?.[1]
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
