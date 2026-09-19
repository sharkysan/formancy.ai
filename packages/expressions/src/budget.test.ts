import { describe, expect, test } from 'vitest'
import { BudgetExceeded, createMeter } from './budget.js'
import { Decimal } from './decimal.js'

describe('the step meter', () => {
  test('charges one step per read of the metered value bag', () => {
    const meter = createMeter({ maxSteps: 100 })
    const values = meter.measure({ a: { b: 1 } }) as { a: { b: number } }

    expect(values.a.b).toBe(1)
    expect(meter.steps).toBe(2)
  })

  test('stops an expression that reads more than its budget', () => {
    const meter = createMeter({ maxSteps: 3 })
    const values = meter.measure({ list: [1, 2, 3, 4, 5, 6] }) as { list: number[] }

    expect(() => values.list.reduce((sum, n) => sum + n, 0)).toThrow(BudgetExceeded)
    expect(meter.steps).toBeGreaterThan(3)
  })

  test('charges work that is not a read, such as a function call', () => {
    const meter = createMeter({ maxSteps: 2 })

    meter.charge()
    meter.charge()
    expect(() => meter.charge()).toThrow(BudgetExceeded)
  })

  test('remembers that it went over, because a swallowed error must still count', () => {
    const meter = createMeter({ maxSteps: 1 })

    meter.charge()
    expect(meter.overspent).toBeUndefined()
    expect(() => meter.charge()).toThrow(BudgetExceeded)
    expect(meter.overspent?.reason).toBe('steps')
  })

  test('reports which bound was hit', () => {
    const meter = createMeter({ maxSteps: 0 })

    try {
      meter.charge()
      expect.unreachable('the meter should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(BudgetExceeded)
      expect((error as BudgetExceeded).reason).toBe('steps')
    }
  })
})

describe('the metered view of a value bag', () => {
  test('passes through values whose behaviour a proxy would break', () => {
    const date = new Date(0)
    const money = new Decimal(1n, 2)
    const meter = createMeter({ maxSteps: 100 })
    const values = meter.measure({ date, money }) as { date: Date; money: Decimal }

    // A Proxy has no internal slots, so a wrapped Date throws from getTime().
    expect(values.date).toBe(date)
    expect(values.date.getTime()).toBe(0)
    expect(values.money).toBe(money)
  })

  test('meters arrays element by element, which is what bounds a comprehension', () => {
    const meter = createMeter({ maxSteps: 1000 })
    const values = meter.measure({ items: [1, 2, 3] }) as { items: number[] }

    let total = 0
    for (const item of values.items) total += item

    expect(total).toBe(6)
    expect(meter.steps).toBeGreaterThanOrEqual(4)
  })
})

describe('the time bound', () => {
  test('stops a pass that outlives its wall-clock budget', () => {
    let clock = 0
    const meter = createMeter({
      maxSteps: 1_000_000,
      maxDurationMs: 50,
      monotonicMs: () => (clock += 10),
    })

    expect(() => {
      for (let i = 0; i < 10_000; i++) meter.charge()
    }).toThrow(BudgetExceeded)
  })

  test('leaves the pass alone while it is inside the time budget', () => {
    const meter = createMeter({ maxSteps: 1_000_000, maxDurationMs: 50, monotonicMs: () => 0 })

    for (let i = 0; i < 10_000; i++) meter.charge()
    expect(meter.steps).toBe(10_000)
  })
})
