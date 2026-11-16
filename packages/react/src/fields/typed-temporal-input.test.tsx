import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TypedTemporalInput } from '../index.js'

afterEach(cleanup)

/** A host that keeps the answer, as a form does: each keystroke starts from what was reported before. */
function Kept({ onChange }: { onChange: (value: string | null) => void }) {
  const [value, setValue] = useState('')
  return (
    <TypedTemporalInput
      type="time"
      precision={0}
      value={value}
      onChange={(next) => {
        setValue(next ?? '')
        onChange(next)
      }}
      aria-label="Clock"
    />
  )
}

describe('the typed temporal control a host may draw on its own', () => {
  test('a ref reaches the input', () => {
    // A host focusing the control, or a form library registering it, needs the element; props
    // typed without `ref` silently dropped it.
    let element: HTMLInputElement | null = null
    render(<TypedTemporalInput ref={(node) => void (element = node)} type="time" precision={0} value="" onChange={() => undefined} aria-label="Clock" />)

    expect(element).toBe(screen.getByLabelText('Clock'))
  })

  test('is exported from the package, and reports the stored answer, not the digits', async () => {
    // A host or a builder drawing it needs the stored text to keep; digits would need the
    // same conversion again, in a second place that could disagree with the field's.
    const onChange = vi.fn()
    render(<Kept onChange={onChange} />)

    await userEvent.setup().type(screen.getByLabelText('Clock'), '1403')

    // The digits are 1403; the answer is the time they make, which is what a host stores.
    expect(onChange).toHaveBeenLastCalledWith('14:03')
    expect(screen.getByLabelText<HTMLInputElement>('Clock').placeholder).toBe('__:__:__')
  })

  test('shows a stored answer in its shape and writes nothing on mount', () => {
    // An answer somebody supplied and nobody touched is submitted byte for byte.
    const onChange = vi.fn()
    render(<TypedTemporalInput type="time" precision={3} value="14:03:27.415" onChange={onChange} aria-label="Clock" />)

    expect(screen.getByLabelText<HTMLInputElement>('Clock').value).toBe('14:03:27.415')
    expect(onChange).not.toHaveBeenCalled()
  })
})
