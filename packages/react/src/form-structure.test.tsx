import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

describe('paged rendering', () => {
  const paged: FormSchema = {
    specVersion: '0',
    id: 'onboarding',
    title: 'Onboarding',
    model: {
      fields: [
        { key: 'who', type: 'page', fields: [{ key: 'email', type: 'text', required: true }] },
        { key: 'what', type: 'page', fields: [{ key: 'message', type: 'text' }] },
      ],
    },
  }
  const labels = { email: 'Email', message: 'Message' }

  test('renders only the current page, with working navigation', async () => {
    const engine = createFormEngine({ schema: paged, initialValue: { email: 'a@b.ch' } })
    render(
      <FormancyProvider engine={engine}>
        <FormancyForm labels={labels} />
      </FormancyProvider>,
    )

    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })

    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.getByLabelText('Message')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  test('a blocked next stays on the page and surfaces the error', async () => {
    const engine = createFormEngine({ schema: paged })
    render(
      <FormancyProvider engine={engine}>
        <FormancyForm labels={labels} />
      </FormancyProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })

    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
  })
})

describe('repeater rendering', () => {
  const withRows: FormSchema = {
    specVersion: '0',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        {
          key: 'items',
          type: 'repeater',
          fields: [{ key: 'name', type: 'text' }],
        },
      ],
    },
  }
  const labels = { items: 'Item', 'items[].name': 'Name' }

  test('renders each row with named add and remove controls', () => {
    const engine = createFormEngine({ schema: withRows, initialValue: { items: [{ name: 'a' }, { name: 'b' }] } })
    render(
      <FormancyProvider engine={engine}>
        <FormancyForm labels={labels} />
      </FormancyProvider>,
    )

    expect(screen.getAllByLabelText('Name')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeTruthy()
    // "2 of 2" context, so a screen reader user knows which row a button kills.
    expect(screen.getByRole('button', { name: 'Remove Item 2 of 2' })).toBeTruthy()
  })

  test('add and remove drive the engine and re-render the rows', () => {
    const engine = createFormEngine({ schema: withRows })
    render(
      <FormancyProvider engine={engine}>
        <FormancyForm labels={labels} />
      </FormancyProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
    expect(screen.getAllByLabelText('Name')).toHaveLength(1)
    expect(engine.rowCount(['items'])).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Item 1 of 1' }))
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  test('row fields resolve labels through the template wire', () => {
    const engine = createFormEngine({ schema: withRows, initialValue: { items: [{}] } })
    render(
      <FormancyProvider engine={engine}>
        <FormancyForm labels={labels} />
      </FormancyProvider>,
    )

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'typed' } })
    expect(engine.getFieldSnapshot(['items', 0, 'name']).value).toBe('typed')
  })
})
