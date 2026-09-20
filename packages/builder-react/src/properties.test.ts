import { describe, expect, test } from 'vitest'
import { editablePropertiesFor } from './properties.js'

const names = (type: string): string[] =>
  editablePropertiesFor(type).map((property) => property.name)

/**
 * The panel is generated from packages/spec/formancy.schema.json rather than
 * written out by hand. Twenty-five hand-written panels rot within two
 * releases: a property is added to the spec, nobody remembers the panel, and
 * the builder silently cannot set it.
 */
describe('editablePropertiesFor', () => {
  test('every field type gets the properties all fields share', () => {
    for (const type of ['text', 'number', 'select', 'repeater', 'group']) {
      expect(names(type), type).toEqual(expect.arrayContaining(['label', 'required', 'clearOnHide']))
    }
  })

  test('the per-type properties come from the schema conditionals, not a list here', () => {
    expect(names('number')).toEqual(expect.arrayContaining(['min', 'max']))
    expect(names('text')).toEqual(
      expect.arrayContaining(['minLength', 'maxLength', 'pattern', 'format']),
    )
    expect(names('repeater')).toEqual(
      expect.arrayContaining(['minItems', 'maxItems', 'addLabel', 'removeLabel']),
    )
    expect(names('select')).toEqual(expect.arrayContaining(['options']))
  })

  test('a property belonging to another type is not offered', () => {
    expect(names('text')).not.toContain('min')
    expect(names('number')).not.toContain('pattern')
    expect(names('text')).not.toContain('minItems')
    expect(names('group')).not.toContain('options')
  })

  test('the properties that are not this panel’s business are left out', () => {
    for (const type of ['text', 'group', 'repeater']) {
      // `key` is a rename, which carries renamedFrom semantics and has its own
      // command. `fields` is structure, which the tree edits. `type` is a
      // different field. `renamedFrom` is written by the session, never typed.
      expect(names(type), type).not.toContain('key')
      expect(names(type), type).not.toContain('fields')
      expect(names(type), type).not.toContain('type')
      expect(names(type), type).not.toContain('renamedFrom')
    }
  })

  test('each property knows how to be rendered', () => {
    const byName = new Map(editablePropertiesFor('text').map((p) => [p.name, p]))

    expect(byName.get('required')?.kind).toBe('boolean')
    expect(byName.get('minLength')?.kind).toBe('number')
    expect(byName.get('pattern')?.kind).toBe('string')
    expect(byName.get('format')?.kind).toBe('enum')
    expect(byName.get('format')?.choices).toEqual(['email', 'url', 'uuid'])
  })

  test('each property carries the words the spec already wrote for it', () => {
    const clearOnHide = editablePropertiesFor('text').find((p) => p.name === 'clearOnHide')

    // The schema's own title and description, so the builder and the reference
    // documentation cannot disagree about what a property means.
    expect(clearOnHide?.title).toBe('Clear when hidden')
    expect(clearOnHide?.description).toContain('What happens to an answer')
    expect(clearOnHide?.default).toBe(true)
  })

  test('an unknown type gets the shared properties rather than throwing', () => {
    expect(names('no-such-type')).toEqual(expect.arrayContaining(['label', 'required']))
  })
})
