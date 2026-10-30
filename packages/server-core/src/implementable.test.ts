import { describe, expect, test } from 'vitest'
import type { AuthDeps } from './auth.js'
import type { ServerDeps } from './deps.js'

/**
 * The functions of an interface a host implements are methods whose `this` is `void`, as in
 * the renderers and the builder: a method keeps the check a host's implementation was always
 * held to, and `this: void` says the function needs no `this`, so it may be passed on
 * detached, as `@typescript-eslint/unbound-method` reads it. These two take no parameter, so
 * no implementation compiles under one declaration and not the other; what is held is that
 * both ways of writing them compile, under `pnpm typecheck`, and that each runs detached.
 */
describe('the clock and the ids a host hands the server', () => {
  test('may be written as functions and passed on detached', () => {
    let next = 0
    const deps: Pick<ServerDeps, 'newId' | 'nowIso'> & Pick<AuthDeps, 'newId' | 'nowIso'> = {
      newId: () => `id-${(next += 1)}`,
      nowIso: () => '2026-10-30T00:00:00.000Z',
    }
    const { newId, nowIso } = deps
    expect([newId(), newId(), nowIso()]).toEqual(['id-1', 'id-2', '2026-10-30T00:00:00.000Z'])
  })

  test('may be a class that implements them', () => {
    class Clock implements Pick<ServerDeps, 'newId' | 'nowIso'>, Pick<AuthDeps, 'newId' | 'nowIso'> {
      private count = 0
      newId(): string {
        this.count += 1
        return `id-${this.count}`
      }
      nowIso(): string {
        return '2026-10-30T00:00:00.000Z'
      }
    }
    const clock = new Clock()
    expect([clock.newId(), clock.nowIso()]).toEqual(['id-1', '2026-10-30T00:00:00.000Z'])
  })
})
