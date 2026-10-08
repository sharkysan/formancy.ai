import { describe, expect, test } from 'vitest'
import { layoutPropertyHeading, nextChoice } from './editors.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { createBuilderText } from './messages.js'

const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
const english = createBuilderText()

describe('the choice "Add a choice" adds', () => {
  test('takes a value nothing else uses, because two choices sharing one store one answer', () => {
    // option-2 is taken by a choice somebody renamed, so counting alone would
    // collide with it.
    const next = nextChoice(
      [
        { value: 'option-2', label: 'Renamed' },
        { value: 'ch', label: 'Switzerland' },
      ],
      english,
    )

    expect(next.value).toBe('option-3')
  })

  test('carries a label in the author’s language, because it is written into the form', () => {
    // And a label at all: the schema requires one, so a choice without would be
    // refused and the button would look broken.
    expect(nextChoice([], german)).toEqual({
      value: 'option-1',
      label: german('options.newChoice'),
    })
  })
})

describe('what the layout property panel calls a node', () => {
  test('names the kind, not the node’s own label, which is what the panel edits', () => {
    expect(layoutPropertyHeading('table', english)).toBe('This grid')
    expect(layoutPropertyHeading('field', german)).toBe(german('layoutProps.heading.field'))
    expect(german('layoutProps.heading.field')).not.toBe(english('layoutProps.heading.field'))
  })
})
