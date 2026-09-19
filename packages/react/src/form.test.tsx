import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider, useField } from './index.js'

afterEach(cleanup)

const CLOCK = { now: () => 0, today: () => '2026-09-19', random: () => 0.5 }

const schema: FormSchema = {
  specVersion: '0',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'textarea' },
      { key: 'newsletter', type: 'checkbox' },
      { key: 'secret', type: 'text' },
    ],
  },
  logic: { rules: [{ target: 'secret', kind: 'visible', cel: 'false' }] },
}

const labels = { email: 'Email', message: 'Message', newsletter: 'Newsletter', secret: 'Secret' }

function renderForm(engine = createFormEngine({ schema, capabilities: CLOCK })) {
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm labels={labels} />
    </FormancyProvider>,
  )
  return engine
}

describe('FormancyForm', () => {
  test('renders every visible field with a real label wired to a control', () => {
    renderForm()

    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Message').tagName).toBe('TEXTAREA')
    expect((screen.getByLabelText('Newsletter') as HTMLInputElement).type).toBe('checkbox')
  })

  test('a hidden field is not in the DOM at all — not merely display:none', () => {
    renderForm()
    expect(screen.queryByLabelText('Secret')).toBeNull()
  })

  test('falls back to the field key when no label is given', () => {
    const engine = createFormEngine({ schema, capabilities: CLOCK })
    render(
      <FormancyProvider engine={engine}>
        <FormancyForm />
      </FormancyProvider>,
    )
    expect(screen.getByLabelText('email')).toBeTruthy()
  })

  test('typing lands in the engine', () => {
    const engine = renderForm()

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@y.ch' } })

    expect(engine.getFieldSnapshot(['email']).value).toBe('x@y.ch')
  })

  test('a checkbox writes booleans, not strings', () => {
    const engine = renderForm()

    fireEvent.click(screen.getByLabelText('Newsletter'))

    expect(engine.getFieldSnapshot(['newsletter']).value).toBe(true)
  })
})

describe('the registry', () => {
  test('a per-type entry replaces the default renderer for that type', () => {
    function ShoutyText({ path }: { path: string }) {
      const field = useField(path)
      return <input aria-label={`SHOUTY ${path}`} {...field.controlProps} />
    }
    render(
      <FormancyProvider engine={createFormEngine({ schema, capabilities: CLOCK })}>
        <FormancyForm labels={labels} registry={{ byType: { text: ShoutyText } }} />
      </FormancyProvider>,
    )

    expect(screen.getByLabelText('SHOUTY email')).toBeTruthy()
    // Non-text fields keep the default renderer.
    expect(screen.getByLabelText('Message')).toBeTruthy()
  })

  test('a per-path entry wins over a per-type entry', () => {
    function A({ path }: { path: string }) {
      const field = useField(path)
      return <input aria-label={`A ${path}`} {...field.controlProps} />
    }
    function B({ path }: { path: string }) {
      const field = useField(path)
      return <input aria-label={`B ${path}`} {...field.controlProps} />
    }
    render(
      <FormancyProvider engine={createFormEngine({ schema, capabilities: CLOCK })}>
        <FormancyForm labels={labels} registry={{ byType: { text: A }, byPath: { email: B } }} />
      </FormancyProvider>,
    )

    expect(screen.getByLabelText('B email')).toBeTruthy()
    expect(screen.queryByLabelText('A email')).toBeNull()
  })
})
