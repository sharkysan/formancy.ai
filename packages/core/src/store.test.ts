import { describe, expect, test, vi } from 'vitest'
import { createValueStore } from './store.js'

const initial = {
  email: 'a@b.ch',
  address: { city: 'Zurich', zip: '8000' },
  items: [{ qty: 1 }, { qty: 2 }],
}

describe('createValueStore', () => {
  test('reads the initial value at a path', () => {
    const store = createValueStore(initial)
    expect(store.get(['address', 'city'])).toBe('Zurich')
  })

  test('set makes the new value visible to get', () => {
    const store = createValueStore(initial)
    store.set(['address', 'city'], 'Bern')
    expect(store.get(['address', 'city'])).toBe('Bern')
  })

  test('notifies subscribers once per set, with the changed wire path', () => {
    const store = createValueStore(initial)
    const seen: string[][] = []
    store.subscribe((changed) => seen.push([...changed].sort()))

    store.set(['email'], 'x@y.ch')

    expect(seen).toEqual([['email']])
  })

  test('a set that changes nothing notifies nobody and does not bump the version', () => {
    const store = createValueStore(initial)
    const listener = vi.fn()
    store.subscribe(listener)
    const version = store.version()

    store.set(['address', 'city'], 'Zurich')

    expect(listener).not.toHaveBeenCalled()
    expect(store.version()).toBe(version)
  })

  test('transact coalesces several writes into one notification carrying every changed path', () => {
    const store = createValueStore(initial)
    const seen: string[][] = []
    store.subscribe((changed) => seen.push([...changed].sort()))

    store.transact(() => {
      store.set(['email'], 'x@y.ch')
      store.set(['address', 'city'], 'Bern')
    })

    expect(seen).toEqual([[
      'address.city',
      'email',
    ].sort()])
  })

  test('a nested transact joins the outer transaction rather than notifying twice', () => {
    const store = createValueStore(initial)
    const listener = vi.fn()
    store.subscribe(listener)

    store.transact(() => {
      store.set(['email'], 'x@y.ch')
      store.transact(() => {
        store.set(['address', 'zip'], '3000')
      })
    })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('a transaction whose body throws rolls back and notifies nobody', () => {
    const store = createValueStore(initial)
    const listener = vi.fn()
    store.subscribe(listener)

    expect(() =>
      store.transact(() => {
        store.set(['email'], 'x@y.ch')
        throw new Error('validation blew up')
      }),
    ).toThrow('validation blew up')

    expect(store.get(['email'])).toBe('a@b.ch')
    expect(listener).not.toHaveBeenCalled()
  })

  test('version increments exactly once per committed transaction', () => {
    const store = createValueStore(initial)
    const v0 = store.version()

    store.set(['email'], 'x@y.ch')
    const v1 = store.version()

    store.transact(() => {
      store.set(['address', 'city'], 'Bern')
      store.set(['address', 'zip'], '3000')
    })
    const v2 = store.version()

    expect(v1).toBeGreaterThan(v0)
    expect(v2).toBeGreaterThan(v1)
    expect(v2 - v1).toBe(1)
  })

  test('unsubscribe stops notifications', () => {
    const store = createValueStore(initial)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.set(['email'], 'x@y.ch')

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('subscribeField', () => {
  test('fires when the subscribed value changes and stays silent for unrelated writes', () => {
    const store = createValueStore(initial)
    const city = vi.fn()
    store.subscribeField(['address', 'city'], city)

    store.set(['email'], 'x@y.ch')
    expect(city).not.toHaveBeenCalled()

    store.set(['address', 'city'], 'Bern')
    expect(city).toHaveBeenCalledTimes(1)
  })

  test('fires when an ancestor is replaced and the value underneath actually changed', () => {
    const store = createValueStore(initial)
    const city = vi.fn()
    store.subscribeField(['address', 'city'], city)

    store.set(['address'], { city: 'Basel', zip: '4000' })

    expect(city).toHaveBeenCalledTimes(1)
  })

  test('stays silent when an ancestor is replaced but the subscribed value is identical', () => {
    const store = createValueStore(initial)
    const city = vi.fn()
    store.subscribeField(['address', 'city'], city)

    store.set(['address'], { city: 'Zurich', zip: '9999' })

    expect(city).not.toHaveBeenCalled()
  })

  test('fires for a row subscriber when rows reorder', () => {
    const store = createValueStore(initial)
    const firstRow = vi.fn()
    store.subscribeField(['items', 0], firstRow)

    store.set(['items'], [initial.items[1], initial.items[0]])

    expect(firstRow).toHaveBeenCalledTimes(1)
  })
})
