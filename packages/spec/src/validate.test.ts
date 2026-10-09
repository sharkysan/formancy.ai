import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { canonicalize } from './canonical.js'
import { schemaHash } from './hash.js'
import { CONTAINER_FIELD_TYPES, FIELD_TYPES } from './types.js'
import type { FieldDef, FormSchema } from './types.js'
import type { SchemaError, ValidationResult } from './validate.js'
import { validateSchema } from './validate.js'

const contactForm: FormSchema = {
  specVersion: '1',
  id: 'contact-us',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'textarea' },
    ],
  },
}

/** A deep clone with an edit applied, so no test can disturb another.
 *  JSON round-trip rather than structuredClone: this package must run
 *  unchanged in a browser and in Node, and a schema is JSON by definition. */
function revise(edit: (draft: FormSchema) => void): FormSchema {
  const draft = JSON.parse(JSON.stringify(contactForm)) as FormSchema
  edit(draft)
  return draft
}

/** The one error the document should produce, asserted to be the only one. */
function onlyError(result: ValidationResult): SchemaError {
  expect(result.valid).toBe(false)
  if (result.valid) throw new Error('expected an invalid result')
  expect(result.errors).toHaveLength(1)
  return result.errors[0]!
}

describe('validateSchema', () => {
  test('accepts a well-formed form and hands back the typed schema', () => {
    const result = validateSchema(contactForm)

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.schema).toEqual(contactForm)
  })
})

describe('validateSchema structural errors', () => {
  test('rejects a value that is not an object at all', () => {
    const error = onlyError(validateSchema('a form, honest'))

    expect(error.path).toBe('')
    expect(error.message).toContain('object')
  })

  test('points at a missing property by name', () => {
    const missingTitle = revise((draft) => {
      delete (draft as Partial<FormSchema>).title
    })

    expect(onlyError(validateSchema(missingTitle))).toEqual({
      path: '/title',
      message: 'Missing required property "title".',
      code: 'shape.required',
      values: { property: 'title' },
    })
  })

  test('rejects a field type that is not in the spec, and lists the ones that are', () => {
    const unknownType = revise((draft) => {
      draft.model.fields[0]!.type = 'phone' as never
    })
    const error = onlyError(validateSchema(unknownType))

    expect(error.path).toBe('/model/fields/0/type')
    expect(error.message).toContain('"phone"')
    expect(error.message).toContain('textarea')
  })

  test('rejects a key that would not survive as an identifier', () => {
    const dashedKey = revise((draft) => {
      draft.model.fields[0]!.key = 'e-mail'
    })
    const error = onlyError(validateSchema(dashedKey))

    expect(error.path).toBe('/model/fields/0/key')
    expect(error.message).toContain('"e-mail"')
    expect(error.message).toContain('key')
  })

  test('rejects a misspelled property rather than ignoring it', () => {
    const typo = revise((draft) => {
      Object.assign(draft.model.fields[0]!, { requird: true })
    })
    const error = onlyError(validateSchema(typo))

    expect(error.path).toBe('/model/fields/0/requird')
    expect(error.message).toContain('"requird"')
  })

  test('rejects child fields on a field type that cannot hold any', () => {
    const leafWithChildren = revise((draft) => {
      draft.model.fields[0]!.fields = [{ key: 'nested', type: 'text' }]
    })
    const error = onlyError(validateSchema(leafWithChildren))

    expect(error.path).toBe('/model/fields/0/fields')
    expect(error.message).toContain('repeater')
  })

  test('explains a malformed child list once, rather than also calling it unexpected', () => {
    const badChildren = revise((draft) => {
      draft.model.fields.push({ key: 'address', type: 'group', fields: 'nope' as never })
    })

    expect(onlyError(validateSchema(badChildren))).toEqual({
      path: '/model/fields/2/fields',
      message: 'Must be a list.',
      code: 'shape.array',
      values: {},
    })
  })

  test('and a list whose contents are wrong is not also an unknown property', () => {
    // ajv reports a property as unevaluated when the branch declaring it fails, so an
    // option value one character too long also said "Unknown property options. Check
    // the spelling" — telling an author to fix a word they spelled right.
    const longValue = revise((draft) => {
      draft.model.fields.push({
        key: 'pet',
        type: 'radio',
        options: [{ value: 'x'.repeat(201), label: 'Cat' }],
      })
    })

    expect(onlyError(validateSchema(longValue))).toMatchObject({
      path: '/model/fields/2/options/0/value',
      code: 'shape.maxLength',
    })
  })

  test('accepts child fields on a container', () => {
    const grouped = revise((draft) => {
      draft.model.fields.push({
        key: 'address',
        type: 'group',
        fields: [{ key: 'postcode', type: 'text' }],
      })
    })

    expect(validateSchema(grouped).valid).toBe(true)
  })
})

describe('validateSchema semantic rules', () => {
  // Beyond what JSON Schema can say: the four rules below are about the
  // relationship between fields, not the shape of any one of them.

  test('rejects two fields sharing one key, because a key is what identifies an answer', () => {
    const duplicated = revise((draft) => {
      draft.model.fields.push({ key: 'email', type: 'number' })
    })
    const error = onlyError(validateSchema(duplicated))

    expect(error.path).toBe('/model/fields/2/key')
    expect(error.message).toContain('"email"')
  })

  test('accepts a declared rename once the old key is gone', () => {
    const renamed = revise((draft) => {
      draft.model.fields[1] = { key: 'body', type: 'textarea', renamedFrom: 'message' }
    })

    expect(validateSchema(renamed).valid).toBe(true)
  })

  test('rejects renamedFrom naming a key that is still in use, because that is a copy', () => {
    const copy = revise((draft) => {
      draft.model.fields.push({ key: 'contact_email', type: 'text', renamedFrom: 'email' })
    })
    const error = onlyError(validateSchema(copy))

    expect(error.path).toBe('/model/fields/2/renamedFrom')
    expect(error.message).toContain('"email"')
  })

  test('rejects a field that says it was renamed from itself', () => {
    const selfRename = revise((draft) => {
      draft.model.fields[0]!.renamedFrom = 'email'
    })
    const error = onlyError(validateSchema(selfRename))

    expect(error.path).toBe('/model/fields/0/renamedFrom')
    expect(error.message).toContain('itself')
  })

  test('accepts a repeater holding ordinary fields', () => {
    const passengers = revise((draft) => {
      draft.model.fields.push({
        key: 'passengers',
        type: 'repeater',
        fields: [
          { key: 'passenger_name', type: 'text' },
          { key: 'passenger_details', type: 'group', fields: [{ key: 'seat', type: 'text' }] },
        ],
      })
    })

    expect(validateSchema(passengers).valid).toBe(true)
  })

  test('rejects a repeater directly inside a repeater, which the engine cannot render', () => {
    const nested = revise((draft) => {
      draft.model.fields.push({
        key: 'legs',
        type: 'repeater',
        fields: [{ key: 'stops', type: 'repeater' }],
      })
    })
    const error = onlyError(validateSchema(nested))

    expect(error.path).toBe('/model/fields/2/fields/0/type')
    expect(error.message).toContain('repeater')
  })

  test('rejects a repeater nested inside a repeater further down the tree', () => {
    const nested = revise((draft) => {
      draft.model.fields.push({
        key: 'legs',
        type: 'repeater',
        fields: [
          { key: 'leg_detail', type: 'group', fields: [{ key: 'stops', type: 'repeater' }] },
        ],
      })
    })
    const error = onlyError(validateSchema(nested))

    expect(error.path).toBe('/model/fields/2/fields/0/fields/0/type')
  })
})

/** Keys drawn from a small pool so that duplicates, renames pointing at a live
 *  key and renames pointing at nothing all turn up on their own. */
const arbKey = fc.oneof(
  { arbitrary: fc.constantFrom('email', 'message', 'total', 'a', '_b'), weight: 9 },
  { arbitrary: fc.string({ maxLength: 4 }), weight: 1 },
)

const arbLeafType = fc.constantFrom(
  ...FIELD_TYPES.filter((type) => !(CONTAINER_FIELD_TYPES as readonly string[]).includes(type)),
)

function arbField(depth: number): fc.Arbitrary<FieldDef> {
  const leaf = fc.record(
    { key: arbKey, type: arbLeafType, required: fc.boolean(), renamedFrom: arbKey },
    { requiredKeys: ['key', 'type'] },
  )
  if (depth === 0) return leaf

  const container = fc.record(
    {
      key: arbKey,
      type: fc.constantFrom(...CONTAINER_FIELD_TYPES),
      required: fc.boolean(),
      fields: fc.array(arbField(depth - 1), { maxLength: 3 }),
    },
    { requiredKeys: ['key', 'type', 'fields'] },
  )

  return fc.oneof(leaf, container)
}

const arbDocument = fc
  .record({
    specVersion: fc.constant('1' as const),
    id: fc.constantFrom('contact-us', 'expense.claim', 'f_1'),
    title: fc.string({ minLength: 1, maxLength: 20 }),
    fields: fc.array(arbField(2), { maxLength: 4 }),
  })
  .map(({ fields, ...rest }): FormSchema => ({ ...rest, model: { fields } }))

describe('validateSchema, canonicalize and schemaHash together', () => {
  // The three parts of this package only earn their keep as a chain: anything
  // validateSchema accepts is about to be hashed and stored against every
  // submission made under it, so a document it accepts but canonicalize
  // rejects would be an unpublishable form with no diagnosis.
  test('every accepted document canonicalizes and hashes without throwing', () => {
    let accepted = 0

    fc.assert(
      fc.property(arbDocument, (document) => {
        const result = validateSchema(document)
        if (!result.valid) return

        accepted += 1
        expect(schemaHash(result.schema)).toMatch(/^[0-9a-f]{64}$/)
        expect(canonicalize(JSON.parse(canonicalize(result.schema)))).toBe(
          canonicalize(result.schema),
        )
      }),
      { numRuns: 500 },
    )

    // Otherwise the property above passes by never accepting anything.
    expect(accepted).toBeGreaterThan(0)
  })

  test('the generator produces documents validateSchema rejects too', () => {
    const rejected = fc
      .sample(arbDocument, { numRuns: 500, seed: 1 })
      .filter((document) => !validateSchema(document).valid)

    expect(rejected.length).toBeGreaterThan(0)
  })
})

describe('renamedFrom uniqueness across fields', () => {
  test('two fields claiming the same dead key is rejected — a migration cannot map one column into two', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: {
        fields: [
          { key: 'new1', type: 'text', renamedFrom: 'old' },
          { key: 'new2', type: 'text', renamedFrom: 'old' },
        ],
      },
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.path === '/model/fields/1/renamedFrom')).toBe(true)
      expect(result.errors.some((e) => e.message.includes('"old"'))).toBe(true)
    }
  })
})

describe('error folding with several broken fields', () => {
  test('each bad field type lists the allowed values exactly once', () => {
    const result = validateSchema({
      specVersion: '1',
      id: 'f',
      title: 'T',
      model: {
        fields: [
          { key: 'a', type: 'phone' },
          { key: 'b', type: 'fax' },
        ],
      },
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      for (const error of result.errors) {
        const occurrences = error.message.split('textarea').length - 1
        expect(occurrences).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('span, which places a node across a table\u2019s columns', () => {
  /** The contact form with a two-column table around both its fields, which is the
   *  arrangement every case here varies. */
  function withTable(edit: (table: { columns: number; children: unknown[] }) => void): FormSchema {
    return revise((draft) => {
      const table = { kind: 'table', columns: 2, children: [
        { kind: 'field', path: 'email' },
        { kind: 'field', path: 'message' },
      ] }
      edit(table as unknown as { columns: number; children: unknown[] })
      draft.specVersion = '2'
      draft.layouts = [{ name: 'default', nodes: [table] }] as NonNullable<FormSchema['layouts']>
    })
  }

  test('a child may take the whole width', () => {
    // The report this exists for: a rich text editor and a file dropzone at half
    // width inside a two-column table, because a table child took one column and
    // there was no way to say otherwise.
    const result = validateSchema(
      withTable((table) => {
        ;(table.children[1] as { span?: unknown }).span = 'all'
      }),
    )
    expect(result.valid).toBe(true)
  })

  test('a child may take some of the columns', () => {
    const result = validateSchema(
      withTable((table) => {
        table.columns = 3
        ;(table.children[0] as { span?: unknown }).span = 2
      }),
    )
    expect(result.valid).toBe(true)
  })

  test('refuses a span wider than the table it is in', () => {
    // Not clamped, because an author who writes 4 in a two-column table believes
    // they configured something. Silently narrowing it is the shape of failure
    // this format refuses everywhere else.
    const error = onlyError(
      validateSchema(
        withTable((table) => {
          ;(table.children[0] as { span?: unknown }).span = 4
        }),
      ),
    )
    expect(error.path).toBe('/layouts/0/nodes/0/children/0/span')
    expect(error.message).toContain('2')
  })

  test('refuses a span on a node that is not in a table', () => {
    // The whole reason the property is allowed to exist: a span outside a table
    // validated and did nothing would be the documented-but-inert failure this
    // repository has shipped once already.
    const error = onlyError(
      validateSchema(
        revise((draft) => {
          draft.specVersion = '2'
            draft.layouts = [
            {
              name: 'default',
              nodes: [
                {
                  kind: 'section',
                  label: 'About',
                  children: [{ kind: 'field', path: 'email', span: 'all' }],
                },
                { kind: 'field', path: 'message' },
              ],
            },
          ] as unknown as NonNullable<FormSchema['layouts']>
        }),
      ),
    )
    expect(error.path).toBe('/layouts/0/nodes/0/children/0/span')
    expect(error.message).toContain('table')
  })

  test('a table may itself span, when it is inside another table', () => {
    // Nesting is legal, so the rule is about the PARENT and not about the kind of
    // the node carrying the property.
    const result = validateSchema(
      revise((draft) => {
        draft.specVersion = '2'
        draft.layouts = [
          {
            name: 'default',
            nodes: [
              {
                kind: 'table',
                columns: 2,
                children: [
                  {
                    kind: 'table',
                    columns: 2,
                    span: 'all',
                    children: [
                      { kind: 'field', path: 'email' },
                      { kind: 'field', path: 'message' },
                    ],
                  },
                ],
              },
            ],
          },
        ] as unknown as NonNullable<FormSchema['layouts']>
      }),
    )
    expect(result.valid).toBe(true)
  })

  test('a document with no span is exactly as valid as before', () => {
    // The guard on the guard: a rule that refused something it should not would
    // be caught here rather than by every other case going red at once.
    expect(validateSchema(withTable(() => {})).valid).toBe(true)
  })
})

/**
 * `optionsSource` — a select whose answers come from the deployment.
 *
 * The document says WHICH list; the deployment says WHERE. Never an address: a
 * URL in a form document is a deployment detail in a portable format, so the
 * same form moved from staging to production would point at the wrong system —
 * and a published version is frozen forever, so it could never be corrected. It
 * is also attacker-influenceable, and a self-hosted instance sits inside a
 * private network.
 */
describe('optionsSource', () => {
  const sourced = (edit: (field: Record<string, unknown>) => void): FormSchema =>
    revise((draft) => {
      draft.specVersion = '2'
      const field: Record<string, unknown> = {
        key: 'canton',
        type: 'select',
        label: 'Canton',
        optionsSource: 'cantons',
      }
      edit(field)
      draft.model.fields = [field as unknown as FieldDef]
    })

  test('a select may name a source instead of listing its answers', () => {
    expect(validateSchema(sourced(() => {})).valid).toBe(true)
  })

  test('refuses a field that both lists options and names a source', () => {
    // Two answers to "what may be chosen" and no rule for which wins. The schema
    // refuses it with `not: { required: [options, optionsSource] }`; this message
    // exists because ajv's phrasing for a failed `not` is "must NOT be valid", which
    // tells an author nothing about what they did.
    const error = onlyError(
      validateSchema(
        sourced((field) => {
          field['options'] = [{ value: 'ZH', label: 'Zürich' }]
        }),
      ),
    )
    expect(error.message).toContain('remove the list')
  })

  test('refuses a name that is not a name', () => {
    // A bounded, lower-case, hyphenated word: enumerable in a deployment's
    // configuration, greppable across published versions, and unmistakably not an
    // address — which is the property the whole design rests on.
    for (const bad of ['https://example.test/cantons', 'Cantons', '', 'a b']) {
      expect(validateSchema(sourced((field) => (field['optionsSource'] = bad))).valid, bad).toBe(
        false,
      )
    }
  })

  test('accepts the shapes a deployment would actually configure', () => {
    for (const good of ['cantons', 'sap-cost-centres', 'people2']) {
      expect(validateSchema(sourced((field) => (field['optionsSource'] = good))).valid, good).toBe(
        true,
      )
    }
  })

  test('only a select, because the other choosers have nothing to narrow', () => {
    // A source returning a thousand rows renders a thousand radios. The multi-answer
    // picker is foreclosed separately, and this does not un-foreclose it.
    for (const type of ['radio', 'selectboxes', 'text']) {
      const result = validateSchema(
        sourced((field) => {
          field['type'] = type
          if (type !== 'text') field['options'] = undefined
        }),
      )
      expect(result.valid, type).toBe(false)
    }
  })

  test('needs version 2, and a version 1 reader refuses the whole document', () => {
    // The schema is closed, so a version 1 reader answers `Unknown property
    // "optionsSource"` and rejects everything rather than rendering a select with no
    // options — which would be the same field quietly collecting nothing. Saying so
    // here is the only place the author finds out: they cannot see that reader.
    const error = onlyError(
      validateSchema(
        revise((draft) => {
          draft.model.fields = [
            { key: 'canton', type: 'select', optionsSource: 'cantons' } as unknown as FieldDef,
          ]
        }),
      ),
    )
    expect(error.path).toBe('/model/fields/0/optionsSource')
    expect(error.message).toContain('specVersion "2"')
  })

  test('a select that lists its options is exactly as valid as before', () => {
    // The guard on the guard: a rule that refused the ordinary case would be caught
    // here rather than by every other test going red at once.
    expect(
      validateSchema(
        revise((draft) => {
          draft.model.fields = [
            {
              key: 'canton',
              type: 'select',
              options: [{ value: 'ZH', label: 'Zürich' }],
            } as unknown as FieldDef,
          ]
        }),
      ).valid,
    ).toBe(true)
  })
})
