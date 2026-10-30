import { describe, expect, test } from 'vitest'
import type { DraftRun } from './draft-run.js'
import type { PromptRun } from './prompt-run.js'
import type { Relay, RelayTurn } from './relay.js'
import type { TranslationRun } from './translation-run.js'

/**
 * The functions of an interface a host implements, or is handed and passes on, are methods
 * whose `this` is `void`. A method keeps the check a host's implementation was always held
 * to, its parameters compared both ways under `strict`; a function-typed property, which the
 * lint fixes first made them, compares them one way, and refused an implementation with a
 * narrower parameter that had compiled (TS2322). `this: void` says the function needs no
 * `this`, so it may be passed on detached, as `@typescript-eslint/unbound-method` reads it.
 *
 * What fails is `pnpm typecheck`, which reads this file; the calls say each runs detached.
 */
describe('a run and a relay, as a host writes one or hands it on', () => {
  test('take an implementation whose listener is narrower, as a method allows', () => {
    const heard: string[] = []
    const subscribe = (listener: () => undefined) => {
      listener()
      return () => void heard.push('stopped')
    }
    const draft: Pick<DraftRun, 'subscribe'> = { subscribe }
    const prompt: Pick<PromptRun, 'subscribe'> = { subscribe }
    const translation: Pick<TranslationRun, 'subscribe'> = { subscribe }
    const relay: Pick<Relay, 'subscribe' | 'waiting'> = { subscribe, waiting: () => undefined }
    for (const { subscribe: detached } of [draft, prompt, translation, relay]) detached(() => void heard.push('heard'))()
    const { waiting } = relay
    expect(waiting()).toBeUndefined()
    expect(heard).toEqual(['heard', 'stopped', 'heard', 'stopped', 'heard', 'stopped', 'heard', 'stopped'])
  })

  test('take a class that implements them', () => {
    class Turns implements Pick<Relay, 'subscribe' | 'waiting'>, Pick<PromptRun, 'subscribe'> {
      readonly listeners = new Set<() => void>()
      waiting(): RelayTurn | undefined {
        return undefined
      }
      subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }
    }
    const turns = new Turns()
    turns.subscribe(() => undefined)()
    expect(turns.listeners.size).toBe(0)
    expect(turns.waiting()).toBeUndefined()
  })
})
