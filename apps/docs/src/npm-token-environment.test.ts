import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The npm token is read only by jobs that name the `npm` environment.
 *
 * A repository secret is handed to any workflow, on any branch a collaborator
 * pushes, that asks for it: a workflow added on a branch could print
 * `NPM_TOKEN` and publish under the project's name. A secret of an environment
 * is handed only to a job that names the environment, and the environment's
 * deployment policy admits only `v*` tags (`.github/REPO-METADATA.md`), so the
 * token reaches a release and nothing else (0176). That policy is a repository
 * setting nothing in the tree can read; what the tree can hold is that every
 * job reading the token names the environment, because a job that does not is
 * given no environment secret at all and fails at its first use of it, or,
 * while the token is still a repository secret too, quietly reads that one.
 *
 * Jobs are read from each workflow as text: a job starts at a line indented two
 * spaces under `jobs:` and runs to the next such line.
 */
const here = dirname(fileURLToPath(import.meta.url))
const workflows = join(here, '..', '..', '..', '.github', 'workflows')

interface Job {
  readonly file: string
  readonly name: string
  readonly body: string
}

function jobs(): Job[] {
  const found: Job[] = []
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    const lines = readFileSync(join(workflows, file), 'utf8').split('\n')
    const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
    if (start === -1) continue
    let current: { name: string; lines: string[] } | undefined
    for (const line of lines.slice(start + 1)) {
      if (/^\S/.test(line)) break
      const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
      if (header !== null) {
        if (current !== undefined) found.push({ file, name: current.name, body: current.lines.join('\n') })
        current = { name: header[1]!, lines: [] }
        continue
      }
      current?.lines.push(line)
    }
    if (current !== undefined) found.push({ file, name: current.name, body: current.lines.join('\n') })
  }
  return found
}

const readsToken = (job: Job): boolean => /secrets\.NPM_TOKEN\b/.test(job.body)
const namesEnvironment = (job: Job): boolean => /^ {4}environment:\s*['"]?npm['"]?\s*$/m.test(job.body)
// A command, not a comment about one: ci.yml's comments say what `npm publish` would ship.
const publishes = (job: Job): boolean => /^(?!\s*#).*\b(?:pnpm|npm) publish\b/m.test(job.body)
const mayAskForAnIdentity = (job: Job): boolean => /^ {6}id-token:\s*write\b/m.test(job.body)

describe('the npm token', () => {
  // release.yml reads it; a reader that found no job reading it would report
  // every workflow clean, including one that read it from the repository.
  test('is read by at least one job, so the rule below cannot pass by reading nothing', () => {
    expect(
      jobs()
        .filter(readsToken)
        .map((job) => `${job.file}: ${job.name}`),
    ).toContain('release.yml: release')
  })

  // A job that reads the token without naming the environment gets it from the
  // repository, where any branch's workflow can read it too, or not at all.
  test('is read only by jobs that name the npm environment', () => {
    const unguarded = jobs()
      .filter(readsToken)
      .filter((job) => !namesEnvironment(job))
      .map((job) => `${job.file}: ${job.name}`)

    expect(unguarded).toEqual([])
  })
})

/**
 * Every published package trusts one publisher: a run of `release.yml` in
 * `sharkysan/formancy.ai`, in the `npm` environment (0230). npm holds that by
 * name, and holds it where nothing in the tree can read it; what the tree can
 * hold is the other half, that the job which publishes is the one npm was told
 * of. Renamed, or out of the environment, or without an identity to show, it is
 * a stranger to npm, and its publish falls back to the token while there is one
 * and fails at the last step of a release once there is not.
 */
describe("npm's trusted publisher", () => {
  test('is the only job that publishes: in release.yml, naming the npm environment, able to ask for an OIDC token', () => {
    const publishing = jobs().filter(publishes)

    expect(publishing.map((job) => job.file)).toEqual(['release.yml'])
    expect(publishing.filter((job) => !namesEnvironment(job) || !mayAskForAnIdentity(job)).map((job) => `${job.file}: ${job.name}`)).toEqual([])
  })
})
