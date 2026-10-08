import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * A published package writes nothing to its host's console.
 *
 * **The defect this exists for.** `@formancy/builder-angular` logged two lines
 * on every ↓ keypress in the structure tree — `PROBE before …` and `PROBE
 * after …`, a debugging probe left in the handler — from the release that
 * introduced it onwards. An application embedding the builder had its console
 * filled by somebody else's diagnostics, and nothing in the repository could
 * notice: the tests assert on the DOM, and the browser gate collects page
 * errors, not log lines.
 *
 * A library's console is its host's. Anything it prints, the host's developers
 * read as their own application talking, and a host that forwards the console
 * to telemetry ships it somewhere. So the rule is absolute rather than a level:
 * no reference to `console` at all in a package somebody imports.
 *
 * `@formancy/mcp` is held to it too, for a sharper reason: over stdio its
 * standard output IS the protocol, and one stray line corrupts the stream.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/**
 * Packages that own their process, with the reason.
 *
 * The server is an application, not a library: its standard error is its own,
 * and a background worker that fails says so there rather than stopping
 * silently. What it may and may not write is a different question with its own
 * answer — `SAFETY-ANALYSIS.md`, hazard C3.
 */
const OWNS_ITS_PROCESS: ReadonlyArray<{ name: string; why: string }> = [
  {
    name: '@formancy/server',
    why: 'A process with a composition root. Its standard error is its own, and its workers report failures there.',
  },
]

/**
 * Every package `pnpm publish` would push that ships script, with its directory.
 *
 * Script read off the manifest rather than listed: `@formancy/themes` exports five
 * stylesheets and nothing a host could run, so it has no console to write to — and a
 * package that later starts exporting a module is scanned without anybody adding it.
 */
function publishedPackages(): Array<{ dir: string; name: string }> {
  const root = join(repo, 'packages')
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      let manifest: { name?: string; private?: boolean; exports?: unknown; main?: unknown }
      try {
        manifest = JSON.parse(
          readFileSync(join(root, entry.name, 'package.json'), 'utf8'),
        ) as typeof manifest
      } catch {
        return []
      }
      if (manifest.private === true || manifest.name === undefined) return []
      if (!/\.(m?js|cjs)\b/.test(JSON.stringify([manifest.exports, manifest.main]))) return []
      return [{ dir: join(root, entry.name), name: manifest.name }]
    })
}

/** Shipped source under `src`: not a test, and not a fixture that only a test reads. */
function shippedSource(dir: string): string[] {
  const out: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name))
        out.push(path)
    }
  }
  walk(join(dir, 'src'))
  return out
}

/**
 * Source with its comments taken out and its strings kept.
 *
 * Strings are matched first so a `//` inside `'https://…'` is not read as a
 * comment and the rest of the line thrown away with it. A comment saying "no
 * console call can put a script into the document" is prose about the console,
 * not a use of it, and must not count.
 */
function withoutComments(source: string): string {
  return source.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (whole, literal: string | undefined) => literal ?? whole.replace(/[^\n]/g, ' '),
  )
}

describe('a published package', () => {
  const owners = new Set(OWNS_ITS_PROCESS.map((entry) => entry.name))
  const libraries = publishedPackages().filter((pkg) => !owners.has(pkg.name))

  test('writes nothing to the console of the application that imports it', () => {
    // Any reference, not only `console.log(`: `console.debug`, `console['log']`
    // and `const log = console.log` all print, and a pattern that knew one
    // spelling would pass the other three.
    const found = libraries.flatMap((pkg) =>
      shippedSource(pkg.dir).flatMap((file) =>
        withoutComments(readFileSync(file, 'utf8'))
          .split('\n')
          .flatMap((line, at) =>
            /\bconsole\b/.test(line) ? [`${relative(repo, file).split(sep).join("/")}:${String(at + 1)}`] : [],
          ),
      ),
    )

    expect(found).toEqual([])
  })

  test('and the scan reaches every one of them', () => {
    // An assertion of absence is satisfied by a scan that read nothing. Each
    // library has to contribute source, or the check above proves nothing
    // about it.
    const unread = libraries.filter((pkg) => shippedSource(pkg.dir).length === 0).map((pkg) => pkg.name)

    expect(libraries.length).toBeGreaterThan(5)
    expect(unread).toEqual([])
  })

  test('and the process that may write names itself, and exists', () => {
    const names = new Set(publishedPackages().map((pkg) => pkg.name))

    for (const owner of OWNS_ITS_PROCESS) {
      expect(names.has(owner.name), owner.name).toBe(true)
      expect(owner.why.length).toBeGreaterThan(20)
    }
  })
})
