import { describe, expect, test } from 'vitest'
import { check } from './check.js'
import { compile } from './compile.js'
import { parse } from './parse.js'
import type { ExpressionKind } from './kinds.js'
import type { VariableDeclarations } from './types.js'

const variables: VariableDeclarations = {
  age: 'int',
  name: 'string',
  total: 'decimal',
  items: 'list',
}

/** Parse with the declarations above, then check for the given kind. */
function checkFor(source: string, kind: ExpressionKind) {
  const parsed = parse(source, { variables })
  if (!parsed.ok) throw parsed.error
  return check(parsed.ast, { kind })
}

function rejection(source: string, kind: ExpressionKind) {
  const result = checkFor(source, kind)
  if (result.ok) throw new Error(`expected ${source} to be rejected`)
  return result.error
}

describe('check against a declared environment', () => {
  test('accepts a well-typed expression and reports its result type', () => {
    const result = checkFor('age > 18', 'visible')
    expect(result).toEqual({ ok: true, type: 'bool' })
  })

  test('rejects an identifier that is not declared', () => {
    const error = rejection('nope > 18', 'visible')
    expect(error.kind).toBe('type')
    expect(error.message).toMatch(/nope/)
  })

  test('rejects comparing an int against a string before the form is saved', () => {
    const error = rejection('age > "eighteen"', 'visible')
    expect(error.kind).toBe('type')
    expect(error.position).toBeDefined()
  })

  test('rejects a call to a function that does not exist', () => {
    expect(rejection('fetchProfile(name)', 'computed').kind).toBe('type')
  })
})

describe('check needs a declared environment', () => {
  test('refuses an expression parsed without one, rather than passing everything', () => {
    const parsed = parse('anything.at.all > 1')
    if (!parsed.ok) throw parsed.error

    expect(() => check(parsed.ast, { kind: 'visible' })).toThrow(TypeError)
  })
})

describe('the function allow-list is a property of the expression kind', () => {
  test('rejects random() in a visible expression', () => {
    const error = rejection('random() > 0.5', 'visible')
    expect(error.kind).toBe('policy')
    expect(error.code).toBe('function_not_allowed')
    expect(error.message).toMatch(/random/)
  })

  test('allows random() in a computed expression', () => {
    expect(checkFor('random()', 'computed').ok).toBe(true)
  })

  test('allows the read-only core in every kind', () => {
    expect(checkFor('items.filter(i, i.active).size() > 0', 'visible').ok).toBe(true)
    expect(checkFor('name.startsWith("a")', 'required').ok).toBe(true)
    expect(checkFor('name.trim().size() > 0', 'validate').ok).toBe(true)
  })
})

/**
 * A caller with nothing to capture the clock or a draw in (a report rendered twice from the same
 * data must print the same thing) asks for neither, whatever its kind allows. Without this it
 * could only find a call afterwards, by probing the source, and a call it missed changes what the
 * same data gives.
 */
describe('a reproducible expression reads neither the clock nor a random source', () => {
  function reproducibly(source: string, kind: ExpressionKind) {
    const parsed = parse(source, { variables })
    if (!parsed.ok) throw parsed.error
    return check(parsed.ast, { kind, reproducible: true })
  }

  test.each([
    ['now()', 'computed'],
    ['today()', 'computed'],
    ['random()', 'computed'],
    ['now() > timestamp("2026-01-01T00:00:00Z")', 'visible'],
  ] as const)('refuses %s in a %s expression, at the call', (source, kind) => {
    const result = reproducibly(source, kind)
    if (result.ok) throw new Error(`expected ${source} to be refused`)

    expect(result.error.kind).toBe('policy')
    expect(result.error.code).toBe('function_not_allowed')
    expect(result.error.message).toBe(`${source.slice(0, source.indexOf('('))}() cannot be used in a reproducible ${kind} expression.`)
    expect(result.error.position?.start).toBe(0)
    expect(result.error.hint).toMatch(/clock or a random source/)
  })

  test('still allows everything else its kind allows, a value handed in included', () => {
    expect(reproducibly('dec("1.50") * total', 'computed').ok).toBe(true)
    expect(reproducibly('items.filter(i, i.active).size() > 0', 'visible').ok).toBe(true)
    expect(reproducibly('timestamp("2026-01-01T00:00:00Z").getFullYear() == 2026', 'validate').ok).toBe(true)
  })

  test('is asked for: an expression of the same kind may read both otherwise', () => {
    expect(checkFor('now()', 'computed').ok).toBe(true)
    expect(checkFor('random()', 'computed').ok).toBe(true)
    // And a kind's own refusal still says what the kind allows, not why reproducibility forbids it.
    expect(rejection('random() > 0.5', 'visible').hint).toMatch(/^Allowed here: /)
  })

  test('is handed on by compile', () => {
    const compiled = compile('today()', { kind: 'computed', variables: {}, reproducible: true })

    expect(compiled.ok ? undefined : compiled.error.code).toBe('function_not_allowed')
  })
})

describe('the result type is a property of the expression kind', () => {
  test('rejects a visible expression that does not decide a boolean', () => {
    const error = rejection('name', 'visible')
    expect(error.kind).toBe('policy')
    expect(error.code).toBe('result_type_not_allowed')
  })

  test('accepts any value from a computed expression', () => {
    expect(checkFor('total', 'computed')).toEqual({ ok: true, type: 'decimal' })
    expect(checkFor('name', 'computed')).toEqual({ ok: true, type: 'string' })
  })

  test('lets a validate expression answer with a message string', () => {
    // The message convention: `false` and a non-empty string both mean "not
    // acceptable", and the string is what the user is shown. A validate rule
    // producing a string is therefore legal, not a type mistake.
    expect(checkFor('name == "" ? "Name is required" : ""', 'validate')).toEqual({
      ok: true,
      type: 'string',
    })
    expect(checkFor('name != ""', 'validate')).toEqual({ ok: true, type: 'bool' })
  })

  test('still refuses a validate expression that answers with a number', () => {
    expect(rejection('age', 'validate').code).toBe('result_type_not_allowed')
  })
})
