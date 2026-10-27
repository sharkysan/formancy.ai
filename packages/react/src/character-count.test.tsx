import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/**
 * A character count under a field with a limit (0203): the limit, then what is left, shown as the
 * person types and read with the control; and said in a polite live region once they pause, so
 * a screen reader is told without being told at every keystroke.
 */
const mount = (field: FieldDef) => {
  const schema: FormSchema = { specVersion: '5', id: 'f', title: 'F', model: { fields: [field] } }
  render(
    <FormancyProvider engine={createFormEngine({ schema })}>
      <FormancyForm />
    </FormancyProvider>,
  )
}

const note: FieldDef = { key: 'note', type: 'textarea', label: 'Note', maxLength: 10 }

describe('a character count', () => {
  test('says the limit under an empty box, and describes the box', () => {
    mount(note)
    const count = screen.getByText('You can enter up to 10 characters.')
    expect(screen.getByRole('textbox', { name: 'Note' }).getAttribute('aria-describedby')).toBe(count.id)
  })

  test('says what is left as soon as somebody types, and how many too many past the limit', () => {
    mount({ ...note, type: 'text' })
    const box = screen.getByRole('textbox', { name: 'Note' })
    fireEvent.change(box, { target: { value: 'Hello' } })
    expect(screen.getByText('You have 5 characters remaining.')).toBeTruthy()
    fireEvent.change(box, { target: { value: 'Hello world' } })
    expect(screen.getByText('You have 1 character too many.')).toBeTruthy()
  })

  // Announced once the person pauses, never at each keystroke and never on load: a page whose
  // every counted field spoke its limit when it opened would be talking over the person.
  test('is spoken once typing pauses, and not before', () => {
    vi.useFakeTimers()
    mount(note)
    const status = screen.getByRole('status')
    act(() => vi.advanceTimersByTime(2000))
    expect(status.textContent).toBe('')

    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Hi' } })
    expect(status.textContent).toBe('')
    act(() => vi.advanceTimersByTime(1000))
    expect(status.textContent).toBe('You have 8 characters remaining.')
  })

  test('is not there for a box with no limit', () => {
    mount({ key: 'plain', type: 'textarea', label: 'Plain' })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Plain' }).getAttribute('aria-describedby')).toBeNull()
  })
})
