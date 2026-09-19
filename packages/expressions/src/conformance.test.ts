/**
 * What formancy relies on from CEL, pinned.
 *
 * `@marcbachmann/cel-js` claims "most of the CEL spec" and publishes no
 * conformance score, and the cel-spec corpus is not a dependency here. This
 * suite is the substitute: it covers the slice of the language a form actually
 * uses, so that an implementation swap or an upgrade has to keep it green.
 *
 * The last block records where the implementation DIVERGES from the CEL spec.
 * Those tests assert the behaviour we have, not the behaviour we want, and each
 * one is a decision waiting for the engine: compensate in the facade, or live
 * with it.
 */
import { describe, expect, test } from 'vitest'
import { fixedCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import { evaluate } from './evaluate.js'
import type { EvaluationOutcome } from './evaluate.js'
import type { VariableDeclarations } from './types.js'

const capabilities = fixedCapabilities({ nowMs: 0, today: '2026-09-19', random: 0 })

function run(
  source: string,
  variables: VariableDeclarations = {},
  values: Record<string, unknown> = {},
): EvaluationOutcome {
  const compiled = compile(source, { kind: 'computed', variables })
  if (!compiled.ok) return { ok: false, error: compiled.error }
  return evaluate(compiled.program, values, { capabilities })
}

/** The value of an expression that is expected to succeed. */
function value(source: string, variables?: VariableDeclarations, values?: Record<string, unknown>) {
  const outcome = run(source, variables, values)
  if (!outcome.ok) throw outcome.error
  return outcome.value
}

/** The error of an expression that is expected to fail. */
function failure(source: string, variables?: VariableDeclarations, values?: Record<string, unknown>) {
  const outcome = run(source, variables, values)
  if (outcome.ok) throw new Error(`expected ${source} to fail, got ${String(outcome.value)}`)
  return outcome.error
}

describe('operators', () => {
  test('compares numbers, strings and booleans', () => {
    expect(value('1 < 2 && 2 <= 2 && 3 > 2 && 3 >= 3')).toBe(true)
    expect(value('"a" < "b"')).toBe(true)
    expect(value('1 == 1 && 1 != 2')).toBe(true)
    expect(value('true == true && false != true')).toBe(true)
  })

  test('does arithmetic on ints and doubles', () => {
    expect(value('1 + 2 * 3 - 4')).toBe(3)
    expect(value('7 % 3')).toBe(1)
    expect(value('7 / 2')).toBe(3)
    expect(value('7.0 / 2.0')).toBe(3.5)
    expect(value('-(-1)')).toBe(1)
  })

  test('fails integer division and modulo by zero rather than inventing a value', () => {
    expect(failure('1 / 0').kind).toBe('runtime')
    expect(failure('1 % 0').kind).toBe('runtime')
  })

  test('follows IEEE for double division by zero, as the spec requires', () => {
    expect(value('1.0 / 0.0')).toBe(Infinity)
  })

  test('concatenates strings and lists', () => {
    expect(value('"a" + "b"')).toBe('ab')
    expect(value('[1] + [2]')).toEqual([1, 2])
  })
})

describe('logical operators are commutative in the presence of errors', () => {
  const failing = '1 / 0 == 0'

  test('short-circuits a decided disjunction from either side', () => {
    expect(value(`true || ${failing}`)).toBe(true)
    expect(value(`${failing} || true`)).toBe(true)
  })

  test('short-circuits a decided conjunction from either side', () => {
    expect(value(`false && ${failing}`)).toBe(false)
    expect(value(`${failing} && false`)).toBe(false)
  })

  test('propagates the error when the other operand does not decide it', () => {
    expect(failure(`${failing} || false`).kind).toBe('runtime')
    expect(failure(`${failing} && true`).kind).toBe('runtime')
  })

  test('evaluates only the taken branch of a ternary', () => {
    expect(value('true ? 1 : 1 / 0')).toBe(1)
    expect(value('false ? 1 / 0 : 2')).toBe(2)
  })
})

describe('membership and presence', () => {
  test('tests membership of a list and of a map key', () => {
    expect(value('"a" in ["a", "b"]')).toBe(true)
    expect(value('"c" in ["a", "b"]')).toBe(false)
    expect(value('"k" in {"k": 1}')).toBe(true)
    expect(value('"j" in {"k": 1}')).toBe(false)
  })

  test('has() answers for a field that is absent', () => {
    expect(value('has(o.a)', { o: 'map' }, { o: {} })).toBe(false)
    expect(value('has(o.a)', { o: 'map' }, { o: { a: 1 } })).toBe(true)
  })

  test('reading an absent field is an error, which is why has() exists', () => {
    expect(failure('o.a', { o: 'map' }, { o: {} }).kind).toBe('runtime')
  })
})

describe('null', () => {
  test('compares equal to null and to nothing else', () => {
    expect(value('null == null')).toBe(true)
    expect(value('x == null', { x: 'dyn' }, { x: null })).toBe(true)
    expect(value('x != null', { x: 'dyn' }, { x: 1 })).toBe(true)
  })

  test('comes back as null', () => {
    expect(value('x', { x: 'dyn' }, { x: null })).toBe(null)
  })
})

describe('comprehension macros', () => {
  const list = { xs: 'list' } as const satisfies VariableDeclarations
  const values = { xs: [1, 2, 3] }

  test('all, exists and exists_one quantify over a list', () => {
    expect(value('xs.all(x, x > 0)', list, values)).toBe(true)
    expect(value('xs.all(x, x > 1)', list, values)).toBe(false)
    expect(value('xs.exists(x, x == 2)', list, values)).toBe(true)
    expect(value('xs.exists_one(x, x == 2)', list, values)).toBe(true)
    expect(value('xs.exists_one(x, x > 1)', list, values)).toBe(false)
  })

  test('all() over an empty list is true and exists() is false', () => {
    expect(value('xs.all(x, false)', list, { xs: [] })).toBe(true)
    expect(value('xs.exists(x, true)', list, { xs: [] })).toBe(false)
  })

  test('filter and map build new lists', () => {
    expect(value('xs.filter(x, x > 1)', list, values)).toEqual([2, 3])
    // The literal is written 2.0: a number out of the value bag is a double,
    // and CEL has no implicit widening. See the divergences block.
    expect(value('xs.map(x, x * 2.0)', list, values)).toEqual([2, 4, 6])
    expect(value('xs.map(x, x > 1, x * 2.0)', list, values)).toEqual([4, 6])
  })

  test('quantifies over the keys of a map', () => {
    expect(value('m.exists(k, k == "a")', { m: 'map' }, { m: { a: 1 } })).toBe(true)
    expect(value('m.all(k, k != "b")', { m: 'map' }, { m: { a: 1 } })).toBe(true)
  })
})

describe('strings', () => {
  test('supports the predicates a form needs', () => {
    expect(value('"hello".startsWith("he")')).toBe(true)
    expect(value('"hello".endsWith("lo")')).toBe(true)
    expect(value('"hello".contains("ell")')).toBe(true)
    expect(value('"a@b.ch".matches("^[^@]+@[^@]+$")')).toBe(true)
  })

  test('supports the transformations a form needs', () => {
    expect(value('"  Hi  ".trim()')).toBe('Hi')
    expect(value('"Hi".lowerAscii()')).toBe('hi')
    expect(value('"Hi".upperAscii()')).toBe('HI')
    expect(value('"a,b,c".split(",")')).toEqual(['a', 'b', 'c'])
    expect(value('["a", "b"].join("-")')).toBe('a-b')
    expect(value('"hello".substring(1, 3)')).toBe('el')
    expect(value('"hello".indexOf("l")')).toBe(2)
    expect(value('size("hello")')).toBe(5)
  })
})

describe('type conversion', () => {
  test('converts between the types a form holds', () => {
    expect(value('int("42")')).toBe(42)
    expect(value('double("1.5")')).toBe(1.5)
    expect(value('string(42)')).toBe('42')
    expect(value('string(true)')).toBe('true')
    expect(value('bool("true")')).toBe(true)
    expect(value('int(2.9)')).toBe(2)
  })

  test('fails a conversion that cannot be made, rather than producing zero', () => {
    expect(failure('int("nope")').kind).toBe('runtime')
  })
})

describe('timestamps', () => {
  test('reads the parts of an instant', () => {
    expect(value('timestamp("2024-01-02T03:04:05Z").getFullYear()')).toBe(2024)
    expect(value('timestamp("2024-01-02T03:04:05Z").getMonth()')).toBe(0)
    expect(value('timestamp("2024-01-02T03:04:05Z").getDayOfMonth()')).toBe(1)
    expect(value('timestamp("2024-01-02T03:04:05Z").getHours()')).toBe(3)
  })

  test('adds a duration and compares instants', () => {
    expect(value('string(timestamp("2024-01-02T03:04:05Z") + duration("1h"))')).toBe(
      '2024-01-02T04:04:05Z',
    )
    expect(value('timestamp("2024-01-02T00:00:00Z") < timestamp("2024-02-01T00:00:00Z")')).toBe(
      true,
    )
  })

  test('takes a declared timestamp from an ISO string in the value bag', () => {
    expect(
      value('due.getFullYear()', { due: 'timestamp' }, { due: '2030-05-06T00:00:00Z' }),
    ).toBe(2030)
  })
})

/**
 * Known divergences from the CEL specification, asserted as they behave today.
 * Each one is a compensation the facade may have to grow.
 */
describe('KNOWN DIVERGENCES from the CEL spec', () => {
  test('DIVERGENCE: heterogeneous numeric equality is unsupported', () => {
    // The spec says 1 == 1.0 and 1 == 1u are true. Here they have no overload,
    // though at least the rejection lands at check time rather than on a user.
    expect(failure('1 == 1.0').kind).toBe('type')
    expect(failure('1 == 2u').kind).toBe('type')
  })

  test('heterogeneous numeric ORDERING is supported, unlike equality', () => {
    expect(value('1 < 1.5')).toBe(true)
    expect(value('2.5 > 2')).toBe(true)
  })

  test('TRAP: a number from the value bag is a double, so an int literal will not multiply it', () => {
    const outcome = run('n * 2', { n: 'dyn' }, { n: 3 })

    expect(outcome.ok).toBe(false)
    // Worse than a divergence: this one is only caught at evaluation, because
    // the declared type is dyn and the mismatch appears in the data.
    expect(value('n * 2.0', { n: 'dyn' }, { n: 3 })).toBe(6)
  })

  test('DIVERGENCE: matches() has no global form, only the receiver form', () => {
    expect(failure('matches("abc", "^a")').kind).toBe('type')
    expect(value('"abc".matches("^a")')).toBe(true)
  })

  test('COMPENSATED: string(timestamp) is missing upstream and supplied here', () => {
    expect(value('string(timestamp("2024-01-02T03:04:05Z"))')).toBe('2024-01-02T03:04:05Z')
  })
})
