import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { flattenLayout, describeLayoutTarget } from './layout-tree.js'
import { BUILDER_MESSAGES_DE, createBuilderText } from './messages.js'
import { newFieldOfType } from './palette.js'
import { applyProposal, proposeEdit } from './proposal.js'
import { createBuilderSession } from './session.js'
import { base, clone } from './session.test.js'
import { describeTarget } from './tree.js'
import { builderView } from './view.js'

/**
 * A session speaks the language it was opened in, everywhere it speaks.
 *
 * The catalogue being complete proves nothing about the builder: a sentence
 * still assembled in English somewhere between the catalogue and the screen
 * leaves a German builder saying "between Vorname and Nachname", and the
 * catalogue's own tests stay green. So each case here goes through the path a
 * builder takes — a command, a view, a proposal — and compares what comes out
 * with the German catalogue, and with English, so an expectation that happens
 * to read the same in both cannot pass for the wrong reason
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
const english = createBuilderText()

/** The message a refused command carries, or a failure that says it was not refused. */
function refusal(outcome: { ok: boolean; message?: string }): string {
  if (outcome.ok) throw new Error('expected the command to be refused')
  return outcome.message ?? ''
}

const arranged = (): FormSchema => ({
  specVersion: '2',
  id: 'arranged',
  title: 'Anmeldung',
  model: {
    fields: [
      { key: 'first', type: 'text', label: 'Vorname' },
      { key: 'last', type: 'text', label: 'Nachname' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'first' },
            { kind: 'field', path: 'last' },
          ],
        },
        { kind: 'row', children: [] },
      ],
    },
  ],
})

describe('a session opened in German', () => {
  test('refuses in German', () => {
    // A refusal is the one sentence a person most needs to understand, and the
    // session words every one of them — the builders only display it.
    const session = createBuilderSession(base, { text: german })

    const message = refusal(
      session.moveField(['details', 'address'], { parent: ['details', 'address'], index: 0 }),
    )

    expect(message).toBe(german('refuse.moveIntoItself', { path: 'details.address' }))
    expect(message).not.toBe(english('refuse.moveIntoItself', { path: 'details.address' }))
  })

  test('refuses to unwrap a repeater in German, which is the longest refusal it has', () => {
    const session = createBuilderSession(base, { text: german })

    const message = refusal(session.unwrapField(['details', 'passengers']))

    expect(message).toBe(german('refuse.unwrapRepeater', { where: 'details.passengers' }))
  })

  test('describes where a field would land in German, in the view both builders read', () => {
    // The move palette's choices are sentences built from three parts: the
    // container, and the neighbours either side. The view built them in English
    // even once each part could be German.
    const session = createBuilderSession(base, { text: german })
    const view = builderView(session)

    const targets = view.moveTargetsFor(['intro', 'email'])
    const target = targets[0]!

    expect(target.label).toBe(
      describeTarget(session.document(), target.location, ['intro', 'email'], german),
    )
    expect(target.label).not.toBe(
      describeTarget(session.document(), target.location, ['intro', 'email'], english),
    )
  })

  test('gives a new field German starting words, because they are written into the form', () => {
    // Not interface text: these land in the document, and somebody building a
    // German form would otherwise retype "New field" in every group they add.
    const group = newFieldOfType('group', new Set(), german)
    const choice = newFieldOfType('select', new Set(), german)

    expect(group.fields?.[0]?.label).toBe(german('palette.newField'))
    expect(choice.options?.[0]?.label).toBe(german('palette.firstOption'))
    expect(german('palette.newField')).not.toBe(english('palette.newField'))
  })

  test('names a layout node in German, with the list joined by the language', () => {
    // "Zeile mit Vorname and Nachname" is what an English join inside a German
    // sentence reads like. The join is the language's, not the code's.
    const rows = flattenLayout(arranged(), 'web', german)

    expect(rows[0]?.name).toBe(german('layout.with.row', { list: 'Vorname und Nachname' }))
    expect(rows[3]?.name).toBe(german('layout.empty.row'))
  })

  test('describes where a layout node would land in German', () => {
    const label = describeLayoutTarget(
      arranged(),
      { layout: 'web', parent: [1], index: 0 },
      undefined,
      german,
    )

    expect(label).toBe(german('target.firstItem', { where: german('layout.empty.row') }))
  })

  test('refuses a stale proposal in German', () => {
    // The proposal is checked by a function outside the session, so it reads
    // the session's language rather than choosing one of its own.
    const session = createBuilderSession(base, { text: german })
    const proposal = proposeEdit(session.document(), clone(base))
    session.addPage()

    expect(refusal(applyProposal(session, proposal))).toBe(german('proposal.stale'))
  })
})

describe('a session opened with no language', () => {
  test('speaks English, so nothing that never asked for a language changes', () => {
    const session = createBuilderSession(base)

    expect(refusal(session.unwrapField(['details', 'passengers']))).toBe(
      english('refuse.unwrapRepeater', { where: 'details.passengers' }),
    )
    expect(session.text).toBeDefined()
    expect(session.text.locale).toBe('en-GB')
  })
})
