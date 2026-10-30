import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger, loadConfigFromFile } from 'vite'
import type { Logger } from 'vite'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

/**
 * Every Vite and Vitest config in the workspace loads without Vite warning about it.
 *
 * **The defect this exists for.** Vite 8 bundles a config before it runs it, and on the way
 * warns about everything in it that Node's own loader would refuse: `configLoader: 'native'`,
 * which Vite says will become the default in a future major. On 2026-10-18, 23 of the 25
 * configs in the repository printed that warning on every `vite`, `vite build` and `vitest`
 * start. Some imported relative files without an extension. Others read the shared root files
 * (`vitest.coverage.ts`, `css-target.ts`, `monaco-from-this-site.ts`) as CommonJS, because the
 * root manifest did not say `"type": "module"`, and neither did the two Angular packages'
 * manifests. A warning on every start gets read past, so it hides the next warning that
 * matters; and when the default flips, every config fails at once.
 *
 * **Asked of Vite, not re-derived.** Each config is loaded the way `vite` and `vitest` load it,
 * through Vite's own `loadConfigFromFile`, and anything it says while doing so fails the case.
 * That catches every incompatibility Vite checks for — an import without an extension, one
 * that resolves to a directory, ESM read as CommonJS, `__dirname`, a JSON import without its
 * attribute — and any it learns to check later. A copy of those rules here would know the
 * spellings it was written with and pass the rest. It also catches any other warning a config
 * prints on loading, for the same reason the console line was a defect.
 *
 * The two install fixtures under `scripts/` are not here: they are loaded only inside the
 * project the install tests write, which says `"type": "module"`, and their imports are all
 * packages.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/**
 * The directories pnpm runs a package's scripts in — the root, and each workspace package —
 * read from `pnpm-workspace.yaml` rather than listed, so a new package is checked without
 * anybody adding it. Only the `dir/*` shape is understood, and anything else throws, rather
 * than quietly checking fewer packages than the workspace has.
 */
function packageDirectories(): string[] {
  const workspace = readFileSync(join(repo, 'pnpm-workspace.yaml'), 'utf8')
  const block = /^packages:\n((?:[ \t]+-[^\n]*\n)+)/m.exec(workspace)?.[1]
  if (block === undefined) throw new Error('pnpm-workspace.yaml has no packages list this test can read')
  const globs = [...block.matchAll(/-\s*["']?([^"'\n]+?)["']?\s*$/gm)].map((match) => match[1] ?? '')
  return [
    repo,
    ...globs.flatMap((glob) => {
      if (!/^[\w-]+\/\*$/.test(glob)) throw new Error(`a workspace glob this test cannot expand: ${glob}`)
      const parent = join(repo, glob.slice(0, -2))
      return readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(parent, entry.name, 'package.json')))
        .map((entry) => join(parent, entry.name))
    }),
  ]
}

/** Every config Vite or Vitest finds by default in a package's directory, whatever its extension. */
const configs = packageDirectories()
  .flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => /^vite(st)?\.config\.[cm]?[jt]s$/.test(name))
      .map((name) => join(dir, name)),
  )
  .map((file) => relative(repo, file).split(sep).join('/'))
  .sort()

/** What Vite said while loading `config`, its colours taken out. */
async function saidWhileLoading(config: string): Promise<string[]> {
  const said: string[] = []
  const record = (message: string): void => {
    said.push(message.replace(/\u001b\[[0-9;]*m/g, ''))
  }
  const quiet = createLogger('warn')
  const logger: Logger = { ...quiet, warn: record, warnOnce: record, error: record }
  const file = join(repo, config)
  await loadConfigFromFile({ command: 'serve', mode: 'development' }, file, dirname(file), 'warn', logger, 'bundle')
  return said
}

// Vite skips the check when this is set, which would pass every case without asking.
const IGNORE = 'VITE_CONFIG_NATIVE_IGNORE_WARNING'
let ignoring: string | undefined
beforeAll(() => {
  ignoring = process.env[IGNORE]
  delete process.env[IGNORE]
})
afterAll(() => {
  if (ignoring !== undefined) process.env[IGNORE] = ignoring
})

describe('every Vite and Vitest config', () => {
  test('is found, the admin’s two among them', () => {
    // An assertion that nothing warned is met by a search that found nothing. The admin's
    // pair is where the warning was reported.
    expect(configs).toContain('apps/admin/vite.config.ts')
    expect(configs).toContain('apps/admin/vitest.config.ts')
    expect(configs.length).toBeGreaterThan(5)
  })

  // Each loads in well under a second here; the bound is for a load that hangs, on a busy
  // runner, not a budget.
  test.each(configs)(
    '%s loads with nothing for Vite to say',
    async (config) => {
      expect(await saidWhileLoading(config)).toEqual([])
    },
    30_000,
  )
})
