import { CURRENT_SPEC_VERSION } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { BUILDER_MESSAGES_DE, createBuilderText } from './messages.js'
import { newFieldOfType } from './palette.js'
import { createBuilderSession } from './session.js'
import { base, clone, unpaged } from './session.test.js'
import {
  addPageAndSay,
  dropAndSay,
  insertAndSay,
  moveAndSay,
  redoAndSay,
  removeAndSay,
  treeKeyHelp,
  undoAndSay,
  unwrapAndSay,
  upgradeAndSay,
} from './spoken.js'
import { builderView } from './view.js'

/**
 * What a builder says after a command, decided once.
 *
 * Both builders worked these sentences out by hand, identically — and identically
 * wrong in one place, which is what a copy does: a dragged field was announced by
 * the name of the row it was dropped on. Each case here is a sentence somebody
 * using a screen reader depends on to know what just happened to a form they
 * cannot see all of.
 */
const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
const english = createBuilderText()

describe('undo and redo', () => {
  test('say whether there was anything to undo, rather than saying "Undone" either way', () => {
    const session = createBuilderSession(base)

    expect(undoAndSay(session)).toBe(english('said.nothingToUndo'))
    session.addPage()
    expect(undoAndSay(session)).toBe(english('said.undone'))
    expect(redoAndSay(session)).toBe(english('said.redone'))
    expect(redoAndSay(session)).toBe(english('said.nothingToRedo'))
  })
})

describe('adding a page', () => {
  test('to a form with none says how many fields the first page took, because it moved all of them', () => {
    const session = createBuilderSession(unpaged)

    const said = addPageAndSay(session)

    expect(said).toBe(english('said.firstPageAdded', { page: 'Page 1', count: 2 }))
    expect(session.document().model.fields.map((field) => field.type)).toEqual(['page'])
  })

  test('says one field in the singular, which the hand-written sentence did not', () => {
    // "holding the 1 fields that were at the top level" — the count was
    // pluralised by hand and the verb was not.
    const one: FormSchema = {
      ...clone(unpaged),
      model: { fields: [clone(unpaged).model.fields[0]!] },
    }
    const session = createBuilderSession(one)

    expect(addPageAndSay(session)).toBe(
      'Added Page 1, holding the 1 field that was at the top level. The form is a wizard now.',
    )
  })

  test('to a form that has pages names the new one by its number', () => {
    const session = createBuilderSession(base)

    expect(addPageAndSay(session)).toBe(english('said.pageAdded', { page: 'Page 3' }))
  })

  test('writes the page name into the document in the author’s language', () => {
    // The name is stored, not only spoken: a German author should not find
    // "Page 3" in the middle of a German form.
    const session = createBuilderSession(base, { text: german })

    addPageAndSay(session)

    expect(session.document().model.fields[2]?.label).toBe(german('palette.newPage', { number: 3 }))
  })
})

describe('unwrapping', () => {
  test('a page says which page its questions are on now, because they do not stay at the top', () => {
    const session = createBuilderSession(base)

    expect(unwrapAndSay(session, ['details'])).toBe(
      english('said.unwrappedPage', { name: 'details', count: 2, host: 'intro' }),
    )
  })

  test('the last page says the form is not a wizard any more, the least visible thing it does', () => {
    const session = createBuilderSession(base)
    unwrapAndSay(session, ['details'])

    const said = unwrapAndSay(session, ['intro'])

    expect(said).toBe(
      english('said.notAWizard', {
        said: english('said.unwrapped', { name: 'intro', count: 4 }),
      }),
    )
  })

  test('an empty page among others does not claim the form stopped being a wizard', () => {
    // The regression this sentence once had: an empty page has no first
    // question to find a host for, and "no host" was read as "no pages".
    const withEmpty = clone(base)
    withEmpty.model.fields.push({ key: 'spare', type: 'page', fields: [] })
    const session = createBuilderSession(withEmpty)

    expect(unwrapAndSay(session, ['spare'])).toBe(english('said.unwrappedEmpty', { name: 'spare' }))
  })

  test('a group inside a page says it kept what was inside, and does not call itself a page', () => {
    // Both builders looked for the page now holding the questions whatever was
    // unwrapped, found the one the group sat on, and said "Removed the page
    // address" for a group.
    const session = createBuilderSession(base)

    expect(unwrapAndSay(session, ['details', 'address'])).toBe(
      english('said.unwrapped', { name: 'address', count: 1 }),
    )
  })

  test('a refusal carries the session’s reason, in its language', () => {
    const session = createBuilderSession(base, { text: german })

    expect(unwrapAndSay(session, ['details', 'passengers'])).toBe(
      german('said.cannotUnwrap', {
        name: 'passengers',
        reason: german('refuse.unwrapRepeater', { where: 'details.passengers' }),
      }),
    )
  })
})

describe('removing', () => {
  test('names what was removed, read before it is gone', () => {
    const session = createBuilderSession(base)

    expect(removeAndSay(session, ['details', 'passengers', 'seat'])).toBe(
      english('said.removed', { name: 'seat' }),
    )
  })
})

describe('moving', () => {
  test('by the list names the field and where it went', () => {
    const session = createBuilderSession(base)
    const target = builderView(session).moveTargetsFor(['intro', 'email'])[0]!

    expect(moveAndSay(session, ['intro', 'email'], target)).toBe(
      english('said.moved', { name: 'email', where: target.label }),
    )
  })

  test('by dragging names the field that MOVED, not the row it was dropped on', () => {
    // Both builders announced the drop handler's own argument — the row under
    // the pointer — so dragging email onto summary said "Moved summary."
    const session = createBuilderSession(base)

    const said = dropAndSay(session, ['intro', 'email'], { parent: ['intro'], index: 1 })

    expect(said).toBe(english('said.dropped', { name: 'email' }))
    expect(session.document().model.fields[0]?.fields?.map((field) => field.key)).toEqual([
      'summary',
      'email',
    ])
  })
})

describe('inserting', () => {
  test('says what was added, by the palette’s own name for it, and where', () => {
    const session = createBuilderSession(base)
    const def = newFieldOfType('text', new Set(['email', 'summary']))
    const target = builderView(session).insertTargetsFor(def)[0]!

    expect(insertAndSay(session, def, target)).toMatch(/^Added .+ to .+\.$/)
    expect(session.document().model.fields[0]?.fields?.some((field) => field.key === def.key)).toBe(
      true,
    )
  })
})

describe('upgrading the spec version', () => {
  test('moves one step and says nothing else changed', () => {
    const session = createBuilderSession(base)

    expect(upgradeAndSay(session)).toBe(english('said.upgraded', { version: '2' }))
    expect(session.document().specVersion).toBe('2')
  })

  test('at the newest version says so, rather than claiming to have done it', () => {
    const newest = { ...clone(base), specVersion: CURRENT_SPEC_VERSION }
    const session = createBuilderSession(newest)

    expect(upgradeAndSay(session)).toBe(
      english('said.cannotUpgrade', { reason: english('said.alreadyNewest') }),
    )
  })
})

describe('the keyboard legend', () => {
  test('keeps the letters and names the other keys the way the keyboard does', () => {
    const session = createBuilderSession(base, { text: german })
    const legend = new Map(treeKeyHelp(session))

    expect(legend.has('m')).toBe(true)
    expect(legend.get(german('keys.delete.key'))).toBe(german('keys.delete.what'))
    expect(german('keys.delete.key')).not.toBe(english('keys.delete.key'))
  })
})
