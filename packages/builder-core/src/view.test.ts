import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createBuilderSession } from './session.js'
import { builderView } from './view.js'

/**
 * What both builders read off a session.
 *
 * This lived inside React's `useBuilder` and could only be exercised by
 * rendering a React tree, which is why the one behaviour worth asserting here —
 * that a move list never offers the position a field is already in — was tested
 * by pressing `m` in a component test and reading a dialog.
 *
 * It matters twice over now: two builders showing different destination lists
 * for the same document would be two products, and the difference would be
 * invisible to anybody using only one of them.
 */
const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', label: 'Customer' },
      {
        key: 'billing',
        type: 'group',
        label: 'Billing address',
        fields: [
          { key: 'street', type: 'text', label: 'Street' },
          { key: 'city', type: 'text', label: 'City' },
        ],
      },
    ],
  },
}

describe('the view a builder renders', () => {
  test('flattens the document in the order a person reads the form', () => {
    const view = builderView(createBuilderSession(schema))

    expect(view.nodes.map((node) => node.keyPath.join('.'))).toEqual([
      'customer',
      'billing',
      'billing.street',
      'billing.city',
    ])
  })

  test('never offers the position a field is already in', () => {
    // The session offers it, correctly: staying put is a legal destination. A
    // list whose first entry does nothing makes somebody read it to find that
    // out, on the surface whose whole premise is that the keyboard is as good as
    // the pointer.
    const view = builderView(createBuilderSession(schema))

    const labels = view.moveTargetsFor(['customer']).map((target) => target.label)

    expect(labels.length).toBeGreaterThan(0)
    for (const target of view.moveTargetsFor(['customer'])) {
      const staysPut = target.location.parent.length === 0 && target.location.index === 0
      expect(staysPut, target.label).toBe(false)
    }
  })

  test('and describes every destination in words rather than as an index', () => {
    const view = builderView(createBuilderSession(schema))

    for (const target of view.moveTargetsFor(['customer'])) {
      // A palette reading "0, 1, 2" is a keyboard route in the sense that it
      // exists. The labels are what make it the equal of a drag.
      expect(target.label).toMatch(/[a-z]/i)
      expect(target.label).not.toMatch(/^\d+$/)
    }
  })

  test('reports what the session says about publishing, rather than deciding again', () => {
    const view = builderView(createBuilderSession(schema))

    expect(view.publishable.valid).toBe(true)
  })

  test('and follows the session, because it is read per revision and not cached', () => {
    // The contract the bindings depend on: React memoises this on `revision()`
    // and Angular recomputes a signal from the same number, so anything cached
    // HERE would be a third opinion about when the document changed.
    const session = createBuilderSession(schema)
    session.removeField(['customer'])

    expect(builderView(session).nodes.map((node) => node.keyPath.join('.'))).toEqual([
      'billing',
      'billing.street',
      'billing.city',
    ])
  })
})
