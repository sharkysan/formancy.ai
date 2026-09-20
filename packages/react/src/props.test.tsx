import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyProvider, useField } from './index.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: { fields: [{ key: 'email', type: 'text', required: true }] },
}

function Field() {
  const field = useField('email')
  return (
    <div>
      <label {...field.labelProps}>Email</label>
      <input {...field.controlProps} />
      {field.touched && field.errors.length > 0 ? <p {...field.errorProps}>Required</p> : null}
    </div>
  )
}

describe('spreadable props', () => {
  test('label and control wire together through htmlFor', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema })}>
        <Field />
      </FormancyProvider>,
    )

    const input = screen.getByLabelText('Email')
    expect(input.id).toContain('email')
    expect(input.getAttribute('name')).toBe('email')
    expect(input.getAttribute('aria-required')).toBe('true')
  })

  test('after validate and touch, the DOM carries aria-invalid and the describedby chain', () => {
    const engine = createFormEngine({ schema })
    render(
      <FormancyProvider engine={engine}>
        <Field />
      </FormancyProvider>,
    )

    act(() => {
      engine.validate()
      engine.touch(['email'])
    })

    const input = screen.getByLabelText('Email')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(screen.getByText('Required').id).toBe(describedBy)
  })

  test('a pristine field renders no aria-invalid attribute at all', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema })}>
        <Field />
      </FormancyProvider>,
    )

    expect(screen.getByLabelText('Email').hasAttribute('aria-invalid')).toBe(false)
  })
})
