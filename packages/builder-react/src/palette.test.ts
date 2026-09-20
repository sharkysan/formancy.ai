import { describe, expect, test } from 'vitest'
import { createBuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { newFieldOfType, paletteEntries } from './palette.js'

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
    expect(paletteEntries().map((entry) => entry.type)).toEqual([
      'text',
      'textarea',
      'number',
      'checkbox',
      'select',
      'radio',
      'date',
      'hidden',
      'static',
      'group',
      'repeater',
    ])
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

  test('every palette entry actually inserts, which is the point of generating both', () => {
    for (const entry of paletteEntries()) {
      const session = createBuilderSession(schema)
      const def = newFieldOfType(entry.type, new Set(['text']))
      const target = session.validTargets(def)[0]

      expect(target, `${entry.type} has nowhere to go`).toBeDefined()
      expect(session.insertField(target!, def).ok, entry.type).toBe(true)
    }
  })
})
