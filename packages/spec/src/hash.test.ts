import { describe, expect, test } from 'vitest'
import { schemaHash } from './hash.js'

describe('schemaHash', () => {
  test('is identical for schemas differing only in key order', () => {
    const a = { specVersion: '1', title: 'Contact', model: { fields: [] } }
    const b = { model: { fields: [] }, title: 'Contact', specVersion: '1' }

    expect(schemaHash(a)).toBe(schemaHash(b))
  })

  test('changes when any value changes', () => {
    const before = { specVersion: '1', title: 'Contact' }
    const after = { specVersion: '1', title: 'Contact us' }

    expect(schemaHash(after)).not.toBe(schemaHash(before))
  })

  test('is a lowercase 64-character hex sha256 digest', () => {
    expect(schemaHash({ specVersion: '1' })).toMatch(/^[0-9a-f]{64}$/)
  })
})
