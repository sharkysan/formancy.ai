import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyArrangeSurface } from './arrange-surface'

/**
 * Arranging on the preview, in Angular.
 *
 * The same assertions as `packages/builder-react/src/arrange-surface.test.tsx`,
 * because the two surfaces are one feature: the rendered form is a drop target
 * in both, going through the same session commands, and a drag that lands in a
 * different place in one of them is a bug a user finds by switching builders.
 *
 * The preview here stands in for `@formancy/angular`, carrying the two
 * attributes that package emits and nothing else — which is the point. The
 * surface works off inert markup, and mounting the real renderer would hide
 * whether that is still true.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const schema = (): FormSchema =>
  ({
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
  }) as unknown as FormSchema

/** What `@formancy/angular` renders for that layout, reduced to the attributes. */
const PREVIEW = `
  <formancy-arrange-surface [session]="session" layout="web" [enabled]="enabled">
    <div>
      <div data-formancy-part="layout-row" data-formancy-layout-path="0">
        <div data-formancy-part="field" data-formancy-field-path="first">First name</div>
        <div data-formancy-part="field" data-formancy-field-path="last">Last name</div>
      </div>
      <div data-formancy-part="field" data-formancy-field-path="email">Email</div>
    </div>
  </formancy-arrange-surface>
`

interface Mounted {
  session: BuilderSession
  settle(): Promise<void>
}

const mount = async (enabled = true): Promise<Mounted> => {
  const session = createBuilderSession(schema())
  const view = await render(PREVIEW, {
    imports: [FormancyArrangeSurface],
    componentProperties: { session, enabled },
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()
  return { session, settle: async () => void (await view.fixture.whenStable()) }
}

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
 * `clientY` on the floor, so every comparison against a midpoint comes out the
 * same way. Which half of an element a pointer is over is most of what this
 * surface decides, so these are dispatched as `MouseEvent`s, which keep them.
 * The React suite does the same, for the same reason.
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
const drag = async (
  mounted: Mounted,
  from: HTMLElement,
  to: HTMLElement,
  at: { clientX: number; clientY: number },
): Promise<void> => {
  const dataTransfer = transfer()
  from.dispatchEvent(dragEvent('dragstart', NOWHERE, dataTransfer))
  await mounted.settle()
  to.dispatchEvent(dragEvent('dragover', at, dataTransfer))
  await mounted.settle()
  to.dispatchEvent(dragEvent('drop', at, dataTransfer))
  await mounted.settle()
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

/** The arrangement as paths, which is what a move actually changes. */
const arrangement = (session: BuilderSession): unknown =>
  session.document().layouts?.[0]?.nodes

describe('enabling', () => {
  test('off, nothing is draggable and the form is only a form', async () => {
    // A preview somebody is typing into should not be picking up drags, so this
    // is opt-in. Asserted because the default is the safe one only if it holds.
    await mount(false)

    expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0)
    expect(document.querySelector('[data-formancy-part="arrange-surface"]')).toBeNull()
  })

  test('on, every node that maps to the arrangement is picked out', async () => {
    await mount()

    // Three fields and the row: four nodes in the layout, four marked.
    expect(document.querySelectorAll('[data-arrangeable="true"]')).toHaveLength(4)
  })
})

describe('dropping', () => {
  test('a field outside a row joins it, and the session is what changed', async () => {
    const mounted = await mount()

    await drag(mounted, fieldNamed('Email'), fieldNamed('First name'), boxOf(fieldNamed('First name'), 'start'))

    // Email left the top level and is now inside the row with the other two.
    expect(arrangement(mounted.session)).toMatchObject([
      { kind: 'row', children: [{ path: 'email' }, { path: 'first' }, { path: 'last' }] },
    ])
  })

  test('the move is announced, because a silent drag is a silent edit', async () => {
    const mounted = await mount()

    await drag(mounted, fieldNamed('Email'), fieldNamed('First name'), boxOf(fieldNamed('First name'), 'start'))

    expect(screen.getByRole('status').textContent).toMatch(/moved to/i)
  })

  test('a drop onto itself changes nothing and pushes nothing onto undo', async () => {
    const mounted = await mount()
    const before = JSON.stringify(arrangement(mounted.session))

    const email = fieldNamed('Email')
    await drag(mounted, email, email, boxOf(email, 'start'))

    expect(JSON.stringify(arrangement(mounted.session))).toBe(before)
    expect(mounted.session.canUndo()).toBe(false)
  })

  test('a row cannot be dropped into its own child', async () => {
    // The row is the ancestor of the field, so either direction would be a
    // container swallowing itself.
    const mounted = await mount()
    const before = JSON.stringify(arrangement(mounted.session))

    const row = document.querySelector<HTMLElement>('[data-formancy-layout-path="0"]')!
    await drag(mounted, row, fieldNamed('First name'), boxOf(fieldNamed('First name'), 'start'))

    expect(JSON.stringify(arrangement(mounted.session))).toBe(before)
  })

  test('a drop with nothing picked up does nothing', async () => {
    // A drop can arrive without a dragstart — dragged in from outside the page.
    const mounted = await mount()
    const before = JSON.stringify(arrangement(mounted.session))

    const email = fieldNamed('Email')
    email.dispatchEvent(dragEvent('drop', boxOf(email, 'start'), transfer()))
    await mounted.settle()

    expect(JSON.stringify(arrangement(mounted.session))).toBe(before)
  })
})

describe('the indicator', () => {
  test('is drawn only where the session would accept a drop', async () => {
    // One over an illegal target promises a move that will not happen.
    const mounted = await mount()
    const dataTransfer = transfer()
    const row = document.querySelector<HTMLElement>('[data-formancy-layout-path="0"]')!

    row.dispatchEvent(dragEvent('dragstart', NOWHERE, dataTransfer))
    await mounted.settle()
    const inside = fieldNamed('First name')
    inside.dispatchEvent(dragEvent('dragover', boxOf(inside, 'start'), dataTransfer))
    await mounted.settle()

    expect(document.querySelectorAll('[data-drop]')).toHaveLength(0)
  })

  test('inside a row it is drawn down the side the field will land on, not across the top', async () => {
    /*
     * Left to the stylesheet to infer once, and a rule of equal weight drew the
     * line across the top of a field that was about to land beside another. The
     * axis is in the attribute so the stylesheet has nothing to infer.
     */
    const mounted = await mount()
    const dataTransfer = transfer()

    fieldNamed('Email').dispatchEvent(dragEvent('dragstart', NOWHERE, dataTransfer))
    await mounted.settle()
    const last = fieldNamed('Last name')
    last.dispatchEvent(dragEvent('dragover', boxOf(last, 'end'), dataTransfer))
    await mounted.settle()

    expect(last.dataset['drop']).toBe('inline-after')
  })

  test('and read right to left, the right half of a field in a row is before it', async () => {
    // The field before another in a right-to-left row is on its right. The halves
    // were measured from the left whatever the page read, so a field aimed at the
    // right of its neighbour landed on its left.
    document.body.dir = 'rtl'
    try {
      const mounted = await mount()
      const dataTransfer = transfer()

      fieldNamed('Email').dispatchEvent(dragEvent('dragstart', NOWHERE, dataTransfer))
      await mounted.settle()
      const last = fieldNamed('Last name')
      // Right of the midpoint, which `boxOf` calls the end because it reads left to right.
      last.dispatchEvent(dragEvent('dragover', boxOf(last, 'end'), dataTransfer))
      await mounted.settle()

      expect(last.dataset['drop']).toBe('inline-before')
    } finally {
      document.body.removeAttribute('dir')
    }
  })

  test('is cleared when the pointer leaves', async () => {
    const mounted = await mount()
    const dataTransfer = transfer()

    fieldNamed('Email').dispatchEvent(dragEvent('dragstart', NOWHERE, dataTransfer))
    await mounted.settle()
    const last = fieldNamed('Last name')
    last.dispatchEvent(dragEvent('dragover', boxOf(last, 'end'), dataTransfer))
    await mounted.settle()
    expect(last.dataset['drop']).toBeDefined()

    last.dispatchEvent(dragEvent('dragleave', NOWHERE, dataTransfer))
    await mounted.settle()

    expect(last.dataset['drop']).toBeUndefined()
  })

  test('is cleared when the drag is abandoned', async () => {
    // Escape, or a drop outside the window. Without this the line stays drawn
    // over a form nobody is dragging anything on.
    const mounted = await mount()
    const dataTransfer = transfer()

    const email = fieldNamed('Email')
    email.dispatchEvent(dragEvent('dragstart', NOWHERE, dataTransfer))
    await mounted.settle()
    const last = fieldNamed('Last name')
    last.dispatchEvent(dragEvent('dragover', boxOf(last, 'end'), dataTransfer))
    await mounted.settle()

    email.dispatchEvent(dragEvent('dragend', NOWHERE, dataTransfer))
    await mounted.settle()

    expect(last.dataset['drop']).toBeUndefined()
  })
})

describe('after a command replaces the rendered tree', () => {
  test('what can be picked up is marked again', async () => {
    /*
     * The effect that marks elements re-runs on every accepted command, because
     * the renderer replaces the tree. If it did not, a drag would work once.
     *
     * It also has to not be a cycle: an effect reading the signal it writes
     * makes Angular stop scheduling change detection with no error at all,
     * which looks exactly like frozen bindings rather than like a mistake.
     */
    const mounted = await mount()

    await drag(mounted, fieldNamed('Email'), fieldNamed('First name'), boxOf(fieldNamed('First name'), 'start'))

    // The preview in this test is static, so the same four nodes are still
    // there — what matters is that they are still marked and still work.
    expect(document.querySelectorAll('[data-arrangeable="true"]')).toHaveLength(4)

    await drag(mounted, fieldNamed('Last name'), fieldNamed('Email'), boxOf(fieldNamed('Email'), 'start'))

    expect(mounted.session.canUndo()).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/moved to|side by side/i)
  })
})

describe('dropping in the space between two nodes', () => {
  /**
   * The browser reports a pointer in the gap between two fields as over their
   * container, since nothing else is there. Aimed at the container, a field dropped
   * between two others in a section landed above or below the whole section; between
   * two top-level fields, where the form itself carries no layout path, nothing was
   * offered. The same cases as the React suite's, because a drop that lands somewhere
   * else in one builder is a bug somebody finds by switching.
   */
  const gapSchema = (): FormSchema =>
    ({
      specVersion: '1',
      id: 'gaps',
      title: 'Contact',
      model: {
        fields: [
          { key: 'first', type: 'text', label: 'First name' },
          { key: 'last', type: 'text', label: 'Last name' },
          { key: 'email', type: 'text', label: 'Email' },
          { key: 'phone', type: 'text', label: 'Phone' },
        ],
      },
      layouts: [
        {
          name: 'web',
          nodes: [
            {
              kind: 'section',
              label: 'Name',
              children: [
                { kind: 'field', path: 'first' },
                { kind: 'field', path: 'last' },
              ],
            },
            { kind: 'field', path: 'email' },
            { kind: 'field', path: 'phone' },
          ],
        },
      ],
    }) as unknown as FormSchema

  /** A section with a heading and two fields, then two fields on their own. */
  const GAP_PREVIEW = `
    <formancy-arrange-surface [session]="session" layout="web" [enabled]="true">
      <form aria-label="Contact preview">
        <div data-formancy-part="layout-section" data-formancy-layout-path="0">
          <p>Name</p>
          <div data-formancy-part="field" data-formancy-field-path="first">First name</div>
          <div data-formancy-part="field" data-formancy-field-path="last">Last name</div>
        </div>
        <div data-formancy-part="field" data-formancy-field-path="email">Email</div>
        <div data-formancy-part="field" data-formancy-field-path="phone">Phone</div>
      </form>
    </formancy-arrange-surface>
  `

  /** Where each element was drawn, top to bottom, 400 wide: jsdom draws nothing. */
  const drawn = (element: HTMLElement, top: number, bottom: number): void => {
    element.getBoundingClientRect = () =>
      ({ left: 0, right: 400, width: 400, top, bottom, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  }

  const section = (): HTMLElement =>
    document.querySelector<HTMLElement>('[data-formancy-layout-path="0"]')!
  const form = (): HTMLElement => screen.getByRole('form', { name: 'Contact preview' })

  /**
   * The section from 0 to 140, its heading on top and its fields 20 apart; then Email
   * and Phone below it, 20 apart again.
   */
  const mountGaps = async (): Promise<Mounted> => {
    const session = createBuilderSession(gapSchema())
    const view = await render(GAP_PREVIEW, {
      imports: [FormancyArrangeSurface],
      componentProperties: { session },
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()
    drawn(section(), 0, 140)
    drawn(fieldNamed('First name'), 40, 80)
    drawn(fieldNamed('Last name'), 100, 140)
    drawn(fieldNamed('Email'), 160, 200)
    drawn(fieldNamed('Phone'), 220, 260)
    return { session, settle: async () => void (await view.fixture.whenStable()) }
  }

  const order = (session: BuilderSession): unknown =>
    session
      .document()
      .layouts?.[0]?.nodes.map((node) => (node.kind === 'field' ? node.path : node.kind))

  test('between two fields in a section, the drop lands between them', async () => {
    const mounted = await mountGaps()

    // y = 90 is the gap between First name (40–80) and Last name (100–140), which the
    // browser reports as the section. Aimed at the section, Phone went below it.
    await drag(mounted, fieldNamed('Phone'), section(), { clientX: 200, clientY: 90 })

    expect(arrangement(mounted.session)).toMatchObject([
      {
        kind: 'section',
        children: [
          { kind: 'field', path: 'first' },
          { kind: 'field', path: 'phone' },
          { kind: 'field', path: 'last' },
        ],
      },
      { kind: 'field', path: 'email' },
    ])
    expect(screen.getByRole('status').textContent).toContain('between First name and Last name')
  })

  test('between two top-level fields, where nothing on screen names a node, too', async () => {
    const mounted = await mountGaps()

    // y = 150 is between the section (to 140) and Email (from 160). The form carries no
    // layout path, so no drop was offered here at all.
    await drag(mounted, fieldNamed('Phone'), form(), { clientX: 200, clientY: 150 })

    expect(order(mounted.session)).toEqual(['section', 'phone', 'email'])
  })

  test('the line is drawn on the nearer neighbour, on the side the gap is', async () => {
    const mounted = await mountGaps()
    const dataTransfer = transfer()

    fieldNamed('Phone').dispatchEvent(dragEvent('dragstart', NOWHERE, dataTransfer))
    await mounted.settle()
    section().dispatchEvent(dragEvent('dragover', { clientX: 200, clientY: 95 }, dataTransfer))
    await mounted.settle()

    // Nearer Last name, so above it — and not on the section, which is not where it lands.
    expect(fieldNamed('Last name').dataset['drop']).toBe('before')
    expect(section().dataset['drop']).toBeUndefined()
  })

  test('a gap beside the field being dragged moves nothing, so it offers nothing', async () => {
    const mounted = await mountGaps()
    const before = JSON.stringify(arrangement(mounted.session))

    // Between Email and Phone, dragging Phone: the gap is where it already is.
    await drag(mounted, fieldNamed('Phone'), form(), { clientX: 200, clientY: 210 })

    expect(JSON.stringify(arrangement(mounted.session))).toBe(before)
  })

  test("over a section's own heading, the section is still what is aimed at", async () => {
    const mounted = await mountGaps()

    // y = 10 is the heading, above the section's fields: not between two of them. The
    // top half of the section means before it, as it always did.
    await drag(mounted, fieldNamed('Phone'), section(), { clientX: 200, clientY: 10 })

    expect(order(mounted.session)).toEqual(['phone', 'section', 'email'])
  })
})

describe('when something other than this surface redraws the preview', () => {
  /**
   * The same case as the React suite's: marks put on when the surface last ran, and a
   * preview redrawn afterwards by somebody else — another framework, or a field a rule
   * shows — whose new elements carried none.
   */
  test('what it draws can be picked up', async () => {
    const mounted = await mount()
    const before = fieldNamed('Email')
    const email = document.createElement('div')
    email.dataset['formancyPart'] = 'field'
    email.dataset['formancyFieldPath'] = 'email'
    email.textContent = 'Email'
    before.replaceWith(email)
    await mounted.settle()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(email.dataset['arrangeable']).toBe('true')
    expect(email.draggable).toBe(true)
  })
})
