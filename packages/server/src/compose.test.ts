import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The deployment files agree with each other.
 *
 * `.env.example` is the only documentation of the server's environment that a
 * self-hoster is told to copy, and both compose files decide what actually
 * reaches the container. Nothing connected the two, and they had already come
 * apart: `.env.example` documented `FORMANCY_CHALLENGE_SECRET` in fourteen lines
 * of careful prose, and neither compose file passed it through.
 *
 * That failure is worse than an undocumented variable. Somebody puts a public
 * form on the internet, reads that the proof-of-work challenge defends it, sets
 * the secret in `.env` as instructed, and gets a server with the challenge off
 * and nothing anywhere saying so. The switch was documented and inert — which is
 * the same shape as the rate limit whose `timeWindowMs` key did nothing.
 *
 * So the guard is the direction that matters: anything `.env.example` tells a
 * reader to set must be reachable through the path it tells them to use.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const read = (name: string): string => readFileSync(join(repo, name), 'utf8')

const example = read('.env.example')
const composeFiles = ['compose.yaml', 'compose.published.yaml'] as const

/**
 * Every `FORMANCY_*` name `.env.example` mentions, commented out or not — a
 * commented line is how that file spells "optional", not "not documented".
 *
 * **Digits are in the class deliberately.** The first version matched
 * `/FORMANCY_[A-Z_]+/`, which stops at the `3` in `FORMANCY_S3_BUCKET` and
 * reports the name as `FORMANCY_S`. It happened to fail on the commit that added
 * those variables, for the wrong reason: every one of the five collapsed to one
 * meaningless name, so a compose file passing `FORMANCY_S3_ENDPOINT` and
 * forgetting the other four would have satisfied it. The nth regex in this
 * repository to be the thing at fault; the lesson each time is to match the whole
 * property rather than the shape it usually has.
 */
function documented(): readonly string[] {
  return [...new Set(example.match(/FORMANCY_[A-Z0-9_]+/g) ?? [])].sort()
}

describe('.env.example and the compose files', () => {
  test('are the files being read, and have something in them', () => {
    // A guard on the guard: an empty list of names would pass forever, and a
    // renamed compose file would make every assertion below vacuous.
    expect(documented().length).toBeGreaterThan(5)
    for (const file of composeFiles) expect(read(file)).toContain('services:')
  })

  test('pass through every variable the example tells somebody to set', () => {
    for (const file of composeFiles) {
      const compose = read(file)
      const missing = documented().filter((name) => !compose.includes(name))
      expect(missing, `${file} drops variables .env.example documents`).toEqual([])
    }
  })

  test('make the optional challenge secret absent rather than empty when unset', () => {
    // Measured before it was written, because the obvious spelling is wrong.
    // `${FORMANCY_CHALLENGE_SECRET:-}` resolves to the empty string when unset,
    // which is `!== undefined` to the server, which then refuses to start on a
    // secret shorter than 32 characters -- taking down every deployment that
    // never wanted a challenge. A bare key reads `.env` when the value is there
    // and leaves the variable genuinely absent when it is not; `docker compose
    // run` in an alpine container printed ABSENT rather than an empty value.
    for (const file of composeFiles) {
      expect(read(file)).toMatch(/^\s*FORMANCY_CHALLENGE_SECRET:\s*$/m)
    }
  })

  test('keep a secret mandatory in both files or in neither', () => {
    // The easiest mistake in a second copy of a compose file is relaxing what
    // the first one refused to default, and the second copy is the one that goes
    // on the internet.
    const required = (compose: string): readonly string[] =>
      [...new Set(compose.match(/FORMANCY_[A-Z_]+(?=:\s*\$\{FORMANCY_[A-Z_]+:\?)/g) ?? [])].sort()

    const [first, ...rest] = composeFiles.map((file) => required(read(file)))
    expect(first?.length).toBeGreaterThan(2)
    for (const other of rest) expect(other).toEqual(first)
  })
})
