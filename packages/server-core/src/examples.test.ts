import { beforeEach, describe, expect, test } from 'vitest'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import type { Actor } from './auth.js'
import type { ServerDeps } from './deps.js'
import { keepExamples, readExamples } from './examples.js'
import { publishForm } from './publishing.js'
import { createMemoryStorage } from './testing/memory-storage.js'
import { listVersions, resolveForm } from './use-cases.js'

/**
 * A form's examples, kept by the deployment beside the form, and run at publish (0166).
 *
 * An example with its answer written down is the one check that tells a condition that
 * compiles from the condition that was asked for (0110). The builders run them, the review of
 * a model's edit runs them (0159), a model can draft them (0162) — and a deployment kept none,
 * so on a deployment none of that had anything to run, and publishing, the last moment before
 * a version is frozen, ran nothing.
 */
const EDITOR: Actor = { kind: 'user', id: 'editor-1', role: 'editor' }
const VIEWER: Actor = { kind: 'user', id: 'viewer-1', role: 'viewer' }

/** A form whose canton rule reads `cel`, so a test can turn it round. */
const contact = (cel: string): FormSchema =>
  ({
    specVersion: '4',
    id: 'contact',
    title: 'Contact',
    model: {
      fields: [
        { key: 'email', type: 'text', label: 'Email', required: true },
        { key: 'country', type: 'text', label: 'Country' },
        { key: 'canton', type: 'text', label: 'Canton' },
      ],
    },
    logic: { rules: [{ target: 'canton', kind: 'visible', cel }] },
  }) as unknown as FormSchema

const ASKS_FOR_A_CANTON: Scenario = {
  name: 'Switzerland asks for a canton',
  changes: { country: 'CH' },
  valid: true,
  visible: { canton: true },
}
const GERMANY_DOES_NOT: Scenario = {
  name: 'Germany does not',
  changes: { country: 'DE' },
  valid: true,
  visible: { canton: false },
}
/** Fictional, and what every example starts from: the form's one required answer. */
const SAMPLE = { email: 'jane@example.ch' }

let deps: ServerDeps
beforeEach(async () => {
  let counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `id-${String(++counter)}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 },
    nowIso: () => '2026-10-10T12:00:00Z',
  }
  await publishForm(deps, { path: 'contact', schema: contact('country == "CH"') })
})

describe('keeping a form’s examples', () => {
  test('keeps them with their sample, beside the form, and reads them back as kept', async () => {
    // The failure this exists for: examples that lived in one browser tab, gone with it,
    // and never seen by the publish that freezes a version.
    const kept = await keepExamples(deps, {
      path: 'contact',
      actor: EDITOR,
      examples: { scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT], sample: SAMPLE },
    })
    expect(kept).toEqual({ ok: true, examples: { scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT], sample: SAMPLE } })

    expect(await readExamples(deps, { path: 'contact', actor: EDITOR })).toEqual(kept)
  })

  test('are none, not an error, for a form nobody wrote any for', async () => {
    // Every form starts here, and a pane told "error" for it would draw nothing to add to.
    expect(await readExamples(deps, { path: 'contact', actor: EDITOR })).toEqual({
      ok: true,
      examples: { scenarios: [] },
    })
  })

  test('change no version, because they are not in one', async () => {
    // A published version is immutable (0025) and examples change while the form does not:
    // test data inside a version would mint a version per example and freeze it with them.
    const before = await resolveForm(deps, 'contact')
    await keepExamples(deps, { path: 'contact', actor: EDITOR, examples: { scenarios: [ASKS_FOR_A_CANTON] } })

    expect(await resolveForm(deps, 'contact')).toEqual(before)
    expect(await listVersions(deps, 'contact')).toHaveLength(1)
  })

  test('are refused for a form the deployment does not have', async () => {
    // Beside the form means beside a form: a list kept for a path nothing was published at
    // would be found by whatever is published there next.
    const outcome = await keepExamples(deps, {
      path: 'nowhere',
      actor: EDITOR,
      examples: { scenarios: [ASKS_FOR_A_CANTON] },
    })
    expect(outcome).toEqual({ ok: false, kind: 'unknown_form' })
    expect(await readExamples(deps, { path: 'nowhere', actor: EDITOR })).toEqual({ ok: false, kind: 'unknown_form' })
  })

  test('are read and changed only with the permission editing the form takes', async () => {
    // A viewer may read the form and its submissions, and may not change what the form is
    // checked against: removing the example that would have named a broken rule is an edit.
    const first = await keepExamples(deps, { path: 'contact', actor: EDITOR, examples: { scenarios: [ASKS_FOR_A_CANTON] } })
    expect(first.ok).toBe(true)

    expect(await keepExamples(deps, { path: 'contact', actor: VIEWER, examples: { scenarios: [] } })).toEqual({
      ok: false,
      kind: 'forbidden',
    })
    expect(await readExamples(deps, { path: 'contact', actor: VIEWER })).toEqual({ ok: false, kind: 'forbidden' })
    expect(await readExamples(deps, { path: 'contact', actor: EDITOR })).toEqual(first)
  })

  test('are refused by the storage itself for a form that is not there, in memory as in PostgreSQL', async () => {
    // The memory storage stands in for the table, whose foreign key refuses a list for no
    // form (`server.integration.test.ts`). A double that accepted it would let a use-case
    // that forgot to look the form up pass every test here.
    await expect(
      deps.storage.keepExamples({ formId: 'no-such-form', scenarios: [], sample: null, updatedAt: '2026-10-10T12:00:00Z' }),
    ).rejects.toThrow()
    expect(await deps.storage.getExamples('no-such-form')).toBeUndefined()
  })

  test('refuses a list with an item that is not an example, says which and why, and keeps nothing of it', async () => {
    // Kept, it would be run at every publish as written: `changes` that are not a map throw,
    // and an `errors` of the wrong shape is compared as though it were right.
    const first = await keepExamples(deps, { path: 'contact', actor: EDITOR, examples: { scenarios: [ASKS_FOR_A_CANTON] } })

    const outcome = await keepExamples(deps, {
      path: 'contact',
      actor: EDITOR,
      examples: {
        scenarios: [GERMANY_DOES_NOT, { name: 'Broken', changes: null, valid: true }, { ...GERMANY_DOES_NOT, name: 'x', errors: { canton: 'required' } }],
      },
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok || outcome.kind !== 'invalid_examples') throw new Error(`expected invalid_examples, got ${JSON.stringify(outcome)}`)
    expect(outcome.problems).toHaveLength(2)
    expect(outcome.problems[0]).toMatch(/^Example 2 \("Broken"\)/)
    expect(outcome.problems[0]).toContain('changes')
    expect(outcome.problems[1]).toMatch(/^Example 3 \("x"\)/)
    expect(outcome.problems[1]).toContain('"errors"')
    expect(await readExamples(deps, { path: 'contact', actor: EDITOR })).toEqual(first)
  })

  test('says each reason an item is not an example in words of its own', async () => {
    // Whoever sent the list fixes it from these sentences. Two reasons worded alike would
    // send somebody to fix the wrong part of an example.
    const outcome = await keepExamples(deps, {
      path: 'contact',
      actor: EDITOR,
      examples: {
        scenarios: [
          'not an object',
          { ...GERMANY_DOES_NOT, name: 'a', expected: {} },
          { changes: {}, valid: true },
          { name: 'b', valid: true },
          { name: 'c', changes: {}, valid: 'yes' },
          { ...GERMANY_DOES_NOT, name: 'd', visible: { canton: 'no' } },
        ],
      },
    })

    if (outcome.ok || outcome.kind !== 'invalid_examples') throw new Error(JSON.stringify(outcome))
    const reasons = outcome.problems.map((problem) => problem.replace(/^Example \d+( \("[a-z]"\))? /, ''))
    expect(reasons).toHaveLength(6)
    expect(new Set(reasons).size).toBe(6)
    expect(reasons[1]).toContain('"expected"')
    expect(reasons[5]).toContain('"visible"')
  })

  test('refuses two examples with one name', async () => {
    // A name is how an example's result is found; with two, a regression in one would be
    // reported as the other, or not at all.
    const outcome = await keepExamples(deps, {
      path: 'contact',
      actor: EDITOR,
      examples: { scenarios: [ASKS_FOR_A_CANTON, { ...GERMANY_DOES_NOT, name: ` ${ASKS_FOR_A_CANTON.name}` }] },
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'invalid_examples' })
    expect(JSON.stringify(outcome)).toContain('Example 2')
  })

  test('refuses a body with no list, and a sample that is not answers by field', async () => {
    // The runner starts every example from the sample; a list or a string there is no
    // answers at all, and the examples would all fail for a reason that is not the form.
    for (const examples of [{}, { scenarios: 'none' }, null, { scenarios: [], sample: ['jane'] }]) {
      expect(await keepExamples(deps, { path: 'contact', actor: EDITOR, examples })).toMatchObject({
        ok: false,
        kind: 'invalid_examples',
      })
    }
  })

  test('leave out, and name, what is kept and is not an example when they are read', async () => {
    // A row edited around the use-case, handed on as it is: the admin runs it as it draws the
    // build tab, the runner throws on `changes` it cannot read, and the admin is gone — the form
    // cannot be edited there at all, not even to remove the row. Read as a list sent to be kept
    // is read, one decision for both, so what is handed on is examples.
    const form = await deps.storage.getFormByPath('contact')
    await deps.storage.keepExamples({
      formId: form!.id,
      scenarios: [
        ASKS_FOR_A_CANTON,
        { name: 'Hand-edited', changes: null, valid: true },
        GERMANY_DOES_NOT,
        { ...GERMANY_DOES_NOT, name: ASKS_FOR_A_CANTON.name },
      ] as unknown as Scenario[],
      sample: ['jane'] as unknown as Record<string, unknown>,
      updatedAt: '2026-10-10T12:00:00Z',
    })

    expect(await readExamples(deps, { path: 'contact', actor: EDITOR })).toEqual({
      ok: true,
      examples: {
        scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT],
        unreadable: [
          'The sample is the answers every example starts from, by field, and this is not that.',
          'Example 2 ("Hand-edited") has no "changes": the answers it sets, by field.',
          'Example 4 ("Switzerland asks for a canton") has the name of example 1; a name is how an example\'s result is found.',
        ],
      },
    })
  })

  test('read none from a kept list that is not a list, and say so', async () => {
    // The same row edited further. Read item by item it would throw before any item was read,
    // and the admin would not open the form.
    const form = await deps.storage.getFormByPath('contact')
    await deps.storage.keepExamples({
      formId: form!.id,
      scenarios: { name: 'Hand-edited' } as unknown as Scenario[],
      sample: SAMPLE,
      updatedAt: '2026-10-10T12:00:00Z',
    })

    const outcome = await readExamples(deps, { path: 'contact', actor: EDITOR })
    expect(outcome).toMatchObject({ ok: true, examples: { scenarios: [], sample: SAMPLE } })
    expect(outcome.ok && outcome.examples.unreadable).toHaveLength(1)
  })

  test('is recorded in the audit log, with counts and never the examples', async () => {
    // Who changed what a form is checked against, and when: the question after a publish
    // that should have warned and did not. The sample is fictional, and still not a log's.
    await keepExamples(deps, {
      path: 'contact',
      actor: EDITOR,
      examples: { scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT], sample: SAMPLE },
    })

    const entry = (await deps.storage.listAudit(10)).find((row) => row.action === 'form.examples.changed')
    expect(entry).toMatchObject({
      subject: 'contact',
      actorKind: 'user',
      actorId: 'editor-1',
      detail: { examples: 2, sample: true },
    })
    expect(JSON.stringify(entry)).not.toContain('jane')
    expect(JSON.stringify(entry)).not.toContain('Switzerland')
  })
})

describe('publishing a form whose examples are kept', () => {
  const keep = async (scenarios: readonly unknown[], sample: unknown = SAMPLE): Promise<void> => {
    const kept = await keepExamples(deps, { path: 'contact', actor: EDITOR, examples: { scenarios, sample } })
    if (!kept.ok) throw new Error(JSON.stringify(kept))
  }

  test('warns, naming each example the new version stops holding, and still publishes it', async () => {
    // The rule turned round: both spellings compile, every other check passes, and the
    // example is the one thing that can say which was meant. A refusal is not available —
    // a rule changed on purpose stops its old example holding, and the person decides.
    await keep([ASKS_FOR_A_CANTON, GERMANY_DOES_NOT])

    const outcome = await publishForm(deps, { path: 'contact', schema: contact('country != "CH"') })

    expect(outcome).toMatchObject({ ok: true, version: 2 })
    if (!outcome.ok) return
    expect(outcome.warnings).toHaveLength(2)
    expect(outcome.warnings[0]).toContain('"Switzerland asks for a canton"')
    expect(outcome.warnings[1]).toContain('"Germany does not"')
    expect((await resolveForm(deps, 'contact'))?.version).toBe(2)
  })

  test('says which versions, and what was expected and what happened', async () => {
    // "An example stopped holding" sends somebody to find out which rule; the runner's own
    // words say it.
    await keep([ASKS_FOR_A_CANTON])

    const outcome = await publishForm(deps, { path: 'contact', schema: contact('country != "CH"') })

    if (!outcome.ok) throw new Error('publish failed')
    expect(outcome.warnings).toEqual([
      'The example "Switzerland asks for a canton" held against version 1 and does not hold against version 2: "canton": expected to be visible, and it is hidden.',
    ])
  })

  test('says nothing of an example that did not hold before either, nor of one that holds again', async () => {
    // Not this publish's doing, and good news respectively. A warning channel that repeats
    // what was already true on every publish is one people stop reading (0111).
    await keep([
      ASKS_FOR_A_CANTON,
      { name: 'Already wrong', changes: { country: 'FR' }, valid: true, visible: { canton: true } },
      { name: 'Austria asks too', changes: { country: 'AT' }, valid: true, visible: { canton: true } },
    ])

    const outcome = await publishForm(deps, { path: 'contact', schema: contact('country == "CH" || country == "AT"') })

    expect(outcome).toMatchObject({ ok: true, version: 2, warnings: [] })
  })

  test('runs them from the sample kept beside them', async () => {
    // The form has a required email. Started from nothing, every example fails on it before
    // and after, so none would ever stop holding and the publish would never say anything.
    await keep([ASKS_FOR_A_CANTON])

    const outcome = await publishForm(deps, { path: 'contact', schema: contact('country != "CH"') })

    expect(outcome.ok && outcome.warnings).toHaveLength(1)
  })

  test('runs them as the server replays a submission, not as a browser would', async () => {
    // A rule moved to the browser no longer refuses anything the server is sent. In client
    // mode the example failed against both versions, and the publish said nothing.
    const refuses = (runsOn: 'server' | 'client'): FormSchema =>
      ({
        ...contact('country == "CH"'),
        logic: {
          rules: [
            { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
            { target: 'email', kind: 'validate', cel: 'email.endsWith(".ch")', code: 'swiss_only', runsOn },
          ],
        },
      }) as unknown as FormSchema
    await publishForm(deps, { path: 'contact', schema: refuses('server') })
    await keep([{ name: 'A German address is refused', changes: { email: 'jane@example.de' }, valid: false, errors: { email: ['swiss_only'] } }])

    const outcome = await publishForm(deps, { path: 'contact', schema: refuses('client') })

    expect(outcome.ok && outcome.warnings).toHaveLength(1)
    expect(outcome.ok && outcome.warnings[0]).toContain('"A German address is refused"')
  })

  test('says nothing about examples when the document is the one already published', async () => {
    // The idempotent republish is a deploy run again, and the version it answers with is the
    // one the examples were last run against: nothing about them changed.
    await keep([ASKS_FOR_A_CANTON])
    expect(await publishForm(deps, { path: 'contact', schema: contact('country == "CH"') })).toMatchObject({
      ok: true,
      version: 1,
      warnings: [],
    })
  })

  test('runs the kept examples that are examples, and names what it left out', async () => {
    // A row edited around the use-case, with `changes` the runner cannot read. Run as it is, it
    // throws, and every publish of the form is a 500 — a refusal by accident, for a check that
    // is never one. Read first, as the admin reads it, it is named and left out, and the
    // examples beside it still say what this publish changes.
    const form = await deps.storage.getFormByPath('contact')
    await deps.storage.keepExamples({
      formId: form!.id,
      scenarios: [{ name: 'Hand-edited', changes: null, valid: true } as unknown as Scenario, ASKS_FOR_A_CANTON],
      sample: SAMPLE,
      updatedAt: '2026-10-10T12:00:00Z',
    })

    const outcome = await publishForm(deps, { path: 'contact', schema: contact('country != "CH"') })

    expect(outcome).toMatchObject({ ok: true, version: 2 })
    if (!outcome.ok) return
    expect(outcome.warnings).toEqual([
      'The example "Switzerland asks for a canton" held against version 1 and does not hold against version 2: "canton": expected to be visible, and it is hidden.',
      'Not everything kept with this form\'s examples could be read, and what could not was not run: Example 1 ("Hand-edited") has no "changes": the answers it sets, by field.',
    ])
  })
})
