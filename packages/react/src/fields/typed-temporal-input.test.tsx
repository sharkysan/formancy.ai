import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TypedTemporalInput } from '../index.js'

afterEach(cleanup)

describe('the typed temporal control a host may draw on its own', () => {
  test('is exported from the package, and reports the stored answer, not the digits', async () => {
    // A host or a builder drawing it needs the stored text to keep; digits would need the
    // same conversion again, in a second place that could disagree with the field's.
    const onChange = vi.fn()
    render(<TypedTemporalInput type="time" precision={0} value="" onChange={onChange} aria-label="Clock" />)

    await userEvent.setup().type(screen.getByLabelText('Clock'), '1')

    expect(onChange).toHaveBeenLastCalledWith('1')
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
