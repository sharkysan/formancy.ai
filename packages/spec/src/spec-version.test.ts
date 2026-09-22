import { describe, expect, test } from 'vitest'
import { CURRENT_SPEC_VERSION, SPEC_1_FIELD_TYPES, SPEC_VERSIONS } from './types.js'
import type { FormSchema } from './types.js'
import { upgradeSpecVersion } from './upgrade.js'
import { validateSchema } from './validate.js'

/**
 * Two versions of the document format, and the one rule that keeps them
 * honest: version 2 only adds.
 *
 * The line is drawn by what a READER must understand, not by what a document
 * happens to contain. That is why a `selectboxes` field in a document
 * declaring version 1 is an error rather than a courtesy: an implementation
 * that has never heard of the type would drop the answer, and drop it quietly.
 */
const spec1 = (over: Partial<FormSchema> = {}): FormSchema => ({
  specVersion: '1',
  id: 'contact',
  title: 'Contact us',
  model: { fields: [{ key: 'email', type: 'text' }] },
  ...over,
})

const errorsOf = (document: FormSchema): string[] => {
  const result = validateSchema(document)
  return result.valid ? [] : result.errors.map((error) => error.message)
}

describe('what each version defines', () => {
  test('the versions this package speaks are 1 and 2, newest by default', () => {
    expect([...SPEC_VERSIONS]).toEqual(['1', '2'])
    expect(CURRENT_SPEC_VERSION).toBe('2')
  })

  test('version 2 is a superset: every version 1 type is still a version 2 type', () => {
    const asTwo: FormSchema = {
      ...spec1({
        model: {
          fields: SPEC_1_FIELD_TYPES.filter((type) => type !== 'page').map((type, index) => ({
            key: `f${String(index)}`,
            type,
            ...(type === 'select' || type === 'radio'
              ? { options: [{ value: 'a', label: 'A' }] }
              : {}),
          })),
        },
      }),
      specVersion: '2',
    }

    expect(validateSchema(asTwo).valid).toBe(true)
  })
})

describe('a version 2 construct in a version 1 document', () => {
  test('is refused by name, with the fix in the message', () => {
    const document = spec1({
      model: { fields: [{ key: 'topics', type: 'selectboxes', options: [{ value: 'a', label: 'A' }] }] },
    })

    const messages = errorsOf(document)
    expect(messages).toHaveLength(1)
    // Named, not "must match exactly one schema in oneOf". A form author has
    // to be able to act on this without reading the JSON Schema.
    expect(messages[0]).toContain('"selectboxes"')
    expect(messages[0]).toContain('specVersion "2"')
  })

  test.each(['selectboxes', 'file', 'richtext'] as const)('refuses a %s field', (type) => {
    const document = spec1({
      model: {
        fields: [
          {
            key: 'x',
            type,
            ...(type === 'selectboxes' ? { options: [{ value: 'a', label: 'A' }] } : {}),
          },
        ],
      },
    })

    expect(errorsOf(document)).toHaveLength(1)
  })

  test('refuses a version 2 layout kind, however deeply it is buried', () => {
    const document = spec1({
      layouts: [
        {
          name: 'web',
          nodes: [
            {
              kind: 'section',
              label: 'Details',
              children: [{ kind: 'table', columns: 2, children: [{ kind: 'field', path: 'email' }] }],
            },
          ],
        },
      ],
    })

    const messages = errorsOf(document)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('"table"')
  })

  test('accepts the same document once it declares version 2', () => {
    const document: FormSchema = {
      ...spec1({
        model: { fields: [{ key: 'topics', type: 'selectboxes', options: [{ value: 'a', label: 'A' }] }] },
      }),
      specVersion: '2',
    }

    expect(validateSchema(document).valid).toBe(true)
  })
})

describe('upgradeSpecVersion', () => {
  test('is a one-line change, because there is nothing else to do', () => {
    const before = spec1()

    const after = upgradeSpecVersion(before)

    expect(after.specVersion).toBe('2')
    expect({ ...after, specVersion: '1' }).toEqual(before)
  })

  test('hands back the same document when it is already there', () => {
    const already: FormSchema = { ...spec1(), specVersion: '2' }

    expect(upgradeSpecVersion(already)).toBe(already)
  })

  test('refuses to go backwards rather than quietly dropping what it cannot express', () => {
    const two: FormSchema = { ...spec1(), specVersion: '2' }

    // The plausible-looking answers — drop the field, or turn it into a text
    // box — are both silent data loss wearing the word "conversion".
    expect(() => upgradeSpecVersion(two, '1')).toThrow(/data loss/)
  })

  test('an upgraded version 1 document still validates', () => {
    expect(validateSchema(upgradeSpecVersion(spec1())).valid).toBe(true)
  })
})

describe('the new version 2 constructs', () => {
  const spec2 = (over: Partial<FormSchema>): FormSchema => ({
    specVersion: '2',
    id: 'wide',
    title: 'Wide',
    model: { fields: [{ key: 'email', type: 'text' }] },
    ...over,
  })

  test('a tabs node holds sections, one per tab', () => {
    const document = spec2({
      layouts: [
        {
          name: 'web',
          nodes: [
            {
              kind: 'tabs',
              children: [
                { kind: 'section', label: 'Your details', children: [{ kind: 'field', path: 'email' }] },
              ],
            },
          ],
        },
      ],
    })

    expect(validateSchema(document).valid).toBe(true)
  })

  test('a tab with no name is refused, because nobody can choose it', () => {
    const document = spec2({
      layouts: [
        {
          name: 'web',
          nodes: [
            { kind: 'tabs', children: [{ kind: 'section', children: [{ kind: 'field', path: 'email' }] }] },
          ],
        },
      ],
    })

    expect(errorsOf(document)[0]).toContain('no name')
  })

  test('a tabs node holding something other than a section says what to do about it', () => {
    const document = spec2({
      layouts: [
        { name: 'web', nodes: [{ kind: 'tabs', children: [{ kind: 'field', path: 'email' }] }] },
      ],
    })

    expect(errorsOf(document)[0]).toContain('Wrap it in a section')
  })

  test('a tabs node with no tabs shows nothing at all', () => {
    const document = spec2({
      layouts: [{ name: 'web', nodes: [{ kind: 'tabs', children: [] }] }],
    })

    // Caught structurally by minItems before the semantic rule sees it; either
    // way the document is refused, which is what this pins.
    expect(validateSchema(document).valid).toBe(false)
  })

  test('a table declares how many columns it has at full width', () => {
    const document = spec2({
      layouts: [
        {
          name: 'web',
          nodes: [{ kind: 'table', columns: 3, children: [{ kind: 'field', path: 'email' }] }],
        },
      ],
    })

    expect(validateSchema(document).valid).toBe(true)
  })

  test('a file field carries what it will accept and how large', () => {
    const document = spec2({
      model: {
        fields: [
          {
            key: 'evidence',
            type: 'file',
            accept: ['application/pdf', '.png'],
            maxFileSize: 5_000_000,
            maxItems: 3,
          },
        ],
      },
    })

    expect(validateSchema(document).valid).toBe(true)
  })

  test('a selectboxes field bounds how many may be ticked', () => {
    const document = spec2({
      model: {
        fields: [
          {
            key: 'topics',
            type: 'selectboxes',
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
            minItems: 1,
            maxItems: 2,
          },
        ],
      },
    })

    expect(validateSchema(document).valid).toBe(true)
  })

  test('a selectboxes field still needs options, like every other choice field', () => {
    const document = spec2({
      model: { fields: [{ key: 'topics', type: 'selectboxes', options: [] }] },
    })

    expect(validateSchema(document).valid).toBe(false)
  })
})
