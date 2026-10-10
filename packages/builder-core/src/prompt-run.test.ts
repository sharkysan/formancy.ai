import { describe, expect, test, vi } from 'vitest'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import type { AskModel } from './answers.js'
import { createPromptRun } from './prompt-run.js'
import { createRelay } from './relay.js'
import { createBuilderSession } from './session.js'

/**
 * A prompt pane's run, held where the host chooses
 * ([0163](../../../docs/decisions/0163-a-models-run-belongs-to-the-host.md)).
 *
 * A run belonged to the pane that asked, and a pane taken off the screen stopped it
 * (0157). Through a relay a turn takes as long as a person takes to carry it, and on
 * formancy.ai the prompt pane is under one tab of one builder: a visitor who looked at the
 * JSON, another tab or the other builder while their chat answered lost the turn, and the
 * answer they pasted afterwards had nowhere to go. What is pinned here is the holder that
 * outlives a pane: the run, its stop, and what it came to, for whichever pane attaches
 * next.
 */
const START: FormSchema = {
  specVersion: '2',
  id: 'start',
  title: 'Start',
  model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
}

const withField = (key: string): FormSchema => ({
  ...START,
  model: { fields: [...START.model.fields, { key, type: 'text', label: key }] },
})

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
    release: (answer: string, turn = releases.length - 1) => releases[turn]?.(answer),
  }
}

/**
 * Lets whatever has settled run its callbacks: an answer released to a run that should
 * ignore it has had every chance to land. Microtasks, as `authoring.test.ts` waits, since
 * this package has no timer in its types.
 */
const ticks = async (count = 20): Promise<void> => {
  for (let tick = 0; tick < count; tick += 1) await Promise.resolve()
}

/** A pane, as the holder sees one: something that subscribes, and reads the state when told. */
const attach = (run: ReturnType<typeof createPromptRun>) => {
  const heard = vi.fn(() => run.state())
  const detach = run.subscribe(heard)
  return { heard, detach }
}

describe('a run held by the host', () => {
  test('outlives the pane that asked, and its proposal reaches the next pane that attaches', async () => {
    /*
     * The defect. A visitor asks, carries the request to their chat, and looks at the JSON
     * while it answers: the prompt pane goes, and with a run that was the pane's, the turn
     * went with it. Held here, nothing about a pane going reaches the run — the model is
     * not told to stop — and what it answers is held for the pane drawn next.
     */
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()
    const first = attach(run)

    run.instruct('add a phone number')
    void run.write(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    first.detach()

    slow.release(JSON.stringify(withField('phone')))
    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    expect(slow.cancelled).not.toHaveBeenCalled()
    expect(first.heard).toHaveBeenCalledTimes(2)

    const next = attach(run)
    const state = run.state()
    expect(state.proposal?.document.model.fields.map((field) => field.key)).toEqual(['name', 'phone'])
    expect(state.result?.ok).toBe(true)
    // The instruction it answers, beside it: a proposal shown in a pane that did not ask
    // has to say what it is the answer to.
    expect(state.instruction).toBe('add a phone number')
    expect(session.document()).toEqual(START)

    run.apply(session)
    expect(session.document().model.fields.map((field) => field.key)).toEqual(['name', 'phone'])
    expect(next.heard).toHaveBeenCalled()
  })

  test('through a relay, keeps its turn waiting while no pane is attached', async () => {
    // The playground's case: the relay pane above the tabs shows the turn, and the answer
    // pasted there — under another tab, or in the other builder — is the run's answer.
    const session = createBuilderSession(START)
    const relay = createRelay()
    const run = createPromptRun()
    const pane = attach(run)

    run.instruct('add a phone number')
    void run.write(relay.ask, session)
    await vi.waitFor(() => expect(relay.waiting()).toBeDefined())
    pane.detach()

    expect(relay.waiting()).toBeDefined()
    expect(relay.answer(JSON.stringify(withField('phone')))).toBe('accepted')
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())
  })

  test('is stopped by Stop from any pane showing it, and every pane hears it end', async () => {
    // Two panes on one run — one in each builder — press the same stop. A Stop that ended
    // only the run of the pane it was drawn in would leave the other waiting, and the
    // relay's turn with it.
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()
    const react = attach(run)
    const angular = attach(run)

    run.instruct('add a phone number')
    void run.write(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    run.stop()

    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    expect(run.state().result).toMatchObject({ ok: false, ended: 'stopped' })
    expect(react.heard.mock.results.at(-1)?.value).toBe(run.state())
    expect(angular.heard.mock.results.at(-1)?.value).toBe(run.state())

    // And whatever the model says afterwards is never held.
    slow.release(JSON.stringify(withField('phone')))
    await ticks()
    expect(run.state().proposal).toBeUndefined()
  })

  test('an answer to a stopped run, arriving while the next one waits, is not taken for its answer', async () => {
    /*
     * SAFETY-ANALYSIS D10's variant, now that the holder makes the stops: somebody stops,
     * asks for something else, and the first model answers late. A holder that kept one
     * stop for its life would end the second run before it asked; one that took whichever
     * answer came first would review the phone number as the answer to the fax.
     */
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()

    run.instruct('add a phone number')
    void run.write(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    run.stop()
    await vi.waitFor(() => expect(run.state().busy).toBe(false))

    run.instruct('add a fax number')
    void run.write(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(2))
    slow.release(JSON.stringify(withField('phone')), 0)
    await ticks()
    expect(run.state().busy).toBe(true)
    expect(run.state().proposal).toBeUndefined()

    slow.release(JSON.stringify(withField('fax')), 1)
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())
    expect(run.state().proposal?.document.model.fields.map((field) => field.key)).toEqual(['name', 'fax'])
  })

  test('keeps the instruction it was asked with while it waits', async () => {
    /*
     * A run outlives its pane, so its proposal can be read in a pane that did not ask —
     * beside the instruction shown there. If that could change while the run waited, a
     * late answer would be reviewed against words it never answered, which is D10's
     * variant without a stop in it.
     */
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()

    run.instruct('add a phone number')
    void run.write(slow.model, session)
    run.instruct('add a fax number')
    expect(run.state().instruction).toBe('add a phone number')

    // And a second Write while it waits asks nothing.
    void run.write(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    await ticks()
    expect(slow.model).toHaveBeenCalledTimes(1)

    slow.release(JSON.stringify(withField('phone')))
    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    run.instruct('add a fax number')
    expect(run.state().instruction).toBe('add a fax number')
  })

  test('asks nothing for an instruction with nothing in it', async () => {
    const model = vi.fn<AskModel>(() => Promise.resolve('{}'))
    const run = createPromptRun()
    run.instruct('   ')

    await run.write(model, createBuilderSession(START))

    expect(model).not.toHaveBeenCalled()
    expect(run.state().busy).toBe(false)
  })

  test('is the same object until it changes', async () => {
    // What React's useSyncExternalStore requires of a snapshot, and what keeps an Angular
    // signal set from it from waking the template for nothing.
    const run = createPromptRun()
    const before = run.state()
    expect(run.state()).toBe(before)

    run.instruct('')
    expect(run.state()).toBe(before)

    run.instruct('add a phone number')
    expect(run.state()).not.toBe(before)
    expect(run.state()).toBe(run.state())
  })
})

describe('what a run came to', () => {
  test('runs the form’s examples before it is held, as the prompt pane did', async () => {
    // The examples in force when Write was pressed, against the document the run was asked
    // over (0159): held by the host, the run must not lose them on the way.
    const session = createBuilderSession(START)
    const scenarios: Scenario[] = [{ name: 'a name is accepted', changes: { name: 'Ada' }, valid: true }]
    const run = createPromptRun()
    run.instruct('add a phone number')

    await run.write(() => Promise.resolve(JSON.stringify(withField('phone'))), session, {
      examples: { scenarios },
    })

    expect(run.state().proposal?.examples).toEqual({ regressions: [], repaired: [] })
  })

  test('asks as many times as the pane was told to', async () => {
    // A host's `attempts` reaches the run through the holder: one that dropped it would ask
    // three times, each a round trip by hand through a relay, after the host said once.
    const model = vi.fn<AskModel>(() => Promise.resolve('not a form'))
    const run = createPromptRun()
    run.instruct('add a phone number')

    await run.write(model, createBuilderSession(START), { attempts: 1 })

    expect(model).toHaveBeenCalledTimes(1)
    expect(run.state().result).toMatchObject({ ok: false, ended: 'gave-up', attempts: 1 })
  })

  test('is applied as one step, and leaves nothing behind it', async () => {
    const session = createBuilderSession(START)
    const run = createPromptRun()
    run.instruct('add a phone number')
    await run.write(() => Promise.resolve(JSON.stringify(withField('phone'))), session)

    const outcome = run.apply(session)

    expect(outcome?.ok).toBe(true)
    expect(session.revision()).toBe(1)
    expect(run.state()).toMatchObject({
      instruction: '',
      busy: false,
      result: undefined,
      proposal: undefined,
      refusal: undefined,
    })
  })

  test('is kept, with the refusal, when the form moved while it waited', async () => {
    // The commonest refusal (0109), and more common now: a run that outlives its pane
    // outlives edits made elsewhere while it waits. Kept, because throwing the proposal
    // away would lose what the person needs in order to ask again.
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()
    run.instruct('add a phone number')
    void run.write(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    session.replaceDocument(withField('email'))
    slow.release(JSON.stringify(withField('phone')))
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())
    const outcome = run.apply(session)

    expect(outcome?.ok).toBe(false)
    expect(run.state().proposal).toBeDefined()
    expect(run.state().refusal).toBe(session.text('proposal.stale'))
    expect(session.document()).toEqual(withField('email'))
  })

  test('is discarded whole, and so is a run still waiting, whose answer is then never held', async () => {
    /*
     * A host forgets a run when it opens another form: the playground does when another
     * demo is chosen. A run still waiting is stopped — its relay turn cleared, its host
     * told — and nothing it answers later is held, nor is the ending said.
     */
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()
    run.instruct('add a phone number')
    void run.write(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    run.discard()

    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    expect(run.state().busy).toBe(false)
    slow.release(JSON.stringify(withField('phone')))
    await ticks()
    expect(run.state()).toMatchObject({ busy: false, result: undefined, proposal: undefined })
  })

  test('apply with nothing held does nothing', () => {
    const session = createBuilderSession(START)
    expect(createPromptRun().apply(session)).toBeUndefined()
    expect(session.revision()).toBe(0)
  })
})
