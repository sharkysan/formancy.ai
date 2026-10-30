import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { FieldOption } from '@formancy/spec'
import { OptionsEditor } from './options-editor.js'

afterEach(cleanup)

/**
 * The Remove button of a choice names the choice it removes.
 *
 * A choice whose label is a message reference — `{ $t: 'colour.red' }`, which a translated form
 * holds — was named "[object Object]", because its label was written out as a string. Five
 * translated choices were five identical, meaningless announcements, which is what the name
 * exists to prevent. The Angular builder falls back to the choice's value; so does this one.
 */
describe('the options editor', () => {
  test('names a choice whose label is a message reference by its value', () => {
    const options: FieldOption[] = [
      { value: 'red', label: { $t: 'colour.red' } },
      { value: 'green', label: 'Green' },
    ]
    render(<OptionsEditor options={options} onChange={() => undefined} />)

    expect(screen.getByRole('button', { name: /Remove.*red/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /object Object/ })).toBeNull()
  })
})
