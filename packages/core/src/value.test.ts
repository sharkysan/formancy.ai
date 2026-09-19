import { describe, expect, test } from 'vitest'
import { arrayInsert, arrayMove, arrayRemove, getAt, setAt } from './value.js'

const submission = {
  email: 'a@b.ch',
  address: { city: 'Zurich', zip: '8000' },
  items: [
    { name: 'first', qty: 1 },
    { name: 'second', qty: 2 },
  ],
}

describe('getAt', () => {
  test('returns the root for the empty path', () => {
    expect(getAt(submission, [])).toBe(submission)
  })

  test('reads a nested object path', () => {
    expect(getAt(submission, ['address', 'city'])).toBe('Zurich')
  })

  test('reads through an array index', () => {
    expect(getAt(submission, ['items', 1, 'name'])).toBe('second')
  })

  test('returns undefined for a missing path instead of throwing', () => {
    expect(getAt(submission, ['address', 'country'])).toBeUndefined()
    expect(getAt(submission, ['items', 9, 'name'])).toBeUndefined()
    expect(getAt(submission, ['email', 'nested'])).toBeUndefined()
  })
})

describe('setAt', () => {
  test('returns a new root with the value applied, leaving the original untouched', () => {
    const next = setAt(submission, ['address', 'city'], 'Bern')

    expect(getAt(next, ['address', 'city'])).toBe('Bern')
    expect(getAt(submission, ['address', 'city'])).toBe('Zurich')
  })

  test('shares untouched subtrees by identity', () => {
    const next = setAt(submission, ['address', 'city'], 'Bern') as typeof submission

    // items was not on the written path, so it must be the SAME object — this
    // is what makes change detection O(changed), not O(form).
    expect(next.items).toBe(submission.items)
    expect(next.address).not.toBe(submission.address)
  })

  test('writes through an array index without disturbing sibling rows', () => {
    const next = setAt(submission, ['items', 0, 'qty'], 5) as typeof submission

    expect(next.items[0]!.qty).toBe(5)
    expect(next.items[1]).toBe(submission.items[1])
  })

  test('creates missing intermediate containers, arrays for indices and objects for keys', () => {
    const next = setAt({}, ['rows', 0, 'name'], 'x')

    expect(next).toEqual({ rows: [{ name: 'x' }] })
    expect(Array.isArray(getAt(next, ['rows']))).toBe(true)
  })

  test('replaces the root when given the empty path', () => {
    expect(setAt(submission, [], 42)).toBe(42)
  })

  test('setting an identical value returns the same root, so no-ops cause no notifications', () => {
    expect(setAt(submission, ['address', 'city'], 'Zurich')).toBe(submission)
  })
})

describe('array operations', () => {
  test('arrayInsert places a row and shifts the rest, preserving row identities', () => {
    const next = arrayInsert(submission, ['items'], 1, { name: 'inserted', qty: 9 }) as typeof submission

    expect(next.items.map((i) => i.name)).toEqual(['first', 'inserted', 'second'])
    expect(next.items[0]).toBe(submission.items[0])
    expect(next.items[2]).toBe(submission.items[1])
    expect(submission.items).toHaveLength(2)
  })

  test('arrayInsert at the length appends', () => {
    const next = arrayInsert(submission, ['items'], 2, { name: 'last', qty: 3 }) as typeof submission
    expect(next.items.map((i) => i.name)).toEqual(['first', 'second', 'last'])
  })

  test('arrayInsert into a missing path creates the array', () => {
    const next = arrayInsert({}, ['rows'], 0, 'x')
    expect(next).toEqual({ rows: ['x'] })
  })

  test('arrayRemove splices the row out rather than leaving a hole', () => {
    const next = arrayRemove(submission, ['items'], 0) as typeof submission

    expect(next.items.map((i) => i.name)).toEqual(['second'])
    expect(next.items[0]).toBe(submission.items[1])
  })

  test('arrayMove reorders without cloning the rows themselves', () => {
    const next = arrayMove(submission, ['items'], 0, 1) as typeof submission

    expect(next.items.map((i) => i.name)).toEqual(['second', 'first'])
    expect(next.items[0]).toBe(submission.items[1])
    expect(next.items[1]).toBe(submission.items[0])
  })

  test.each([
    ['insert past the end', () => arrayInsert(submission, ['items'], 3, {})],
    ['insert at a negative index', () => arrayInsert(submission, ['items'], -1, {})],
    ['remove out of range', () => arrayRemove(submission, ['items'], 2)],
    ['move from out of range', () => arrayMove(submission, ['items'], 5, 0)],
    ['move to out of range', () => arrayMove(submission, ['items'], 0, 5)],
    ['remove on a non-array', () => arrayRemove(submission, ['email'], 0)],
  ])('%s throws instead of corrupting silently', (_label, op) => {
    expect(op).toThrow()
  })
})
