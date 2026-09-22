import { describe, expect, test } from 'vitest'
import { createBuilderSession } from '@formancy/builder-core'
import { FIELD_TYPES, SPEC_1_FIELD_TYPES } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { newFieldOfType, paletteEntries, typesNeedingUpgrade } from './palette.js'

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: { fields: [{ key: 'text', type: 'text', label: 'Existing' }] },
}

describe('paletteEntries', () => {
  test('are the schema’s own types, named in its own words', () => {
    const entries = paletteEntries()
    const text = entries.find((entry) => entry.type === 'text')

    expect(text?.title).toBe('Single-line text')
    expect(text?.description).toContain('One line of free text')
  })

  test('leaves out page, whose placement is not a palette choice', () => {
    // A page may only sit at the top level, so offering it against any
    // container would offer a choice that is refused most of the time.
    expect(paletteEntries().map((entry) => entry.type)).not.toContain('page')
  })

  test('covers everything else the spec defines', () => {
    // Derived rather than listed: the palette is generated from the schema
    // precisely so a new type appears in it without anyone remembering, and a
    // literal list here would be the one place that still had to be edited.
    expect(paletteEntries().map((entry) => entry.type)).toEqual(
      FIELD_TYPES.filter((type) => type !== 'page'),
    )
  })

  test('a version 1 document is offered only what version 1 defines', () => {
    const offered = paletteEntries('1').map((entry) => entry.type)

    expect(offered).toEqual(SPEC_1_FIELD_TYPES.filter((type) => type !== 'page'))
    expect(offered).not.toContain('selectboxes')
  })

  test('a version 2 document is offered everything', () => {
    expect(paletteEntries('2').map((entry) => entry.type)).toContain('selectboxes')
  })

  test('what a version 1 document is missing is named, so the builder can offer the upgrade', () => {
    // A shorter palette with no explanation reads as a broken builder. The
    // document needs upgrading, and that is something the builder can do.
    expect(typesNeedingUpgrade('1').map((entry) => entry.type)).toEqual([
      'selectboxes',
      'file',
      'richtext',
    ])
    expect(typesNeedingUpgrade('2')).toEqual([])
  })
})

describe('newFieldOfType', () => {
  test('a new field is labelled, so it can be found by name at all', () => {
    const def = newFieldOfType('text', new Set())

    // A field with no label is one the conformance drivers cannot resolve —
    // and a builder producing those produces fields a screen reader cannot
    // resolve either. See decision 0034.
    expect(def.label).toBe('Single-line text')
    expect(def.key).toBe('text')
  })

  test('the key avoids one already in the document', () => {
    expect(newFieldOfType('text', new Set(['text'])).key).toBe('text2')
    expect(newFieldOfType('text', new Set(['text', 'text2'])).key).toBe('text3')
  })

  test('a container arrives with a child, because an empty one is invalid', () => {
    const group = newFieldOfType('group', new Set())

    expect(group.fields).toHaveLength(1)
    // And its child does not collide with the container's own key.
    expect(group.fields?.[0]?.key).not.toBe(group.key)
  })

  test('a choice field arrives with an option, because an empty list cannot be answered', () => {
    for (const type of ['select', 'radio', 'selectboxes']) {
      expect(newFieldOfType(type, new Set()).options, type).toHaveLength(1)
    }
  })

  test('every palette entry actually inserts, which is the point of generating both', () => {
    // Against a version 2 document, so the palette and the document agree
    // about which types exist. Version 1 is covered by the filter test above.
    for (const entry of paletteEntries('2')) {
      const session = createBuilderSession({ ...schema, specVersion: '2' })
      const def = newFieldOfType(entry.type, new Set(['text']))
      const target = session.validTargets(def)[0]

      expect(target, `${entry.type} has nowhere to go`).toBeDefined()
      expect(session.insertField(target!, def).ok, entry.type).toBe(true)
    }
  })
})
