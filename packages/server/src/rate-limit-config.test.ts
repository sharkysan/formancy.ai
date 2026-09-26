import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Every per-route rate limit names the option the plugin actually reads.
 *
 * `@fastify/rate-limit` takes `timeWindow` on a route's `config.rateLimit`. One
 * route passed `timeWindowMs` instead — the name used for the option this app
 * exposes — which the plugin does not read, so that route silently fell back to
 * the GLOBAL window.
 *
 * It had no visible effect only because the global registration happens to use
 * the same numbers. A deployment that set a different window for one route would
 * have found it quietly ignored, and nothing anywhere would have said so. A
 * configuration key that does nothing is worse than a missing one, because it
 * reads as configured.
 */
const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, 'app.ts'), 'utf8')

describe('per-route rate limits', () => {
  test('are actually present in the source being checked', () => {
    // A guard on the guard: a rename that broke the search would make the
    // assertion below pass forever.
    expect(app.split('config: { rateLimit:').length - 1).toBeGreaterThan(2)
  })

  test('use timeWindow, which is the option the plugin reads', () => {
    // `timeWindowMs:` with the colon -- the KEY. Matching the bare word would
    // flag `timeWindow: submissionLimit.timeWindowMs`, where it is the property
    // being read and entirely correct. The first version of this test did
    // exactly that and reported the fixed code as broken.
    const wrong = [...app.matchAll(/config: \{ rateLimit: \{[^}]*\}/g)]
      .map((match) => match[0])
      .filter((block) => /timeWindowMs\s*:/.test(block))

    expect(wrong).toEqual([])
  })
})
