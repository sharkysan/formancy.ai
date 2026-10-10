import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'
import { fileStoreSettings } from './file-store-settings.js'
import { modelSettings } from './model-settings.js'

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
 * reader to set must be reachable through the path it tells them to use — and,
 * since the object store, must leave the server one store. Passing all five
 * `FORMANCY_S3_*` settings through was not enough: both files also named the
 * volume as `FORMANCY_FILES_DIR`, so everybody who followed the S3 block got a
 * server that refused two stores and restart-looped.
 *
 * **The compose files are parsed, not searched.** An earlier version asked whether
 * each name appeared anywhere in the file, and a comment mentioning a variable
 * satisfied it as well as the key passing it through did.
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

interface ServerService {
  /** A key with no value — compose's pass-through — is `null`. */
  readonly environment: Readonly<Record<string, string | null>>
  /** Where each named volume is mounted inside the container. */
  readonly mounts: readonly string[]
}

/**
 * The `server` service as compose reads it.
 *
 * Throws on any shape it was not written for — the list form of `environment`,
 * the long form of a volume — rather than reading it as empty, because an empty
 * environment passes every "is nothing missing" assertion below.
 */
function serverService(file: string): ServerService {
  const document = parse(read(file)) as {
    services?: { server?: { environment?: unknown; volumes?: unknown } }
  }
  const server = document.services?.server
  const environment = server?.environment
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error(`${file}: services.server.environment is not a mapping`)
  }
  const volumes = server?.volumes ?? []
  if (!Array.isArray(volumes) || !volumes.every((volume) => typeof volume === 'string')) {
    throw new Error(`${file}: services.server.volumes is not a list of short-form mounts`)
  }

  return {
    environment: Object.fromEntries(
      Object.entries(environment).map(([key, value]): [string, string | null] => {
        if (value === null) return [key, null]
        if (['string', 'number', 'boolean'].includes(typeof value)) return [key, String(value)]
        throw new Error(`${file}: ${key} has a value compose does not take`)
      }),
    ),
    // `name:/target` or `name:/target:ro`.
    mounts: volumes.map((volume: string) => volume.split(':')[1] ?? ''),
  }
}

/** Raised where compose stops with `required variable … is missing a value`. */
class RequiredMissing extends Error {}

/**
 * Compose's interpolation of one value — as much of it as these files use, and a
 * throw on the rest, so a spelling this does not know fails here instead of
 * resolving to something compose would not.
 *
 * Checked against `docker compose config` (Compose 5.5.1): with `.env` holding
 * `DIR=` or `DIR=""`, `${DIR-/default}` is the empty string and `${DIR:-/default}`
 * is `/default`; with `DIR` absent, both are `/default`.
 *
 * Names take digits. A name class without them is the bug the `documented()`
 * comment describes, and it was here too: the check that a secret stays mandatory
 * in both files read `FORMANCY_[A-Z_]+`, so a mandatory `FORMANCY_S3_*` would
 * never have been compared.
 */
function interpolate(value: string, env: Readonly<Record<string, string>>): string {
  return value.replace(/\$(\$|\{[^}]*\}|)/g, (whole, expression: string) => {
    if (expression === '$') return '$'
    const match = /^\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?)([-?])([^$]*))?\}$/.exec(expression)
    if (match === null) throw new Error(`No vocabulary for ${whole} in ${value}`)
    const [, name = '', colon, operator, argument = ''] = match
    const set = env[name]
    if (operator === undefined) return set ?? ''
    const missing = set === undefined || (colon === ':' && set === '')
    if (!missing) return set
    if (operator === '-') return argument
    throw new RequiredMissing(`${name}: ${argument}`)
  })
}

/**
 * What reaches the container from one compose file, given an `.env`: a bare key
 * only when `.env` sets it, and every other value interpolated. Compose reads the
 * shell's environment as well; this is the `.env`-only case the example describes.
 */
function containerEnvironment(
  file: string,
  env: Readonly<Record<string, string>>,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [key, value] of Object.entries(serverService(file).environment)) {
    if (value === null) {
      const passed = env[key]
      if (passed !== undefined) resolved[key] = passed
    } else {
      resolved[key] = interpolate(value, env)
    }
  }
  return resolved
}

/**
 * The `.env` somebody ends up with by doing what `.env.example` says: copy it,
 * fill in what it leaves empty, and uncomment the block for what they want.
 *
 * `NAME=` is a value the reader supplies, so it is filled in. `NAME=""` is empty
 * on purpose, and stays empty — compose reads both as the empty string, and the
 * quotes are how the example tells the two apart.
 */
function following(block = ''): Record<string, string> {
  const assignment = /^(#\s*)?([A-Z_][A-Z0-9_]*)=(.*)$/
  const env: Record<string, string> = {}
  const lines = [
    ...example.split('\n').filter((line) => !line.startsWith('#')),
    ...block.split('\n').filter((line) => line.startsWith('#')),
  ]
  for (const line of lines) {
    const match = assignment.exec(line.trim())
    if (match?.[2] === undefined || match[3] === undefined) continue
    const raw = match[3]
    if (/^(["'])(.*)\1$/.test(raw)) env[match[2]] = raw.slice(1, -1)
    else if (/\s|#/.test(raw)) throw new Error(`No vocabulary for an unquoted ${line}`)
    else env[match[2]] = raw === '' ? 'filled-in-by-the-reader' : raw
  }
  return env
}

/** The block of `.env.example` — between blank lines — that assigns `name`. */
function blockAssigning(name: string): string {
  const assigns = new RegExp(`^#?\\s*${name}=`, 'm')
  const blocks = example.split(/\n\s*\n/).filter((block) => assigns.test(block))
  if (blocks.length !== 1) throw new Error(`${blocks.length} blocks of .env.example assign ${name}`)
  return blocks[0] ?? ''
}

describe('.env.example and the compose files', () => {
  test('are the files being read, and have something in them', () => {
    // A guard on the guard: an empty list of names would pass forever, and a
    // renamed compose file would make every assertion below vacuous.
    expect(documented().length).toBeGreaterThan(5)
    for (const file of composeFiles) {
      expect(Object.keys(serverService(file).environment).length).toBeGreaterThan(5)
    }
  })

  test('pass through every variable the example tells somebody to set', () => {
    // As keys of the server's environment. `FORMANCY_CHALLENGE_SECRET` is named
    // in a comment in both files, so a substring check went on passing with its
    // key deleted.
    for (const file of composeFiles) {
      const keys = Object.keys(serverService(file).environment)
      const missing = documented().filter((name) => !keys.includes(name))
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
      expect(serverService(file).environment['FORMANCY_CHALLENGE_SECRET'], file).toBeNull()
      expect(containerEnvironment(file, following()), file).not.toHaveProperty(
        'FORMANCY_CHALLENGE_SECRET',
      )
    }
  })

  test('keep a secret mandatory in both files or in neither', () => {
    // The easiest mistake in a second copy of a compose file is relaxing what
    // the first one refused to default, and the second copy is the one that goes
    // on the internet. Mandatory is what compose refuses to start without, so it
    // is found by resolving each value against an empty `.env`.
    const required = (file: string): readonly string[] =>
      Object.entries(serverService(file).environment)
        .filter(([, value]) => {
          try {
            if (value !== null) interpolate(value, {})
            return false
          } catch (error) {
            if (error instanceof RequiredMissing) return true
            throw error
          }
        })
        .map(([key]) => key)
        .sort()

    const [first, ...rest] = composeFiles.map(required)
    expect(first?.length).toBeGreaterThan(2)
    for (const other of rest) expect(other).toEqual(first)
  })
})

describe('following .env.example through compose', () => {
  test('without any optional block keeps uploads on the volume', () => {
    // The default deployment. A FORMANCY_FILES_DIR that stopped reaching the
    // container would switch uploads off for everybody; one pointing anywhere
    // but a mount would keep them in the container's own filesystem, which the
    // next deploy deletes.
    for (const file of composeFiles) {
      const settings = fileStoreSettings(containerEnvironment(file, following()))
      expect(settings.kind, file).toBe('local')
      if (settings.kind === 'local') {
        expect(serverService(file).mounts, file).toContain(settings.directory)
      }
    }
  })

  test('with the object store block leaves the server one store, the object store', () => {
    // Both files used to hard-code FORMANCY_FILES_DIR, so the S3 block of
    // .env.example produced a container told about two stores, and a server
    // that refused them -- `Set FORMANCY_FILES_DIR or FORMANCY_S3_ENDPOINT, not
    // both` -- on every restart, for ever.
    const block = blockAssigning('FORMANCY_S3_ENDPOINT')
    for (const file of composeFiles) {
      const settings = fileStoreSettings(containerEnvironment(file, following(block)))
      expect(settings, file).toMatchObject({
        kind: 's3',
        config: { endpoint: following(block)['FORMANCY_S3_ENDPOINT'] },
      })
    }
  })

  test('without the model block sends no form anywhere', () => {
    // Off unless set (0166). A compose file that defaulted a provider would start every
    // deployment refusing to boot for want of a key, or worse, with one.
    for (const file of composeFiles) {
      expect(modelSettings(containerEnvironment(file, following())), file).toEqual({ kind: 'none' })
    }
  })

  test('with the model block gives the server the model it names', () => {
    // The challenge secret's failure again, for a model: documented, set in `.env` as
    // instructed, and never reaching the container — a server with no model, an admin
    // with no prompt pane, and nothing saying why.
    const block = blockAssigning('FORMANCY_MODEL_PROVIDER')
    for (const file of composeFiles) {
      expect(modelSettings(containerEnvironment(file, following(block))), file).toMatchObject({
        kind: 'configured',
        provider: following(block)['FORMANCY_MODEL_PROVIDER'],
        model: following(block)['FORMANCY_MODEL'],
      })
    }
  })
})
