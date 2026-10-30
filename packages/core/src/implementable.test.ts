import { describe, expect, test } from 'vitest'
import type { PendingUpload, UploadQueue } from './uploads.js'

/** A picked file, as the queue takes one: core has no DOM, so no `File`. */
type Picked = { readonly name: string; readonly size: number }

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
describe('an upload queue, as a host writes one', () => {
  test('takes an implementation whose parameter is narrower, as a method allows', () => {
    const none: readonly PendingUpload[] = []
    const heard: string[] = []
    const queue: Pick<UploadQueue<Picked>, 'pending' | 'subscribe'> = {
      pending: () => none,
      subscribe: (listener: () => undefined) => {
        listener()
        return () => void heard.push('stopped')
      },
    }
    const { pending, subscribe } = queue
    subscribe(() => void heard.push('heard'))()
    expect(pending()).toBe(none)
    expect(heard).toEqual(['heard', 'stopped'])
  })

  test('takes a class that implements it', () => {
    class Queue implements Pick<UploadQueue<Picked>, 'pending' | 'subscribe'> {
      readonly listeners = new Set<() => void>()
      pending(): readonly PendingUpload[] {
        return []
      }
      subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }
    }
    const queue = new Queue()
    queue.subscribe(() => undefined)()
    expect(queue.listeners.size).toBe(0)
    expect(queue.pending()).toEqual([])
  })
})
