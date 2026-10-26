import { describe, expect, test } from 'vitest'
import { shownAsCodes } from './messages.js'

describe('a message shown as its code', () => {
  // The renderers drew `required` where a person should read a sentence (0191); a driver
  // reporting that text is the renderer failing, whatever language the sentence would be in.
  test('is one whose text is its code', () => {
    const coded = { path: 'name', code: 'required', text: 'required' }
    const said = { path: 'name', code: 'minLength', text: 'Enter at least 5 characters.' }
    expect(shownAsCodes([coded, said])).toEqual([coded])
  })

  // The contract carries text for diagnostics and does not require it, so a driver that reports
  // none is not judged on words it did not report.
  test('and never one whose driver reported no text', () => {
    expect(shownAsCodes([{ path: 'name', code: 'required' }])).toEqual([])
  })
})
