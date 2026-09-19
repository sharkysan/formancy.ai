import type { Fixture } from './types.js'
import { FixtureError, parseFixture } from './validate.js'

/**
 * A directory of fixture files, supplied by the caller.
 *
 * The loader does not import `node:fs` on purpose. The same suite has to load
 * in Node, in a browser under Vitest's browser mode, and inside a bundler that
 * has no filesystem at all, so the one platform-specific part — reading bytes —
 * is the caller's to provide. In Node that is two lines:
 *
 * ```ts
 * const directory = new URL('./fixtures/', import.meta.url)
 * const fixtures = await loadFixtures({
 *   list: () => readdir(directory),
 *   read: (file) => readFile(new URL(file, directory), 'utf8'),
 * })
 * ```
 *
 * In a browser, `import.meta.glob` or a fetch of a manifest does the same job.
 */
export interface FixtureSource {
  /** File names in the directory. Anything that is not `.json` is ignored. */
  list(): readonly string[] | Promise<readonly string[]>
  read(file: string): string | Promise<string>
}

/**
 * Read, parse and validate a directory of fixtures.
 *
 * Every failure names the file. A suite loaded from disk is usually loaded by
 * someone who did not write it, and "unexpected token at position 214" without
 * a file name costs them an afternoon.
 */
export async function loadFixtures(source: FixtureSource): Promise<readonly Fixture[]> {
  const files = [...(await source.list())].filter((file) => file.endsWith('.json')).sort()

  const fixtures: Fixture[] = []
  const seen = new Map<string, string>()

  for (const file of files) {
    const text = await source.read(file)

    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (error) {
      throw new Error(`${file}: not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }

    let fixture: Fixture
    try {
      fixture = parseFixture(value)
    } catch (error) {
      if (error instanceof FixtureError) throw new FixtureError(error.problems, file)
      throw error
    }

    // The name is the test id a renderer author reads in CI output and the key
    // a `skip` entry names, so two cases may not share one.
    const previous = seen.get(fixture.name)
    if (previous !== undefined) {
      throw new Error(`${file}: fixture name "${fixture.name}" is already used by ${previous}`)
    }
    seen.set(fixture.name, file)

    fixtures.push(fixture)
  }

  return fixtures
}
