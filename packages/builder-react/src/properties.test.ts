import { describe, expect, test } from 'vitest'
import rawSchema from '@formancy/spec/schema.json' with { type: 'json' }
import { FIELD_TYPES, WIDGETS_BY_FIELD_TYPE } from '@formancy/spec'
import {
  editableLayoutPropertiesFor,
  editablePropertiesFor,
  layoutKinds,
} from './properties.js'

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

/**
 * Is everything in the format actually configurable?
 *
 * Asked as a guard rather than answered once, because the answer changes every
 * time the format grows. It has already been "no" twice without anybody
 * noticing: `span` arrived in [0074] with the format validating it, both
 * renderers honouring it and the builder unable to set it at all, and every
 * other layout property — a table's `columns`, a section's `label` — had never
 * been settable either.
 *
 * The schema is walked HERE, independently of the walk `properties.ts` does. A
 * test that asked the same function the same question would agree with itself
 * whatever either of them got wrong.
 */
const schemaRoot = rawSchema as unknown as {
  $defs: Record<string, Record<string, unknown>>
}

const resolve = (node: Record<string, unknown> | undefined): Record<string, unknown> => {
  const ref = node?.['$ref']
  if (typeof ref !== 'string') return node ?? {}
  return (schemaRoot.$defs[ref.replace('#/$defs/', '')] ?? {}) as Record<string, unknown>
}

const propertyNames = (node: Record<string, unknown> | undefined): string[] =>
  Object.keys((node?.['properties'] ?? {}) as Record<string, unknown>)

/** Every property name the schema lets ANY field carry, however it is branched. */
function everyFieldProperty(): Set<string> {
  const names = new Set<string>()
  const walk = (node: Record<string, unknown>): void => {
    for (const name of propertyNames(node)) names.add(name)
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      for (const branch of (node[key] ?? []) as Array<Record<string, unknown>>) {
        walk(resolve(branch))
        for (const side of ['then', 'else']) {
          const nested = branch[side] as Record<string, unknown> | undefined
          if (nested !== undefined) walk(resolve(nested))
        }
      }
    }
  }
  walk(schemaRoot.$defs['field'] ?? {})
  return names
}

/** Every property name the schema lets ANY layout node carry. */
function everyLayoutProperty(): Set<string> {
  const union = schemaRoot.$defs['layoutNode'] ?? {}
  const branches = ((union['oneOf'] ?? union['anyOf'] ?? []) as Array<Record<string, unknown>>).map(
    resolve,
  )
  return new Set(branches.flatMap(propertyNames))
}

/**
 * Properties no panel offers, each with the reason.
 *
 * A list rather than a silence: an exception nobody writes down is an exception
 * nobody removes. The test below fails on a name that is no longer a property at
 * all, so it cannot rot in the other direction either.
 */
const NOT_CONFIGURABLE: Readonly<Record<string, string>> = {
  key: 'a rename, with `renamedFrom` semantics and its own command — typing over it in a text box is how answers get orphaned',
  type: 'a different type is a different field, and the tree adds fields',
  fields: 'structure, which the tree edits',
  renamedFrom: 'written by the session when a rename happens, never by a person',
  kind: 'what a layout node IS; changing it in a box would turn a table into a section without moving its children',
  children: 'structure, which the arrangement tree edits',
  path: 'which answer a placement places, chosen when the placement is added — and governed by the one-place-per-field rule',
}

describe('everything the format has is configurable, or says why not', () => {
  test('every property a field can carry is offered for the types that can carry it', () => {
    // Types AND widgets: some branches of the schema are conditioned on one and some
    // on the other, and a walk that only knew about types skipped `columns` entirely.
    const offered = new Set(
      FIELD_TYPES.flatMap((type) => [
        ...editablePropertiesFor(type).map((property) => property.name),
        ...((WIDGETS_BY_FIELD_TYPE as Record<string, readonly string[]>)[type] ?? []).flatMap((widget: string) =>
          editablePropertiesFor(type, widget).map((property) => property.name),
        ),
      ]),
    )
    const missing = [...everyFieldProperty()]
      .filter((name) => !offered.has(name) && NOT_CONFIGURABLE[name] === undefined)
      .sort()

    expect(missing).toEqual([])
    // A guard on the guard: an empty walk would pass forever.
    expect(everyFieldProperty().size).toBeGreaterThan(15)
  })

  test('every property a layout node can carry is offered for the kinds that can carry it', () => {
    const offered = new Set(
      layoutKinds().flatMap((kind) =>
        editableLayoutPropertiesFor(kind).map((property) => property.name),
      ),
    )
    const missing = [...everyLayoutProperty()]
      .filter((name) => !offered.has(name) && NOT_CONFIGURABLE[name] === undefined)
      .sort()

    expect(missing).toEqual([])
    expect(layoutKinds().length).toBeGreaterThan(3)
  })

  test('the not-configurable list names only real properties', () => {
    // So an excuse cannot outlive the property it excuses.
    const real = new Set([...everyFieldProperty(), ...everyLayoutProperty()])
    expect(Object.keys(NOT_CONFIGURABLE).filter((name) => !real.has(name))).toEqual([])
  })

  test('a layout node offers exactly what its own branch declares', () => {
    // The specific gaps this was written after: a table sizes its grid, anything in a
    // table may span it, and a section is named. None of the three was settable.
    expect(editableLayoutPropertiesFor('table').map((p) => p.name)).toEqual(
      expect.arrayContaining(['columns', 'label', 'span']),
    )
    expect(editableLayoutPropertiesFor('section').map((p) => p.name)).toEqual(
      expect.arrayContaining(['label', 'span']),
    )
    expect(editableLayoutPropertiesFor('field').map((p) => p.name)).toEqual(['span'])
    // And a kind that does not exist offers nothing, rather than everything.
    expect(editableLayoutPropertiesFor('nonsense')).toEqual([])
  })

  test('a span is offered as the format writes it, a number or the word all', () => {
    // `span` is `anyOf: [integer, const 'all']`, which is neither a plain number nor a
    // plain enum. A panel that rendered it as a number box could not express `all`, and
    // `all` is the value an author almost always wants.
    const span = editableLayoutPropertiesFor('table').find((p) => p.name === 'span')
    expect(span).toBeDefined()
    expect(span?.description).toContain('all')
  })
})

describe('a property the format writes as a number OR a word', () => {
  test('is marked so the panel hands over a number and not a string', () => {
    // `span` is `anyOf: [{type: "integer"}, {const: "all"}]`. It cannot be a number
    // box — that could not express `all`, which is the value an author almost always
    // wants — and it cannot be an enum, which could not express 2.
    //
    // So it is a text box, and the box has to know to send `2` rather than `"2"`.
    // Measured in packages/builder-core/src/layout.test.ts: the string form is
    // refused outright, so typing a numeric span did nothing and said nothing.
    const span = editableLayoutPropertiesFor('table').find((p) => p.name === 'span')

    expect(span?.kind).toBe('string')
    expect(span?.numericAlternative).toBe(true)
  })

  test('and a plain number property is NOT marked, because it never needed to be', () => {
    // The guard on the guard: a flag that were true everywhere would be no flag.
    const columns = editableLayoutPropertiesFor('table').find((p) => p.name === 'columns')
    expect(columns?.kind).toBe('number')
    expect(columns?.numericAlternative).toBeUndefined()

    const label = editableLayoutPropertiesFor('section').find((p) => p.name === 'label')
    expect(label?.numericAlternative).toBeUndefined()
  })
})
