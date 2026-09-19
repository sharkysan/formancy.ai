import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { parse } from './parse.js'
import { referencedPaths } from './references.js'

/** Parse or fail the test loudly; every case here is syntactically valid. */
function pathsOf(source: string): readonly string[] {
  const result = parse(source)
  if (!result.ok) throw result.error
  return referencedPaths(result.ast)
}

describe('referencedPaths', () => {
  test('reports a plain identifier', () => {
    expect(pathsOf('total > 10')).toEqual(['total'])
  })

  test('reports a dotted member access as one path', () => {
    expect(pathsOf('address.city == "Zurich"')).toEqual(['address.city'])
  })

  test('reports the deepest path of a member chain', () => {
    expect(pathsOf('a.b.c')).toEqual(['a.b.c'])
  })

  test('keeps a literal index in the path', () => {
    expect(pathsOf('items[0].price > 1')).toEqual(['items[0].price'])
  })

  test('normalises a literal string index to the equivalent dotted path', () => {
    expect(pathsOf('address["city"] == "Zurich"')).toEqual(['address.city'])
  })

  test('coarsens a computed index to the whole collection plus the index variable', () => {
    expect(pathsOf('items[i].price > 1')).toEqual(['i', 'items'])
  })
})

describe('referencedPaths across comprehension macros', () => {
  test('reports the iterated collection but not the iteration variable', () => {
    expect(pathsOf('items.all(x, x.price > limit)')).toEqual(['items', 'limit'])
  })

  test('scopes the iteration variable of exists, filter and map', () => {
    expect(pathsOf('items.exists(x, x > 0)')).toEqual(['items'])
    expect(pathsOf('items.filter(x, x.active).size() > 0')).toEqual(['items'])
    expect(pathsOf('items.map(x, x.price)')).toEqual(['items'])
    expect(pathsOf('items.exists_one(x, x == 1)')).toEqual(['items'])
  })

  test('scopes the iteration variable of the three-argument map', () => {
    expect(pathsOf('items.map(x, x.active, x.price)')).toEqual(['items'])
  })

  test('honours shadowing in nested comprehensions', () => {
    expect(pathsOf('outer.all(x, inner.exists(x, x > threshold))')).toEqual([
      'inner',
      'outer',
      'threshold',
    ])
  })

  test('does not let the iteration variable escape the macro', () => {
    expect(pathsOf('items.all(x, true) && x > 1')).toEqual(['items', 'x'])
  })

  test('reports the path tested by has()', () => {
    expect(pathsOf('has(address.city)')).toEqual(['address.city'])
  })

  test('reports a collection iterated inside its own comprehension once per read', () => {
    expect(pathsOf('items.all(x, items.exists(y, y == x))')).toEqual(['items'])
  })
})

/**
 * The scoping rule is the part of this function that breaks silently, so it is
 * worth asserting over generated names rather than only the ones a person
 * happened to write in a test.
 */
/** The identifier a path starts at, which is the field a dependency is on. */
function rootOf(path: string): string {
  return path.split(/[.[]/)[0] ?? path
}

describe('referencedPaths scoping, over generated names', () => {
  const name = fc.constantFrom('a', 'b', 'x', 'y', 'item', 'total', 'row', 'value')
  const macro = fc.constantFrom('all', 'exists', 'exists_one', 'filter')

  test('never reports the iteration variable and always reports the collection', () => {
    fc.assert(
      fc.property(name, name, name, macro, (collection, iterator, external, kind) => {
        fc.pre(new Set([collection, iterator, external]).size === 3)

        const paths = pathsOf(
          `${collection}.${kind}(${iterator}, ${iterator}.f == ${external} && ${iterator} != 0)`,
        )

        // Nothing rooted at the iteration variable, in any of its forms.
        expect(paths.filter((path) => rootOf(path) === iterator)).toEqual([])
        expect(paths).toContain(collection)
        expect(paths).toContain(external)
      }),
    )
  })

  test('reports every identifier of a conjunction exactly once', () => {
    fc.assert(
      fc.property(fc.uniqueArray(name, { minLength: 1, maxLength: 5 }), (names) => {
        expect(pathsOf(names.map((each) => `${each} != 0`).join(' && '))).toEqual(
          [...names].sort(),
        )
      }),
    )
  })
})
