import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Third-party actions run pinned to a commit, with the tag in a comment.
 *
 * `release.yml` states the rule and the reason: a tag is a mutable pointer, and
 * whoever controls an action's repository can move it to different code, which then
 * runs with the workflow's secrets. Nothing held the rule, so `ci.yml` handed
 * `CODECOV_TOKEN` to `codecov/codecov-action@v7` — found by CodeQL
 * (actions/unpinned-tag), not by anything here. This reads every workflow, so a step
 * added anywhere is held to it.
 *
 * GitHub's own actions (`actions/*`, `github/*`) are exempt, as CodeQL exempts them:
 * they are published by the platform the workflow already trusts with everything.
 */
const here = dirname(fileURLToPath(import.meta.url))
const workflows = join(here, '..', '..', '..', '.github', 'workflows')

interface Step {
  readonly file: string
  readonly action: string
  readonly ref: string
  readonly comment: string
}

/** Every `uses:` in every workflow, however it is spelled: with or without `- `, quoted or not. */
function steps(): Step[] {
  const found: Step[] = []
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    for (const line of readFileSync(join(workflows, file), 'utf8').split('\n')) {
      const match = /^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)['"]?\s*(#.*)?$/.exec(line)
      if (match === null) continue
      const [action = '', ref = ''] = match[1]!.split('@')
      found.push({ file, action, ref, comment: match[2] ?? '' })
    }
  }
  return found
}

const firstParty = (action: string): boolean =>
  action.startsWith('./') || action.startsWith('docker://') || /^(actions|github)\//.test(action)

describe('the actions the workflows run', () => {
  test('are found at all, so the rule below cannot pass by reading nothing', () => {
    // release.yml pins five third-party actions; a reader that missed them all would
    // report every workflow clean.
    expect(steps().filter((step) => !firstParty(step.action)).length).toBeGreaterThanOrEqual(5)
  })

  test('from a third party are pinned to a commit hash, with the tag they were in a comment', () => {
    const unpinned = steps()
      .filter((step) => !firstParty(step.action))
      .filter((step) => !/^[0-9a-f]{40}$/.test(step.ref) || !/#\s*v\d/.test(step.comment))
      .map((step) => `${step.file}: ${step.action}@${step.ref}`)

    expect(unpinned).toEqual([])
  })
})
