import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import { DEFAULT_LIMITS, EXPRESSION_KINDS, KIND_POLICIES, compile } from '@formancy/expressions'
import type { FormSchema, LogicRule } from '@formancy/spec'

/**
 * What `concepts/logic.md` says an expression may call, and what it tells somebody who
 * wants a total over a repeater's rows — each held to the engine rather than proofread.
 *
 * An agent building a demo form found there was nothing to add a list up with, and the
 * page did not say so: it listed no functions at all. The list it gives now is the
 * allow-list the engine enforces, read from `KIND_POLICIES`, and the workaround it gives
 * is taken out of the page and run, because a workaround written from reasoning is the
 * kind of advice that is wrong in the one detail that matters. This one was, when it was
 * first written: the obvious cap, `maxItems` on the repeater, capped nothing, and the
 * obvious place for a rule that caps it, the repeater, ran nothing. These cases asserted
 * both so that enforcing either would fail them, which is what happened on 2026-10-18
 * (0184); they now hold the cap the page gives instead.
 *
 * When a case here fails because the engine changed — a `sum` arrived, a repeater's bound
 * stopped being enforced — the page is what is out of date, not the case.
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'content', 'docs', 'concepts', 'logic.md'), 'utf8')

const CLOCK = { now: () => 0, today: () => '2026-10-18', random: () => 0.5 }

/** The part of the page from one `## ` heading to the next. */
function section(heading: string): string {
  const from = page.indexOf(`\n## ${heading}\n`)
  expect(from, `"## ${heading}" is gone from logic.md`).toBeGreaterThan(-1)
  const to = page.indexOf('\n## ', from + 1)
  return page.slice(from, to === -1 ? undefined : to)
}

/** The table's rows: the function names in the second cell, and the kinds in the third. */
function functionTable(): Array<{ names: string[]; kinds: string }> {
  const rows: Array<{ names: string[]; kinds: string }> = []
  for (const line of section('What an expression may call').split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length !== 5) continue
    const [, , names, kinds] = cells as [string, string, string, string]
    const found = [...names.matchAll(/`([A-Za-z_]+)`/g)].map((match) => match[1]!)
    if (found.length === 0) continue
    rows.push({ names: found, kinds })
  }
  return rows
}

/** Which kinds a row's third cell names: every one, or those it spells out. */
function kindsOf(cell: string): string[] {
  if (cell === 'every kind') return [...EXPRESSION_KINDS]
  return [...cell.matchAll(/`([a-z]+)`/g)].map((match) => match[1]!)
}

describe('what logic.md says an expression may call', () => {
  test('is the allow-list the engine enforces, kind by kind', () => {
    // A function added to a kind and not to the page fails here, and so does one the page
    // offers that the kind refuses — the second is the worse, since an author who follows
    // the page is refused with no idea why. `sum` arriving would land in this table, next
    // to the paragraph saying there is none.
    const rows = functionTable()
    expect(rows.length, 'the function table parsed to nothing').toBeGreaterThan(0)

    const offered = new Map<string, Set<string>>(EXPRESSION_KINDS.map((kind) => [kind, new Set()]))
    for (const { names, kinds } of rows) {
      const named = kindsOf(kinds)
      expect(named.length, `a row names no kind: ${kinds}`).toBeGreaterThan(0)
      for (const kind of named) for (const name of names) offered.get(kind)?.add(name)
    }

    for (const kind of EXPRESSION_KINDS) {
      expect([...offered.get(kind)!].sort(), kind).toEqual([...KIND_POLICIES[kind].allowedFunctions].sort())
    }
  })
})

/** A form with a repeater of fees and a total beside it, under the rules given. */
const feeForm = (rules: readonly unknown[], repeater: Record<string, unknown> = {}): FormSchema =>
  ({
    specVersion: '4',
    id: 'fees',
    title: 'Fees',
    model: {
      fields: [
        {
          key: 'fees',
          type: 'repeater',
          label: 'Fees',
          ...repeater,
          fields: [{ key: 'amount', type: 'number', label: 'Amount' }],
        },
        { key: 'total', type: 'number', label: 'Total' },
      ],
    },
    logic: { rules },
  }) as unknown as FormSchema

/** Why building the form fails, or `undefined` when it builds. */
function refusal(rules: readonly unknown[]): string | undefined {
  try {
    createFormEngine({ schema: feeForm(rules), capabilities: CLOCK })
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** The server's replay of these answers: the stored total, and what refused them. */
function replay(rules: readonly unknown[], fees: readonly unknown[], repeater: Record<string, unknown> = {}) {
  const engine = createFormEngine({
    schema: feeForm(rules, repeater),
    capabilities: CLOCK,
    mode: 'server',
    // What the browser claimed, which the replay overwrites.
    initialValue: { fees, total: 999 },
  })
  const outcome = engine.submit()
  return { total: (engine.value() as { total?: unknown }).total, errors: outcome.errors }
}

/** The page's own example, taken out of its two code blocks: the repeater, then the rules. */
function pageExample(): { repeater: Record<string, unknown>; rules: LogicRule[] } {
  const blocks = [...section('No function adds up a list').matchAll(/```jsonc\n([\s\S]*?)\n```/g)].map((match) => match[1]!)
  expect(blocks, 'the workaround is a repeater and its rules, one block each').toHaveLength(2)
  const [repeater, rules] = blocks as [string, string]
  return {
    repeater: JSON.parse(repeater) as Record<string, unknown>,
    rules: JSON.parse(`[${rules}]`) as LogicRule[],
  }
}

/** The rules in the page's own example. */
const pageRules = (): LogicRule[] => pageExample().rules

/** The repeater's properties the page sets, beside the key, type and fields `feeForm` has. */
function pageBounds(): Record<string, unknown> {
  const { key, type, fields, ...bounds } = pageExample().repeater
  // The page's repeater is the one these forms hold, or its bound is about another list.
  expect({ key, type, fields }).toEqual({ key: 'fees', type: 'repeater', fields: [{ key: 'amount', type: 'number' }] })
  return bounds
}

const FOUR_FEES = [{ amount: 10 }, { amount: 20 }, { amount: 30 }, { amount: 40 }]

/**
 * One row's term in a total written out row by row: the row exists, it has an `amount`
 * (a row the add button made has none), and the amount is answered.
 */
const term = (row: number) => {
  const at = String(row)
  return `(size(fees) > ${at} && 'amount' in fees[${at}] && fees[${at}].amount != null ? fees[${at}].amount : 0.0)`
}

describe('what logic.md says about adding up a list', () => {
  test('no spelling of a total builds', () => {
    // The page's first claim. Each is a way somebody would reach for one: CEL's extension
    // libraries spell it as a function, a method or a macro. None of them is in this
    // engine, and `bind`, which is, is refused by the allow-list.
    const spellings = [
      'sum(fees.map(f, f.amount))',
      'fees.map(f, f.amount).sum()',
      'math.sum(fees.map(f, f.amount))',
      'fees.fold(f, acc, acc + f.amount)',
      'fees.reduce(f, acc, acc + f.amount)',
      'cel.bind(a, fees.map(f, f.amount), a[0] + a[1])',
    ]
    const built = spellings.filter((cel) => refusal([{ target: 'total', kind: 'computed', cel }]) === undefined)
    expect(built).toEqual([])
  })

  test('its example totals the rows it names, and refuses one more', () => {
    // The workaround, run as the server runs it. A total that read one row too few, or a
    // cap that refused nothing, would be advice that stores a wrong total.
    const rules = pageRules()
    expect(replay(rules, [{ amount: 10 }, { amount: 20.5 }, { amount: null }], pageBounds())).toEqual({
      total: 30.5,
      errors: {},
    })
    expect(replay(rules, FOUR_FEES, pageBounds()).errors).toEqual({ fees: ['maxItems'] })
  })

  test('its example totals a row nobody has typed into as nothing, in the browser', async () => {
    // A row the add button made has no `amount` at all, which is not the `null` the replay
    // above was handed; a term that errored there would leave the total unwritten while the
    // person types. Read after the microtask the engine evaluates in, as a renderer reads it.
    const engine = createFormEngine({ schema: feeForm(pageRules(), pageBounds()), capabilities: CLOCK })
    engine.addRow(['fees'])
    engine.addRow(['fees'])
    engine.setValue(['fees', 1, 'amount'], 12.5)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(engine.getFieldSnapshot(['total']).value).toBe(12.5)
  })

  test('its cap is the one the total names, and no row is added past it', () => {
    // The page sets `maxItems` to the rows its total writes out. One more than that and a
    // fourth fee is stored and left out of the total; one fewer and a fee the total could
    // count is refused. And the engine adds no row past it, so neither renderer offers one.
    const named = pageRules()
      .find((rule) => rule.kind === 'computed')!
      .cel!.match(/size\(fees\) > \d+/g)!.length
    expect(pageBounds()).toEqual({ maxItems: named })

    const engine = createFormEngine({ schema: feeForm(pageRules(), pageBounds()), capabilities: CLOCK })
    for (let row = 0; row < named; row += 1) engine.addRow(['fees'])
    expect(engine.canAddRow(['fees'])).toBe(false)
    expect(() => engine.addRow(['fees'])).toThrow(RangeError)
    expect(engine.rowCount(['fees'])).toBe(named)
  })

  test('the cap the page used to give still refuses the same row', () => {
    // A form written from the page before 2026-10-18 carries a `validate` rule on the total
    // and no `maxItems`. The page says it keeps working, under the total rather than on the
    // repeater; and the same rule aimed at the repeater, which the page said was never run,
    // is run now and refuses there.
    const total = pageRules().filter((rule) => rule.kind === 'computed')
    const cap = { target: 'total', kind: 'validate', cel: 'size(fees) <= 3', code: 'tooManyFees' } as LogicRule
    expect(section('No function adds up a list')).toContain(`\`${cap.cel!}\``)
    expect(replay([...total, cap], FOUR_FEES).errors).toEqual({ total: ['tooManyFees'] })
    expect(replay([...total, { ...cap, target: 'fees' }], FOUR_FEES).errors).toEqual({ fees: ['tooManyFees'] })
  })

  test('the number of rows the page names is the most its shape compiles to', () => {
    // A number on the page, so it is measured here rather than trusted: the structural
    // limit on an expression is what caps a total written out row by row. The shape is the
    // page's own — its example must be exactly these terms — so a guard dropped from the
    // example, or added, moves the number this checks. If the limit moves, the page's
    // number is wrong and this says so.
    const computed = pageRules().find((rule) => rule.kind === 'computed')!
    expect(computed.cel).toBe([0, 1, 2].map(term).join(' + '))

    const compiles = (rows: number) =>
      compile(Array.from({ length: rows }, (_, row) => term(row)).join(' + '), {
        kind: 'computed',
        variables: { fees: 'list' },
      }).ok
    let most = 0
    while (compiles(most + 1)) most += 1

    expect(most).toBeGreaterThan(3)
    expect(section('No function adds up a list')).toContain(`stops at ${String(most)} rows`)
  })

  test('its question in place of a total answers over rows nobody has typed into', async () => {
    // The first thing the page offers instead. A row the add button made has no `amount`,
    // and a predicate that read it unguarded errors there unless another row settles it:
    // a fee lowered back under the limit beside an untouched row left the answer saying
    // "over", the last thing it could evaluate. Taken from the page, so the guard it shows
    // is the one held.
    const asked = /`(fees\.exists\([^`]+\))`/.exec(section('No function adds up a list'))?.[1]
    expect(asked, 'the page offers no question over the rows').toBeDefined()

    const engine = createFormEngine({
      schema: {
        ...feeForm([]),
        model: {
          fields: [...feeForm([]).model.fields, { key: 'overLimit', type: 'checkbox', label: 'Over the limit' }],
        },
        logic: { rules: [{ target: 'overLimit', kind: 'computed', cel: asked! }] },
      } as unknown as FormSchema,
      capabilities: CLOCK,
    })
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
    engine.addRow(['fees'])
    engine.addRow(['fees'])
    await settle()
    expect(engine.getFieldSnapshot(['overLimit']).value).toBe(false)
    engine.setValue(['fees', 1, 'amount'], 600)
    await settle()
    expect(engine.getFieldSnapshot(['overLimit']).value).toBe(true)
    engine.setValue(['fees', 1, 'amount'], 10)
    await settle()
    expect(engine.getFieldSnapshot(['overLimit']).value).toBe(false)
  })

  test('a running total down the rows is refused as a cycle', () => {
    // The other way round the missing function, and the page says it does not work: a row
    // reading the repeater reads every row, its own included.
    const why = refusal([{ target: 'fees[].amount', kind: 'computed', cel: 'index == 0 ? 0.0 : fees[index - 1].amount + 1.0' }])
    expect(why).toMatch(/cycle/i)
  })

  test('counting characters adds up whole numbers, and is bounded by the longest literal', () => {
    // The trick the page names so nobody mistakes it for a total. It is exact for whole
    // numbers no larger than the literal, and a literal longer than the limit is refused.
    const literal = (length: number) => `"${'x'.repeat(length)}"`
    const counted = (length: number) => `double(size(fees.map(f, ${literal(length)}.substring(0, int(f.amount))).join("")))`
    expect(replay([{ target: 'total', kind: 'computed', cel: counted(50) }], FOUR_FEES)).toEqual({
      total: 100,
      errors: {},
    })
    expect(refusal([{ target: 'total', kind: 'computed', cel: counted(DEFAULT_LIMITS.maxStringLiteralLength) }])).toBe(undefined)
    expect(refusal([{ target: 'total', kind: 'computed', cel: counted(DEFAULT_LIMITS.maxStringLiteralLength + 1) }])).toBeDefined()
  })
})
