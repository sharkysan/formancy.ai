import { describe, expect, test } from 'vitest'
import { validateSchema } from '@formancy/spec/validate'
import { CONTAINER_FIELD_TYPES, FIELD_TYPES } from '@formancy/spec'
import type { FieldDef, FieldType } from '@formancy/spec'
import { STARTER_SCHEMA } from './starter.js'

describe('the starter schema', () => {
  test('validates against the spec — the demo must never open on an error screen', () => {
    const result = validateSchema(STARTER_SCHEMA)
    expect(result).toMatchObject({ valid: true })
  })

  /**
   * The demo's own claim, enforced.
   *
   * The intro used to say "every field type the spec defines" while the
   * document declared `specVersion: '1'` — so `selectboxes`, `file` and
   * `richtext` were not in it and could not be, and the builder correctly
   * refused to add one. The form advertised everything and the palette said
   * no. Nothing failed: the demo simply did not contain what it said it did,
   * and only somebody going looking for a rich text field would find out.
   */
  const typesUsed = (fields: readonly FieldDef[]): Set<FieldType> => {
    const seen = new Set<FieldType>()
    const walk = (list: readonly FieldDef[]): void => {
      for (const field of list) {
        seen.add(field.type)
        if (field.fields !== undefined) walk(field.fields)
      }
    }
    walk(fields)
    return seen
  }

  test('contains every field type it claims to', () => {
    const seen = typesUsed(STARTER_SCHEMA.model.fields as readonly FieldDef[])

    // `group` and `page` are the two that nest a form inside a form: a page
    // turns this into a wizard and a group changes the shape of the data.
    // The intro says "except the two that nest", so those two are the
    // exclusions and there are no others.
    const nesting: readonly FieldType[] = ['group', 'page']
    const expected = FIELD_TYPES.filter((type) => !nesting.includes(type))

    expect([...seen].sort()).toEqual([...expected].sort())
  })

  test('is a version 2 document, because three of those types need one', () => {
    // Not cosmetic. A version 1 document may not contain a version 2
    // construct, and `validateSchema` refuses one by name — which is what
    // made the field types above unreachable in the builder.
    expect(STARTER_SCHEMA.specVersion).toBe('2')
  })

  test('uses the layout kinds version 2 added, not only the version 1 ones', () => {
    const kinds = new Set<string>()
    const walk = (nodes: readonly { kind: string; children?: readonly unknown[] }[]): void => {
      for (const node of nodes) {
        kinds.add(node.kind)
        if (node.children !== undefined) {
          walk(node.children as readonly { kind: string; children?: readonly unknown[] }[])
        }
      }
    }
    walk(STARTER_SCHEMA.layouts[0]!.nodes as readonly { kind: string }[])

    expect(kinds).toContain('tabs')
    expect(kinds).toContain('table')
  })

  test('every container type the spec has is either used or deliberately absent', () => {
    // A guard on the guard: if the spec grows a container type, the exclusion
    // list above stops being a complete account of what is missing and this
    // says so rather than letting the claim quietly rot.
    expect(CONTAINER_FIELD_TYPES).toEqual(['group', 'page', 'repeater'])
  })
})
