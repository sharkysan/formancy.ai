import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

// Auto-cleanup hooks into a global afterEach, which vitest only provides with
// globals: true; we keep globals off, so clean up explicitly.
afterEach(cleanup)
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyProvider, useField } from './index.js'

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'textarea' },
    ],
  },
}

function TextInput({ path, renders }: { path: string; renders?: { count: number } }) {
  if (renders) renders.count++
  const field = useField(path)
  return (
    <input
      id={field.ids.control}
      aria-label={path}
      value={(field.value as string) ?? ''}
      onChange={(event) => field.setValue(event.target.value)}
      onBlur={() => field.touch()}
    />
  )
}

function renderForm(ui: React.ReactNode, engine = createFormEngine({ schema })) {
  render(<FormancyProvider engine={engine}>{ui}</FormancyProvider>)
  return engine
}

describe('useField', () => {
  test('exposes the field snapshot from the engine in context', () => {
    renderForm(<TextInput path="email" />, createFormEngine({ schema, initialValue: { email: 'a@b.ch' } }))

    expect(screen.getByLabelText('email')).toHaveProperty('value', 'a@b.ch')
  })

  test('setValue flows into the engine and back into the input', () => {
    const engine = renderForm(<TextInput path="email" />)

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'x@y.ch' } })

    expect(engine.getFieldSnapshot(['email']).value).toBe('x@y.ch')
    expect(screen.getByLabelText('email')).toHaveProperty('value', 'x@y.ch')
  })

  test('touch flows through on blur', () => {
    const engine = renderForm(<TextInput path="email" />)

    fireEvent.blur(screen.getByLabelText('email'))

    expect(engine.getFieldSnapshot(['email']).touched).toBe(true)
  })

  test('typing in one field does not re-render a sibling field component', () => {
    const emailRenders = { count: 0 }
    const messageRenders = { count: 0 }
    renderForm(
      <>
        <TextInput path="email" renders={emailRenders} />
        <TextInput path="message" renders={messageRenders} />
      </>,
    )
    const messageBefore = messageRenders.count

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'x@y.ch' } })

    expect(messageRenders.count).toBe(messageBefore)
    expect(emailRenders.count).toBeGreaterThan(1)
  })

  test('an engine mutation from outside React reaches the input', () => {
    const engine = renderForm(<TextInput path="email" />)

    // Server-driven prefill, devtools, or another consumer of the same engine.
    act(() => engine.setValue(['email'], 'prefilled@b.ch'))

    expect(screen.getByLabelText('email')).toHaveProperty('value', 'prefilled@b.ch')
  })

  test('throws a useful error outside a FormancyProvider', () => {
    function Naked() {
      useField('email')
      return null
    }
    expect(() => render(<Naked />)).toThrow(/FormancyProvider/)
  })
})
