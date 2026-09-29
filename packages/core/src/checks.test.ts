import { describe, expect, test, vi } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * Running a check: a validator the deployment answers, arriving later.
 *
 * The whole difficulty is that the answer is late. Three things go wrong in
 * every implementation of this, and each has a case here.
 *
 * **A stale answer wins.** Somebody types `a@b.ch`, the check goes out, they
 * correct it to `a@c.ch`, and the first answer lands second and marks the second
 * address taken. A generation token is the only fix; debouncing narrows the
 * window and does not close it.
 *
 * **Submit does not wait.** A form submitted while a check is in flight is a form
 * whose verdict was not in, and "it was valid when I pressed the button" is not
 * something the server will agree with.
 *
 * **The field says nothing while it waits.** A control that looks finished and is
 * not is one somebody submits.
 */
const schema: FormSchema = {
  specVersion: '3',
  id: 'signup',
  title: 'Sign up',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
  logic: {
    rules: [
      { target: 'email', kind: 'check', check: 'email-not-taken', code: 'taken', runsOn: 'both' },
    ],
  },
}

const engineWith = (
  checks: Record<string, (request: { value: unknown }) => Promise<string | undefined>>,
): ReturnType<typeof createFormEngine> =>
  createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
    checks,
  })

const errorsOn = (engine: ReturnType<typeof createFormEngine>, path: string): readonly string[] =>
  engine.getFieldSnapshot([path]).errors

describe('a check', () => {
  test('is asked when the answer changes, and its verdict becomes the error', async () => {
    const asked: unknown[] = []
    const engine = engineWith({
      'email-not-taken': async ({ value }) => {
        asked.push(value)
        return value === 'taken@example.ch' ? 'taken' : undefined
      },
    })

    engine.setValue(['email'], 'taken@example.ch')
    engine.touch(['email'])
    await engine.settle()

    expect(asked).toEqual(['taken@example.ch'])
    expect(errorsOn(engine, 'email').join(' ')).toMatch(/taken/)
  })

  test('says it is waiting, because a control that looks finished and is not gets submitted', async () => {
    let release: (() => void) | undefined
    const engine = engineWith({
      'email-not-taken': () =>
        new Promise<string | undefined>((resolve) => {
          release = () => {
            resolve(undefined)
          }
        }),
    })

    engine.setValue(['email'], 'a@b.ch')
    expect(engine.getFieldSnapshot(['email']).checking).toBe(true)

    release?.()
    await engine.settle()
    expect(engine.getFieldSnapshot(['email']).checking).toBe(false)
  })

  test('discards an answer that arrives for a value nobody holds any more', async () => {
    // The one that makes a form wrong rather than slow. Two calls in flight, the
    // FIRST resolving last: without a generation token the stale verdict lands on
    // the current value and marks a good answer taken.
    const pending = new Map<string, (verdict: string | undefined) => void>()
    const engine = engineWith({
      'email-not-taken': async ({ value }) =>
        new Promise<string | undefined>((resolve) => {
          pending.set(String(value), resolve)
        }),
    })

    engine.setValue(['email'], 'first@example.ch')
    engine.setValue(['email'], 'second@example.ch')
    engine.touch(['email'])

    // The stale one answers "taken", after the current one has answered "free".
    pending.get('second@example.ch')?.(undefined)
    pending.get('first@example.ch')?.('taken')
    await engine.settle()

    expect(errorsOn(engine, 'email')).toEqual([])
  })

  test('settle waits for what is in flight, so submit cannot outrun a verdict', async () => {
    let answered = false
    const engine = engineWith({
      'email-not-taken': async () => {
        await Promise.resolve()
        answered = true
        return 'taken'
      },
    })

    engine.setValue(['email'], 'a@b.ch')
    engine.touch(['email'])
    await engine.settle()

    expect(answered).toBe(true)
    expect(errorsOn(engine, 'email').join(' ')).toMatch(/taken/)
  })

  test('a check the deployment has not supplied fails the field, never passes it', async () => {
    // Fails CLOSED, like every other thing here that cannot get an answer: an
    // accepted bogus value is undetectable afterwards, a refusal is retryable.
    const engine = engineWith({})

    engine.setValue(['email'], 'a@b.ch')
    engine.touch(['email'])
    await engine.settle()

    expect(errorsOn(engine, 'email').length).toBeGreaterThan(0)
  })

  test('a check that throws fails the field rather than the form', async () => {
    const engine = engineWith({
      'email-not-taken': async () => {
        throw new Error('the registry is down')
      },
    })

    engine.setValue(['email'], 'a@b.ch')
    engine.touch(['email'])
    await engine.settle()

    expect(errorsOn(engine, 'email').length).toBeGreaterThan(0)
  })

  test('is not asked about an empty answer, which is `required`’s question', async () => {
    const checker = vi.fn(async () => undefined)
    const engine = engineWith({ 'email-not-taken': checker })

    engine.setValue(['email'], '')
    await engine.settle()

    expect(checker).not.toHaveBeenCalled()
  })

  test('is not asked at all when no checks are supplied and none is declared', async () => {
    // The engine without this feature: a form with no check rules must not grow a
    // promise, a settle or a snapshot field that behaves differently.
    const plain = createFormEngine({
      schema: { ...schema, logic: { rules: [] } },
      capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
    })

    plain.setValue(['email'], 'a@b.ch')
    await plain.settle()

    expect(plain.getFieldSnapshot(['email']).checking).toBe(false)
    expect(errorsOn(plain, 'email')).toEqual([])
  })
})
