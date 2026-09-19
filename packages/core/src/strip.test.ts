import { describe, expect, test } from 'vitest'
import { stripPaths } from './strip.js'

const submission = {
  email: 'a@b.ch',
  employer: 'ACME',
  address: { city: 'Zurich', zip: '8000' },
  items: [
    { name: 'first', discount: 'SECRET' },
    { name: 'second', discount: 'ALSO' },
  ],
}

describe('stripPaths', () => {
  test('removes a top-level key entirely, not just its value', () => {
    const next = stripPaths(submission, [['employer']]) as Record<string, unknown>

    expect('employer' in next).toBe(false)
    expect(next['email']).toBe('a@b.ch')
  })

  test('removes a nested key while sharing untouched siblings by identity', () => {
    const next = stripPaths(submission, [['address', 'zip']]) as typeof submission

    expect('zip' in next.address).toBe(false)
    expect(next.address.city).toBe('Zurich')
    expect(next.items).toBe(submission.items)
  })

  test('removes a key inside one repeater row without disturbing other rows', () => {
    const next = stripPaths(submission, [['items', 0, 'discount']]) as typeof submission

    expect('discount' in next.items[0]!).toBe(false)
    expect(next.items[0]!.name).toBe('first')
    expect(next.items[1]).toBe(submission.items[1])
  })

  test('nulls an array slot rather than splicing, so sibling rows keep their positions', () => {
    const next = stripPaths(submission, [['items', 0]]) as typeof submission

    expect(next.items[0]).toBeNull()
    expect(next.items[1]).toBe(submission.items[1])
    expect(next.items).toHaveLength(2)
  })

  test('a path that does not exist is a no-op returning the same root', () => {
    expect(stripPaths(submission, [['ghost']])).toBe(submission)
    expect(stripPaths(submission, [['address', 'country']])).toBe(submission)
  })

  test('strips several paths in one pass', () => {
    const next = stripPaths(submission, [['employer'], ['address', 'zip']]) as Record<string, unknown>

    expect('employer' in next).toBe(false)
    expect('zip' in (next['address'] as object)).toBe(false)
  })

  test('an empty path list returns the same root', () => {
    expect(stripPaths(submission, [])).toBe(submission)
  })

  test('never mutates the input', () => {
    stripPaths(submission, [['employer'], ['items', 0, 'discount']])

    expect(submission.employer).toBe('ACME')
    expect(submission.items[0]!.discount).toBe('SECRET')
  })
})
