import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'textarea' },
    ],
  },
}

describe('field props', () => {
  test('the control carries its id, name and the label points at it', () => {
    const engine = createFormEngine({ schema })
    const { props, ids } = engine.getFieldSnapshot(['email'])

    expect(props.control.id).toBe(ids.control)
    expect(props.control.name).toBe('email')
    expect(props.label.id).toBe(ids.label)
    expect(props.label.for).toBe(ids.control)
  })

  test('a pristine invalid field claims nothing: no aria-invalid, no describedby', () => {
    const engine = createFormEngine({ schema })
    engine.validate()

    const { props } = engine.getFieldSnapshot(['email'])

    expect(props.control['aria-invalid']).toBeUndefined()
    expect(props.control['aria-describedby']).toBeUndefined()
  })

  test('a touched invalid field is aria-invalid and described by its error', () => {
    const engine = createFormEngine({ schema })
    engine.validate()
    engine.touch(['email'])

    const { props, ids } = engine.getFieldSnapshot(['email'])

    expect(props.control['aria-invalid']).toBe(true)
    expect(props.control['aria-describedby']).toBe(ids.error)
    expect(props.error.id).toBe(ids.error)
  })

  test('a touched valid field claims validity by omission, never aria-invalid=false', () => {
    const engine = createFormEngine({ schema, initialValue: { email: 'a@b.ch' } })
    engine.validate()
    engine.touch(['email'])

    const { props } = engine.getFieldSnapshot(['email'])

    expect('aria-invalid' in props.control).toBe(false)
  })

  test('aria-required reflects the effective, expression-driven requiredness', () => {
    const withRule: FormSchema = {
      ...schema,
      logic: { rules: [{ target: 'message', kind: 'required', cel: 'email != null' }] },
    }
    const engine = createFormEngine({
      schema: withRule,
      capabilities: { now: () => 0, today: () => '2026-09-19', random: () => 0.5 },
    })

    expect(engine.getFieldSnapshot(['message']).props.control['aria-required']).toBeUndefined()

    engine.setValue(['email'], 'a@b.ch')

    expect(engine.getFieldSnapshot(['message']).props.control['aria-required']).toBe(true)
  })

  test('a disabled field carries disabled', () => {
    const withRule: FormSchema = {
      ...schema,
      logic: { rules: [{ target: 'message', kind: 'disabled', cel: 'true' }] },
    }
    const engine = createFormEngine({
      schema: withRule,
      capabilities: { now: () => 0, today: () => '2026-09-19', random: () => 0.5 },
    })

    expect(engine.getFieldSnapshot(['message']).props.control.disabled).toBe(true)
    expect(engine.getFieldSnapshot(['email']).props.control.disabled).toBeUndefined()
  })

  test('props are part of the snapshot, so their identity is stable until the field changes', () => {
    const engine = createFormEngine({ schema })
    const before = engine.getFieldSnapshot(['email']).props

    engine.setValue(['message'], 'unrelated')

    expect(engine.getFieldSnapshot(['email']).props).toBe(before)
  })
})
