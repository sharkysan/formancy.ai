import { describe, expect, test } from 'vitest'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { createBuilderText } from './messages.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { reprecise } from './reprecision.js'
import { createBuilderSession } from './session.js'

/**
 * Changing a field's precision carries what is written at its width along, or refuses (0238).
 *
 * A time or a date and time answers at one width, and a bound, a default and a literal a rule
 * compares it with are all compared with an answer as text. Changing only `precision` left each
 * at the old width: the validator then refused the document, and a rule literal was refused at
 * publish. The change rewrites them when that is exact and refuses when it is not; a builder
 * session never holds a document the validator rejects, and never guesses a value.
 */
const rule = (cel: string, extra: Partial<LogicRule> = {}): LogicRule => ({ kind: 'visible', target: 'note', cel, ...extra })

const form = (opens: Record<string, unknown>, rules: LogicRule[] = []): FormSchema =>
  ({
    specVersion: '6',
    id: 'shop',
    title: 'Shop',
    model: {
      fields: [
        { key: 'opens', type: 'time', label: 'Opens', ...opens },
        { key: 'note', type: 'text', label: 'Note' },
        {
          key: 'legs',
          type: 'repeater',
          label: 'Legs',
          fields: [
            { key: 'at', type: 'time', label: 'At', precision: 0 },
            { key: 'flag', type: 'text', label: 'Flag' },
          ],
        },
      ],
    },
    logic: { rules },
  }) as unknown as FormSchema

const opensOf = (document: FormSchema): Record<string, unknown> => document.model.fields[0] as unknown as Record<string, unknown>

describe('widening a field’s precision', () => {
  // Left at the old width, the validator refuses the bound the moment the box is edited, so
  // the author has to retype three properties by hand to change one number.
  test('pads its bounds and its default with zeros', () => {
    const session = createBuilderSession(form({ precision: 0, earliest: '08:00:00', latest: '18:00:00', default: '09:00:00' }))
    expect(session.setFieldProperty(['opens'], 'precision', 3).ok).toBe(true)
    expect(opensOf(session.document())).toMatchObject({ precision: 3, earliest: '08:00:00.000', latest: '18:00:00.000', default: '09:00:00.000' })
  })

  // A rule literal left at the old width compares as text and never equals an answer; publish
  // refuses it. Only the literal's own characters may change, so the author's spacing stays.
  test('pads the literal a rule compares it with, and nothing else in the rule', () => {
    const session = createBuilderSession(form({ precision: 0 }, [rule('has(note)  &&  opens >= "08:00:00" && note == "08:00:00"')]))
    expect(session.setFieldProperty(['opens'], 'precision', 3).ok).toBe(true)
    expect(session.document().logic?.rules[0]?.cel).toBe('has(note)  &&  opens >= "08:00:00.000" && note == "08:00:00"')
  })

  // The visual editor reopens from `editor`, not from the CEL, and recompiles the CEL from it:
  // a value left behind would restore the old width the next time the rule is opened.
  test('pads the value the visual editor holds, which the rule is recompiled from', () => {
    const editor = {
      join: 'all',
      conditions: [
        { field: 'opens', operator: 'gte', value: '08:00:00' },
        { field: 'note', operator: 'is', value: '08:00:00' },
      ],
    }
    const session = createBuilderSession(form({ precision: 0 }, [rule('opens >= "08:00:00" && note == "08:00:00"', { editor })]))
    expect(session.setFieldProperty(['opens'], 'precision', 3).ok).toBe(true)
    expect(session.document().logic?.rules[0]?.editor).toEqual({
      join: 'all',
      conditions: [
        { field: 'opens', operator: 'gte', value: '08:00:00.000' },
        { field: 'note', operator: 'is', value: '08:00:00' },
      ],
    })
  })

  // A rule in a repeater row reads the field as `item.at`; matching only the model's spelling
  // would leave every row rule behind.
  test('finds a rule in a repeater row by the way it reads the field', () => {
    const session = createBuilderSession(form({}, [rule('item.at >= "08:00:00"', { target: 'legs[].flag' })]))
    expect(session.setFieldProperty(['legs', 'at'], 'precision', 2).ok).toBe(true)
    expect(session.document().logic?.rules[0]?.cel).toBe('item.at >= "08:00:00.00"')
  })

  // Adding the first precision to a time changes its shape from HH:MM to HH:MM:SS.
  test('gives a time that had no precision its seconds, which HH:MM always meant to be 00', () => {
    const session = createBuilderSession(form({ earliest: '08:30', default: '09:00' }, [rule('opens >= "08:30"')]))
    expect(session.setFieldProperty(['opens'], 'precision', 0).ok).toBe(true)
    expect(opensOf(session.document())).toMatchObject({ earliest: '08:30:00', default: '09:00:00' })
    expect(session.document().logic?.rules[0]?.cel).toBe('opens >= "08:30:00"')
  })

  // A date and time with no precision and one of precision 0 share a shape, so there is
  // nothing to write; rewriting would be a change nobody asked for.
  test('leaves a date and time alone when 0 and absent are the only difference', () => {
    const stamped = {
      specVersion: '6',
      id: 's',
      title: 'S',
      model: { fields: [{ key: 'at', type: 'datetime', label: 'At', earliest: '2026-10-08T09:00:00Z' }] },
    } as unknown as FormSchema
    const session = createBuilderSession(stamped)
    expect(session.setFieldProperty(['at'], 'precision', 0).ok).toBe(true)
    expect(session.document().model.fields[0]).toMatchObject({ precision: 0, earliest: '2026-10-08T09:00:00Z' })
    expect(session.setFieldProperty(['at'], 'precision', 3).ok).toBe(true)
    expect(session.document().model.fields[0]).toMatchObject({ precision: 3, earliest: '2026-10-08T09:00:00.000Z' })
  })
})

describe('narrowing a field’s precision', () => {
  // The digits being cut carry nothing, so the value is the same instant in fewer characters.
  test('cuts digits that are all zero', () => {
    const session = createBuilderSession(form({ precision: 3, earliest: '08:00:00.000', default: '09:00:00.000' }, [rule('opens >= "08:00:00.000"')]))
    expect(session.setFieldProperty(['opens'], 'precision', 0).ok).toBe(true)
    expect(opensOf(session.document())).toMatchObject({ precision: 0, earliest: '08:00:00', default: '09:00:00' })
    expect(session.document().logic?.rules[0]?.cel).toBe('opens >= "08:00:00"')
  })

  // Cutting 250 ms to nothing moves the bound by a quarter second: a value the builder would
  // have guessed. The change is refused with the validator's own sentence, and the document is
  // exactly as it was.
  test('refuses a bound that has a fraction, in the validator’s words, and leaves the document alone', () => {
    const session = createBuilderSession(form({ precision: 3, earliest: '08:00:00.250' }))
    const before = session.document()
    const outcome = session.setFieldProperty(['opens'], 'precision', 0)
    expect(outcome).toMatchObject({ ok: false, path: '/model/fields/0/earliest' })
    if (!outcome.ok) expect(outcome.message).toContain('Write it exactly as an answer is written, like "09:30:00"')
    expect(session.document()).toBe(before)
  })

  // A bound's fraction is one check, a rule's is another: a literal of 250 ms that the rule
  // compares with would stop meaning what it says, and a refusal must name the rule.
  test('refuses a rule literal that has a fraction, naming the rule, and leaves the document alone', () => {
    const session = createBuilderSession(form({ precision: 3 }, [rule('opens >= "08:00:00.250"')]))
    const before = session.document()
    const outcome = session.setFieldProperty(['opens'], 'precision', 0)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/^Rule 1 \(“Show this field when” on “note”\) compares “opens” with “08:00:00\.250”/)
    expect(session.document()).toBe(before)
  })

  // The same refusal in the session's language, or the author is shown English in a German
  // builder.
  test('refuses in the builder’s language', () => {
    const text = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    const session = createBuilderSession(form({ precision: 3 }, [rule('opens >= "08:00:00.250"')]), { text })
    const outcome = session.setFieldProperty(['opens'], 'precision', 0)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/^Regel 1 /)
  })

  // An editor value that cannot follow would be recompiled back over the CEL the next time the
  // rule is opened, so it refuses on its own even when the CEL is exact.
  test('refuses an editor value that has a fraction even when the rule’s text could be cut', () => {
    const editor = { join: 'all', conditions: [{ field: 'opens', operator: 'gte', value: '08:00:00.250' }] }
    const session = createBuilderSession(form({ precision: 3 }, [rule('opens >= "08:00:00.000"', { editor })]))
    expect(session.setFieldProperty(['opens'], 'precision', 0).ok).toBe(false)
  })

  // A value already not at the old width was a misshapen literal before this edit (publish
  // warns about it); the edit is not the place to decide what it should have been.
  test('leaves a literal that was not at the old width alone', () => {
    const session = createBuilderSession(form({ precision: 3 }, [rule('opens >= "08:00"')]))
    expect(session.setFieldProperty(['opens'], 'precision', 0).ok).toBe(true)
    expect(session.document().logic?.rules[0]?.cel).toBe('opens >= "08:00"')
  })
})

describe('removing a field’s precision', () => {
  // HH:MM cannot hold seconds, so 08:00:01 would become 08:00 and move the bound a second.
  test('refuses a time that has seconds other than 00', () => {
    const session = createBuilderSession(form({ precision: 0, earliest: '08:00:01' }))
    const outcome = session.setFieldProperty(['opens'], 'precision', undefined)
    expect(outcome).toMatchObject({ ok: false, path: '/model/fields/0/earliest' })
    if (!outcome.ok) expect(outcome.message).toContain('like "09:30"')
  })

  // HH:MM means seconds 00 (0067), so 08:00:00 and 08:00 are the same time of day written two
  // ways and dropping the seconds is exact.
  test('turns 08:00:00 into 08:00, because HH:MM means seconds 00', () => {
    const session = createBuilderSession(form({ precision: 0, earliest: '08:00:00', default: '09:00:00' }, [rule('opens >= "08:00:00"')]))
    expect(session.setFieldProperty(['opens'], 'precision', undefined).ok).toBe(true)
    const opens = opensOf(session.document())
    expect(opens).toMatchObject({ earliest: '08:00', default: '09:00' })
    expect('precision' in opens).toBe(false)
    expect(session.document().logic?.rules[0]?.cel).toBe('opens >= "08:00"')
  })

  // A fraction of zeros is as exact to drop as the seconds.
  test('turns 08:00:00.000 into 08:00, and refuses 08:00:00.100', () => {
    const exact = createBuilderSession(form({ precision: 3, earliest: '08:00:00.000' }))
    expect(exact.setFieldProperty(['opens'], 'precision', undefined).ok).toBe(true)
    expect(opensOf(exact.document()).earliest).toBe('08:00')
    const inexact = createBuilderSession(form({ precision: 3, earliest: '08:00:00.100' }))
    expect(inexact.setFieldProperty(['opens'], 'precision', undefined).ok).toBe(false)
  })

  // A date and time with no precision and with 0 share a shape, so a bound survives as it is.
  test('keeps a date and time’s bound, which 0 and absent write the same', () => {
    const stamped = {
      specVersion: '6',
      id: 's',
      title: 'S',
      model: { fields: [{ key: 'at', type: 'datetime', label: 'At', precision: 0, earliest: '2026-10-08T09:00:00Z' }] },
    } as unknown as FormSchema
    const session = createBuilderSession(stamped)
    expect(session.setFieldProperty(['at'], 'precision', undefined).ok).toBe(true)
    expect(session.document().model.fields[0]).toMatchObject({ earliest: '2026-10-08T09:00:00Z' })
  })
})

describe('reprecise', () => {
  // The command the property box uses and the function a caller without a session uses must
  // not be two answers; the function is the one place the rewrite is decided.
  test('returns the rewritten document, and leaves the one it was given unchanged', () => {
    const given = form({ precision: 0, earliest: '08:00:00' })
    const outcome = reprecise(given, 'opens', 3)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(opensOf(outcome.schema)).toMatchObject({ precision: 3, earliest: '08:00:00.000' })
    expect(opensOf(given)).toMatchObject({ precision: 0, earliest: '08:00:00' })
  })

  // A caller deciding what to say needs the validator's codes, not only a sentence.
  test('refuses with the validator’s errors', () => {
    const outcome = reprecise(form({ precision: 3, earliest: '08:00:00.250' }), 'opens', 0)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.errors).toMatchObject([{ code: 'bounds.width', path: '/model/fields/0/earliest', values: { expected: '09:30:00' } }])
  })

  // A precision the schema refuses (1.5, 12) has no width to rewrite to; the validator says what
  // is wrong with the number and the field is untouched.
  test('hands a precision it cannot read to the validator rather than guessing a width', () => {
    const session = createBuilderSession(form({ precision: 0, earliest: '08:00:00' }))
    expect(session.setFieldProperty(['opens'], 'precision', 12).ok).toBe(false)
    expect(session.setFieldProperty(['opens'], 'precision', 1.5).ok).toBe(false)
    expect(opensOf(session.document())).toMatchObject({ precision: 0, earliest: '08:00:00' })
  })

  // Only a time and a date and time have a precision; on any other the property is as it ever
  // was, set and judged by the validator.
  test('leaves a field of another type to the ordinary property command', () => {
    const session = createBuilderSession(form({}))
    expect(session.setFieldProperty(['note'], 'precision', 3).ok).toBe(false)
  })
})
