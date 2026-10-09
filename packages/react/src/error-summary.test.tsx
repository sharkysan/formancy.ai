import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { ErrorSummary, FormancyForm, FormancyProvider, useSubmit } from './index.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'text', required: true },
    ],
  },
}
const labels = { email: 'Email', message: 'Message' }

function Submit() {
  const submit = useSubmit()
  return <button onClick={() => submit()}>send</button>
}

function renderAll(engine = createFormEngine({ schema })) {
  render(
    <FormancyProvider engine={engine}>
      <ErrorSummary labels={labels} />
      <FormancyForm labels={labels} />
      <Submit />
    </FormancyProvider>,
  )
  return engine
}

describe('ErrorSummary', () => {
  test('renders nothing while the form has no surfaced errors', () => {
    renderAll()
    expect(screen.queryByRole('heading', { name: /problem/i })).toBeNull()
  })

  test('after a failed submit it lists each error as a link to its field', () => {
    renderAll()

    fireEvent.click(screen.getByText('send'))

    const summary = screen.getByRole('heading', { name: /2 problems/i })
    expect(summary).toBeTruthy()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]!.textContent).toContain('Email')
  })

  test('receives focus on failed submit INSTEAD of the first field, and is not role=alert', () => {
    renderAll()

    fireEvent.click(screen.getByText('send'))

    const region = document.querySelector('[data-formancy-part="error-summary"]')!
    expect(document.activeElement).toBe(region)
    expect(region.getAttribute('tabindex')).toBe('-1')
    // Focusing it already announces it; role=alert would announce it twice.
    expect(region.getAttribute('role')).not.toBe('alert')
  })

  test('clicking an error link focuses the offending control', () => {
    renderAll()
    fireEvent.click(screen.getByText('send'))

    fireEvent.click(screen.getAllByRole('link')[1]!)

    expect(document.activeElement).toBe(screen.getByLabelText('Message'))
  })

  test('fixing every error makes the summary disappear', () => {
    const engine = renderAll()
    fireEvent.click(screen.getByText('send'))

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.ch' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByText('send'))

    expect(engine.validate().valid).toBe(true)
    expect(screen.queryByRole('heading', { name: /problem/i })).toBeNull()
  })
})

describe('ErrorSummary without a labels prop', () => {
  /*
   * A field's label is in the document, and the engine resolves it in the form's language.
   * The summary named a field by its data path unless the host passed `labels` — "email:
   * required" as a link's accessible name, and "items[0].qty" for a row — so the one list a
   * screen reader is sent to after a failed submit read like a stack trace.
   */
  const labelled: FormSchema = {
    specVersion: '1',
    id: 'contact',
    title: 'Contact',
    model: {
      fields: [
        { key: 'email', type: 'text', label: 'Your email', required: true },
        { key: 'code', type: 'text', required: true },
      ],
    },
  }

  test('names each field by its own label, and by its key only when it has none', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema: labelled })}>
        <ErrorSummary />
        <FormancyForm />
        <Submit />
      </FormancyProvider>,
    )

    fireEvent.click(screen.getByText('send'))

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Your email: required',
      'code: required',
    ])
  })
})
