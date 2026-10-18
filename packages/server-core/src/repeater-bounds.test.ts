import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createSubmission } from './submitting.js'
import { publishForm } from './publishing.js'
import { listSubmissions } from './use-cases.js'
import type { ServerDeps } from './deps.js'
import { createMemoryStorage } from './testing/memory-storage.js'

/**
 * A repeater's rows, posted straight at the server (0184).
 *
 * The server replays the browser's engine, so what the engine did not check the server did
 * not either: more rows than `maxItems`, none where the repeater is required, and a
 * `validate` rule aimed at the repeater were all stored. These are the posts a modified
 * client or a script sends, which no renderer's missing button stops.
 */
const schema = {
  specVersion: '4',
  id: 'fees',
  title: 'Fees',
  model: {
    fields: [
      {
        key: 'fees',
        type: 'repeater',
        label: 'Fees',
        required: true,
        maxItems: 3,
        fields: [{ key: 'amount', type: 'number', label: 'Amount' }],
      },
    ],
  },
  logic: {
    rules: [
      {
        target: 'fees',
        kind: 'validate',
        cel: "fees.all(f, !has(f.amount) || f.amount == null || f.amount <= 500.0)",
        code: 'feeOverLimit',
      },
    ],
  },
} as unknown as FormSchema

let deps: ServerDeps
beforeEach(() => {
  let counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 1_726_000_000_000, today: () => '2026-10-18', random: () => 0.5 },
    nowIso: () => '2026-10-18T09:00:00.000Z',
  }
})

async function post(data: unknown) {
  const published = await publishForm(deps, { path: 'fees', schema })
  if (!published.ok) throw new Error('publish failed')
  return createSubmission(deps, { path: 'fees', declaredSchemaHash: published.schemaHash, actor: 'authenticated', data })
}

const fees = (...amounts: number[]) => ({ fees: amounts.map((amount) => ({ amount })) })

describe('a submission posted straight at the server', () => {
  test('with more rows than the repeater allows is refused, and nothing is stored', async () => {
    // Four fees on `maxItems: 3` were stored, and a webhook sent them on.
    expect(await post(fees(1, 2, 3, 4))).toEqual({ ok: false, kind: 'invalid', errors: { fees: ['maxItems'] } })
    expect(await listSubmissions(deps, 'fees')).toEqual([])
  })

  test('with no rows where the repeater is required is refused', async () => {
    // Measured on 2026-10-18 by exactly this post: accepted, the key absent or the list empty.
    expect(await post({})).toEqual({ ok: false, kind: 'invalid', errors: { fees: ['required'] } })
    expect(await post({ fees: [] })).toEqual({ ok: false, kind: 'invalid', errors: { fees: ['required'] } })
  })

  test('that a validate rule on the repeater forbids is refused with the rule’s code', async () => {
    // The rule was accepted at publish and evaluated nowhere: a fee over the limit was
    // stored under a form whose author had written the limit down.
    expect(await post(fees(100, 900))).toEqual({ ok: false, kind: 'invalid', errors: { fees: ['feeOverLimit'] } })
  })

  test('within every bound is stored', async () => {
    // The premise: refusing everything would pass the three cases above.
    expect(await post(fees(100, 200, 300))).toMatchObject({ ok: true })
  })
})
