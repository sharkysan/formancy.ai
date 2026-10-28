import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import type { ServerDeps } from './deps.js'
import { publishForm } from './publishing.js'
import { createMemoryStorage } from './testing/memory-storage.js'
import { formVersion } from './use-cases.js'

/**
 * One published version's document, by its number (0207): what an admin reads an older version's
 * submissions against, since they answered that version's questions and not the current one's.
 */
const contact = (title: string): FormSchema => ({
  specVersion: '5',
  id: 'contact',
  title,
  model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
})

let deps: ServerDeps
beforeEach(async () => {
  let counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 0, today: () => '2026-10-28', random: () => 0.5 },
    nowIso: () => '2026-10-28T09:00:00.000Z',
  }
  await publishForm(deps, { path: 'contact', schema: contact('Contact, first') })
  await publishForm(deps, { path: 'contact', schema: contact('Contact, second') })
  await publishForm(deps, { path: 'other', schema: { ...contact('Another form'), id: 'other' } })
})

describe('a version’s document', () => {
  test('is the document that version was published with, by its number', async () => {
    expect(await formVersion(deps, 'contact', '1')).toMatchObject({ ok: true, version: 1, schema: { title: 'Contact, first' } })
    expect(await formVersion(deps, 'contact', '2')).toMatchObject({ ok: true, version: 2, schema: { title: 'Contact, second' } })
  })

  test('is unknown for a number the form has not published, and the form for a path it has not', async () => {
    expect(await formVersion(deps, 'contact', '3')).toEqual({ ok: false, kind: 'unknown_version' })
    expect(await formVersion(deps, 'nowhere', '1')).toEqual({ ok: false, kind: 'unknown_form' })
  })

  // One spelling per version: "01" and "1.0" reaching version 1 would be one document under many
  // names, and a cache or an audit keyed by the address would count them apart.
  test('is unknown under any spelling but the number’s own', async () => {
    for (const spelling of ['01', '1.0', '1e0', '0', '-1', ' 1', '1 ', '+1', '0x1', '']) {
      expect(await formVersion(deps, 'contact', spelling), JSON.stringify(spelling)).toEqual({ ok: false, kind: 'unknown_version' })
    }
  })

  // Reading one form must never read another's: a version is looked up among this form's own,
  // and another form's version — by its id or by its number — is as unknown as one never made.
  test('is unknown for another form’s version, by its id as by its number', async () => {
    const otherVersions = await deps.storage.listVersionsByForm((await deps.storage.getFormByPath('other'))!.id)
    expect(await formVersion(deps, 'contact', otherVersions[0]!.id)).toEqual({ ok: false, kind: 'unknown_version' })
    expect(await formVersion(deps, 'other', '2')).toEqual({ ok: false, kind: 'unknown_version' })
  })
})
