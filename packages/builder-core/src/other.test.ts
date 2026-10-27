import { describe, expect, test } from 'vitest'
import { createFormEngine, engineRefusal } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { addOtherOption } from './other.js'
import { createBuilderSession } from './session.js'

/**
 * "Other, please specify" in one step (0202): what an author would build by hand from three
 * constructs the format has — an option, a text field and the rules that show and require it
 * while that option is chosen (0199).
 */
const CLOCK = { now: () => 0, today: () => '2026-10-27', random: () => 0.5 }
const options = [
  { value: 'friend', label: 'A friend' },
  { value: 'press', label: 'The press' },
]

const form = (fields: FieldDef[], specVersion: '4' | '5' = '5'): FormSchema => ({ specVersion, id: 'survey', title: 'Survey', model: { fields } })

describe('adding "Other, please specify"', () => {
  test('adds the option, a text field straight after the choice, and rules showing and requiring it', () => {
    const session = createBuilderSession(
      form([{ key: 'channel', type: 'radio', label: 'Channel', options }, { key: 'email', type: 'text', label: 'Email' }]),
    )
    expect(addOtherOption(session, ['channel']).ok).toBe(true)

    const document = session.document()
    expect(document.model.fields.map((field) => field.key)).toEqual(['channel', 'channelOther', 'email'])
    // Kept last: "Other" read in the middle of a shuffled list is not what anybody means (0200).
    expect(document.model.fields[0]?.options?.at(-1)).toEqual({ value: 'other', label: 'Other', keepPlace: true })
    expect(document.model.fields[1]).toEqual({ key: 'channelOther', type: 'text', label: 'Please specify' })
    expect(document.logic?.rules).toEqual([
      expect.objectContaining({ target: 'channelOther', kind: 'visible', cel: 'channel == "other"' }),
      expect.objectContaining({ target: 'channelOther', kind: 'required', cel: 'channel == "other"' }),
    ])
  })

  // Written as the condition editor writes a comparison, so the engine takes it and it works.
  test('is a form the engine opens, which asks for the text only while "Other" is chosen', () => {
    const session = createBuilderSession(form([{ key: 'channel', type: 'radio', label: 'Channel', options }]))
    addOtherOption(session, ['channel'])
    const document = session.document()
    expect(engineRefusal(document)).toBeUndefined()

    const engine = createFormEngine({ schema: document, capabilities: CLOCK })
    expect(engine.getFieldSnapshot(['channelOther']).visible).toBe(false)
    engine.setValue(['channel'], 'other')
    expect(engine.getFieldSnapshot(['channelOther'])).toMatchObject({ visible: true, required: true })
  })

  // A list of ticks holds "Other" among others, so the rule asks whether it is in the list.
  test('on a list of ticks, asks whether "Other" is among the ticks', () => {
    const session = createBuilderSession(form([{ key: 'channel', type: 'selectboxes', label: 'Channel', options }]))
    addOtherOption(session, ['channel'])
    expect(session.document().logic?.rules?.[0]?.cel).toBe('"other" in channel')
  })

  // A choice in a repeater's row: the text field is the row's, and so are its rules.
  test('in a repeater’s row, writes the rules for the row', () => {
    const session = createBuilderSession(
      form([{ key: 'people', type: 'repeater', label: 'People', fields: [{ key: 'channel', type: 'select', label: 'Channel', options }] }]),
    )
    expect(addOtherOption(session, ['people', 'channel']).ok).toBe(true)
    const document = session.document()
    expect(document.model.fields[0]?.fields?.map((field) => field.key)).toEqual(['channel', 'channelOther'])
    expect(document.logic?.rules?.[0]).toMatchObject({ target: 'people[].channelOther', cel: 'item.channel == "other"' })
    expect(engineRefusal(document)).toBeUndefined()
  })

  // A version 4 document cannot hold `keepPlace`; the option is added without it.
  test('in a version 4 document, leaves out what it cannot hold', () => {
    const session = createBuilderSession(form([{ key: 'channel', type: 'radio', label: 'Channel', options }], '4'))
    expect(addOtherOption(session, ['channel']).ok).toBe(true)
    expect(session.document().model.fields[0]?.options?.at(-1)).toEqual({ value: 'other', label: 'Other' })
  })

  test('takes a key nobody uses', () => {
    const session = createBuilderSession(
      form([{ key: 'channel', type: 'radio', label: 'Channel', options }, { key: 'channelOther', type: 'text', label: 'Taken' }]),
    )
    addOtherOption(session, ['channel'])
    expect(session.document().model.fields.map((field) => field.key)).toEqual(['channel', 'channelOther2', 'channelOther'])
  })

  // On a field that is not a choice there is nothing to choose "Other" from; on one that offers
  // it already, a second would be a value the options share.
  test('is refused where there is no choice, or one that already offers "other"', () => {
    const session = createBuilderSession(
      form([
        { key: 'email', type: 'text', label: 'Email' },
        { key: 'channel', type: 'radio', label: 'Channel', options: [...options, { value: 'other', label: 'Other' }] },
      ]),
    )
    const before = session.document()
    expect(addOtherOption(session, ['email']).ok).toBe(false)
    expect(addOtherOption(session, ['channel']).ok).toBe(false)
    expect(session.document()).toEqual(before)
  })

  test('is one step to undo', () => {
    const session = createBuilderSession(form([{ key: 'channel', type: 'radio', label: 'Channel', options }]))
    const before = session.document()
    addOtherOption(session, ['channel'])
    session.undo()
    expect(session.document()).toEqual(before)
  })
})
