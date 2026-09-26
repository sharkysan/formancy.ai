import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyArrangeSurface } from './arrange-surface.js'

afterEach(cleanup)

/**
 * Arranging on the preview.
 *
 * The rendered form stands in for `@formancy/react` here, carrying the two
 * attributes that package emits and nothing else — which is the point: this
 * surface works off inert markup, and depending on the real renderer would
 * hide whether that is still true.
 */
const schema = (): FormSchema => ({
  specVersion: '1',
  id: 'arranged',
  title: 'Sign-up',
  model: {
    fields: [
      { key: 'first', type: 'text', label: 'First name' },
      { key: 'last', type: 'text', label: 'Last name' },
      { key: 'email', type: 'text', label: 'Email' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'first' },
            { kind: 'field', path: 'last' },
          ],
        },
        { kind: 'field', path: 'email' },
      ],
    },
  ],
})

/** What `@formancy/react` renders for that layout, reduced to the attributes. */
function Preview() {
  return (
    <div>
      <div data-formancy-part="layout-row" data-formancy-layout-path="0">
        <div data-formancy-part="field" data-formancy-field-path="first">
          First name
        </div>
        <div data-formancy-part="field" data-formancy-field-path="last">
          Last name
        </div>
      </div>
      <div data-formancy-part="field" data-formancy-field-path="email">
        Email
      </div>
    </div>
  )
}

const open = (): BuilderSession => createBuilderSession(schema())

const surfaceWith = (session: BuilderSession, enabled = true) =>
  render(
    <FormancyArrangeSurface session={session} layout="web" enabled={enabled}>
      <Preview />
    </FormancyArrangeSurface>,
  )

const fieldNamed = (text: string): HTMLElement => screen.getByText(text)

/** jsdom has no DataTransfer, and the surface writes to the one it is given. */
const transfer = (): object => ({
  effectAllowed: '',
  dropEffect: '',
  setData: () => undefined,
  getData: () => '',
})

/**
 * A drag event that actually carries coordinates.
 *
 * jsdom has no `DragEvent`, and Testing Library's fallback drops `clientX` and
 * `clientY` on the floor — so `fireEvent.dragOver(el, { clientX: -1 })` arrives
 * with both undefined and every comparison against a midpoint comes out the
 * same way. Which half of an element a pointer is over is the whole decision
 * this surface makes, so it is dispatched as a `MouseEvent`, which keeps them.
 */
const dragEvent = (
  type: string,
  at: { clientX: number; clientY: number },
  dataTransfer: object,
): Event => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...at })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  return event
}

const NOWHERE = { clientX: 0, clientY: 0 }

/** One whole drag, as the browser fires it: start, over, drop. */
const drag = (from: HTMLElement, to: HTMLElement, at: { clientX: number; clientY: number }): void => {
  const dataTransfer = transfer()
  fireEvent(from, dragEvent('dragstart', NOWHERE, dataTransfer))
  fireEvent(to, dragEvent('dragover', at, dataTransfer))
  fireEvent(to, dragEvent('drop', at, dataTransfer))
}

const boxOf = (element: HTMLElement, side: 'start' | 'end'): { clientX: number; clientY: number } => {
  const box = element.getBoundingClientRect()
  // jsdom gives every element a zero rectangle, so the midpoint is 0 and the
  // half a point falls in is decided by its sign. Said here once rather than
  // left as an unexplained -1 in every test.
  return side === 'start'
    ? { clientX: box.left - 1, clientY: box.top - 1 }
    : { clientX: box.left + 1, clientY: box.top + 1 }
}

describe('enabling', () => {
  test('off, nothing is draggable and the form is only a form', () => {
    const session = open()
    surfaceWith(session, false)

    expect(document.querySelectorAll('[data-arrangeable="true"]')).toHaveLength(0)
    expect(document.querySelector('[data-formancy-part="arrange-surface"]')).toBeNull()
  })

  test('on, every node that maps to the arrangement is picked out', () => {
    surfaceWith(open())

    // The row, and the three fields. Nothing else in the preview maps to a
    // layout node, and marking something that cannot be moved would offer a
    // drag that always fails.
    expect(document.querySelectorAll('[data-arrangeable="true"]')).toHaveLength(4)
  })
})

describe('dropping', () => {
  test('a field outside a row joins it, and the session is what changed', () => {
    const session = open()
    surfaceWith(session)

    drag(fieldNamed('Email'), fieldNamed('First name'), boxOf(fieldNamed('First name'), 'start'))

    expect(session.document().layouts?.[0]?.nodes).toEqual([
      {
        kind: 'row',
        children: [
          { kind: 'field', path: 'email' },
          { kind: 'field', path: 'first' },
          { kind: 'field', path: 'last' },
        ],
      },
    ])
  })

  test('the move is announced, because a silent drag is a silent edit', () => {
    surfaceWith(open())

    drag(fieldNamed('Email'), fieldNamed('First name'), boxOf(fieldNamed('First name'), 'start'))

    expect(screen.getByRole('status').textContent).toContain('Moved to')
  })

  test('a whole row can be picked up, not only the fields in it', () => {
    const session = open()
    surfaceWith(session)

    const row = document.querySelector<HTMLElement>('[data-formancy-layout-path="0"]')!
    drag(row, fieldNamed('Email'), boxOf(fieldNamed('Email'), 'end'))

    expect(session.document().layouts?.[0]?.nodes[0]).toEqual({ kind: 'field', path: 'email' })
  })

  test('a drop onto itself changes nothing and pushes nothing onto undo', () => {
    const session = open()
    surfaceWith(session)

    drag(fieldNamed('Email'), fieldNamed('Email'), boxOf(fieldNamed('Email'), 'start'))

    expect(session.canUndo()).toBe(false)
  })

  test('a row cannot be dropped into its own child', () => {
    const session = open()
    surfaceWith(session)

    const row = document.querySelector<HTMLElement>('[data-formancy-layout-path="0"]')!
    drag(row, fieldNamed('First name'), boxOf(fieldNamed('First name'), 'start'))

    expect(session.canUndo()).toBe(false)
  })

  test('a drop with nothing picked up does nothing', () => {
    const session = open()
    surfaceWith(session)

    fireEvent(
      fieldNamed('Email'),
      dragEvent('drop', boxOf(fieldNamed('Email'), 'start'), transfer()),
    )

    expect(session.canUndo()).toBe(false)
  })
})

describe('dropping on the side to make a row', () => {
  /**
   * The pointer route for what `w` does in the arrangement pane, added after it
   * rather than before — WCAG 2.2 SC 2.5.7 is satisfied by that keyboard path
   * existing, and this calls the same `wrapLayoutNodes` command.
   *
   * These tests give the target a real rectangle. jsdom reports every element as
   * zero-sized, and a side zone measured as a fraction of zero width covers
   * everything except one exact coordinate — which would also have quietly
   * turned every existing drop above into a side drop. The surface therefore
   * requires a MINIMUM WIDTH before it offers side zones at all, which is a real
   * rule and not a test accommodation: a 20px-wide side zone is one nobody can
   * aim at.
   */
  const withBox = (element: HTMLElement, box: { left: number; width: number }): void => {
    element.getBoundingClientRect = () =>
      ({
        left: box.left,
        right: box.left + box.width,
        width: box.width,
        top: 0,
        bottom: 40,
        height: 40,
        x: box.left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
  }

  test('dropping on the left of a field puts both in a row, dragged one first', () => {
    const session = open()
    surfaceWith(session)
    const target = fieldNamed('Email')
    withBox(target, { left: 0, width: 400 })

    // x = 10 is inside the left zone of a 400px box.
    drag(fieldNamed('First name'), target, { clientX: 10, clientY: 20 })

    expect(session.document().layouts?.[0]?.nodes).toEqual([
      { kind: 'row', children: [{ kind: 'field', path: 'last' }] },
      {
        kind: 'row',
        children: [
          { kind: 'field', path: 'first' },
          { kind: 'field', path: 'email' },
        ],
      },
    ])
  })

  test('dropping on the right puts the dragged one second', () => {
    const session = open()
    surfaceWith(session)
    const target = fieldNamed('Email')
    withBox(target, { left: 0, width: 400 })

    drag(fieldNamed('First name'), target, { clientX: 390, clientY: 20 })

    const nodes = JSON.stringify(session.document().layouts?.[0]?.nodes)
    // The side aimed at is what decides the order, which is the whole point of
    // having two zones rather than one.
    expect(nodes.indexOf('email')).toBeLessThan(nodes.indexOf('first'))
  })

  test('the middle still moves it above or below, as it did', () => {
    const session = open()
    surfaceWith(session)
    const target = fieldNamed('Email')
    withBox(target, { left: 0, width: 400 })

    // x = 200 is the middle; y above the midpoint means "before".
    drag(fieldNamed('First name'), target, { clientX: 200, clientY: 5 })

    // A move, not a wrap: the existing gesture is unchanged by the new one.
    expect(screen.getByRole('status').textContent).toContain('Moved to')
  })

  test('a narrow element offers no side zone at all', () => {
    const session = open()
    surfaceWith(session)
    const target = fieldNamed('Email')
    withBox(target, { left: 0, width: 40 })

    drag(fieldNamed('First name'), target, { clientX: 1, clientY: 5 })

    // 40px wide leaves no zone anybody could aim at, so it stays a move. This
    // is also what keeps jsdom's zero-sized rectangles from turning every drop
    // in this file into a side drop.
    expect(screen.getByRole('status').textContent).toContain('Moved to')
  })

  test('the row it makes is announced, not silent', () => {
    surfaceWith(open())
    const target = fieldNamed('Email')
    withBox(target, { left: 0, width: 400 })

    drag(fieldNamed('First name'), target, { clientX: 10, clientY: 20 })

    expect(screen.getByRole('status').textContent).toContain('side by side')
  })

  test('the indicator says which side, so it is not a guess', () => {
    surfaceWith(open())
    const target = fieldNamed('Email')
    withBox(target, { left: 0, width: 400 })
    const dataTransfer = transfer()

    fireEvent(fieldNamed('First name'), dragEvent('dragstart', NOWHERE, dataTransfer))
    fireEvent(target, dragEvent('dragover', { clientX: 10, clientY: 20 }, dataTransfer))

    // Distinct from 'before'/'after', or somebody aiming for a row sees the
    // same line they get for a move.
    expect(target.dataset['drop']).toBe('wrap-start')
  })

  test('it will not wrap something with itself', () => {
    const session = open()
    surfaceWith(session)
    const before = JSON.stringify(session.document().layouts)
    const target = fieldNamed('Email')
    withBox(target, { left: 0, width: 400 })

    drag(target, target, { clientX: 10, clientY: 20 })

    expect(JSON.stringify(session.document().layouts)).toBe(before)
  })
})

describe('the indicator', () => {
  test('is drawn only where the session would accept a drop', () => {
    surfaceWith(open())

    const dataTransfer = transfer()
    fireEvent(fieldNamed('Email'), dragEvent('dragstart', NOWHERE, dataTransfer))
    fireEvent(
      fieldNamed('First name'),
      dragEvent('dragover', boxOf(fieldNamed('First name'), 'start'), dataTransfer),
    )

    // Showing one over an illegal target promises a move that will not happen,
    // which is how a field ends up snapping back with no explanation.
    expect(fieldNamed('First name').dataset['drop']).toBe('before')
  })

  test('is cleared when the pointer leaves', () => {
    surfaceWith(open())

    const dataTransfer = transfer()
    fireEvent(fieldNamed('Email'), dragEvent('dragstart', NOWHERE, dataTransfer))
    fireEvent(
      fieldNamed('First name'),
      dragEvent('dragover', boxOf(fieldNamed('First name'), 'start'), dataTransfer),
    )
    fireEvent(fieldNamed('First name'), dragEvent('dragleave', NOWHERE, transfer()))

    expect(fieldNamed('First name').dataset['drop']).toBeUndefined()
  })

  test('is cleared when the drag is abandoned', () => {
    surfaceWith(open())

    const dataTransfer = transfer()
    fireEvent(fieldNamed('Email'), dragEvent('dragstart', NOWHERE, dataTransfer))
    fireEvent(
      fieldNamed('First name'),
      dragEvent('dragover', boxOf(fieldNamed('First name'), 'start'), dataTransfer),
    )
    fireEvent(fieldNamed('Email'), dragEvent('dragend', NOWHERE, transfer()))

    expect(fieldNamed('First name').dataset['drop']).toBeUndefined()
  })
})
