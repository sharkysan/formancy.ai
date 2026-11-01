import { describe, expect, test } from 'vitest'
import { compile } from './compile.js'
import type { Program } from './compile.js'
import type { VariableDeclarations } from './types.js'

const variables: VariableDeclarations = {
  qty: 'int',
  price: 'double',
  total: 'decimal',
  items: 'list',
  anything: 'dyn',
}

function program(source: string): Program {
  const compiled = compile(source, { kind: 'computed', variables })
  if (!compiled.ok) throw compiled.error
  return compiled.program
}

const spelled = (source: string, at: { start: number; end: number }): string => source.slice(at.start, at.end)

/**
 * A caller that must refuse a kind of call, the clock or an inexact conversion, had nothing to
 * read but the source: Formancy Report re-spelled every candidate token, compiled again and
 * watched whether the outcome changed (#260). A call it missed, or an error code that changed
 * under it, let the call through without a word.
 */
describe('a program says which functions it calls, each at its call', () => {
  test('outside in, then left to right, a conversion and a call inside its argument both', () => {
    const source = 'int(double("4.35") * 100.0)'

    expect(program(source).calls.map((call) => [call.name, spelled(source, call.position)])).toEqual([
      ['int', source],
      ['double', 'double("4.35")'],
    ])
  })

  test('names a method, a macro and a call inside a comprehension’s body', () => {
    const source = 'items.filter(i, has(i.active) && size(i.tags) > 0).size()'

    expect(program(source).calls.map((call) => call.name)).toEqual(['size', 'filter', 'has', 'size'])
  })

  test('names the clock where it is read', () => {
    const source = 'now() > timestamp("2026-01-01T00:00:00Z")'

    expect(program(source).calls.map((call) => [call.name, spelled(source, call.position)])).toEqual([
      ['now', 'now()'],
      ['timestamp', 'timestamp("2026-01-01T00:00:00Z")'],
    ])
  })

  test('is empty for an expression of operators alone', () => {
    expect(program('qty * 2 + 1').calls).toEqual([])
  })
})

/**
 * `int(double("4.35") * 100.0)` is an int and evaluates to 434, which a caller could not tell from
 * an exact integer. A caller that needs exact numbers, a report printing an amount, has to see
 * where a value passed through a double or lost a remainder.
 */
describe('a program says where it computes through a double or divides integers', () => {
  test('a double is named once, where it is outermost, not at every part of it', () => {
    const source = 'int(double("4.35") * 100.0)'

    expect(program(source).inexact.map((step) => [step.kind, spelled(source, step.position)])).toEqual([['double', 'double("4.35") * 100.0']])
  })

  test('a double read from a variable or written as a literal is named', () => {
    expect(program('price > 1').inexact.map((step) => step.kind)).toEqual(['double'])
    const source = 'qty > 0.5'
    expect(program(source).inexact.map((step) => spelled(source, step.position))).toEqual(['0.5'])
  })

  test('an integer division is named, and so is one over unsigned integers', () => {
    expect(program('qty / 2').inexact).toEqual([{ kind: 'integer_division', position: { start: 0, end: 7 } }])
    expect(program('10u / 3u').inexact.map((step) => step.kind)).toEqual(['integer_division'])
  })

  test('inside a comprehension’s body too', () => {
    const doubles = 'items.map(i, i * 0.5)'
    expect(program(doubles).inexact.map((step) => [step.kind, spelled(doubles, step.position)])).toEqual([['double', 'i * 0.5']])
    const divided = '[1, 2].map(x, x / 2)'
    expect(program(divided).inexact.map((step) => [step.kind, spelled(divided, step.position)])).toEqual([['integer_division', 'x / 2']])
  })

  test('is empty for exact arithmetic: integers without division, a remainder, and decimals', () => {
    expect(program('qty * 3 - 1').inexact).toEqual([])
    expect(program('qty % 2').inexact).toEqual([])
    expect(program('divide(total, dec("3"), 2) + dec("0.10") * total').inexact).toEqual([])
  })

  // Documented, not wanted: the checker types a dyn read as dyn, so what it holds when the
  // expression runs is not known here. A caller that needs this exact declares the variable's type.
  test('says nothing of a value the checker types as dyn', () => {
    expect(program('anything * anything').inexact).toEqual([])
  })
})
