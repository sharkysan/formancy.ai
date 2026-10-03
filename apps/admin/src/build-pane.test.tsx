import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { BuildPane } from './build-pane.js'

afterEach(cleanup)

/**
 * The three-pane inspector: structure on the left, the form in the middle, its
 * properties on the right.
 *
 * What is worth testing here is only what this file decides, since the panes
 * themselves are tested in `@formancy/builder-react`: that the JSON text
 * follows the document so the editor tab and Publish cannot see something
 * different from the builder, that Publish is refused while the document is,
 * and that the preview renders through the arrangement — without which moving
 * two fields into a row changes nothing anybody can see.
 */
const schema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact us',
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
          kind: 'row',
          children: [
            { kind: 'field', path: 'first' },
            { kind: 'field', path: 'last' },
          ],
        },
      ],
    },
  ],
}

const mount = (over: { source?: string } = {}) => {
  const onChange = vi.fn<(next: string) => void>()
  const onPublish = vi.fn<() => void>()
  render(
    <BuildPane
      source={over.source ?? JSON.stringify(schema)}
      onChange={onChange}
      publishState={undefined}
      onPublish={onPublish}
    />,
  )
  return { onChange, onPublish }
}

describe('opening', () => {
  test('a document the validator refuses sends you to the editor tab', () => {
    mount({ source: '{ not json' })

    // A session opened on an invalid document makes every later refusal
    // ambiguous: you cannot tell whether your command broke the form or
    // merely failed to fix it.
    expect(screen.getByRole('heading', { name: /cannot be opened in the builder/ })).toBeTruthy()
  })

  test('a valid one gives the three panes', () => {
    mount()

    expect(screen.getByRole('tree', { name: 'Form structure' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy()
  })
})

describe('the JSON follows the document', () => {
  test('on open, so the editor tab shows what the builder built', async () => {
    const { onChange } = mount()

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(JSON.parse(onChange.mock.calls[0]?.[0] as string)).toEqual(schema)
  })

  test('and after every edit', async () => {
    const user = userEvent.setup()
    const { onChange } = mount()
    await waitFor(() => expect(onChange).toHaveBeenCalled())

    screen.getByRole('treeitem', { name: 'Last name' }).focus()
    await user.keyboard('{Delete}')

    await waitFor(() => {
      const latest = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string
      expect(JSON.parse(latest).model.fields).toHaveLength(1)
    })
  })
})

describe('the arrangement editor', () => {
  test('is a switch in the pane header, not a separate screen', async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole('button', { name: 'Arrangement' }))

    expect(screen.getByRole('tree', { name: /Arrangement/ })).toBeTruthy()
    expect(screen.queryByRole('tree', { name: 'Form structure' })).toBeNull()
  })

  test('and Publish stays reachable while it is open', async () => {
    const user = userEvent.setup()
    const { onPublish } = mount()

    await user.click(screen.getByRole('button', { name: 'Arrangement' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    expect(onPublish).toHaveBeenCalledOnce()
  })
})

describe('the preview', () => {
  test('renders through the arrangement, or editing one would change nothing visible', () => {
    const { container } = render(
      <BuildPane
        source={JSON.stringify(schema)}
        onChange={vi.fn()}
        publishState={undefined}
        onPublish={vi.fn()}
      />,
    )

    expect(container.querySelector('[data-formancy-part="layout-row"]')).toBeTruthy()
  })

  test('says what the engine refused, verbatim, rather than rendering nothing', () => {
    mount({
      source: JSON.stringify({
        ...schema,
        logic: { rules: [{ kind: 'visible', target: 'first', cel: 'this is not CEL' }] },
      }),
    })

    // `@formancy/spec` sits below `@formancy/expressions` and cannot compile
    // CEL, so a document like this is structurally valid and the builder holds
    // it quite happily. The engine is what refuses it, and publish refuses it
    // for the same reason — so the preview has to show the compiler's own
    // words rather than an empty pane.
    expect(screen.getByText(/Unexpected character/)).toBeTruthy()
  })
})

describe('publishing', () => {
  test('is refused while the document is, and says why', () => {
    render(
      <BuildPane
        source={JSON.stringify(schema)}
        onChange={vi.fn()}
        publishState={{ ok: false, message: 'Two fields share the key "email".' }}
        onPublish={vi.fn()}
      />,
    )

    expect(screen.getByText('Two fields share the key "email".')).toBeTruthy()
  })

  test('reports the version it created', () => {
    render(
      <BuildPane
        source={JSON.stringify(schema)}
        onChange={vi.fn()}
        publishState={{ ok: true, version: 4, schemaHash: 'h4', warnings: [] }}
        onPublish={vi.fn()}
      />,
    )

    expect(screen.getByText('Published version 4.')).toBeTruthy()
  })

  test('and shows what the server thought worth checking, without calling it a failure', () => {
    /*
     * A publish that warns has SUCCEEDED, and the two have to be told apart on
     * screen or the warning reads as a refusal and somebody presses the button
     * again. So both are present: the version it created, and the list.
     *
     * The warning worth having this for is a rule reading a path no field
     * provides — it evaluates to nothing for the life of an immutable version,
     * and nothing else anywhere reports it
     * ([0097](../../../docs/decisions/0097-a-publish-may-warn.md)).
     */
    render(
      <BuildPane
        source={JSON.stringify(schema)}
        onChange={vi.fn()}
        publishState={{
          ok: true,
          version: 4,
          schemaHash: 'h4',
          warnings: ['Rule on "note" (visible) reads "address.nope", which no field provides.'],
        }}
        onPublish={vi.fn()}
      />,
    )

    expect(screen.getByText('Published version 4.')).toBeTruthy()
    expect(screen.getByText(/address\.nope/)).toBeTruthy()
    // Announced politely rather than as an alert: the publish worked, and an
    // alert interrupts whatever was being read to report something that is not
    // an error.
    expect(screen.getByRole('status', { name: 'Publish warnings' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('and says nothing extra when there is nothing to say', () => {
    // The case that keeps the channel worth reading. A list that appears empty,
    // or a heading with nothing under it, teaches somebody to skip the region.
    render(
      <BuildPane
        source={JSON.stringify(schema)}
        onChange={vi.fn()}
        publishState={{ ok: true, version: 4, schemaHash: 'h4', warnings: [] }}
        onPublish={vi.fn()}
      />,
    )

    // By name: the pane has another `status` of its own, and asking for "the
    // status" would find whichever came first.
    expect(screen.queryByRole('status', { name: 'Publish warnings' })).toBeNull()
  })

  test('the button calls back', async () => {
    const user = userEvent.setup()
    const { onPublish } = mount()

    await user.click(screen.getByRole('button', { name: 'Publish' }))

    expect(onPublish).toHaveBeenCalledOnce()
  })
})

describe('undo and redo', () => {
  test('start disabled and follow the session', async () => {
    const user = userEvent.setup()
    mount()

    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toHaveProperty('disabled', true)

    screen.getByRole('treeitem', { name: 'Last name' }).focus()
    await user.keyboard('{Delete}')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', false))

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(within(screen.getByRole('tree', { name: 'Form structure' })).getAllByRole('treeitem')).toHaveLength(2),
    )
  })
})
