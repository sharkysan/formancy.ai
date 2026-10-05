import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * A budget on the size of a source file, with a ratchet.
 *
 * Size is a signal rather than a verdict — `validate.ts` is one subject and reads
 * top to bottom — so this is not a rule against long files. It is a rule against
 * a file quietly becoming *the place things go*, which is what every one of the
 * entries below did.
 *
 * The ratchet is the part that matters. An entry is a CEILING and its number is
 * the file's size on the day it was measured, so the file cannot grow; and when
 * it shrinks past that number this fails as well, which forces the entry down
 * rather than leaving stale headroom nobody needs. **The list is meant to
 * empty.** A new file over the budget is not added to it.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/** Lines, for a file that is one subject read top to bottom. */
const BUDGET = 600

/**
 * What was already over it, measured 2026-09-29, each capped where it stood.
 *
 * Read the notes: they say what the seam is, because a number with no plan is a
 * permission slip. Two of these are generated and one is data, and those are
 * marked as such — splitting a generated file is splitting its generator.
 */
const CEILINGS: Record<string, { lines: number; why: string }> = {
  'packages/builder-core/src/session.ts': {
    lines: 1558,
    why: 'One factory holding every command. The seam is one concern per file — model, arrangement, translation, version — over a shared attempt/commit core. The repath family left for `repath.ts` when this budget refused the rule rewriting, which is the seam working as intended.',
  },
  'packages/core/src/engine.ts': {
    lines: 1460,
    why: 'The engine is one subject and its parts are genuinely coupled through the graph. The seam, if there is one, is the check and skip machinery — whose protocol types left for `checks.ts` to pay for the `formId` option, since this budget allows no growth at all. The machinery itself still needs the graph and the store, which is why it has not followed.',
  },
  'packages/angular/src/form.ts': {
    lines: 1019,
    why: 'The form shell plus layout rendering. The seam is the layout renderer.',
  },
  'packages/conformance/src/builtin-fixtures.ts': {
    lines: 1012,
    why: 'GENERATED from fixtures/*.json. Splitting this means splitting the fixtures, which are the unit of meaning.',
  },
  'apps/site/src/app.tsx': {
    lines: 976,
    why: 'The landing page, one long document. The seam is one section per file.',
  },
  'packages/server/src/app.ts': {
    lines: 928,
    why: 'The seam is one route family per Fastify plugin, which is the framework’s own unit. Publishing moved to routes/publish.ts when the budget refused the next thing added here; the rest follow the same way.',
  },
  'packages/spec/src/validate.ts': {
    lines: 870,
    why: 'One subject, read top to bottom: what makes a document invalid. Kept deliberately whole.',
  },
  'packages/server-core/src/use-cases.ts': {
    lines: 663,
    why: 'The seam is one use-case family per file. Publishing moved to publishing.ts when the budget refused the next thing added here; submitting, drafts and files follow the same way.',
  },
  'packages/conformance/src/validate.ts': {
    lines: 763,
    why: 'Refusing a fixture that could not run honestly. One subject.',
  },
  'apps/playground/src/app.tsx': {
    lines: 576,
    why: 'Three panes and their wiring. The seam is one pane per file, and six things have left: the Angular renderer pane, the capabilities this deployment supplies, the builder pane, the engine inspector, the pane list with its fold control, and all of the pane state — the last of those when draggable boundaries pushed this past its ceiling and the budget turned out to be pointing at something real, since none of which pane is folded, how wide each is, or the template that follows is the page’s business.',
  },
  'packages/spec/src/types.ts': {
    lines: 695,
    why: 'The format’s vocabulary, and every part of it is read beside the rest. Kept whole on purpose.',
  },
  'packages/conformance/src/runner.ts': {
    lines: 688,
    why: 'Executing a fixture against a driver. One subject.',
  },
  'packages/builder-react/src/layout-pane.tsx': {
    lines: 678,
    why: 'Tree, dialogs and three drag surfaces. The seam is the drag surface.',
  },
}

const ROOTS = ['packages', 'apps']
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'out-tsc', '.astro', 'generated'])

/** Every source file a person maintains: no tests, no build output, no generated code. */
function sources(): Array<{ path: string; lines: number }> {
  const found: Array<{ path: string; lines: number }> = []

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (SKIP.has(entry)) continue
      const full = join(directory, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue
      if (/\.d\.ts$/.test(entry)) continue
      found.push({
        path: relative(repo, full).replaceAll('\\', '/'),
        lines: readFileSync(full, 'utf8').split('\n').length,
      })
    }
  }

  for (const root of ROOTS) walk(join(repo, root))
  return found
}

describe('how big a source file may be', () => {
  test('is reading the repository at all', () => {
    // A guard on the guard: an empty listing would make both assertions below
    // vacuously true, and both of them are about absence.
    const found = sources()
    expect(found.length).toBeGreaterThan(100)
    expect(found.some(({ path }) => path === 'packages/core/src/engine.ts')).toBe(true)
  })

  test('is under the budget, unless it is one of the files being worked down', () => {
    const over = sources()
      .filter(({ path, lines }) => lines > BUDGET && CEILINGS[path] === undefined)
      .map(({ path, lines }) => `${path} (${String(lines)})`)

    expect(over, 'over budget and not on the list — split it rather than adding it').toEqual([])
  })

  test('and a file on that list may not grow', () => {
    const grown = sources()
      .filter(({ path, lines }) => {
        const ceiling = CEILINGS[path]
        return ceiling !== undefined && lines > ceiling.lines
      })
      .map(({ path, lines }) => `${path} (${String(lines)} > ${String(CEILINGS[path]?.lines)})`)

    expect(grown).toEqual([])
  })

  test('and a file that has shrunk takes its ceiling down with it', () => {
    // The ratchet. Without this an entry keeps granting room the file no longer
    // needs, and the list stops being a plan and becomes a list of exemptions.
    const slack = sources()
      .filter(({ path, lines }) => {
        const ceiling = CEILINGS[path]
        return ceiling !== undefined && lines < ceiling.lines
      })
      .map(({ path, lines }) => `${path} is ${String(lines)}; lower its ceiling from ${String(CEILINGS[path]?.lines)}`)

    expect(slack).toEqual([])
  })

  test('and the list only names files that exist, with a reason each', () => {
    // An entry for a file that moved would grant a budget to nothing and hide
    // the file's real size under its new name.
    const present = new Set(sources().map(({ path }) => path))
    for (const [path, ceiling] of Object.entries(CEILINGS)) {
      expect(present.has(path), `${path} is on the list and not in the repository`).toBe(true)
      // A number with no plan is a permission slip.
      expect(ceiling.why.length, `${path} has no note saying where the seam is`).toBeGreaterThan(40)
    }
  })
})
