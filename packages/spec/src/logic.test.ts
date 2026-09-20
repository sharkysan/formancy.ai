import { describe, expect, test } from 'vitest'
import type { FormSchema } from './types.js'
import { modelDataPaths } from './paths.js'
import { validateSchema } from './validate.js'

const base: FormSchema = {
  specVersion: '1',
  id: 'f',
  title: 'T',
  model: {
    fields: [
      { key: 'country', type: 'select' },
      { key: 'p', type: 'page', fields: [{ key: 'canton', type: 'text' }] },
      { key: 'address', type: 'group', fields: [{ key: 'city', type: 'text' }] },
      { key: 'items', type: 'repeater', fields: [{ key: 'qty', type: 'number' }] },
    ],
  },
}

describe('modelDataPaths', () => {
  test('lists data paths: pages transparent, groups nested, repeater rows marked', () => {
    expect(modelDataPaths(base.model)).toEqual([
      'country',
      'canton',
      'address',
      'address.city',
      'items',
      'items[].qty',
    ])
  })
})

describe('logic section validation', () => {
  test('accepts rules whose targets exist in the model', () => {
    const document: FormSchema = {
      ...base,
      logic: {
        rules: [
          { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
          { target: 'canton', kind: 'validate', cel: 'canton != ""', code: 'required' },
        ],
      },
    }

    expect(validateSchema(document).valid).toBe(true)
  })

  test('rejects a rule whose target names no model path', () => {
    const result = validateSchema({
      ...base,
      logic: { rules: [{ target: 'ghost', kind: 'visible', cel: 'true' }] },
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.path === '/logic/rules/0/target' && e.message.includes('ghost'))).toBe(true)
    }
  })

  test('rejects two rules of the same non-validate kind on one target — which would win?', () => {
    const result = validateSchema({
      ...base,
      logic: {
        rules: [
          { target: 'canton', kind: 'visible', cel: 'true' },
          { target: 'canton', kind: 'visible', cel: 'false' },
        ],
      },
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.path === '/logic/rules/1')).toBe(true)
    }
  })

  test('allows several validate rules on one target — each is its own check', () => {
    const document: FormSchema = {
      ...base,
      logic: {
        rules: [
          { target: 'canton', kind: 'validate', cel: 'size(canton) > 1', code: 'tooShort' },
          { target: 'canton', kind: 'validate', cel: 'size(canton) < 30', code: 'tooLong' },
        ],
      },
    }

    expect(validateSchema(document).valid).toBe(true)
  })

  test('accepts clearOnHide on a model field', () => {
    const document: FormSchema = {
      ...base,
      model: { fields: [{ key: 'a', type: 'text', clearOnHide: false }] },
    }

    expect(validateSchema(document).valid).toBe(true)
  })
})

describe('v0 presentation-lite properties', () => {
  test('a labelled field with options, add/remove labels and minItems validates', () => {
    const document: FormSchema = {
      specVersion: '1',
      id: 'order',
      title: 'Order',
      model: {
        fields: [
          {
            key: 'country',
            type: 'select',
            label: 'Country',
            options: [
              { value: 'CH', label: 'Switzerland' },
              { value: 'DE', label: 'Germany' },
            ],
          },
          {
            key: 'items',
            type: 'repeater',
            label: 'Items',
            minItems: 1,
            maxItems: 10,
            addLabel: 'Add item',
            removeLabel: 'Remove item',
            fields: [{ key: 'name', type: 'text', label: 'Name' }],
          },
        ],
      },
    }

    expect(validateSchema(document).valid).toBe(true)
  })

  test('options on a non-choice field are rejected', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: {
        fields: [{ key: 'a', type: 'text', options: [{ value: 'x', label: 'X' }] }],
      },
    })

    expect(result.valid).toBe(false)
  })

  test('an option needs both value and label', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: { fields: [{ key: 'a', type: 'select', options: [{ value: 'x' }] }] },
    })

    expect(result.valid).toBe(false)
  })
})

describe('v0.1 model validators', () => {
  test('numeric bounds on a number field, text bounds and pattern and format on text fields', () => {
    const document: FormSchema = {
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: {
        fields: [
          { key: 'qty', type: 'number', min: 1, max: 100 },
          { key: 'name', type: 'text', minLength: 2, maxLength: 50, pattern: '^[A-Z]' },
          { key: 'email', type: 'text', format: 'email' },
          { key: 'site', type: 'text', format: 'url' },
          { key: 'ref', type: 'text', format: 'uuid' },
        ],
      },
    }

    expect(validateSchema(document).valid).toBe(true)
  })

  test('numeric bounds on a text field are rejected', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: { fields: [{ key: 'a', type: 'text', min: 1 }] },
    })
    expect(result.valid).toBe(false)
  })

  test('an unknown format is rejected', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: { fields: [{ key: 'a', type: 'text', format: 'phone' }] },
    })
    expect(result.valid).toBe(false)
  })

  test('a pattern that is not a valid regular expression is rejected semantically', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: { fields: [{ key: 'a', type: 'text', pattern: '([' }] },
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.path === '/model/fields/0/pattern')).toBe(true)
    }
  })
})

describe('pages are top-level only', () => {
  test('a page inside a group is rejected — a wizard step is not a data container', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: {
        fields: [
          {
            key: 'wrap',
            type: 'group',
            fields: [{ key: 'step', type: 'page', fields: [{ key: 'a', type: 'text' }] }],
          },
        ],
      },
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.path.includes('/fields/0/type'))).toBe(true)
    }
  })

  test('a page inside a repeater is rejected too', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: {
        fields: [
          {
            key: 'rows',
            type: 'repeater',
            fields: [{ key: 'step', type: 'page', fields: [{ key: 'a', type: 'text' }] }],
          },
        ],
      },
    })

    expect(result.valid).toBe(false)
  })

  test('a page at the top level is fine, and so is a group inside it', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: {
        fields: [
          {
            key: 'step',
            type: 'page',
            fields: [{ key: 'g', type: 'group', fields: [{ key: 'a', type: 'text' }] }],
          },
        ],
      },
    })

    expect(result.valid).toBe(true)
  })
})

describe('runsOn', () => {
  const withRule = (rule: Record<string, unknown>): FormSchema =>
    ({
      specVersion: '1',
      id: 'f',
      title: 'F',
      model: { fields: [{ key: 'email', type: 'text' }] },
      logic: { rules: [rule] },
    }) as unknown as FormSchema

  test('a validate rule may choose where it runs', () => {
    const result = validateSchema(
      withRule({ target: 'email', kind: 'validate', cel: 'true', code: 'x', runsOn: 'server' }),
    )

    expect(result.valid).toBe(true)
  })

  test('a metadata rule may not, because the server could no longer check the client', () => {
    const result = validateSchema(
      withRule({ target: 'email', kind: 'visible', cel: 'true', runsOn: 'client' }),
    )

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.errors.map((error) => error.path)).toContain('/logic/rules/0/runsOn')
  })

  test('an unknown side is refused by the schema itself', () => {
    const result = validateSchema(
      withRule({ target: 'email', kind: 'validate', cel: 'true', code: 'x', runsOn: 'nowhere' }),
    )

    expect(result.valid).toBe(false)
  })
})
