import { describe, expect, test } from 'vitest'
import { validateSchema } from '@formancy/spec/validate'
import { STARTER_SCHEMA } from './starter.js'

describe('the starter schema', () => {
  test('validates against the spec — the demo must never open on an error screen', () => {
    const result = validateSchema(STARTER_SCHEMA)
    expect(result).toMatchObject({ valid: true })
  })
})
