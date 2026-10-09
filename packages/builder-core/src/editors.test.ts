import { describe, expect, test } from 'vitest'
import { layoutPropertyHeading, nextChoice, withPicture } from './editors.js'
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

describe('a choice’s picture, as both options editors change it', () => {
  const cat = { value: 'cat', label: 'Cat' }

  test('an address gives it a picture, and a description describes it', () => {
    const pictured = withPicture(withPicture(cat, { src: '/cat.png' }), { alt: 'A tabby' })

    expect(pictured).toEqual({ ...cat, image: { src: '/cat.png', alt: 'A tabby' } })
  })

  test('an emptied address takes the picture away, rather than leaving one with nowhere to load from', () => {
    // An image with an empty address is refused by the validator, so the edit would
    // be refused and the box would snap back mid-clear.
    expect(
      withPicture({ ...cat, image: { src: '/cat.png', alt: 'A tabby' } }, { src: '' }),
    ).toEqual(cat)
  })

  test('and an emptied description leaves the picture as decoration', () => {
    expect(
      withPicture({ ...cat, image: { src: '/cat.png', alt: 'A tabby' } }, { alt: '' }),
    ).toEqual({
      ...cat,
      image: { src: '/cat.png' },
    })
  })
})
