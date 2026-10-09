import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The versions formancy says it supports are the versions it runs (0134).
 *
 * A peer range is a promise to every consumer below it, and `^22.0.0` said "Angular 22.0"
 * while nothing had ever run on anything but 22.1. So the tested versions are one
 * file, `compatibility.json`, which CI reads as its job matrices; this holds that file to
 * the ranges the packages declare, the workflow to that file, and the page to both.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const read = (path: string): string => readFileSync(join(repo, path), 'utf8')
const json = <T>(path: string): T => JSON.parse(read(path)) as T

interface Manifest {
  name?: string
  private?: boolean
  engines?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const tested = json<Record<'react' | 'angular' | 'node', string[]>>('compatibility.json')

/** Every manifest of a publishable package, by directory. */
const published = (): Manifest[] =>
  readdirSync(join(repo, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return [json<Manifest>(`packages/${entry.name}/package.json`)]
      } catch {
        return []
      }
    })
    .filter((manifest) => manifest.private !== true && manifest.name !== undefined)

/** The lowest version a `^`, `~` or `>=` range admits. */
const lowestOf = (range: string): string | undefined =>
  /^(?:\^|~|>=)\s*(\d+\.\d+\.\d+)$/.exec(range.trim())?.[1]

/** The range every publishable package declares for a peer — refused if they disagree. */
function declaredPeer(name: string): string {
  const ranges = new Set(
    published().flatMap((manifest) => {
      const range = manifest.peerDependencies?.[name]
      return range === undefined ? [] : [range]
    }),
  )
  expect([...ranges], `the packages disagree about ${name}`).toHaveLength(1)
  return [...ranges][0]!
}

/** Read inside each test, so a disagreement fails a named case rather than the file's load. */
const declared = () => ({
  react: declaredPeer('react'),
  angular: declaredPeer('@angular/core'),
  node: json<Manifest>('package.json').engines?.node ?? '',
})

describe('the versions formancy says it supports', () => {
  test('start at the lowest each declared range admits, so the bound has a run', () => {
    // A range widened to ^19.0.0 without a run at 19.0.0 is a promise nothing checked.
    const ranges = declared()
    for (const name of ['react', 'angular', 'node'] as const) {
      expect(tested[name][0], name).toBe(lowestOf(ranges[name]))
    }
  })

  test('and Angular Material is promised at the range Angular is', () => {
    // Angular refuses siblings at different versions, so Material's range is Angular's.
    expect(declaredPeer('@angular/material')).toBe(declared().angular)
    expect(declaredPeer('@angular/cdk')).toBe(declared().angular)
  })

  test('are what the workflow runs, each list as a job matrix', () => {
    const workflow = read('.github/workflows/ci.yml')

    expect(workflow).toContain("require('./compatibility.json')")
    for (const name of ['react', 'angular', 'node'] as const) {
      expect(workflow, name).toContain(`fromJSON(needs.matrix.outputs.${name})`)
    }
  })

  test('and are what the compatibility page says, with the range it says', () => {
    const page = read('apps/docs/src/content/docs/start/compatibility.md')
    const rows = new Map(
      page
        .split('\n')
        .map((line) => line.split('|').map((cell) => cell.trim()))
        .filter((cells) => cells.length === 6)
        .map(([, label, range, lowest]) => [label, { range, lowest }]),
    )
    const labels = { react: 'React', angular: 'Angular', node: 'Node.js' } as const
    const ranges = declared()

    for (const name of ['react', 'angular', 'node'] as const) {
      const row = rows.get(labels[name])
      expect(row, `no ${labels[name]} row`).toBeDefined()
      expect(row?.lowest, name).toBe(tested[name][0])
      expect(row?.range, name).toContain(ranges[name])
    }
  })
})
