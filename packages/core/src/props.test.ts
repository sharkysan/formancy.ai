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

describe('a list of ticks drawn as a tag picker', () => {
  /*
   * A tag picker is one combobox with the chosen answers beside it, not a group of boxes, and
   * the engine decided whether a field is a group from its type alone. So a required one was
   * told to say so as a group does — by a hint its renderer never draws, since the hint is a
   * fieldset's — and not with `aria-required`, which a combobox supports: its box pointed at an
   * id nothing carried, and nothing said the field was required (hazard D4). The same list drawn
   * as boxes is still a group.
   */
  const topics = (widget?: 'tagpicker'): FormSchema => ({
    specVersion: '4',
    id: 'topics',
    title: 'Topics',
    model: {
      fields: [
        {
          key: 'topics',
          type: 'selectboxes',
          label: 'Topics',
          required: true,
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          ...(widget === undefined ? {} : { widget }),
        },
      ],
    },
  })

  test('is one control, so a required one carries aria-required and names no hint', () => {
    const snapshot = createFormEngine({ schema: topics('tagpicker') }).getFieldSnapshot(['topics'])

    expect(snapshot.props.control['aria-required']).toBe(true)
    expect(snapshot.props.control['aria-describedby'] ?? '').not.toContain(snapshot.ids.hint)
  })

  test('drawn as boxes, is a group, which says it is required by its hint', () => {
    const snapshot = createFormEngine({ schema: topics() }).getFieldSnapshot(['topics'])

    expect(snapshot.props.control['aria-required']).toBeUndefined()
    expect(snapshot.props.control['aria-describedby']).toContain(snapshot.ids.hint)
  })
})
