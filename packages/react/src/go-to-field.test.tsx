import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider, useGoToField } from './index.js'

afterEach(cleanup)

/**
 * A host taking a person to a question, as the error summary's links and the review's Change do
 * (0213). A host's own list — of what is still missing, say — had the field's control id and nothing
 * else: a group's id is on its fieldset, which takes no focus, and a question on a page the wizard
 * is not showing is not drawn, so focusing by the id reached nothing for both. The Angular renderer
 * is held to the same in `packages/angular/src/go-to-field.test.ts`.
 */
const options = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

function GoTo({ path }: { path: string }) {
  const goToField = useGoToField()
  return (
    <button type="button" onClick={() => goToField(path)}>
      Go to {path}
    </button>
  )
}

function mount(schema: FormSchema, path: string) {
  const engine = createFormEngine({ schema })
  render(
    <FormancyProvider engine={engine}>
      <GoTo path={path} />
      <FormancyForm />
    </FormancyProvider>,
  )
  return engine
}

describe('a host taking a person to a question', () => {
  test('on another page, moves the form to that page and focuses the question', async () => {
    const engine = mount(
      {
        specVersion: '4',
        id: 'trip',
        title: 'Trip',
        model: {
          fields: [
            { key: 'one', type: 'page', label: 'One', fields: [{ key: 'name', type: 'text', label: 'Name' }] },
            { key: 'two', type: 'page', label: 'Two', fields: [{ key: 'city', type: 'text', label: 'City' }] },
          ],
        },
      } as unknown as FormSchema,
      'city',
    )
    expect(screen.queryByRole('textbox', { name: 'City' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Go to city' }))

    expect(engine.wizard()?.page()).toBe(1)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'City' }))
  })

  test('to a radio group, focuses its first option, since a fieldset takes no focus', async () => {
    mount(
      {
        specVersion: '4',
        id: 'visit',
        title: 'Visit',
        model: { fields: [{ key: 'smoker', type: 'radio', label: 'Smoker', options }] },
      } as unknown as FormSchema,
      'smoker',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Go to smoker' }))

    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Yes' }))
  })

  test('to a field in a row, focuses that row’s', async () => {
    const engine = mount(
      {
        specVersion: '4',
        id: 'guests',
        title: 'Guests',
        model: {
          fields: [{ key: 'guests', type: 'repeater', label: 'Guests', fields: [{ key: 'name', type: 'text', label: 'Name' }] }],
        },
      } as unknown as FormSchema,
      'guests[1].name',
    )
    act(() => {
      engine.addRow(['guests'])
      engine.addRow(['guests'])
    })

    await userEvent.click(screen.getByRole('button', { name: 'Go to guests[1].name' }))

    expect(document.activeElement?.id).toBe(engine.getFieldSnapshot(['guests', 1, 'name']).ids.control)
  })
})

test('a path no field has is refused, as the engine refuses it, not ignored', () => {
  // A host's link that goes nowhere is a bug to find: doing nothing would leave a person pressing
  // a link that does nothing, which is what the summary's links did before 0205.
  let goToField: ((path: string) => void) | undefined
  function Capture() {
    goToField = useGoToField()
    return null
  }
  render(
    <FormancyProvider
      engine={createFormEngine({
        schema: { specVersion: '4', id: 'one', title: 'One', model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] } } as unknown as FormSchema,
      })}
    >
      <Capture />
    </FormancyProvider>,
  )

  expect(() => goToField?.('nope')).toThrow(/Unknown field "nope"/)
})
