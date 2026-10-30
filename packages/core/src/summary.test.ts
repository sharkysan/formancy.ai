import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createSummary, summariseAnswers } from './summary.js'
import { createFormText } from './words.js'

/**
 * What a form's submissions say together, question by question (0206): how many answered, and
 * for a choice how many chose each option, by its label — the first thing anybody reading a
 * form's responses asks, before reading any one of them.
 */
const form: FormSchema = {
  specVersion: '5',
  id: 'survey',
  title: 'Survey',
  i18n: { defaultLocale: 'en', messages: { en: { 'channel.friend': 'A friend' } } },
  model: {
    fields: [
      {
        key: 'channel',
        type: 'radio',
        label: 'How did you hear of us?',
        options: [
          { value: 'friend', label: { $t: 'channel.friend' } },
          { value: 'press', label: 'The press' },
        ],
      },
      {
        key: 'extras',
        type: 'selectboxes',
        label: 'Extras',
        options: [
          { value: 'wrap', label: 'Gift wrap' },
          { value: 'card', label: 'Card' },
        ],
      },
      { key: 'again', type: 'checkbox', label: 'Would you come again?' },
      { key: 'nights', type: 'number', label: 'Nights' },
      { key: 'note', type: 'textarea', label: 'Anything else?' },
      { key: 'intro', type: 'static', label: 'Thank you.' },
    ],
  },
}

const english = createFormText({ locale: 'en' })

const submissions = [
  { channel: 'friend', extras: ['wrap', 'card'], again: true, nights: 2, note: 'Lovely.' },
  { channel: 'friend', extras: ['card'], again: false, nights: 5 },
  { channel: 'press', extras: [], again: true },
  { channel: 'gone', nights: 2 },
]

describe('a summary of answers', () => {
  test('counts each option of a choice by its label, in the options’ order', () => {
    const [channel] = summariseAnswers(form, submissions, english)
    expect(channel).toEqual({
      field: 'channel',
      label: 'How did you hear of us?',
      answered: 4,
      kind: 'choices',
      // An answer no option names any more is counted as itself, after the options: a summary
      // that dropped it would add up to less than was answered.
      counts: [
        { value: 'friend', label: 'A friend', count: 2 },
        { value: 'press', label: 'The press', count: 1 },
        { value: 'gone', label: 'gone', count: 1 },
      ],
    })
  })

  // A list counts each tick, so the counts can add up to more than answered; an empty list is
  // not an answer, as `required` reads it.
  test('counts every tick of a list, and an empty list as not answered', () => {
    expect(summariseAnswers(form, submissions, english)[1]).toMatchObject({
      answered: 2,
      counts: [
        { value: 'wrap', count: 1 },
        { value: 'card', count: 2 },
      ],
    })
  })

  test('counts a tick box as yes and no', () => {
    expect(summariseAnswers(form, submissions, english)[2]).toMatchObject({
      answered: 3,
      counts: [
        { value: true, label: 'Yes', count: 2 },
        { value: false, label: 'No', count: 1 },
      ],
    })
  })

  test('gives a number its range and its mean', () => {
    expect(summariseAnswers(form, submissions, english)[3]).toEqual({
      field: 'nights',
      label: 'Nights',
      answered: 3,
      kind: 'number',
      min: 2,
      max: 5,
      mean: 3,
    })
  })

  // Text is read one answer at a time; the summary says how many there are to read.
  test('says how many answered anything else, and leaves out what asks nothing', () => {
    const summary = summariseAnswers(form, submissions, english)
    expect(summary[4]).toEqual({ field: 'note', label: 'Anything else?', answered: 1, kind: 'answered' })
    expect(summary.map((question) => question.field)).not.toContain('intro')
  })

  // A repeater's question is counted over every row of every submission: two travellers in one
  // response are two answers to "Diet", not one.
  test('counts a repeater’s question over every row', () => {
    const people: FormSchema = {
      ...form,
      model: {
        fields: [
          {
            key: 'people',
            type: 'repeater',
            label: 'Travellers',
            fields: [{ key: 'diet', type: 'radio', label: 'Diet', options: [{ value: 'veg', label: 'Vegetarian' }, { value: 'any', label: 'Anything' }] }],
          },
        ],
      },
    }
    expect(summariseAnswers(people, [{ people: [{ diet: 'veg' }, { diet: 'any' }] }, { people: [{ diet: 'veg' }] }, {}], english)).toEqual([
      {
        field: 'people[].diet',
        label: 'Travellers › Diet',
        answered: 3,
        kind: 'choices',
        counts: [
          { value: 'veg', label: 'Vegetarian', count: 2 },
          { value: 'any', label: 'Anything', count: 1 },
        ],
      },
    ])
  })

  // A matrix asks one question of each row, so each row is counted on its own.
  test('counts each row of a matrix as a question of its own', () => {
    const rating: FormSchema = {
      ...form,
      model: {
        fields: [
          {
            key: 'rating',
            type: 'matrix',
            label: 'Rating',
            rows: [{ value: 'taste', label: 'Taste' }, { value: 'price', label: 'Price' }],
            options: [{ value: 'good', label: 'Good' }, { value: 'bad', label: 'Bad' }],
          },
        ],
      },
    }
    const summary = summariseAnswers(rating, [{ rating: { taste: 'good', price: 'bad' } }, { rating: { taste: 'good' } }], english)
    expect(summary.map(({ field, label, answered }) => ({ field, label, answered }))).toEqual([
      { field: 'rating.taste', label: 'Rating › Taste', answered: 2 },
      { field: 'rating.price', label: 'Rating › Price', answered: 1 },
    ])
    expect(summary[0]).toMatchObject({ counts: [{ value: 'good', count: 2 }, { value: 'bad', count: 0 }] })
  })

  // A form nobody has answered yet still lists its questions, each answered by none.
  // Every number was kept to find the range with `Math.min(...numbers)`, and a spread past the
  // engine's argument limit throws: measured on Node 22, at 120,000 numbers, where 100,000 passed.
  // A summary counted on the server for a form that large answered a 500 (0224).
  test('gives a number its range and mean over more answers than a call can take arguments', () => {
    const many = Array.from({ length: 200_000 }, (_, at) => ({ nights: at % 90 }))
    const mean = many.reduce((total, { nights }) => total + nights, 0) / many.length

    expect(summariseAnswers(form, many, english)[3]).toEqual({
      field: 'nights',
      label: 'Nights',
      answered: 200_000,
      kind: 'number',
      min: 0,
      max: 89,
      mean,
    })
  })

  // So the server can count a page of responses at a time and hold no more than the page (0224).
  test('counted one response at a time, says what it says counted all at once', () => {
    const summary = createSummary(form, english)
    for (const submission of submissions) summary.add(submission)

    expect(summary.questions()).toEqual(summariseAnswers(form, submissions, english))
    expect(createSummary(form, english).questions()).toEqual(summariseAnswers(form, [], english))
  })

  test('lists every question with none answered when there are no submissions', () => {
    expect(summariseAnswers(form, [], english).map(({ field, answered }) => [field, answered])).toEqual([
      ['channel', 0],
      ['extras', 0],
      ['again', 0],
      ['nights', 0],
      ['note', 0],
    ])
  })
})

