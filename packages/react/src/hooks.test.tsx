import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyProvider, useField, useRepeater, useSubmit, useWizard } from './index.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '0',
  id: 'order',
  title: 'Order',
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
        fields: [
          {
            key: 'items',
            type: 'repeater',
            fields: [{ key: 'name', type: 'text' }],
          },
        ],
      },
    ],
  },
}

function Rows() {
  const repeater = useRepeater('items')
  return (
    <div>
      <output aria-label="count">{repeater.rowCount}</output>
      <button onClick={() => repeater.addRow()}>add</button>
      <button onClick={() => repeater.removeRow(0)}>remove first</button>
    </div>
  )
}

describe('useRepeater', () => {
  test('exposes the live row count and row operations', () => {
    const engine = createFormEngine({ schema, initialValue: { items: [{ name: 'a' }] } })
    render(
      <FormancyProvider engine={engine}>
        <Rows />
      </FormancyProvider>,
    )

    expect(screen.getByLabelText('count').textContent).toBe('1')

    fireEvent.click(screen.getByText('add'))
    expect(screen.getByLabelText('count').textContent).toBe('2')
    expect(engine.rowCount(['items'])).toBe(2)

    fireEvent.click(screen.getByText('remove first'))
    expect(screen.getByLabelText('count').textContent).toBe('1')
  })

  test('re-renders when rows change from outside React', () => {
    const engine = createFormEngine({ schema })
    render(
      <FormancyProvider engine={engine}>
        <Rows />
      </FormancyProvider>,
    )

    act(() => engine.addRow(['items']))

    expect(screen.getByLabelText('count').textContent).toBe('1')
  })
})

function Stepper() {
  const wizard = useWizard()
  return (
    <div>
      <output aria-label="page">{wizard.page}</output>
      <output aria-label="total">{wizard.pageCount}</output>
      <button onClick={() => void wizard.next()}>next</button>
      <button onClick={() => wizard.back()}>back</button>
    </div>
  )
}

describe('useWizard', () => {
  test('exposes the live page and navigation', async () => {
    const engine = createFormEngine({ schema, initialValue: { email: 'a@b.ch' } })
    render(
      <FormancyProvider engine={engine}>
        <Stepper />
      </FormancyProvider>,
    )

    expect(screen.getByLabelText('page').textContent).toBe('0')
    expect(screen.getByLabelText('total').textContent).toBe('2')

    await act(async () => {
      fireEvent.click(screen.getByText('next'))
    })
    expect(screen.getByLabelText('page').textContent).toBe('1')

    fireEvent.click(screen.getByText('back'))
    expect(screen.getByLabelText('page').textContent).toBe('0')
  })

  test('stays on the page when validation blocks the move', async () => {
    const engine = createFormEngine({ schema })
    render(
      <FormancyProvider engine={engine}>
        <Stepper />
      </FormancyProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByText('next'))
    })

    expect(screen.getByLabelText('page').textContent).toBe('0')
  })

  test('throws a useful error on an unpaged form', () => {
    const flat: FormSchema = {
      ...schema,
      model: { fields: [{ key: 'email', type: 'text' }] },
    }
    const engine = createFormEngine({ schema: flat })
    function Naked() {
      useWizard()
      return null
    }

    expect(() =>
      render(
        <FormancyProvider engine={engine}>
          <Naked />
        </FormancyProvider>,
      ),
    ).toThrow(/page/i)
  })
})

function EmailInput() {
  const field = useField('email')
  return <input id={field.ids.control} aria-label="email" />
}

function SubmitButton() {
  const submit = useSubmit()
  return <button onClick={() => submit()}>send</button>
}

describe('useSubmit', () => {
  test('a failed submit moves focus to the first invalid control', () => {
    const engine = createFormEngine({ schema })
    render(
      <FormancyProvider engine={engine}>
        <EmailInput />
        <SubmitButton />
      </FormancyProvider>,
    )

    fireEvent.click(screen.getByText('send'))

    expect(document.activeElement).toBe(screen.getByLabelText('email'))
    expect(engine.getFieldSnapshot(['email']).touched).toBe(true)
  })

  test('a clean submit reports ok and moves no focus', () => {
    const engine = createFormEngine({ schema, initialValue: { email: 'a@b.ch' } })
    let outcome: { ok: boolean } | undefined
    function Catcher() {
      const submit = useSubmit()
      return <button onClick={() => (outcome = submit())}>send</button>
    }
    render(
      <FormancyProvider engine={engine}>
        <EmailInput />
        <Catcher />
      </FormancyProvider>,
    )

    fireEvent.click(screen.getByText('send'))

    expect(outcome?.ok).toBe(true)
    expect(document.activeElement).not.toBe(screen.getByLabelText('email'))
  })
})
