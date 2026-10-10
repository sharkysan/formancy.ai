import { describe, expect, test, vi } from 'vitest'
import { createStop } from './answers.js'
import { authorForm } from './authoring.js'
import type { AskModel, AuthoringPrompt, AuthoringResult } from './authoring.js'
import type { FormSchema } from '@formancy/spec'

/**
 * The loop, with a scripted model.
 *
 * No vendor, no network, no key — the model is a function, which is the whole
 * point of `AskModel` and is also what makes this testable at all. Each case
 * scripts what a model would plausibly return and asserts what the loop does
 * about it.
 *
 * What is being tested is not "does it call the model". It is that a document
 * which does not work never comes back as a success, and that the model is
 * told precisely enough to fix it on the next turn.
 */
const GOOD = {
  specVersion: '2',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', format: 'email', required: true },
      { key: 'seats', type: 'number', label: 'Seats' },
    ],
  },
}

/** A model that answers with each of these in turn. */
const scripted = (...answers: string[]): AskModel => {
  let at = 0
  return vi.fn(() => Promise.resolve(answers[Math.min(at++, answers.length - 1)] ?? ''))
}

/** The prompts a scripted model was given, in the order it was given them. */
const promptsOf = (ask: AskModel): AuthoringPrompt[] =>
  (ask as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as AuthoringPrompt)

/**
 * Lets whatever has settled run its callbacks. Microtasks rather than a timer: this
 * package has no DOM or Node types, so `setTimeout` does not exist for it.
 */
const ticks = async (count = 20): Promise<void> => {
  for (let tick = 0; tick < count; tick += 1) await Promise.resolve()
}

/**
 * What a run came to, or that it was still going once a stop had every chance to end it.
 *
 * A run that ignores its stop never settles, and a case awaiting it would fail on
 * the test timeout five seconds later with nothing to say. Raced instead, so it
 * fails at once and says what it saw.
 */
const settledSoon = (run: Promise<AuthoringResult>): Promise<AuthoringResult | 'still running'> =>
  Promise.race([run, ticks().then(() => 'still running' as const)])

/** A model that waits until it is told what to say. */
const waiting = (): { ask: AskModel; answer: (text: string) => void } => {
  let answer: (text: string) => void = () => undefined
  const ask = vi.fn<AskModel>(
    () =>
      new Promise<string>((resolve) => {
        answer = resolve
      }),
  )
  return { ask, answer: (text) => answer(text) }
}

describe('a good answer', () => {
  test('comes back as the document, on the first attempt', async () => {
    const result = await authorForm(scripted(JSON.stringify(GOOD)), 'a contact form')

    expect(result).toMatchObject({ ok: true, attempts: 1 })
  })

  test('is accepted inside a code fence, because models add one', async () => {
    // Told firmly not to, they still do it. Spending a turn on formatting
    // rather than on the form helps nobody.
    const result = await authorForm(
      scripted('Here you go:\n```json\n' + JSON.stringify(GOOD) + '\n```'),
      'a contact form',
    )

    expect(result.ok).toBe(true)
  })

  test('and with a sentence in front of it', async () => {
    const result = await authorForm(
      scripted('Sure! ' + JSON.stringify(GOOD)),
      'a contact form',
    )

    expect(result.ok).toBe(true)
  })

  test('but prose alone is not a document', async () => {
    // A bare string is valid JSON. Accepting one would report it as an
    // invalid document rather than as an answer that was not one.
    const result = await authorForm(scripted('"I could not do that"'), 'a contact form')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]?.kind).toBe('not-json')
  })
})

describe('an answer that does not work', () => {
  test('is sent back with the validator’s own words, and the retry is accepted', async () => {
    const ask = scripted(JSON.stringify({ specVersion: '2', id: 'x' }), JSON.stringify(GOOD))

    const result = await authorForm(ask, 'a contact form')

    expect(result).toMatchObject({ ok: true, attempts: 2 })
    // The second prompt has to carry the reason, or the model is guessing.
    const second = (ask as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { user: string }
    expect(second.user).toContain('rejected')
  })

  test('an expression that compiles and never runs is caught too', async () => {
    // The failure the whole loop exists for. `seats * 4` is double times int:
    // it type-checks as far as the schema is concerned and then evaluates to
    // nothing, so the form would publish cleanly and quietly do nothing.
    const broken = {
      ...GOOD,
      model: { fields: [...GOOD.model.fields, { key: 'total', type: 'number', label: 'Total' }] },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'seats * 4' }] },
    }
    const fixed = {
      ...broken,
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'seats * 4.0' }] },
    }
    const ask = scripted(JSON.stringify(broken), JSON.stringify(fixed))

    const result = await authorForm(ask, 'total is four times the seats')

    expect(result).toMatchObject({ ok: true, attempts: 2 })
    const second = (ask as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { user: string }
    // Told what to write, not just that it was wrong.
    expect(second.user).toContain('4.0')
  })

  test('a document the engine would not open is sent back in the engine’s words', async () => {
    // Used to pass this loop: valid against the schema, and the expression
    // check skips what the engine refuses. So a form with one misspelled field
    // name landed in the editor, and the preview could not open it.
    const misspelled = {
      ...GOOD,
      model: { fields: [...GOOD.model.fields, { key: 'notes', type: 'text', label: 'Notes' }] },
      logic: { rules: [{ target: 'notes', kind: 'visible', cel: "emial != ''" }] },
    }
    const fixed = {
      ...misspelled,
      logic: { rules: [{ target: 'notes', kind: 'visible', cel: "email != ''" }] },
    }
    const ask = scripted(JSON.stringify(misspelled), JSON.stringify(fixed))

    const result = await authorForm(ask, 'notes once they have given an email')

    expect(result).toMatchObject({ ok: true, attempts: 2 })
    const second = (ask as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { user: string }
    expect(second.user).toContain('emial')
  })

  test('and one that never opens is never returned as a success', async () => {
    const callback = {
      ...GOOD,
      model: {
        fields: [
          ...GOOD.model.fields,
          { key: 'callback', type: 'checkbox', label: 'Call me back' },
          { key: 'phone', type: 'text', label: 'Phone' },
        ],
      },
      logic: { rules: [{ target: 'phone', kind: 'visible', cel: 'callback' }] },
    }

    const result = await authorForm(scripted(JSON.stringify(callback)), 'a phone number on request', {
      attempts: 1,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems[0]).toMatchObject({ kind: 'logic' })
      // What to write, so the next attempt can be the right one.
      expect(result.problems[0]?.detail).toContain('callback == true')
    }
  })

  test('only the most recent complaint is repeated', async () => {
    const ask = scripted('not json', JSON.stringify({ specVersion: '2' }), JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const third = (ask as ReturnType<typeof vi.fn>).mock.calls[2]?.[0] as { user: string }
    // Three rounds of accumulated complaints and a model starts fixing the
    // first one again.
    expect(third.user).not.toContain('That was not JSON')
  })

  test('gives up rather than circling, and says what it last saw', async () => {
    const ask = scripted('nonsense')

    const result = await authorForm(ask, 'a contact form', { attempts: 2 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.attempts).toBe(2)
      expect(result.problems).toHaveLength(2)
      // So a person can see what the model actually said, rather than being
      // told only that it failed.
      expect(result.lastAnswer).toBe('nonsense')
    }
    expect(ask).toHaveBeenCalledTimes(2)
  })

  test('a document that never works is never returned as a success', async () => {
    const ask = scripted(JSON.stringify({ specVersion: '2', id: 'x' }))

    const result = await authorForm(ask, 'a contact form', { attempts: 2 })

    // The property that matters. Everything else here is about how helpfully
    // it fails.
    expect(result.ok).toBe(false)
  })
})

describe('editing a form that already exists', () => {
  test('the current document goes in the prompt, canonicalised', async () => {
    const ask = scripted(JSON.stringify(GOOD))

    await authorForm(ask, 'add a phone number', { current: GOOD as unknown as FormSchema })

    const prompt = (ask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { user: string }
    expect(prompt.user).toContain('Here is the current document')
    expect(prompt.user).toContain('"contact"')
    // Canonical, so key order that means nothing does not distract the model
    // and two identical documents look identical to it.
    expect(prompt.user).toContain('"specVersion"')
  })

  test('without one, it is asked to write rather than to change', async () => {
    const ask = scripted(JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const prompt = (ask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { user: string }
    expect(prompt.user).not.toContain('current document')
  })
})

describe('the briefing', () => {
  test('tells the model the rules before it writes anything', async () => {
    const ask = scripted(JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const prompt = (ask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { system: string }
    // Each of these is something a model gets wrong unprompted, and each has
    // cost time in this repository.
    expect(prompt.system).toContain('selectboxes')
    expect(prompt.system).toContain('4.0 rather than 4')
    expect(prompt.system).toContain('format "email"')
  })
})

describe('a host that cannot ask its model', () => {
  test('is not a document that failed: the run ends unreachable, with the host’s reason', async () => {
    /*
     * The network down, a key refused. authorForm used to reject, and both panes
     * caught it and built a failure by hand with `attempts: 0` — which the status
     * worded as "0 attempts, and the document still did not work", sending a
     * person to reword an instruction when nothing had been asked at all.
     */
    const ask: AskModel = () => Promise.reject(new Error('fetch failed'))

    const result = await authorForm(ask, 'a contact form')

    expect(result).toMatchObject({
      ok: false,
      ended: 'unreachable',
      reason: 'fetch failed',
      attempts: 1,
      problems: [],
      lastAnswer: '',
    })
  })

  test('after an answer that failed its check, keeps what that answer was told', async () => {
    // The second turn is the one that could not be made. What was wrong with the
    // first is still what the person needs in order to reword the instruction.
    let turns = 0
    const ask: AskModel = () =>
      turns++ === 0 ? Promise.resolve('nonsense') : Promise.reject(new Error('401: key refused'))

    const result = await authorForm(ask, 'a contact form')

    expect(result).toMatchObject({
      ok: false,
      ended: 'unreachable',
      reason: '401: key refused',
      attempts: 2,
      lastAnswer: 'nonsense',
    })
    if (!result.ok) expect(result.problems.map((problem) => problem.kind)).toEqual(['not-json'])
  })

  test('and one that throws rather than rejecting is the same', async () => {
    // A host's function that fails before it returns a promise — a missing
    // configuration read synchronously — would otherwise escape the run as a throw.
    const ask: AskModel = () => {
      throw new Error('no endpoint configured')
    }

    const result = await authorForm(ask, 'a contact form')

    expect(result).toMatchObject({ ok: false, ended: 'unreachable', reason: 'no endpoint configured' })
  })

  test('an error with no message is named by what it is, so the sentence does not end on nothing', async () => {
    // "The model could not be reached: " and then nothing reads as a sentence cut off.
    const ask: AskModel = () => Promise.reject(new TypeError(''))

    const result = await authorForm(ask, 'a contact form')

    expect(result).toMatchObject({ ok: false, ended: 'unreachable', reason: 'TypeError' })
  })

  test('and one rejected with something other than an Error is said as text', async () => {
    // A host's own wrapper rejecting with a status string is still the host's
    // reason, and reading `.message` off it would have shown `undefined`.
    const ask: AskModel = () => Promise.reject('offline' as unknown as Error)

    const result = await authorForm(ask, 'a contact form')

    expect(result).toMatchObject({ ok: false, ended: 'unreachable', reason: 'offline' })
  })

  test('one with nothing to say ends the run with no reason, not "undefined" or an empty one', async () => {
    /*
     * `String()` of whatever was thrown put "undefined" or "[object Object]" after
     * the colon — an XHR wrapper's `onerror = reject` hands over an event, not an
     * error — and an empty string ended the sentence on nothing. A value with no
     * prototype could not be made text at all: `String()` threw inside the handler
     * meant to end the run, and the run never ended.
     */
    const nothingToSay: unknown[] = [undefined, null, '', '  ', { type: 'error' }, Object.create(null)]

    for (const thrown of nothingToSay) {
      const result = await settledSoon(authorForm(() => Promise.reject(thrown as Error), 'a form'))

      expect(result).toMatchObject({ ok: false, ended: 'unreachable' })
      expect(result).not.toHaveProperty('reason')
    }
  })

  test('a run that used every attempt says it gave up, and names no reason', async () => {
    // So the three endings are told apart by what they are, not by a count of
    // attempts that happened to be zero.
    const result = await authorForm(scripted('nonsense'), 'a contact form', { attempts: 2 })

    expect(result).toMatchObject({ ok: false, ended: 'gave-up', attempts: 2 })
    expect(result).not.toHaveProperty('reason')
  })
})

describe('stopping a run', () => {
  test('ends it at once as stopped, tells the host once, and discards an answer that arrives later', async () => {
    /*
     * Nothing could stop a run: a slow model held the pane busy for as long as it
     * liked. And an answer arriving after the person had walked away would land as
     * a proposal for an instruction they had abandoned.
     */
    const cancelled = vi.fn()
    let answer: (text: string) => void = () => undefined
    const ask = vi.fn<AskModel>(
      (_prompt, turn) =>
        new Promise<string>((resolve) => {
          answer = resolve
          turn.onCancel(cancelled)
        }),
    )
    const stop = createStop()

    const run = authorForm(ask, 'a contact form', { stop })
    stop.stop()
    stop.stop()

    const result = await settledSoon(run)
    expect(result).toMatchObject({ ok: false, ended: 'stopped', attempts: 1, problems: [] })
    expect(result).not.toHaveProperty('reason')
    expect(cancelled).toHaveBeenCalledTimes(1)

    // A working document, late. Read, it would be a proposal nobody asked for.
    answer(JSON.stringify(GOOD))
    await ticks()
    expect(ask).toHaveBeenCalledTimes(1)
    expect(await run).toMatchObject({ ok: false, ended: 'stopped', lastAnswer: '' })
  })

  test('a host that ignores the stop is still stopped at once', async () => {
    /*
     * An `AskModel` written with one parameter — every one written before the
     * second existed — never hears about the stop. The run must not wait for it:
     * the stop is the person's, and the host's request is the host's to abandon.
     * Typed, so `pnpm typecheck` fails if a one-parameter model stops compiling.
     */
    const oneParameter: AskModel = ({ user }) => new Promise<string>(() => void user)
    const stop = createStop()

    const run = authorForm(oneParameter, 'a contact form', { stop })
    stop.stop()

    expect(await settledSoon(run)).toMatchObject({ ok: false, ended: 'stopped' })
  })

  test('a host that asks to be told only after the stop is told at once', async () => {
    // A host that registers after an await of its own would otherwise never hear,
    // and its request would run on for an answer nobody reads.
    const cancelled = vi.fn()
    const ask: AskModel = async (_prompt, turn) => {
      await ticks(2)
      turn.onCancel(cancelled)
      return new Promise<string>(() => undefined)
    }
    const stop = createStop()

    const run = authorForm(ask, 'a contact form', { stop })
    stop.stop()
    await settledSoon(run)
    await ticks()

    expect(cancelled).toHaveBeenCalledTimes(1)
  })

  test('a stop before the run asks nothing', async () => {
    const ask = scripted(JSON.stringify(GOOD))
    const stop = createStop()
    stop.stop()

    const result = await authorForm(ask, 'a contact form', { stop })

    expect(result).toMatchObject({ ok: false, ended: 'stopped', attempts: 0 })
    expect(ask).not.toHaveBeenCalled()
  })

  test('a stop after the run has ended tells the host nothing', async () => {
    // The turn answered; cancelling it then would abort a request that finished,
    // and a listener left on the stop is one per turn for as long as it lives.
    const cancelled = vi.fn()
    const ask: AskModel = (_prompt, turn) => {
      turn.onCancel(cancelled)
      return Promise.resolve(JSON.stringify(GOOD))
    }
    const stop = createStop()

    const result = await authorForm(ask, 'a contact form', { stop })
    stop.stop()

    expect(result.ok).toBe(true)
    expect(cancelled).not.toHaveBeenCalled()
  })
})

describe('what the model receives on each turn', () => {
  test('which attempt this is, of how many, and from the second the complaint alone', async () => {
    /*
     * The prompt was the same shape on every turn, so a host keeping a
     * conversation with its model could not tell a correction from a fresh
     * request, and sent the instruction and the whole document again each time.
     */
    const ask = scripted('not json', JSON.stringify({ specVersion: '2', id: 'x' }), JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const prompts = promptsOf(ask)
    expect(prompts.map((prompt) => [prompt.attempt, prompt.limit])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
    expect(prompts[0]).not.toHaveProperty('followUp')
    expect(prompts[1]?.followUp).toContain('That was not JSON')
    // The complaint alone: the instruction is already in the conversation.
    expect(prompts[1]?.followUp).not.toContain('a contact form')
    expect(prompts[2]?.followUp).not.toContain('That was not JSON')
  })

  test('and the stateless prompt still carries the instruction and only the latest complaint', async () => {
    // A host that sends only `user` each turn is unchanged by follow-ups (0056).
    const ask = scripted('not json', JSON.stringify({ specVersion: '2', id: 'x' }), JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const [, second, third] = promptsOf(ask)
    expect(second?.user).toContain('a contact form')
    expect(second?.user).toContain(second?.followUp ?? 'a follow-up')
    expect(third?.user).toContain(third?.followUp ?? 'a follow-up')
    expect(third?.user).not.toContain('That was not JSON')
  })
})
