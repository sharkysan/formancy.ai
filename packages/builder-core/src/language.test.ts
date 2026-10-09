import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { flattenLayout, describeLayoutTarget } from './layout-tree.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { createBuilderText } from './messages.js'
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

  test('puts what a container holds in the case its sentence needs', () => {
    // After "mit" German takes the dative. The first German catalogue used one
    // form for a node in a list and a node on its own, and shipped "Abschnitt mit
    // eine Zeile"; the list forms and the new-node forms are separate for that.
    const nested = arranged()
    nested.layouts = [{ name: 'web', nodes: [{ kind: 'section', children: [{ kind: 'row', children: [] }] }] }]

    expect(flattenLayout(nested, 'web', german)[0]?.name).toBe('Abschnitt mit einer Zeile')
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

describe('the refusals the first catalogue missed', () => {
  /*
   * Four refusals were still written in English in `session.ts`, and a rename a
   * rule could not follow set an English clause into a German sentence. Each is
   * reached here through the command, in German.
   */
  const translated = (): FormSchema => ({
    specVersion: '2',
    id: 'contact',
    title: 'Kontakt',
    model: {
      fields: [
        { key: 'postcode', type: 'text', label: 'PLZ' },
        { key: 'note', type: 'text', label: { $t: 'note.label' } },
      ],
    },
    logic: { rules: [{ kind: 'visible', target: 'note', cel: 'postcode ==' }] },
    i18n: { defaultLocale: 'de', messages: { de: { 'note.label': 'Notiz' } } },
    layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'postcode' }] }],
  })

  test('a rename a rule cannot follow is refused in one language, not two', () => {
    const session = createBuilderSession(translated(), { text: german })

    const message = refusal(session.renameField(['postcode'], 'zip'))

    expect(message).toContain(
      german('refuse.ruleCannotFollow', {
        number: 1,
        kind: german('rule.visible.label'),
        target: 'note',
        reason: '',
      }).split(':')[0]!,
    )
    expect(message).not.toMatch(/cannot follow/)
  })

  test('removing the default language is refused in German', () => {
    const session = createBuilderSession(translated(), { text: german })

    expect(refusal(session.removeLocale('de'))).toBe(german('refuse.defaultLocale', { locale: 'de' }))
  })

  test('a layout setting that is not a setting is refused in German', () => {
    const session = createBuilderSession(translated(), { text: german })

    expect(refusal(session.setLayoutNodeProperty({ layout: 'web', path: [0] }, 'kind', 'row'))).toBe(
      german('refuse.notASetting', { property: 'kind' }),
    )
  })

  test('a file that is not a catalogue is refused in words rather than thrown', () => {
    // It threw "file.messages is not iterable", and both builders showed that
    // to a translator as the reason their upload did nothing.
    const session = createBuilderSession(translated(), { text: german })

    expect(refusal(session.importCatalogue({ hello: 1 } as never))).toBe(german('refuse.notACatalogue'))
  })
})
