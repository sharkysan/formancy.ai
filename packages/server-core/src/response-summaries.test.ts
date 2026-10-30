import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { summariseResponses } from './response-summaries.js'
import { publishForm } from './publishing.js'
import type { ServerDeps } from './deps.js'
import { createMemoryStorage } from './testing/memory-storage.js'

/**
 * A form's responses summarised by question on the server, one summary per version (0223).
 *
 * The admin counted them in the browser, from every submission it had read, which it can stop
 * reading once the listing pages (0222). The server counts with the function the admin called,
 * `summariseAnswers`, against each version's own document (0207), so the counting rules are
 * written once.
 */
const first: FormSchema = {
  specVersion: '1',
  id: 'poll',
  title: 'Poll',
  model: {
    fields: [
      {
        key: 'colour',
        type: 'radio',
        label: 'Colour',
        options: [
          { value: 'red', label: 'Red' },
          { value: 'blue', label: 'Blue' },
        ],
      },
    ],
  },
}
const second: FormSchema = {
  specVersion: '1',
  id: 'poll',
  title: 'Poll, again',
  i18n: { defaultLocale: 'de', messages: { de: { agree: 'Einverstanden' } } },
  model: { fields: [{ key: 'agree', type: 'checkbox', label: { $t: 'agree' } }] },
} as unknown as FormSchema

let deps: ServerDeps
let counter = 0

beforeEach(() => {
  counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 },
    nowIso: () => '2026-09-19T12:00:00.000Z',
  }
})

/** Publish `schema` and store `answers` as its responses. */
async function answered(schema: FormSchema, answers: readonly unknown[]): Promise<void> {
  const published = await publishForm(deps, { path: 'poll', schema })
  if (!published.ok) throw new Error(`publish failed: ${JSON.stringify(published)}`)
  const formId = (await deps.storage.getFormByPath('poll'))!.id
  for (const data of answers) {
    await deps.storage.insertSubmission({
      id: deps.newId(),
      formId,
      formVersionId: published.versionId,
      data,
      submittedAt: deps.nowIso(),
    })
  }
}

describe('a form’s responses, summarised on the server', () => {
  test('are one summary per version that has responses, newest first, each against its own questions', async () => {
    await answered(first, [{ colour: 'red' }, { colour: 'red' }, { colour: 'blue' }])
    await answered(second, [{ agree: true }])

    const summaries = await summariseResponses(deps, 'poll')

    expect(summaries?.map(({ version, responses }) => ({ version, responses }))).toEqual([
      { version: 2, responses: 1 },
      { version: 1, responses: 3 },
    ])
    expect(summaries?.[1]?.questions).toEqual([
      {
        kind: 'choices',
        field: 'colour',
        label: 'Colour',
        answered: 3,
        counts: [
          { value: 'red', label: 'Red', count: 2 },
          { value: 'blue', label: 'Blue', count: 1 },
        ],
      },
    ])
  })

  // The words around an answer, a tick box's yes and no, are the document's language's, as the
  // admin said them when it counted.
  test('say a tick box in the language of the version’s document', async () => {
    await answered(second, [{ agree: true }, { agree: false }])

    const [summary] = (await summariseResponses(deps, 'poll')) ?? []

    expect(summary?.questions[0]).toMatchObject({ kind: 'choices', label: 'Einverstanden' })
    expect(summary?.questions[0]?.kind === 'choices' ? summary.questions[0].counts.map((c) => c.label) : []).toEqual(['Ja', 'Nein'])
  })

  test('leave out a version nobody answered', async () => {
    await answered(first, [{ colour: 'red' }])
    await answered(second, [])

    expect((await summariseResponses(deps, 'poll'))?.map((summary) => summary.version)).toEqual([1])
  })

  test('are none for a form there is none of', async () => {
    expect(await summariseResponses(deps, 'ghost')).toBeUndefined()
  })
})
