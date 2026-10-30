import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { errorSentence } from './error-words.js'
import { createFormText } from './words.js'

/**
 * A rule's own message, as a renderer is handed it (0198): resolved in the form's language by
 * the engine, as a label is, and said for the rule's code by the one function both renderers
 * and both error summaries call — so a code nobody worded is no longer shown as itself.
 */
const CLOCK = { now: () => 0, today: () => '2026-10-27', random: () => 0.5 }

const trip: FormSchema = {
  specVersion: '5',
  id: 'trip',
  title: 'Trip',
  i18n: {
    defaultLocale: 'en',
    messages: {
      en: { 'age.adult': 'Travellers must be 18 or older.', 'qty.some': 'Order at least one.' },
      de: { 'age.adult': 'Reisende müssen mindestens 18 sein.', 'qty.some': 'Bestellen Sie mindestens eines.' },
    },
  },
  model: {
    fields: [
      { key: 'age', type: 'number', label: 'Age' },
      { key: 'name', type: 'text', label: 'Name' },
      { key: 'items', type: 'repeater', label: 'Items', minItems: 1, fields: [{ key: 'qty', type: 'number', label: 'Qty' }] },
    ],
  },
  logic: {
    rules: [
      { target: 'age', kind: 'validate', cel: 'age >= 18', code: 'adult', message: { $t: 'age.adult' } },
      { target: 'name', kind: 'validate', cel: "name != 'x'", code: 'notX' },
      { target: 'items[].qty', kind: 'validate', cel: 'item.qty > 0', code: 'some', message: { $t: 'qty.some' } },
    ],
  },
}

const engineFor = (locale?: string) => createFormEngine({ schema: trip, capabilities: CLOCK, ...(locale === undefined ? {} : { locale }) })

describe('a rule’s message', () => {
  test('is on the snapshot of the field it is about, in the form’s language', () => {
    expect(engineFor().getFieldSnapshot(['age']).messages).toEqual({ adult: 'Travellers must be 18 or older.' })
    expect(engineFor('de').getFieldSnapshot(['age']).messages).toEqual({ adult: 'Reisende müssen mindestens 18 sein.' })
    expect(engineFor().getFieldSnapshot(['name']).messages).toEqual({})
  })

  // A row-scoped rule is every row's: the message is on each row's field.
  test('of a rule on a repeater’s field is on that field in every row', () => {
    expect(engineFor().getFieldSnapshot(['items', 0, 'qty']).messages).toEqual({ some: 'Order at least one.' })
  })

  // Said by the function every error goes through, so the summary and the field agree.
  test('is what the field says for the rule’s code', () => {
    const engine = engineFor('de')
    engine.setValue(['age'], 12)
    engine.submit()
    const { errors, def, messages } = engine.getFieldSnapshot(['age'])
    expect(errors).toEqual(['adult'])
    expect(errors.map((code) => errorSentence(createFormText({ locale: 'de' }), def, code, messages))).toEqual(['Reisende müssen mindestens 18 sein.'])
  })

  // A rule that runs only on the server reports its code to a browser that never evaluated it.
  // The message is the document's, not the evaluation's, so the verdict is said all the same.
  test('says a verdict from the server too', () => {
    const engine = engineFor()
    engine.applyServerErrors({ age: ['adult'] })
    const { errors, def, messages } = engine.getFieldSnapshot(['age'])
    expect(errorSentence(createFormText({ locale: 'en' }), def, errors[0]!, messages)).toBe('Travellers must be 18 or older.')
  })

  // Without one, as before: a code no catalogue knows is said as the author wrote it.
  test('absent, leaves the code said as itself', () => {
    const { def, messages } = engineFor().getFieldSnapshot(['name'])
    expect(errorSentence(createFormText({ locale: 'en' }), def, 'notX', messages)).toBe('notX')
  })
})
