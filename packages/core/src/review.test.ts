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

  // An optional question skipped by mistake is pointed out where the person checks, in its
  // place, rather than missing from a list that reads as complete (0214).
  test('name a question the person was asked and left unanswered, in its place', () => {
    const engine = createFormEngine({ schema: trip, initialValue: { name: 'Ada' } })
    const rows = answersToReview(engine, createFormText({ locale: 'en' }))
    expect(rows.map(({ label, said, answered, page }) => ({ label, said, answered, page }))).toEqual([
      { label: 'Name', said: 'Ada', answered: true, page: 0 },
      { label: 'Country', said: 'Not answered', answered: false, page: 0 },
      { label: 'Nights', said: 'Not answered', answered: false, page: 1 },
    ])
    expect(rows[2]?.controlId).toBe(engine.getFieldSnapshot(['nights']).ids.control)
  })

  // A line the person cannot act on is noise, and a Change to a control that is not drawn or
  // takes no answer goes nowhere: only a question the person is being asked has one.
  test('name no question a rule hides, a skipped page holds, a rule disables or computes, or a hidden field', () => {
    const schema: FormSchema = {
      specVersion: '5',
      id: 'asked',
      title: 'Asked',
      model: {
        fields: [
          {
            key: 'first',
            type: 'page',
            label: 'First',
            fields: [
              { key: 'shown', type: 'text', label: 'Shown' },
              { key: 'hidden', type: 'text', label: 'Hidden by a rule' },
              { key: 'boxed', type: 'group', label: 'Boxed', fields: [{ key: 'inside', type: 'text', label: 'Inside' }] },
              { key: 'locked', type: 'text', label: 'Locked' },
              { key: 'total', type: 'number', label: 'Total' },
              { key: 'ref', type: 'hidden' },
            ],
          },
          { key: 'second', type: 'page', label: 'Second', fields: [{ key: 'later', type: 'text', label: 'Later' }] },
        ],
      },
      logic: {
        rules: [
          { kind: 'visible', target: 'hidden', cel: 'false' },
          { kind: 'visible', target: 'boxed', cel: 'false' },
          { kind: 'disabled', target: 'locked', cel: 'true' },
          { kind: 'computed', target: 'total', cel: 'null' },
          { kind: 'skip', target: 'second', cel: 'true' },
        ],
      },
    }
    const engine = createFormEngine({ schema, capabilities: { now: () => 0, today: () => '2026-10-29', random: () => 0.5 } })
    expect(answersToReview(engine, createFormText({ locale: 'en' })).map((row) => row.path)).toEqual(['shown'])
  })

  // A repeater a rule writes is the rule's row by row (0218), so a question in its rows is not the
  // person's to answer, as a computed field's is not: what the rule wrote is listed, as it will be
  // sent, and a question it left empty is not said to be *Not answered*.
  test('name no question left unanswered in the rows of a repeater a rule computes', () => {
    const schema: FormSchema = {
      specVersion: '5',
      id: 'doses',
      title: 'Doses',
      model: {
        fields: [
          { key: 'weight', type: 'number', label: 'Weight' },
          {
            key: 'doses',
            type: 'repeater',
            label: 'Dose',
            fields: [
              { key: 'drug', type: 'text', label: 'Drug' },
              { key: 'note', type: 'text', label: 'Note' },
            ],
          },
        ],
      },
      logic: { rules: [{ kind: 'computed', target: 'doses', cel: "[{'drug': 'A'}]" }] },
    }
    const engine = createFormEngine({ schema, capabilities: { now: () => 0, today: () => '2026-10-29', random: () => 0.5 } })
    expect(answersToReview(engine, createFormText({ locale: 'en' })).map((row) => row.field)).toEqual(['weight', 'doses[0].drug'])
  })

  // A row's questions are asked once per row, so each row's unanswered one has its line; a
  // repeater with no rows asked nothing, and a matrix asks each of its rows.
  test('name an unanswered question in each row, and each unanswered row of a matrix', () => {
    const schema: FormSchema = {
      specVersion: '5',
      id: 'rows',
      title: 'Rows',
      model: {
        fields: [
          { key: 'guests', type: 'repeater', label: 'Guest', fields: [{ key: 'name', type: 'text', label: 'Name' }] },
          { key: 'pets', type: 'repeater', label: 'Pet', fields: [{ key: 'kind', type: 'text', label: 'Kind' }] },
          {
            key: 'rate',
            type: 'matrix',
            label: 'Rate',
            rows: [
              { value: 'food', label: 'Food' },
              { value: 'room', label: 'Room' },
            ],
            options: [{ value: 'good', label: 'Good' }],
          },
        ],
      },
    }
    const engine = createFormEngine({
      schema,
      initialValue: { guests: [{ name: 'Ada' }, {}], pets: [], rate: { food: 'good' } },
    })
    const rows = answersToReview(engine, createFormText({ locale: 'en' }))
    expect(rows.map(({ label, said, field }) => ({ label, said, field }))).toEqual([
      { label: 'Guest 1 › Name', said: 'Ada', field: 'guests[0].name' },
      { label: 'Guest 2 › Name', said: 'Not answered', field: 'guests[1].name' },
      { label: 'Rate › Food', said: 'Good', field: 'rate' },
      { label: 'Rate › Room', said: 'Not answered', field: 'rate' },
    ])
  })
})
