import { describe, expect, test, vi } from 'vitest'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import type { AskModel } from './answers.js'
import { createDraftRun, draftsOn } from './draft-run.js'
import { createRelay } from './relay.js'
import { draftVerdict } from './scenario-drafts.js'
import { createBuilderSession } from './session.js'

/**
 * A drafting part's run, held where the host chooses
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 *
 * The drafts waiting were the part's, tagged with the session they were drafted over, and
 * the part stopped its run when it went. On formancy.ai the part is under *Fields*, and the
 * page opens a new session over the same text every time *Build* is shown: a visitor who
 * asked for examples and looked at the JSON while their chat answered came back to nothing.
 * What is pinned here is the holder, and what "the same form" means across sessions: the
 * form's id, which the spec calls its stable identifier. A new session over the same form
 * shows the drafts, judged against it; another form shows none of them, and cannot keep them.
 */
const FORM: FormSchema = {
  specVersion: '4',
  id: 'travel',
  title: 'Travel',
  model: {
    fields: [
      {
        key: 'country',
        type: 'select',
        label: 'Country',
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      { key: 'canton', type: 'text', label: 'Canton' },
    ],
  },
  logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'country == "CH"' }] },
}

/** Another form, with a field of the same name: what a draft for `FORM` must never be kept into. */
const OTHER: FormSchema = {
  specVersion: '4',
  id: 'leave',
  title: 'Leave',
  model: { fields: [{ key: 'country', type: 'text', label: 'Country' }] },
}

const HOLDS: Scenario = { name: 'Germany is not asked for a canton', changes: { country: 'DE' }, valid: true, visible: { canton: false } }
const ALSO: Scenario = { name: 'Switzerland is asked for a canton', changes: { country: 'CH' }, valid: true, visible: { canton: true } }
const drafting = (...items: Scenario[]): string => JSON.stringify({ scenarios: items })

/** A model that waits to be told what to say, and records whether it was told to stop. */
const held = () => {
  const releases: Array<(answer: string) => void> = []
  const cancelled = vi.fn()
  const model = vi.fn<AskModel>(
    (_prompt, turn) =>
      new Promise<string>((resolve) => {
        releases.push(resolve)
        turn.onCancel(cancelled)
      }),
  )
  return {
    model,
    cancelled,
    release: (text: string, turn = releases.length - 1) => releases[turn]?.(text),
  }
}

const ticks = async (count = 20): Promise<void> => {
  for (let tick = 0; tick < count; tick += 1) await Promise.resolve()
}

const attach = (run: ReturnType<typeof createDraftRun>) => {
  const heard = vi.fn(() => run.state())
  const detach = run.subscribe(heard)
  return { heard, detach }
}

describe('drafts held by the host', () => {
  test('outlive the part that asked, and reach the next part that attaches', async () => {
    // The defect: the part went while the chat answered, its run with it, and the answer
    // pasted afterwards had nowhere to go. Held here, a part going stops nothing.
    const session = createBuilderSession(FORM)
    const slow = held()
    const run = createDraftRun()
    const first = attach(run)

    run.describe('Only Switzerland asks for a canton.')
    void run.draft(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    expect(run.state()).toMatchObject({ form: 'travel', busy: true })
    first.detach()

    slow.release(drafting(HOLDS, ALSO))
    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    expect(slow.cancelled).not.toHaveBeenCalled()

    attach(run)
    expect(draftsOn(run.state(), session).drafts.map((draft) => draft.name)).toEqual([HOLDS.name, ALSO.name])
    // The words are the run's too: the part drawn next shows what was asked.
    expect(run.state().intent).toBe('Only Switzerland asks for a canton.')
  })

  test('through a relay, keep their turn waiting while no part is attached', async () => {
    const session = createBuilderSession(FORM)
    const relay = createRelay()
    const run = createDraftRun()
    const part = attach(run)
    run.describe('Only Switzerland asks for a canton.')

    void run.draft(relay.ask, session)
    await vi.waitFor(() => expect(relay.waiting()).toBeDefined())
    part.detach()

    expect(relay.answer(drafting(HOLDS))).toBe('accepted')
    await vi.waitFor(() => expect(run.state().drafts).toHaveLength(1))
  })

  test('are stopped by Stop from any part showing them, and a late answer is never drafted', async () => {
    const session = createBuilderSession(FORM)
    const slow = held()
    const run = createDraftRun()
    const react = attach(run)
    const angular = attach(run)
    run.describe('anything')

    void run.draft(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    run.stop()

    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    expect(run.state().result).toMatchObject({ ok: false, ended: 'stopped' })
    expect(react.heard.mock.results.at(-1)?.value).toBe(run.state())
    expect(angular.heard.mock.results.at(-1)?.value).toBe(run.state())

    slow.release(drafting(HOLDS))
    await ticks()
    expect(run.state().drafts).toEqual([])
  })

  test('an answer to a stopped run, arriving while the next one waits, is not taken for its drafts', async () => {
    // D10's variant, for drafts: a late answer listed as the next run's drafts would be
    // offered for keeping as an answer to words it never saw.
    const session = createBuilderSession(FORM)
    const slow = held()
    const run = createDraftRun()
    run.describe('anything')

    void run.draft(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    run.stop()
    await vi.waitFor(() => expect(run.state().busy).toBe(false))

    void run.draft(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(2))
    slow.release(drafting(HOLDS), 0)
    await ticks()
    expect(run.state()).toMatchObject({ busy: true, drafts: [] })

    slow.release(drafting(ALSO), 1)
    await vi.waitFor(() => expect(run.state().drafts.map((draft) => draft.name)).toEqual([ALSO.name]))
  })

  test('ask nothing while a run for the same form waits, or with no words', async () => {
    // Two turns for one request would be two pastes, and the relay refuses the second.
    const session = createBuilderSession(FORM)
    const slow = held()
    const run = createDraftRun()

    await run.draft(slow.model, session)
    expect(slow.model).not.toHaveBeenCalled()

    run.describe('anything')
    void run.draft(slow.model, session)
    void run.draft(slow.model, createBuilderSession(FORM))
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    await ticks()
    expect(slow.model).toHaveBeenCalledTimes(1)
  })
})

describe('what the part asks with', () => {
  test('the examples the form has, where they start, and how many times to ask', async () => {
    // The request is `draftScenarios`', from the options the part hands over: names already
    // taken, the sample examples start from, and the host's `attempts`. A holder that dropped
    // them would offer names the list refuses, and ask three times after the host said once.
    const asked: string[] = []
    const model = vi.fn<AskModel>((prompt) => {
      asked.push(prompt.user)
      return Promise.resolve('no examples here')
    })
    const run = createDraftRun()
    run.describe('Only Switzerland asks for a canton.')

    await run.draft(model, createBuilderSession(FORM), {
      existing: [{ name: 'already kept', changes: {}, valid: true }],
      initialValue: { country: 'CH' },
      attempts: 1,
    })

    expect(model).toHaveBeenCalledTimes(1)
    expect(asked[0]).toContain('already kept')
    expect(asked[0]).toContain('{"country":"CH"}')
    expect(run.state().result).toMatchObject({ ok: false, ended: 'gave-up', attempts: 1 })
  })
})

describe('the same form, across sessions', () => {
  test('a new session over the same form shows the drafts, judged against that session’s document', async () => {
    /*
     * The playground opens a new session every time Build is shown, over the text the last
     * one wrote. Tagged with the session, the drafts were dropped on the first return from
     * the Schema view. The form's id is what stays: its drafts are shown, and judged by the
     * engine against the document as the new session has it — edited under Schema, too.
     */
    const run = createDraftRun()
    run.describe('Only Switzerland asks for a canton.')
    await run.draft(() => Promise.resolve(drafting(HOLDS)), createBuilderSession(FORM))

    const reopened = createBuilderSession({ ...FORM, logic: { rules: [] } })
    const shown = draftsOn(run.state(), reopened)

    expect(shown).toBe(run.state())
    expect(shown.drafts.map((draft) => draft.name)).toEqual([HOLDS.name])
    // Without the rule, Germany is asked for a canton: the verdict is the reopened form's.
    expect(draftVerdict(reopened.document(), shown.drafts[0]!).passed).toBe(false)
    expect(run.keep(shown.drafts[0]!, reopened, [])).toEqual({ ok: true, scenarios: [HOLDS] })
  })

  test('another form shows none of them, and they cannot be kept into its list', async () => {
    // Another form's list is not the place for these drafts: one that names `country` would
    // even run there. Not shown, and refused if a part asked anyway.
    const run = createDraftRun()
    run.describe('Only Switzerland asks for a canton.')
    await run.draft(() => Promise.resolve(drafting(HOLDS)), createBuilderSession(FORM))
    const other = createBuilderSession(OTHER)

    expect(draftsOn(run.state(), other)).toEqual({
      intent: 'Only Switzerland asks for a canton.',
      form: undefined,
      busy: false,
      result: undefined,
      drafts: [],
      note: undefined,
    })
    expect(run.keep(run.state().drafts[0]!, other, [])).toBeUndefined()
    // And still there for the form they were drafted for.
    expect(draftsOn(run.state(), createBuilderSession(FORM)).drafts).toHaveLength(1)
  })

  test('a run waiting for one form is not drawn waiting over another, and asking there ends it', async () => {
    /*
     * A host that opens another form without discarding the run leaves it waiting. Drawn
     * there as busy, the part could ask nothing — the box disabled over a turn about a form
     * nobody is looking at. So it is drawn idle, and asking for this form ends the last one's
     * run, clearing its turn, rather than being refused behind it.
     */
    const slow = held()
    const run = createDraftRun()
    run.describe('anything')
    void run.draft(slow.model, createBuilderSession(FORM))
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    const other = createBuilderSession(OTHER)

    expect(draftsOn(run.state(), other).busy).toBe(false)
    void run.draft(slow.model, other)

    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(2))
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    expect(run.state()).toMatchObject({ form: 'leave', busy: true })
    // The first form's late answer lands nowhere.
    slow.release(drafting(HOLDS), 0)
    await ticks()
    expect(run.state()).toMatchObject({ form: 'leave', busy: true, drafts: [] })
  })
})

describe('what a held draft comes to', () => {
  test('kept, it leaves the list and the host is handed the longer one; refused, it stays with why', async () => {
    // Keep is `keepDraft`, once: a name already taken is refused and said, and the draft
    // stays to be renamed by asking again or discarded.
    const session = createBuilderSession(FORM)
    const run = createDraftRun()
    run.describe('anything')
    await run.draft(() => Promise.resolve(drafting(HOLDS, ALSO)), session)
    // The drafts as the run holds them, which is what a part's buttons hand back.
    const [holds, also] = run.state().drafts

    expect(run.keep(holds!, session, [{ ...HOLDS, changes: {} }])).toEqual({ ok: false, refused: 'name-taken' })
    expect(run.state().drafts).toHaveLength(2)
    expect(run.state().note).toEqual({ kind: 'refused', why: 'name-taken', name: HOLDS.name })

    expect(run.keep(holds!, session, [])).toEqual({ ok: true, scenarios: [HOLDS] })
    expect(run.state().drafts.map((draft) => draft.name)).toEqual([ALSO.name])
    expect(run.state().note).toEqual({ kind: 'kept', name: HOLDS.name })

    run.discardDraft(also!)
    expect(run.state().drafts).toEqual([])
    expect(run.state().note).toEqual({ kind: 'discarded', name: ALSO.name })
    // A draft it no longer holds is neither kept nor discarded: a second press does nothing.
    expect(run.keep(also!, session, [])).toBeUndefined()
    run.discardDraft(also!)
    expect(run.state().note).toEqual({ kind: 'discarded', name: ALSO.name })
  })

  test('discarded whole, a run still waiting is stopped and nothing it answers is drafted; the words stay', async () => {
    // A host forgets drafts when it opens another form, as the playground does on another
    // demo. The words typed stay, as the prompt pane's instruction does.
    const session = createBuilderSession(FORM)
    const slow = held()
    const run = createDraftRun()
    run.describe('Only Switzerland asks for a canton.')
    void run.draft(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    run.discard()

    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    slow.release(drafting(HOLDS))
    await ticks()
    expect(run.state()).toEqual({
      intent: 'Only Switzerland asks for a canton.',
      form: undefined,
      busy: false,
      result: undefined,
      drafts: [],
      note: undefined,
    })
  })

  test('is the same object until it changes', () => {
    // What React's useSyncExternalStore requires of a snapshot.
    const run = createDraftRun()
    const before = run.state()
    run.describe('')
    run.discard()
    expect(run.state()).toBe(before)
    run.describe('anything')
    expect(run.state()).not.toBe(before)
    expect(draftsOn(run.state(), createBuilderSession(FORM))).toBe(run.state())
  })
})
