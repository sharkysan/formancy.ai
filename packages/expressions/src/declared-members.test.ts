import { describe, expect, test } from 'vitest'
import { fixedCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import type { CompileOptions } from './compile.js'
import { Decimal, decimalToString } from './decimal.js'
import { evaluate } from './evaluate.js'
import type { ExpressionKind } from './kinds.js'
import type { VariableDeclarations } from './types.js'

/**
 * A variable declared by member: `row` with `amount` a decimal and `copies` an int (0231).
 *
 * Declared as a `map`, every member is `dyn` to the checker. Formancy Report measured what that
 * let through and what it refused (#259): it passed `params.copies + "x"`, refused
 * `row.amount == dec("1")` and refused a boolean parameter used alone as a condition, and it
 * worked around all three by splicing each member read into a flat variable and compiling again.
 */
const variables: VariableDeclarations = {
  row: { amount: 'decimal', copies: 'int', address: { city: 'string' }, note: 'dyn' },
  params: { copies: 'int', duplex: 'bool' },
  items: 'list',
}

function compiled(source: string, kind: ExpressionKind = 'computed', declared: VariableDeclarations = variables) {
  return compile(source, { kind, variables: declared })
}

function errorOf(source: string, kind: ExpressionKind = 'computed') {
  const outcome = compiled(source, kind)
  if (outcome.ok) throw new Error(`${source} compiled`)
  return outcome.error
}

const capabilities = fixedCapabilities({ nowMs: 0, today: '2026-11-01', random: 0.5 })

function run(source: string, values: Record<string, unknown>, declared: CompileOptions['variables'] = variables) {
  const outcome = compiled(source, 'computed', declared)
  if (!outcome.ok) throw outcome.error
  return evaluate(outcome.program, values, { capabilities })
}

const ROW = { amount: '19.90', copies: 2, address: { city: 'Bern' }, note: null }

describe('a member is checked with its own type', () => {
  // The three Report measured: an int member added to a string passed, a decimal member
  // compared with a decimal was refused, and a bool member could not be a condition.
  test('the type a member declares is the type the checker gives it', () => {
    expect(errorOf('params.copies + "x"').message).toMatch(/no such overload: int \+ string/)
    expect(compiled('row.amount == dec("1")', 'visible').ok).toBe(true)
    expect(compiled('params.duplex', 'visible').ok).toBe(true)
    expect(compiled('row.amount * dec("2")')).toMatchObject({ ok: true, program: { resultType: 'decimal' } })
  })

  // Declared as a map, `row.copies < dec("0")` passed and failed when it ran.
  test('a comparison a member’s type has no overload for is refused when it is checked', () => {
    expect(errorOf('row.copies < dec("0")').kind).toBe('type')
  })

  test('a member declared by member of its own, selected or indexed', () => {
    expect(compiled('row.address.city.startsWith("B")', 'visible').ok).toBe(true)
    expect(compiled('row["address"]["city"]')).toMatchObject({ ok: true, program: { resultType: 'string' } })
    expect(compiled('has(row.amount)', 'visible').ok).toBe(true)
  })

  // The checker cannot see a member nobody declared, so its name in a rule is a typo or a
  // field that is not there: refused when the author saves, with what is there.
  test('a member it does not declare is refused, and the hint names those it does', () => {
    const error = errorOf('row.amont > dec("0")')

    expect(error.kind).toBe('type')
    expect(error.hint).toBe('row declares address, amount, copies, note.')
  })

  test('and one a nested member does not declare names the nested ones', () => {
    expect(errorOf('row.address.zip == "3000"').hint).toBe('row.address declares city.')
  })

  // What #260's exactness report reads is the checker's types, so a member's type reaches it.
  test('a double member is named where it is inexact', () => {
    const outcome = compiled('row.price * 2.0', 'computed', { row: { price: 'double' } })
    expect(outcome.ok && outcome.program.inexact.map((step) => step.kind)).toEqual(['double'])
  })

  test('what a program reads is the member, as before', () => {
    expect(compiled('row.amount * dec("2") + dec(string(params.copies))')).toMatchObject({ ok: true, program: { references: ['params.copies', 'row.amount'] } })
  })
})

/**
 * Read whole, a variable declared by member is a value the checker gives a type of its own and
 * nothing accepts. A list or map holding it, or a branch returning it, hands its members on as
 * `dyn`, which is what declaring them was for not to happen.
 */
describe('a variable declared by member cannot be read whole', () => {
  test.each([
    ['as the whole result', 'row', 'row'],
    ['inside a list', '[row].size() > 0', 'row'],
    ['as the value of a map', '{"r": row}.r.amount > dec("0")', 'row'],
    ['as a branch of a conditional', '(params.duplex ? row : row).copies', 'row'],
    ['a member declared by member, as the whole result', 'row.address', 'row.address'],
  ])('%s', (_where, source, path) => {
    const error = errorOf(source)

    expect(error).toMatchObject({ kind: 'type', code: 'variable_read_whole' })
    expect(error.message).toBe(`${path} is declared by member, so it is read one member at a time.`)
    expect(error.position).toBeDefined()
  })

  test('the hint names the members it can read', () => {
    expect(errorOf('row').hint).toBe('Read one of its members: row.address, row.amount, row.copies, row.note.')
  })

  // The checker refuses these first, with an overload message naming the type it made up for
  // `row`; the hint says why there is no overload.
  test('passed to a function or compared, the checker’s refusal carries the same hint', () => {
    expect(errorOf('size(row) > 0').hint).toBe('row is declared by member, so it is read one member at a time: row.address, row.amount, row.copies, row.note.')
    expect(errorOf('params == params').hint).toBe('params is declared by member, so it is read one member at a time: params.copies, params.duplex.')
    // `$row.address` holds `$row`: the member is named, not the variable it is a member of.
    expect(errorOf('size(row.address) > 0').hint).toBe('row.address is declared by member, so it is read one member at a time: row.address.city.')
  })

  // A comprehension's own variable is the comprehension's, whatever it is called.
  test('a comprehension variable named like it is not it', () => {
    expect(compiled('items.map(row, row)').ok).toBe(true)
  })

  // A key read by value is any member, so its type is none of theirs.
  test('a member read by a key computed when it runs is refused', () => {
    expect(errorOf('row[string(params.copies)]').code).toBe('variable_read_whole')
  })
})

describe('evaluated, each member is bound as its declaration says', () => {
  // JSON carries an int as a number and money as a string; a member is converted as a variable
  // of its type is, or `row.copies + 1` is a double meeting an int when it runs.
  test('an int member from a number, a decimal member from a string, a nested member from its map', () => {
    expect(run('row.copies + 1', { row: ROW, params: { copies: 1, duplex: true }, items: [] })).toMatchObject({ ok: true, value: 3 })
    const total = run('row.amount * dec("2")', { row: ROW, params: { copies: 1, duplex: true }, items: [] })
    expect(total.ok && total.value instanceof Decimal && decimalToString(total.value)).toBe('39.80')
    expect(run('row.address.city', { row: ROW, params: { copies: 1, duplex: true }, items: [] })).toMatchObject({ ok: true, value: 'Bern' })
  })

  test('a member missing from the value is missing, by its path', () => {
    const outcome = run('row.copies + 1', { row: { amount: '1' }, params: { copies: 1, duplex: true }, items: [] })

    expect(outcome).toMatchObject({ ok: false, error: { code: 'missing_variable', message: 'No value was supplied for row.copies.' } })
  })

  // A member declared by member is a map of its own, and the hint asks for one, not a type.
  test('a member declared by member missing from the value asks for a map of its members', () => {
    const outcome = run('row.copies + 1', { row: { amount: '1', copies: 1, note: null }, params: { copies: 1, duplex: true }, items: [] })

    expect(outcome).toMatchObject({
      ok: false,
      error: { message: 'No value was supplied for row.address.', hint: 'Pass null for an empty field and declare it as dyn, or supply a map of its members.' },
    })
  })

  test('a member of the wrong kind is refused by its path', () => {
    const outcome = run('row.copies', { row: { ...ROW, amount: 19.9 }, params: { copies: 1, duplex: true }, items: [] })

    expect(outcome).toMatchObject({ ok: false, error: { code: 'invalid_value' } })
    expect(!outcome.ok && outcome.error.message).toMatch(/^The value of row\.amount cannot be used: /)
  })

  test.each([
    ['null', null],
    ['a list', [ROW]],
    ['a string', 'row'],
  ])('a value that is not a map of members, %s, is refused', (_what, row) => {
    const outcome = run('row.copies', { row, params: { copies: 1, duplex: true }, items: [] })

    expect(outcome).toMatchObject({ ok: false, error: { code: 'invalid_value' } })
    expect(!outcome.ok && outcome.error.message).toMatch(/^The value of row cannot be used: /)
  })

  test('a map made without a prototype is a map of members', () => {
    const row = Object.assign(Object.create(null) as object, ROW)

    expect(run('row.copies + 1', { row, params: { copies: 1, duplex: true }, items: [] })).toMatchObject({ ok: true, value: 3 })
  })

  // The library tells a map by `value.constructor` (0185): a member declared under that name
  // is read like any other, and so is one under `__proto__`, which an assignment would lose.
  test('members named constructor and __proto__ are read as members', () => {
    // TypeScript widens the literal of a property named `constructor` to string; `as const` keeps it.
    const declared: VariableDeclarations = { row: { constructor: 'int' as const, ['__proto__']: 'string' } }
    const value = JSON.parse('{"constructor": 4, "__proto__": "x"}') as Record<string, unknown>

    expect(run('row.constructor + 1', { row: value }, declared)).toMatchObject({ ok: true, value: 5 })
    expect(run('row["__proto__"]', { row: value }, declared)).toMatchObject({ ok: true, value: 'x' })
  })
})
