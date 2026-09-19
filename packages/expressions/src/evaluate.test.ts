import { describe, expect, test } from 'vitest'
import { captureCapabilities, fixedCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import { evaluate } from './evaluate.js'
import type { CompileOptions } from './compile.js'
import type { Program } from './compile.js'

const capabilities = fixedCapabilities({
  nowMs: Date.UTC(2026, 8, 19, 10, 30, 0),
  today: '2026-09-19',
  random: 0.25,
})

/** Compile or fail the test loudly; these sources are all valid. */
function program(source: string, options: CompileOptions): Program {
  const result = compile(source, options)
  if (!result.ok) throw result.error
  return result.program
}

function valueOf(source: string, options: CompileOptions, values: Record<string, unknown>) {
  const result = evaluate(program(source, options), values, { capabilities })
  if (!result.ok) throw result.error
  return result.value
}

const visible: CompileOptions = {
  kind: 'visible',
  variables: { age: 'int', name: 'string', items: 'list' },
}
const computed: CompileOptions = {
  kind: 'computed',
  variables: { age: 'int', name: 'string', items: 'list' },
}

describe('evaluate', () => {
  test('answers a visible expression against a value bag', () => {
    expect(valueOf('age >= 18', visible, { age: 21, name: 'a', items: [] })).toBe(true)
    expect(valueOf('age >= 18', visible, { age: 17, name: 'a', items: [] })).toBe(false)
  })

  test('takes integers as JavaScript numbers and gives them back as numbers', () => {
    expect(valueOf('age + 1', computed, { age: 21, name: 'a', items: [] })).toBe(22)
  })

  test('reuses one compiled program across evaluations', () => {
    const compiled = program('age >= 18', visible)

    const young = evaluate(compiled, { age: 5, name: 'a', items: [] }, { capabilities })
    const old = evaluate(compiled, { age: 50, name: 'a', items: [] }, { capabilities })

    expect([young, old]).toEqual([
      { ok: true, value: false, steps: expect.any(Number) },
      { ok: true, value: true, steps: expect.any(Number) },
    ])
  })

  test('reads a list of maps', () => {
    const values = { age: 1, name: 'a', items: [{ active: true }, { active: false }] }
    expect(valueOf('items.filter(i, i.active).size()', computed, values)).toBe(1)
  })
})

describe('injected capabilities', () => {
  test('two calls to now() in one evaluation return the same instant', () => {
    let tick = 0
    const advancing = captureCapabilities({
      // A source that moves every time it is asked, so an unfrozen clock shows.
      now: () => Date.UTC(2026, 8, 19) + (tick += 1000),
      today: () => '2026-09-19',
      random: () => 0.5,
    })
    const compiled = program('now() == now()', { kind: 'computed', variables: {} })

    expect(evaluate(compiled, {}, { capabilities: advancing })).toEqual({
      ok: true,
      value: true,
      steps: expect.any(Number),
    })
  })

  test('now() is the instant the caller passed in, not the machine clock', () => {
    expect(valueOf('string(now())', computed, { age: 1, name: 'a', items: [] })).toBe(
      '2026-09-19T10:30:00Z',
    )
  })

  test('today() is the caller civil date at midnight UTC', () => {
    expect(valueOf('string(today())', computed, { age: 1, name: 'a', items: [] })).toBe(
      '2026-09-19T00:00:00Z',
    )
  })

  test('random() is one draw for the whole pass', () => {
    expect(valueOf('random() == random()', computed, { age: 1, name: 'a', items: [] })).toBe(true)
    expect(valueOf('random()', computed, { age: 1, name: 'a', items: [] })).toBe(0.25)
  })
})

describe('evaluation failures are expression errors, never crashes', () => {
  test('reports a declared variable that the value bag does not have', () => {
    const result = evaluate(program('age > 1', visible), {}, { capabilities })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('runtime')
    expect(result.error.code).toBe('missing_variable')
    expect(result.error.message).toMatch(/age/)
  })

  test('reports a missing key inside a dynamic value', () => {
    const result = evaluate(
      program('items[0].price > 1', { kind: 'visible', variables: { items: 'list' } }),
      { items: [{}] },
      { capabilities },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('runtime')
    expect(result.error.name).toBe('ExpressionError')
  })

  test('reports an integer that is too large to be exact as a number', () => {
    const result = evaluate(
      program('big + big', { kind: 'computed', variables: { big: 'int' } }),
      { big: Number.MAX_SAFE_INTEGER },
      { capabilities },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('int_out_of_range')
  })
})

describe('the runtime budget', () => {
  test('stops a quadratic comprehension over data the author never saw', () => {
    const items = Array.from({ length: 200 }, (_, index) => ({ n: index }))
    const compiled = program('items.all(x, items.exists(y, y.n == x.n))', {
      kind: 'visible',
      variables: { items: 'list' },
    })

    const result = evaluate(compiled, { items }, { capabilities })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('budget')
    expect(result.error.code).toBe('steps_exceeded')
  })

  test('leaves the same expression alone on a small collection', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ n: index }))
    const compiled = program('items.all(x, items.exists(y, y.n == x.n))', {
      kind: 'visible',
      variables: { items: 'list' },
    })

    expect(evaluate(compiled, { items }, { capabilities }).ok).toBe(true)
  })

  test('honours a caller budget that is tighter than the default', () => {
    const compiled = program('items.all(x, x.n > 0)', {
      kind: 'visible',
      variables: { items: 'list' },
    })
    const items = Array.from({ length: 50 }, (_, index) => ({ n: index + 1 }))

    const result = evaluate(compiled, { items }, { capabilities, budget: { maxSteps: 10 } })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('budget')
  })
})

describe('compile', () => {
  test('reports the result type and the paths the expression reads', () => {
    const compiled = program('age >= 18 && items.exists(i, i.tag == name)', computed)

    expect(compiled.resultType).toBe('bool')
    expect(compiled.references).toEqual(['age', 'items', 'name'])
    expect(compiled.kind).toBe('computed')
    expect(compiled.source).toBe('age >= 18 && items.exists(i, i.tag == name)')
  })

  test('refuses to produce a program from an expression it would reject', () => {
    const result = compile('age > "x"', visible)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('type')
  })
})
