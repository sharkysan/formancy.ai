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

/**
 * The spec 2 types, which is the real test of generating the panel rather
 * than writing one: nobody added a line here for any of them, and the panel
 * offers exactly what the schema says each one takes.
 */
describe('the spec 2 types', () => {
  test('selectboxes gets options and a bound on how many may be ticked', () => {
    const names = editablePropertiesFor('selectboxes').map((property) => property.name)

    expect(names).toContain('options')
    expect(names).toContain('minItems')
    expect(names).toContain('maxItems')
  })

  test('file gets what it will accept, how large and how many', () => {
    const properties = editablePropertiesFor('file')
    const names = properties.map((property) => property.name)

    expect(names).toEqual(expect.arrayContaining(['accept', 'maxFileSize', 'minItems', 'maxItems']))
    // A list of plain strings, so the panel gives it a line-per-value box
    // rather than a text field somebody has to guess the separator for.
    expect(properties.find((property) => property.name === 'accept')?.kind).toBe('strings')
  })

  test('richtext gets a length cap and no pattern', () => {
    const names = editablePropertiesFor('richtext').map((property) => property.name)

    expect(names).toContain('maxLength')
    // `pattern` belongs to single-line text. Offering it here would invite an
    // author to write a regular expression against markup.
    expect(names).not.toContain('pattern')
  })

  test('each new type is described in the schema’s own words', () => {
    for (const type of ['selectboxes', 'file', 'richtext']) {
      for (const property of editablePropertiesFor(type)) {
        expect(property.title, `${type}.${property.name}`).not.toBe(property.name)
        expect(property.description.length, `${type}.${property.name}`).toBeGreaterThan(10)
      }
    }
  })
})
