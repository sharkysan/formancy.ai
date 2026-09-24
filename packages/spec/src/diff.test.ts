import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { diffSchemas } from './diff.js'
import type { FormSchema } from './types.js'

const base: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'textarea' },
    ],
  },
}

/** A deep clone with an edit applied, so tests never mutate `base`.
 *  JSON round-trip rather than structuredClone: this package must not depend
 *  on Node or DOM globals, and schemas are JSON by definition. */
function clone(schema: FormSchema): FormSchema {
  return JSON.parse(JSON.stringify(schema)) as FormSchema
}

function revise(edit: (draft: FormSchema) => void): FormSchema {
  const draft = clone(base)
  edit(draft)
  return draft
}

describe('diffSchemas', () => {
  test('reports no changes for a schema against itself', () => {
    expect(diffSchemas(base, base)).toEqual([])
  })

  test('reports no changes when only key order differs', () => {
    const reordered = { title: base.title, model: base.model, id: base.id, specVersion: base.specVersion }
    expect(diffSchemas(base, reordered as FormSchema)).toEqual([])
  })
})

/** The one change in the diff, asserted to be the only one. */
function only(changes: ReturnType<typeof diffSchemas>) {
  expect(changes).toHaveLength(1)
  return changes[0]!
}

describe('diffSchemas severity', () => {
  test('adding an optional field is compatible', () => {
    const after = revise((d) => {
      d.model.fields.push({ key: 'company', type: 'text' })
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.added',
      severity: 'compatible',
      path: 'model.fields.company',
    })
  })

  test('adding a required field is lossy, because existing submissions lack it', () => {
    const after = revise((d) => {
      d.model.fields.push({ key: 'company', type: 'text', required: true })
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.added',
      severity: 'lossy',
    })
  })

  test('removing a field is lossy', () => {
    const after = revise((d) => {
      d.model.fields = d.model.fields.filter((f) => f.key !== 'message')
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.removed',
      severity: 'lossy',
      path: 'model.fields.message',
    })
  })

  test('a declared rename is compatible, because old data can be mapped across', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'body', type: 'textarea', renamedFrom: 'message' }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.renamed',
      severity: 'compatible',
      path: 'model.fields.body',
    })
  })

  test('an undeclared rename is lossy, and is not silently treated as a rename', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'body', type: 'textarea' }
    })

    const changes = diffSchemas(base, after)
    expect(changes.map((c) => c.kind).sort()).toEqual(['field.added', 'field.removed'])
    expect(changes.some((c) => c.severity === 'lossy')).toBe(true)
  })

  test('changing a field type is lossy', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'message', type: 'text' }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.typeChanged',
      severity: 'lossy',
    })
  })

  test('relaxing a required field is compatible', () => {
    const after = revise((d) => {
      d.model.fields[0] = { key: 'email', type: 'text', required: false }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.requiredRelaxed',
      severity: 'compatible',
    })
  })

  test('tightening a field to required is lossy', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'message', type: 'textarea', required: true }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.requiredTightened',
      severity: 'lossy',
    })
  })

  test('moving up a spec version is compatible, because the newer one only adds', () => {
    // This rule was written as "any bump is breaking" before spec 2 existed,
    // which was the safe guess and turned out to be the wrong one: version 2
    // adds field types and layout kinds and removes nothing, so every answer
    // keeps its path and nothing has to be rebound.
    const after = { ...clone(base), specVersion: '2' as const }

    expect(diffSchemas(base, after)).toContainEqual(
      expect.objectContaining({ kind: 'specVersion.changed', severity: 'compatible' }),
    )
  })

  test('moving down one is breaking, because what the newer version added cannot be expressed', () => {
    const before = { ...clone(base), specVersion: '2' as const }
    const after = { ...clone(base), specVersion: '1' as const }

    expect(diffSchemas(before, after)).toContainEqual(
      expect.objectContaining({ kind: 'specVersion.changed', severity: 'breaking' }),
    )
  })

  test('reordering fields is not a change, because keys carry identity', () => {
    const after = revise((d) => {
      d.model.fields.reverse()
    })

    expect(diffSchemas(base, after)).toEqual([])
  })
})

const fieldTypes = ['text', 'textarea', 'number', 'checkbox', 'select', 'radio', 'date'] as const

const arbField = fc.record(
  {
    key: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
    type: fc.constantFrom(...fieldTypes),
    required: fc.boolean(),
  },
  { requiredKeys: ['key', 'type'] },
)

const arbSchema = fc
  .record({
    specVersion: fc.constant('1' as const),
    id: fc.string({ minLength: 1, maxLength: 8 }),
    title: fc.string({ maxLength: 20 }),
    fields: fc.uniqueArray(arbField, { maxLength: 8, selector: (f) => f.key }),
  })
  .map(({ fields, ...rest }): FormSchema => ({ ...rest, model: { fields } }))

describe('diffSchemas invariants', () => {
  test('a schema never differs from itself', () => {
    fc.assert(
      fc.property(arbSchema, (schema) => {
        expect(diffSchemas(schema, schema)).toEqual([])
      }),
    )
  })

  test('never reports a change without a severity and a path', () => {
    fc.assert(
      fc.property(arbSchema, arbSchema, (before, after) => {
        for (const change of diffSchemas(before, after)) {
          expect(change.severity).toMatch(/^(compatible|lossy|breaking)$/)
          expect(change.path.length).toBeGreaterThan(0)
          expect(change.detail.length).toBeGreaterThan(0)
        }
      }),
    )
  })
})

describe('diffSchemas inside containers', () => {
  const nested: FormSchema = {
    specVersion: '1',
    id: 'f',
    title: 'T',
    model: {
      fields: [
        {
          key: 'g',
          type: 'group',
          fields: [
            { key: 'child', type: 'text', required: true },
            { key: 'other', type: 'text' },
          ],
        },
        {
          key: 'items',
          type: 'repeater',
          fields: [{ key: 'name', type: 'text' }],
        },
      ],
    },
  }

  test('deleting a required field inside a group is lossy — the reviewer repro', () => {
    const after = clone(nested)
    after.model.fields[0]!.fields = after.model.fields[0]!.fields!.filter((f) => f.key !== 'child')

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.removed', severity: 'lossy', path: 'model.fields.g.child' }),
    )
  })

  test('changing a nested field type is lossy', () => {
    const after = clone(nested)
    after.model.fields[0]!.fields![0] = { key: 'child', type: 'number', required: true }

    expect(diffSchemas(nested, after)).toContainEqual(
      expect.objectContaining({ kind: 'field.typeChanged', severity: 'lossy', path: 'model.fields.g.child' }),
    )
  })

  test('tightening a repeater template field is lossy, reported at the row-scoped path', () => {
    const after = clone(nested)
    after.model.fields[1]!.fields![0] = { key: 'name', type: 'text', required: true }

    expect(diffSchemas(nested, after)).toContainEqual(
      expect.objectContaining({
        kind: 'field.requiredTightened',
        severity: 'lossy',
        path: 'model.fields.items[].name',
      }),
    )
  })

  test('a declared rename inside a group maps data across as compatible', () => {
    const after = clone(nested)
    after.model.fields[0]!.fields![0] = { key: 'kid', type: 'text', required: true, renamedFrom: 'child' }

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.renamed', severity: 'compatible', path: 'model.fields.g.kid' }),
    )
    expect(changes.some((c) => c.kind === 'field.removed')).toBe(false)
  })

  test('renaming a group with renamedFrom carries its children along — no spurious removals', () => {
    const after = clone(nested)
    after.model.fields[0] = { ...after.model.fields[0]!, key: 'g2', renamedFrom: 'g' }

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.renamed', severity: 'compatible', path: 'model.fields.g2' }),
    )
    expect(changes.filter((c) => c.kind === 'field.removed')).toEqual([])
    expect(changes.filter((c) => c.kind === 'field.added')).toEqual([])
  })

  test('turning a group into a repeater is a lossy type change and re-homes every child', () => {
    const after = clone(nested)
    after.model.fields[0] = { ...after.model.fields[0]!, type: 'repeater' }

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.typeChanged', severity: 'lossy', path: 'model.fields.g' }),
    )
    // Children move from g.child to g[].child — a different data shape.
    expect(changes.some((c) => c.kind === 'field.removed' && c.path === 'model.fields.g.child')).toBe(true)
  })
})

describe('diffSchemas and pages', () => {
  const paged: FormSchema = {
    specVersion: '1',
    id: 'f',
    title: 'T',
    model: {
      fields: [
        { key: 'p1', type: 'page', fields: [{ key: 'email', type: 'text' }] },
        { key: 'p2', type: 'page', fields: [{ key: 'message', type: 'text' }] },
      ],
    },
  }

  test('moving a field to another page is NO change: pages scope presentation, not data', () => {
    const after = clone(paged)
    after.model.fields[0]!.fields = []
    after.model.fields[1]!.fields = [{ key: 'email', type: 'text' }, { key: 'message', type: 'text' }]

    expect(diffSchemas(paged, after)).toEqual([])
  })

  test('moving a field INTO a group changes its data path and is reported as remove plus add', () => {
    const after = clone(paged)
    after.model.fields[0]!.fields = [{ key: 'wrap', type: 'group', fields: [{ key: 'email', type: 'text' }] }]

    const kinds = diffSchemas(paged, after).map((c) => c.kind).sort()
    expect(kinds).toContain('field.removed')
    expect(kinds).toContain('field.added')
  })
})
