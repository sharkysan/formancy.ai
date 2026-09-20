import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { createBuilderSession } from './session.js'

/** A form with every structural situation the builder has to handle: pages,
 *  a group, a repeater, choice options and a logic rule. */
export const base: FormSchema = {
  specVersion: '1',
  id: 'trip',
  title: 'Trip report',
  model: {
    fields: [
      {
        key: 'intro',
        type: 'page',
        fields: [
          { key: 'email', type: 'text', required: true },
          { key: 'summary', type: 'textarea' },
        ],
      },
      {
        key: 'details',
        type: 'page',
        fields: [
          {
            key: 'address',
            type: 'group',
            fields: [{ key: 'city', type: 'text' }],
          },
          {
            key: 'passengers',
            type: 'repeater',
            fields: [
              { key: 'name', type: 'text' },
              {
                key: 'seat',
                type: 'select',
                options: [
                  { value: 'window', label: 'Window' },
                  { value: 'aisle', label: 'Aisle' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  logic: {
    rules: [{ target: 'summary', kind: 'visible', cel: 'email != ""' }],
  },
}

/** A deep clone, so tests never mutate `base`. JSON round-trip rather than
 *  structuredClone: this package must not depend on Node or DOM globals, and
 *  schemas are JSON by definition. */
export function clone(schema: FormSchema): FormSchema {
  return JSON.parse(JSON.stringify(schema)) as FormSchema
}

export function revise(edit: (draft: FormSchema) => void): FormSchema {
  const draft = clone(base)
  edit(draft)
  return draft
}

describe('createBuilderSession', () => {
  test('holds the initial document and exports an equal copy', () => {
    const session = createBuilderSession(base)
    expect(session.exportDocument()).toEqual(base)
  })

  test('exportDocument returns a copy, not a window into the session', () => {
    const session = createBuilderSession(base)
    const exported = session.exportDocument()
    exported.title = 'Mutated outside'
    expect(session.document().title).toBe('Trip report')
  })

  test('does not adopt later mutations of the document it was given', () => {
    const initial = clone(base)
    const session = createBuilderSession(initial)
    initial.title = 'Changed behind the session'
    expect(session.document().title).toBe('Trip report')
  })

  test('the held document is frozen, so it cannot be corrupted in place', () => {
    const session = createBuilderSession(base)
    const held = session.document() as { title: string }
    expect(() => {
      held.title = 'overwritten'
    }).toThrow(TypeError)
  })

  test('refuses to open a document the validator rejects', () => {
    // `email` already exists inside the intro page; keys are unique form-wide.
    const broken = revise((d) => {
      d.model.fields.push({ key: 'email', type: 'text' })
    })
    expect(() => createBuilderSession(broken)).toThrowError(/already uses the key/)
  })

  test('starts at revision 0 with nothing to undo or redo', () => {
    const session = createBuilderSession(base)
    expect(session.revision()).toBe(0)
    expect(session.canUndo()).toBe(false)
    expect(session.canRedo()).toBe(false)
  })

  test('canPublish reports the validator verdict, which holds by construction', () => {
    const session = createBuilderSession(base)
    expect(session.canPublish().valid).toBe(true)
  })

  test('a subscriber hears nothing until something is accepted', () => {
    const session = createBuilderSession(base)
    let calls = 0
    session.subscribe(() => {
      calls += 1
    })
    session.exportDocument()
    session.canPublish()
    expect(calls).toBe(0)
  })
})

/**
 * WCAG 2.2 SC 2.5.7 asks for a keyboard alternative to dragging that does the
 * same job — not a reduced one. A drag can drop a field between any two
 * others, so the list of targets has to offer that too.
 */
describe('validTargets offers every position, not just the end', () => {
  const schema = {
    specVersion: '1',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'customer', type: 'text', label: 'Customer' },
        {
          key: 'billing',
          type: 'group',
          label: 'Billing',
          fields: [
            { key: 'street', type: 'text', label: 'Street' },
            { key: 'city', type: 'text', label: 'City' },
          ],
        },
      ],
    },
  } as unknown as FormSchema

  const offered = (session: ReturnType<typeof createBuilderSession>, path: string[]): string[] =>
    session.validTargets(path).map((target) => `${target.parent.join('/')}#${String(target.index)}`)

  test('a field can land between two others inside a container', () => {
    const session = createBuilderSession(schema)

    const targets = offered(session, ['customer'])

    // Before Street, between Street and City, after City — three positions in
    // a container holding two fields, not one.
    expect(targets).toContain('billing#0')
    expect(targets).toContain('billing#1')
    expect(targets).toContain('billing#2')
  })

  test('and between two others at the top level', () => {
    const session = createBuilderSession(schema)

    // Moving Street out of the group: it can go before Customer, after it, or
    // at the end.
    expect(offered(session, ['billing', 'street'])).toEqual(
      expect.arrayContaining(['#0', '#1', '#2']),
    )
  })

  test('every offered target is actually accepted, which is the point of trying the edit', () => {
    for (const target of createBuilderSession(schema).validTargets(['customer'])) {
      const session = createBuilderSession(schema)
      const outcome = session.moveField(['customer'], target)
      expect(outcome.ok, `${target.parent.join('/')}#${String(target.index)}`).toBe(true)
    }
  })

  test('a container is still not offered a home inside itself', () => {
    const session = createBuilderSession(schema)

    expect(offered(session, ['billing']).some((target) => target.startsWith('billing'))).toBe(false)
  })
})
