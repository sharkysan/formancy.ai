import { describe, expect, test } from 'vitest'
import { rewritePath } from './rewrite.js'
import { parse } from './parse.js'
import { referencedPaths } from './references.js'

/** The paths an expression reads, for asserting a rewrite kept its shape. */
const reads = (source: string): readonly string[] => {
  const outcome = parse(source)
  if (!outcome.ok) throw new Error(`${source} does not parse: ${outcome.error.message}`)
  return referencedPaths(outcome.ast)
}

const rewritten = (source: string, from: string, to: string): string => {
  const outcome = rewritePath(source, from, to)
  if (!outcome.ok) throw new Error(`refused: ${outcome.error.message}`)
  return outcome.source
}

describe('rewriting a data path through a condition', () => {
  test('rewrites the reference and nothing else', () => {
    expect(rewritten('postcode == "8000"', 'postcode', 'zip')).toBe('zip == "8000"')
  })

  test('leaves a longer identifier that merely starts with it alone', () => {
    /*
     * The whole reason this is an AST walk and not a regular expression.
     * `postcode_uk` is a different field, and a pattern over source that gets
     * this wrong silently repoints a working rule at a field that does not
     * exist. Six guards in this repository have been wrong about exactly this
     * shape of boundary.
     */
    expect(rewritten('postcode_uk == "X" && postcode == "8000"', 'postcode', 'zip')).toBe(
      'postcode_uk == "X" && zip == "8000"',
    )
  })

  test('leaves the field name inside a string literal alone', () => {
    // A literal is data, not a reference. A pattern over source cannot tell
    // the difference, and refusing or rewriting here corrupts the author's
    // text in a way nothing downstream can detect.
    expect(rewritten('note == "postcode"', 'postcode', 'zip')).toBe('note == "postcode"')
  })

  test('rewrites only the renamed prefix of a longer chain', () => {
    expect(rewritten('address.city == "Zurich"', 'address', 'addr')).toBe('addr.city == "Zurich"')
  })

  test('and rewrites a chain named in full, in either notation', () => {
    expect(rewritten('address.city == "Z"', 'address.city', 'address.town')).toBe(
      'address.town == "Z"',
    )
    // `address["city"]` and `address.city` are the same read, so the same
    // rename has to reach both spellings or a rule written one way silently
    // survives a rename that fixed the other.
    expect(rewritten('address["city"] == "Z"', 'address.city', 'address.town')).toBe(
      'address.town == "Z"',
    )
  })

  test('rewrites every occurrence, not the first', () => {
    // Rewriting only one is the subtler bug: the rule goes on working for some
    // values and not others. The replacement is deliberately LONGER than the
    // name it replaces, because an equal-length one hides a splice that walks
    // the spans in the wrong order — every offset after the first would then be
    // stale, and the test would pass anyway.
    const after = rewritten('has(a.city) ? a.city : a.other', 'a', 'postalAddress')
    expect(after).toBe('has(postalAddress.city) ? postalAddress.city : postalAddress.other')
  })

  test('preserves the author\'s spacing, because the source is spliced not reprinted', () => {
    // A reprinter would normalise this, and a diff of the published document
    // would then show changes nobody made next to the one somebody did.
    expect(rewritten('  postcode   ==   1  ', 'postcode', 'zip')).toBe('  zip   ==   1  ')
  })

  test('says nothing changed when the path does not appear', () => {
    const outcome = rewritePath('note == "x"', 'postcode', 'zip')
    expect(outcome).toMatchObject({ ok: true, changed: false, source: 'note == "x"' })
  })

  test('leaves a comprehension variable of the same name alone', () => {
    /*
     * `x` here is a local bound by the macro, not the field being renamed.
     * Rewriting it would change what the comprehension iterates over — and
     * `referencedPaths` already knows this, which is why the two share one
     * walker rather than each having an opinion about scope.
     */
    const after = rewritten('items.all(x, x.price > 0) && x == 1', 'x', 'y')
    expect(after).toBe('items.all(x, x.price > 0) && y == 1')
  })

  test('refuses when the new name would be captured by a local', () => {
    /*
     * The one case where a correct splice still changes meaning:
     * `items.all(zip, zip.n > postcode)` renaming `postcode` to `zip` produces
     * source where `zip` resolves to the ITERATION VARIABLE. The text is valid
     * CEL and reads differently, which is the worst available outcome.
     *
     * Caught by comparing what the result reads against what it was supposed
     * to read, rather than by reasoning about scopes a second time — the
     * verification is the guard, the splice is only the mechanism.
     */
    const outcome = rewritePath('items.all(zip, zip.n > postcode)', 'postcode', 'zip')

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.message).toMatch(/zip/)
  })

  test('refuses source that does not parse, rather than splicing blind', () => {
    const outcome = rewritePath('postcode ==', 'postcode', 'zip')
    expect(outcome).toMatchObject({ ok: false })
  })

  test('refuses a new path that is not one path', () => {
    // `zip == 1` is an expression, not a path. Splicing it in would compile and
    // mean something else entirely.
    for (const bad of ['zip == 1', 'a + b', '"zip"', '']) {
      expect(rewritePath('postcode == 1', 'postcode', bad).ok).toBe(false)
    }
  })

  test('accepts a new path that needs bracket notation, and emits it that way', () => {
    const after = rewritten('a.b == 1', 'a.b', 'a["b c"]')
    expect(after).toBe('a["b c"] == 1')
    expect(reads(after)).toEqual(['a["b c"]'])
  })

  test('keeps the read set equal to the renamed read set, for every case above', () => {
    /*
     * The invariant the whole function exists to hold, asserted directly: the
     * result reads exactly what the input read, with the renamed path moved.
     * A rewrite that satisfies this cannot have lost, invented or captured a
     * reference, whatever the splice did.
     */
    const cases: Array<[string, string, string]> = [
      ['postcode == "8000"', 'postcode', 'zip'],
      ['postcode_uk == "X" && postcode == 1', 'postcode', 'zip'],
      ['address.city == "Z" && address.zip == 1', 'address', 'addr'],
      ['items.all(x, x.p > postcode)', 'postcode', 'zip'],
      ['a.b.c == 1', 'a.b', 'x.y'],
    ]
    for (const [source, from, to] of cases) {
      const after = rewritten(source, from, to)
      const expected = reads(source)
        .map((path) => (path === from || path.startsWith(`${from}.`) ? `${to}${path.slice(from.length)}` : path))
        .sort()
      expect(reads(after), source).toEqual(expected)
    }
  })
})
