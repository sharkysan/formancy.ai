import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

const paged: FormSchema = {
  specVersion: '0',
  id: 'onboarding',
  title: 'Onboarding',
  model: {
    fields: [
      {
        key: 'who',
        type: 'page',
        fields: [{ key: 'email', type: 'text', required: true }],
      },
      {
        key: 'what',
        type: 'page',
        fields: [{ key: 'message', type: 'text', required: true }],
      },
    ],
  },
}

describe('engine wizard integration', () => {
  test('a paged schema exposes a wizard sized to its pages', () => {
    const engine = createFormEngine({ schema: paged })
    expect(engine.wizard()?.pageCount).toBe(2)
  })

  test('an unpaged schema has no wizard', () => {
    const engine = createFormEngine({
      schema: { ...paged, model: { fields: [{ key: 'email', type: 'text' }] } },
    })
    expect(engine.wizard()).toBeUndefined()
  })

  test('the same wizard instance is returned every time, so its state survives', () => {
    const engine = createFormEngine({ schema: paged })
    expect(engine.wizard()).toBe(engine.wizard())
  })

  test('next is blocked by an invalid CURRENT page even when later pages are also invalid', async () => {
    const engine = createFormEngine({ schema: paged })

    await expect(engine.wizard()!.next()).resolves.toBe(false)
    expect(engine.wizard()!.page()).toBe(0)
  })

  test('next advances past a valid page regardless of later pages', async () => {
    const engine = createFormEngine({ schema: paged, initialValue: { email: 'a@b.ch' } })

    await expect(engine.wizard()!.next()).resolves.toBe(true)
    expect(engine.wizard()!.page()).toBe(1)
  })

  test('a failed next touches the current page so its errors become visible, and leaves later pages pristine', async () => {
    const engine = createFormEngine({ schema: paged })

    await engine.wizard()!.next()

    expect(engine.getFieldSnapshot(['email']).touched).toBe(true)
    expect(engine.getFieldSnapshot(['email']).errors).toEqual(['required'])
    expect(engine.getFieldSnapshot(['message']).touched).toBe(false)
  })
})

describe('server errors', () => {
  test('applyServerErrors lands on the field snapshot through the same shape as local errors', () => {
    const engine = createFormEngine({ schema: paged, initialValue: { email: 'a@b.ch' } })

    engine.applyServerErrors({ email: ['unique'] })

    expect(engine.getFieldSnapshot(['email']).errors).toEqual(['unique'])
  })

  test('server errors survive a local validate, because the server said so and typing nothing changed', () => {
    const engine = createFormEngine({ schema: paged, initialValue: { email: 'a@b.ch' } })
    engine.applyServerErrors({ email: ['unique'] })

    engine.validate()

    expect(engine.getFieldSnapshot(['email']).errors).toContain('unique')
  })

  test('editing the field clears its server error — the old server verdict no longer describes this value', () => {
    const engine = createFormEngine({ schema: paged, initialValue: { email: 'a@b.ch' } })
    engine.applyServerErrors({ email: ['unique'] })

    engine.setValue(['email'], 'other@b.ch')

    expect(engine.getFieldSnapshot(['email']).errors).toEqual([])
  })

  test('local and server errors on one field are both reported, local first', () => {
    const engine = createFormEngine({ schema: paged })
    engine.validate()
    engine.applyServerErrors({ email: ['unique'] })

    expect(engine.getFieldSnapshot(['email']).errors).toEqual(['required', 'unique'])
  })
})

describe('firstInvalid', () => {
  test('names the first invalid field in document order, for the error summary to focus', () => {
    const engine = createFormEngine({ schema: paged })
    engine.validate()

    expect(engine.firstInvalid()).toBe('email')
  })

  test('is null when the form is clean', () => {
    const engine = createFormEngine({
      schema: paged,
      initialValue: { email: 'a@b.ch', message: 'hello' },
    })
    engine.validate()

    expect(engine.firstInvalid()).toBeNull()
  })
})
