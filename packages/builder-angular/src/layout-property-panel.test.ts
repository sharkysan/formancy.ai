import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession, layoutNodeAt } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyLayoutPropertyPanel } from './layout-property-panel'

/**
 * The property panel for a node in the arrangement.
 *
 * Every property a layout node has was once unsettable in the React builder — a
 * table's `columns` and a section's `label` since the day layouts existed, and
 * `span` from the moment it was added. The format validated them, both renderers
 * honoured them, and the only way to write one was to edit the JSON by hand. The
 * gap was found by a guard rather than by a person.
 *
 * This is also where the property control's **draft** earns its keep, which is
 * why the case lives here rather than beside the field panel: no field property
 * refuses a prefix, so a draft there is untested by construction.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const schema: FormSchema = {
  specVersion: '2',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'first', type: 'text', label: 'First name' },
      { key: 'last', type: 'text', label: 'Last name' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'table',
          columns: 2,
          children: [
            { kind: 'field', path: 'first' },
            { kind: 'field', path: 'last' },
          ],
        },
      ],
    },
  ],
}

interface Mounted {
  session: BuilderSession
  type(element: Element, text: string): Promise<void>
  clear(element: Element): Promise<void>
}

const mountAt = async (path: readonly number[]): Promise<Mounted> => {
  const session = createBuilderSession(schema)
  const view = await render(FormancyLayoutPropertyPanel, {
    componentInputs: { session, address: { layout: 'web', path } },
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()

  const user = userEvent.setup()
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
  }
  return {
    session,
    type: async (element, text) => {
      await user.type(element as HTMLElement, text)
      await settle()
    },
    clear: async (element) => {
      await user.clear(element as HTMLElement)
      await settle()
    },
  }
}

const nodeAt = (session: BuilderSession, path: readonly number[]): Record<string, unknown> =>
  layoutNodeAt(session.document(), 'web', path) as unknown as Record<string, unknown>

describe('the arrangement property panel', () => {
  test('offers what the schema says this kind of node has', async () => {
    await mountAt([0])

    // A table has a column count and a label; a plain row has neither.
    expect(screen.getByLabelText(/columns/i)).toBeTruthy()
  })

  test('and a placement inside a grid offers the one thing it has', async () => {
    // There is no "nothing to configure" case: every layout kind the format
    // defines can span, which `properties.test.ts` derives. Both panels carried
    // a branch for it and neither could ever render one.
    await mountAt([0, 0])

    expect(screen.getByLabelText(/span/i)).toBeTruthy()
    expect(screen.queryByText(/nothing to configure/i)).toBeNull()
  })

  test('setting a property writes it through the validator', async () => {
    const { session, type, clear } = await mountAt([0])

    await clear(screen.getByLabelText(/columns/i))
    await type(screen.getByLabelText(/columns/i), '3')

    expect(nodeAt(session, [0])['columns']).toBe(3)
  })

  test('a word in a box that also takes a number can be typed all the way', async () => {
    /*
     * The case the draft exists for, measured in the React panel before it kept
     * one. `span` is `anyOf: [integer, const "all"]`, so typing the word offers
     * "a", then "al", then "all" — the first two are refused, the document does
     * not change, and a box bound straight to it re-renders empty, so the next
     * keystroke lands in an empty box. The word could not be typed at all.
     *
     * The box shows the draft, every edit is offered to the session, and a
     * refusal leaves the document where it was. The form still cannot be
     * PUBLISHED in an invalid state; it can be typed in.
     */
    const { session, type } = await mountAt([0, 0])

    await type(screen.getByLabelText(/span/i), 'all')

    expect(nodeAt(session, [0, 0])['span']).toBe('all')
  })

  test('and a number typed into that same box arrives as a number', async () => {
    // `anyOf: [integer, const "all"]` means the string form is refused outright,
    // so a numeric span used to do nothing and say nothing. Read from the schema
    // rather than from the property's name, so the next property written that
    // way works without anybody remembering this.
    const { session, type } = await mountAt([0, 0])

    await type(screen.getByLabelText(/span/i), '2')

    expect(nodeAt(session, [0, 0])['span']).toBe(2)
  })
})
