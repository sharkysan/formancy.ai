import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { checkMembership } from './options-membership.js'
import { publishForm } from './publishing.js'
import { createSubmission } from './submitting.js'
import { filesToClaim } from './uploads.js'
import { exportCsv, resumeDraft, saveDraft, startDraft } from './use-cases.js'
import type { ServerDeps } from './deps.js'
import { createMemoryStorage } from './testing/memory-storage.js'

/**
 * What the server reads by a name a document gives, read as the value's own.
 *
 * The engine read an answer through inheritance, so a field keyed `constructor` held
 * `function Object` (0185). The server had three more readers of its own that walked a
 * value the same way — the export, the draft's migration and the deployment's lists — and
 * each said something about a field nobody had answered, or a list nobody had configured.
 */

let deps: ServerDeps
beforeEach(() => {
  let counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `id-${String(++counter)}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 1_760_000_000_000, today: () => '2026-10-18', random: () => 0.5 },
    nowIso: () => '2026-10-18T12:00:00Z',
  }
})

function form(fields: readonly unknown[]): FormSchema {
  return { specVersion: '4', id: 'works', title: 'Works', model: { fields } } as FormSchema
}

describe('the export', () => {
  test('leaves the cell of an unanswered field keyed constructor empty', async () => {
    // It printed `function Object() { [native code] }` into every row that left the field
    // empty, in a file opened by whoever is worth attacking — as an answer nobody gave.
    const published = await publishForm(deps, {
      path: 'works',
      schema: form([
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'constructor', type: 'text', label: 'Contractor' },
        { key: 'site', type: 'group', label: 'Site', fields: [{ key: 'toString', type: 'text', label: 'Label' }] },
      ]),
    })
    if (!published.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'works',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { name: 'Ann' },
    })

    const [header, row] = (await exportCsv(deps, 'works'))!.trim().split('\n')

    expect(header).toBe('id,submittedAt,version,name,constructor,site.toString')
    expect(row!.split(',').slice(3)).toEqual(['Ann', '', ''])
  })
})

describe('a draft resumed after a republish', () => {
  async function resumedAfter(before: readonly unknown[], after: readonly unknown[], data: unknown) {
    const first = await publishForm(deps, { path: 'works', schema: form(before) })
    if (!first.ok) throw new Error('publish failed')
    const started = await startDraft(deps, { path: 'works' })
    if (started === undefined) throw new Error('start failed')
    await saveDraft(deps, { ...started, path: 'works', data })
    const second = await publishForm(deps, { path: 'works', schema: form(after) })
    if (!second.ok) throw new Error('republish failed')
    const resumed = await resumeDraft(deps, { ...started, path: 'works' })
    if (resumed?.outcome !== 'resumed') throw new Error(`resumed as ${String(resumed?.outcome)}`)
    return resumed
  }

  test('carries an answer across a rename to constructor', async () => {
    // A rename was applied only where `!(key in data)`, and every object answers
    // `constructor`, so the answer stayed under the old key and the field it was renamed
    // to opened empty — the loss a declared rename exists to prevent (B1).
    const resumed = await resumedAfter(
      [{ key: 'contractor', type: 'text', label: 'Contractor' }],
      [{ key: 'constructor', type: 'text', label: 'Contractor', renamedFrom: 'contractor' }],
      { contractor: 'ACME' },
    )

    expect(resumed.data).toEqual({ constructor: 'ACME' })
  })

  test('and inside a group, whose object answers constructor as every object does', async () => {
    // The rename is applied group by group, on the group's own object: the walk into it
    // and the rename in it read what the draft holds, or the inner rename is skipped too.
    const resumed = await resumedAfter(
      [{ key: 'site', type: 'group', label: 'Site', fields: [{ key: 'contractor', type: 'text', label: 'Contractor' }] }],
      [
        {
          key: 'site',
          type: 'group',
          label: 'Site',
          fields: [{ key: 'constructor', type: 'text', label: 'Contractor', renamedFrom: 'contractor' }],
        },
      ],
      { site: { contractor: 'ACME' } },
    )

    expect(resumed.data).toEqual({ site: { constructor: 'ACME' } })
  })

  test('and sets nothing aside for a removed field keyed toString that held nothing', async () => {
    // The removed field's answer was read through inheritance too, so the draft came back
    // with `Function.prototype.toString` set aside under `__orphaned`, as an answer.
    const resumed = await resumedAfter(
      [
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'toString', type: 'text', label: 'Label' },
      ],
      [{ key: 'name', type: 'text', label: 'Name' }],
      { name: 'Ann' },
    )

    expect(resumed.data).toEqual({ name: 'Ann' })
  })
})

describe('a list the deployment supplies', () => {
  const sourced = form([{ key: 'country', type: 'select', label: 'Country', optionsSource: 'constructor' }])
  const countries = { countries: { members: (values: readonly string[]) => Promise.resolve(values) } }

  test('is not found under constructor when the deployment has none by that name', async () => {
    // The publish gate asked `optionsSources[name] === undefined`, and `function Object`
    // is not undefined: a form naming a list nobody configured was published.
    const outcome = await publishForm({ ...deps, optionsSources: countries }, { path: 'works', schema: sourced })

    expect(outcome).toEqual({ ok: false, kind: 'unknown_options_source', sources: ['constructor'] })
  })

  test('and an answer said to come from it is refused as unavailable, not stored unchecked', async () => {
    // At submission the same lookup found `function Object`, which has no `members`, so the
    // answer was taken as from a source that cannot check — and stored (hazard A7).
    expect(await checkMembership(sourced, { country: 'XX' }, countries)).toEqual({
      ok: false,
      kind: 'source_unavailable',
      source: 'constructor',
    })
  })
})

/**
 * Something else in the process put `name` on every object — an old polyfill, a library that
 * extends the built-ins. Not enumerable, as such members usually are not, so only a read
 * through inheritance sees it; taken off again whatever the case does.
 */
async function withInherited(name: string, value: unknown, run: () => Promise<void>): Promise<void> {
  Object.defineProperty(Object.prototype, name, { value, configurable: true, writable: true, enumerable: false })
  try {
    await run()
  } finally {
    delete (Object.prototype as Record<string, unknown>)[name]
  }
}

describe('a walk from the schema over what was submitted', () => {
  test('asks a list about no answer the submission does not hold', async () => {
    // The walk read `record[field.key]`, so a member on every object was an answer to the
    // sourced field: an empty submission was refused for a value nobody gave.
    const sourced = form([{ key: 'country', type: 'select', label: 'Country', optionsSource: 'countries' }])
    // `members` answers the values the list does not hold; this list holds none.
    const empty = { countries: { members: (values: readonly string[]) => Promise.resolve(values) } }

    await withInherited('country', 'XX', async () => {
      expect(await checkMembership(sourced, {}, empty)).toEqual({ ok: true })
    })
  })

  test('and claims no file the submission does not name', async () => {
    // The same read for a file field: an empty submission named a file it never attached,
    // and was refused for claiming one that does not exist.
    const attached = form([{ key: 'attachments', type: 'file', label: 'Attachments' }])

    await withInherited('attachments', [{ id: 'planted' }], async () => {
      expect(await filesToClaim(deps.storage, { schema: attached, formId: 'works', data: {} })).toEqual({
        ok: true,
        ids: [],
      })
    })
  })
})
