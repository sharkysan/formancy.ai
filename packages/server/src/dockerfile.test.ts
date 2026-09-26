import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The image has to contain every workspace package the server imports.
 *
 * The Dockerfile copies an explicit list, because copying the whole repository
 * would invalidate the dependency layer on every source change and make the
 * build minutes longer. The cost of that choice is this: **adding a workspace
 * dependency silently breaks the container**, and nothing else notices.
 *
 * It has already happened once. `@formancy/server-core` grew a dependency on
 * `@formancy/challenge`, the Dockerfile was not told, and the image built
 * cleanly, passed every test, and then died on startup with
 * `ERR_MODULE_NOT_FOUND`. The build says nothing because the missing package
 * is only needed at runtime, and the test suite says nothing because it never
 * runs the container.
 *
 * So the list is checked against the dependency graph rather than maintained
 * by memory. This runs in milliseconds and would have caught it the moment the
 * dependency was added.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

interface Manifest {
  name: string
  dependencies?: Record<string, string>
}

const read = (directory: string): Manifest =>
  JSON.parse(readFileSync(join(repo, 'packages', directory, 'package.json'), 'utf8')) as Manifest

/** Every workspace package `@formancy/server` needs at runtime, transitively. */
function workspaceClosure(from: string): Set<string> {
  const found = new Set<string>()
  const pending = [from]

  while (pending.length > 0) {
    const directory = pending.pop()!
    if (found.has(directory)) continue
    found.add(directory)

    for (const [name, range] of Object.entries(read(directory).dependencies ?? {})) {
      // `workspace:` is what makes it ours. A published dependency comes from
      // the registry and needs no COPY.
      if (!name.startsWith('@formancy/') || !range.startsWith('workspace:')) continue
      pending.push(name.slice('@formancy/'.length))
    }
  }

  return found
}

describe('the container build', () => {
  const dockerfile = readFileSync(join(repo, 'packages', 'server', 'Dockerfile'), 'utf8')

  test('copies every workspace package the server depends on', () => {
    const needed = [...workspaceClosure('server')].sort()

    const missing = needed.filter(
      (directory) => !dockerfile.includes(`COPY packages/${directory}/ `),
    )

    // The failure this prevents is not a build error. The image builds, the
    // suite is green, and the container exits on startup with a module it
    // cannot find.
    expect(missing).toEqual([])
  })

  test('copies each one twice: the manifest early, the source late', () => {
    // The manifests are copied before `pnpm install` so a source change does
    // not invalidate the dependency layer, which is most of the build time.
    // A package copied only once has lost one of those, and the symptom is
    // either a failed install or a build that is minutes slower for everyone.
    const needed = [...workspaceClosure('server')]

    const manifestless = needed.filter(
      (directory) => !dockerfile.includes(`COPY packages/${directory}/package.json`),
    )

    expect(manifestless).toEqual([])
  })

  test('the closure is actually being computed, not empty', () => {
    // A guard on the guard: a typo that made `workspaceClosure` return nothing
    // would make both tests above pass forever.
    const needed = workspaceClosure('server')

    expect(needed.has('server-core')).toBe(true)
    expect(needed.has('spec')).toBe(true)
    expect(needed.size).toBeGreaterThan(3)
  })
})
