import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { answersToReview } from './review.js'
import { createFormText } from './words.js'

/**
 * What a person checks before sending (0204): every answer in words, under its question, with
 * where to go to change it — the page it is on and the control to focus — so both renderers
 * draw the same list and take a "Change" to the same place.
 */
const trip: FormSchema = {
  specVersion: '5',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'about',
        type: 'page',
        label: 'About you',
        fields: [
          { key: 'name', type: 'text', label: 'Name' },
          { key: 'country', type: 'select', label: 'Country', options: [{ value: 'CH', label: 'Switzerland' }] },
        ],
      },
      { key: 'stay', type: 'page', label: 'Your stay', fields: [{ key: 'nights', type: 'number', label: 'Nights' }] },
    ],
  },
}

describe('answers to review', () => {
  test('are every answer in words, in document order, with the page and the control to change it', () => {
    const engine = createFormEngine({ schema: trip, initialValue: { name: 'Ada', country: 'CH', nights: 3 } })
    const rows = answersToReview(engine, createFormText({ locale: 'en' }))
    expect(rows.map(({ label, said, page }) => ({ label, said, page }))).toEqual([
      { label: 'Name', said: 'Ada', page: 0 },
      { label: 'Country', said: 'Switzerland', page: 0 },
      { label: 'Nights', said: '3', page: 1 },
    ])
    expect(rows[1]?.controlId).toBe(engine.getFieldSnapshot(['country']).ids.control)
  })

  // What will be sent, and nothing else: a question nobody answered has no line, as a
  // submission read back has none.
  test('leave out a question nobody answered', () => {
    const engine = createFormEngine({ schema: trip, initialValue: { name: 'Ada' } })
    expect(answersToReview(engine, createFormText({ locale: 'en' })).map((row) => row.path)).toEqual(['name'])
  })
})
