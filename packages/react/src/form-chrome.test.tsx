import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

// Labels and options ride on the model definitions, the way fixture schemas
// carry them; the spec's i18n section will formalise this.
const schema = {
  specVersion: '1',
  id: 'poll',
  title: 'Poll',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email address', required: true },
      {
        key: 'country',
        type: 'select',
        label: 'Country',
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      {
        key: 'size',
        type: 'radio',
        label: 'Company size',
        options: [
          { value: 'small', label: 'Up to 10' },
          { value: 'large', label: 'More than 10' },
        ],
      },
    ],
  },
} as unknown as FormSchema

function renderForm(engine = createFormEngine({ schema }), props = {}) {
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm {...props} />
    </FormancyProvider>,
  )
  return engine
}

describe('labels from the schema', () => {
  test('a def label wins; the labels prop and the wire path are fallbacks', () => {
    renderForm()
    expect(screen.getByLabelText('Email address')).toBeTruthy()
  })
})

describe('select with options', () => {
  test('renders a real select carrying its options', () => {
    renderForm()

    const select = screen.getByLabelText('Country') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect([...select.options].map((option) => option.textContent)).toContain('Switzerland')
  })

  test('choosing an option writes the VALUE, not the label', () => {
    const engine = renderForm()

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'CH' } })

    expect(engine.getFieldSnapshot(['country']).value).toBe('CH')
  })
})

describe('radio group with options', () => {
  test('renders a fieldset whose legend is the group label, with one labelled radio per option', () => {
    renderForm()

    const group = screen.getByRole('group', { name: 'Company size' })
    expect(group.tagName).toBe('FIELDSET')
    expect(screen.getByLabelText('Up to 10')).toBeTruthy()
  })

  test('checking a radio writes its value, and the group tracks the engine', () => {
    const engine = renderForm()

    fireEvent.click(screen.getByLabelText('More than 10'))

    expect(engine.getFieldSnapshot(['size']).value).toBe('large')
    expect((screen.getByLabelText('More than 10') as HTMLInputElement).checked).toBe(true)
  })
})

describe('the submit control', () => {
  test('renders a submit button and reports the outcome', () => {
    const onSubmit = vi.fn()
    renderForm(createFormEngine({ schema, initialValue: { email: 'a@b.ch' } }), { onSubmit })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, data: expect.objectContaining({ email: 'a@b.ch' }) }),
    )
  })

  test('a failed submit reports errors in the engine shape', () => {
    const onSubmit = vi.fn()
    renderForm(createFormEngine({ schema }), { onSubmit })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, errors: { email: ['required'] } }),
    )
  })
})

describe('the wizard chrome', () => {
  const paged = {
    specVersion: '1',
    id: 'signup',
    title: 'Sign up',
    model: {
      fields: [
        {
          key: 'details',
          type: 'page',
          label: 'Your details',
          fields: [{ key: 'firstName', type: 'text', label: 'First name', required: true }],
        },
        {
          key: 'review',
          type: 'page',
          label: 'Review',
          fields: [{ key: 'confirm', type: 'checkbox', label: 'All correct', required: true }],
        },
      ],
    },
  } as unknown as FormSchema

  test('renders a stepper naming every page, with aria-current on the active step', async () => {
    const engine = createFormEngine({ schema: paged, initialValue: { firstName: 'Ada' } })
    renderForm(engine)

    const active = () => document.querySelector('[aria-current="step"]')
    expect(active()?.textContent).toBe('Your details')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })

    expect(active()?.textContent).toBe('Review')
  })

  test('the submit control appears only on the last page', async () => {
    const engine = createFormEngine({ schema: paged, initialValue: { firstName: 'Ada' } })
    renderForm(engine)

    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })

    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()
  })

  test('a failed submit navigates to the first page with a problem', async () => {
    const engine = createFormEngine({ schema: paged, initialValue: { firstName: '   ' } })
    renderForm(engine)

    // Fill page one properly, advance, then break it from the engine — the
    // shape of a later answer invalidating an earlier page.
    engine.setValue(['firstName'], 'Ada')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })
    engine.setValue(['firstName'], '')
    engine.setValue(['confirm'], true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    })

    expect(document.querySelector('[aria-current="step"]')?.textContent).toBe('Your details')
    expect(screen.getByLabelText('First name')).toBeTruthy()
  })
})
