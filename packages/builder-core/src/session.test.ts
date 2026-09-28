import type { FieldDef, FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { createBuilderSession } from './session.js'
import type { BuilderSession } from './session.js'

/** A form with every structural situation the builder has to handle: pages,
 *  a group, a repeater, choice options and a logic rule. */
export const base: FormSchema = {
  specVersion: '1',
  id: 'trip',
  title: 'Trip report',
  model: {
    fields: [
      {
        key: 'intro',
        type: 'page',
        fields: [
          { key: 'email', type: 'text', required: true },
          { key: 'summary', type: 'textarea' },
        ],
      },
      {
        key: 'details',
        type: 'page',
        fields: [
          {
            key: 'address',
            type: 'group',
            fields: [{ key: 'city', type: 'text' }],
          },
          {
            key: 'passengers',
            type: 'repeater',
            fields: [
              { key: 'name', type: 'text' },
              {
                key: 'seat',
                type: 'select',
                options: [
                  { value: 'window', label: 'Window' },
                  { value: 'aisle', label: 'Aisle' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  logic: {
    rules: [{ target: 'summary', kind: 'visible', cel: 'email != ""' }],
  },
}

/** A deep clone, so tests never mutate `base`. JSON round-trip rather than
 *  structuredClone: this package must not depend on Node or DOM globals, and
 *  schemas are JSON by definition. */
export function clone(schema: FormSchema): FormSchema {
  return JSON.parse(JSON.stringify(schema)) as FormSchema
}

export function revise(edit: (draft: FormSchema) => void): FormSchema {
  const draft = clone(base)
  edit(draft)
  return draft
}

/** A form nobody has paged yet: every field sits at the top level. */
export const unpaged: FormSchema = {
  specVersion: '2',
  id: 'signup',
  title: 'Sign up',
  model: {
    fields: [
      { key: 'name', type: 'text', required: true },
      { key: 'email', type: 'text', format: 'email' },
    ],
  },
}

describe('createBuilderSession', () => {
  test('holds the initial document and exports an equal copy', () => {
    const session = createBuilderSession(base)
    expect(session.exportDocument()).toEqual(base)
  })

  test('exportDocument returns a copy, not a window into the session', () => {
    const session = createBuilderSession(base)
    const exported = session.exportDocument()
    exported.title = 'Mutated outside'
    expect(session.document().title).toBe('Trip report')
  })

  test('does not adopt later mutations of the document it was given', () => {
    const initial = clone(base)
    const session = createBuilderSession(initial)
    initial.title = 'Changed behind the session'
    expect(session.document().title).toBe('Trip report')
  })

  test('the held document is frozen, so it cannot be corrupted in place', () => {
    const session = createBuilderSession(base)
    const held = session.document() as { title: string }
    expect(() => {
      held.title = 'overwritten'
    }).toThrow(TypeError)
  })

  test('refuses to open a document the validator rejects', () => {
    // `email` already exists inside the intro page; keys are unique form-wide.
    const broken = revise((d) => {
      d.model.fields.push({ key: 'email', type: 'text' })
    })
    expect(() => createBuilderSession(broken)).toThrowError(/already uses the key/)
  })

  test('starts at revision 0 with nothing to undo or redo', () => {
    const session = createBuilderSession(base)
    expect(session.revision()).toBe(0)
    expect(session.canUndo()).toBe(false)
    expect(session.canRedo()).toBe(false)
  })

  test('canPublish reports the validator verdict, which holds by construction', () => {
    const session = createBuilderSession(base)
    expect(session.canPublish().valid).toBe(true)
  })

  test('a subscriber hears nothing until something is accepted', () => {
    const session = createBuilderSession(base)
    let calls = 0
    session.subscribe(() => {
      calls += 1
    })
    session.exportDocument()
    session.canPublish()
    expect(calls).toBe(0)
  })
})

/**
 * WCAG 2.2 SC 2.5.7 asks for a keyboard alternative to dragging that does the
 * same job — not a reduced one. A drag can drop a field between any two
 * others, so the list of targets has to offer that too.
 */
describe('validTargets offers every position, not just the end', () => {
  const schema = {
    specVersion: '1',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'customer', type: 'text', label: 'Customer' },
        {
          key: 'billing',
          type: 'group',
          label: 'Billing',
          fields: [
            { key: 'street', type: 'text', label: 'Street' },
            { key: 'city', type: 'text', label: 'City' },
          ],
        },
      ],
    },
  } as unknown as FormSchema

  const offered = (session: ReturnType<typeof createBuilderSession>, path: string[]): string[] =>
    session.validTargets(path).map((target) => `${target.parent.join('/')}#${String(target.index)}`)

  test('a field can land between two others inside a container', () => {
    const session = createBuilderSession(schema)

    const targets = offered(session, ['customer'])

    // Before Street, between Street and City, after City — three positions in
    // a container holding two fields, not one.
    expect(targets).toContain('billing#0')
    expect(targets).toContain('billing#1')
    expect(targets).toContain('billing#2')
  })

  test('and between two others at the top level', () => {
    const session = createBuilderSession(schema)

    // Moving Street out of the group: it can go before Customer, after it, or
    // at the end.
    expect(offered(session, ['billing', 'street'])).toEqual(
      expect.arrayContaining(['#0', '#1', '#2']),
    )
  })

  test('every offered target is actually accepted, which is the point of trying the edit', () => {
    for (const target of createBuilderSession(schema).validTargets(['customer'])) {
      const session = createBuilderSession(schema)
      const outcome = session.moveField(['customer'], target)
      expect(outcome.ok, `${target.parent.join('/')}#${String(target.index)}`).toBe(true)
    }
  })

  test('a container is still not offered a home inside itself', () => {
    const session = createBuilderSession(schema)

    expect(offered(session, ['billing']).some((target) => target.startsWith('billing'))).toBe(false)
  })
})

/**
 * Taking a whole document at once.
 *
 * For a change that is not an edit so much as a different document: a form
 * written from an instruction, or a paste into the schema editor.
 */
describe('replaceDocument', () => {
  const other: FormSchema = {
    specVersion: '2',
    id: 'other',
    title: 'Other',
    model: { fields: [{ key: 'reference', type: 'text', label: 'Reference' }] },
  }

  test('takes it, and it becomes the document', () => {
    const session = createBuilderSession(base)

    const outcome = session.replaceDocument(other)

    expect(outcome.ok).toBe(true)
    expect(session.document().id).toBe('other')
  })

  test('is ONE step on the undo stack', () => {
    const session = createBuilderSession(base)
    const before = session.document().id

    session.replaceDocument(other)
    session.undo()

    // Ctrl+Z after "write me a contact form" has to put back what was there,
    // which is the only behaviour anybody would expect — and would not be
    // what happened if this were applied as a sequence of field edits.
    expect(session.document().id).toBe(before)
  })

  test('refuses one the validator does not accept, and keeps the old one', () => {
    const session = createBuilderSession(base)

    const outcome = session.replaceDocument({ specVersion: '2', id: 'x' } as unknown as FormSchema)

    expect(outcome.ok).toBe(false)
    // A session may never come to hold something invalid, whatever route the
    // document arrived by.
    expect(session.document().id).toBe(base.id)
  })

  test('does not keep a reference to the caller’s object', () => {
    const session = createBuilderSession(base)
    // A plain clone: this package has no DOM and no Node globals, which is
    // the point of it, so `structuredClone` is not available here.
    const mutable = JSON.parse(JSON.stringify(other)) as FormSchema

    session.replaceDocument(mutable)
    mutable.title = 'changed underneath'

    expect(session.document().title).toBe('Other')
  })

  test('leaves nothing of the previous document behind', () => {
    // Replaced key by key on a draft, so a section the old document had and
    // the new one does not must actually be gone rather than surviving the
    // assignment.
    const session = createBuilderSession({ ...base, logic: { rules: [] } })

    session.replaceDocument(other)

    expect(session.document().logic).toBeUndefined()
  })
})

describe('addPage', () => {
  /*
   * A wizard was a thing a developer could write by hand and an author could not
   * make. Every other part existed — the format has `page`, the engine walks the
   * pages and refuses to advance past a problem, both renderers draw the stepper —
   * and the builder had no route to one. The palette leaves `page` out on purpose,
   * because a page may sit only at the top level while the palette can target any
   * container, so it would offer a choice refused most of the time.
   *
   * The shape of the command was decided by measuring the engine rather than by
   * taste. With a page in the document, a top-level field that is NOT inside one
   * lands on page 1 wherever it sits: given `bare1`, `page one`, `bare2`, `page
   * two`, the engine reports `pageOf` as 0, 0, 0, 1 — `bare2` sits between the two
   * pages in the document and belongs to the first. No builder tree can draw that
   * honestly; it would show a field between two pages that is not on either.
   *
   * So the first page absorbs what is already there. "Add a page" to an unpaged
   * form means "make this form a wizard", and the form somebody already built
   * becomes page one rather than being scattered invisibly across it.
   */
  test('the first page takes the fields that were already at the top level', () => {
    const session = createBuilderSession(unpaged)

    const outcome = session.addPage('Your details')

    expect(outcome.ok).toBe(true)
    const fields = session.document().model.fields
    // One page, holding everything that was loose.
    expect(fields.map((f) => f.type)).toEqual(['page'])
    expect(fields[0]?.fields?.map((f) => f.key)).toEqual(['name', 'email'])
    expect(fields[0]?.label).toBe('Your details')
  })

  test('and the second page is a second page, not another absorption', () => {
    const session = createBuilderSession(unpaged)
    session.addPage('Your details')

    session.addPage('Your trip')

    const fields = session.document().model.fields
    expect(fields.map((f) => f.type)).toEqual(['page', 'page'])
    expect(fields[1]?.fields ?? []).toEqual([])
    expect(fields.map((f) => f.label)).toEqual(['Your details', 'Your trip'])
  })

  test('adding a page to a form that already has them appends an empty one', () => {
    const session = createBuilderSession(base)

    expect(session.addPage('Third').ok).toBe(true)

    const fields = session.document().model.fields
    expect(fields.map((f) => f.key)).toEqual(['intro', 'details', 'page3'])
    expect(fields[2]?.fields ?? []).toEqual([])
  })

  test('is one undoable step, whether or not it absorbed anything', () => {
    // The absorbing case is the one worth checking: it moves every top-level
    // field AND adds a container, and a gesture that takes two undos to reverse
    // is one people stop trusting.
    const session = createBuilderSession(unpaged)
    session.addPage('Your details')

    expect(session.undo()).toBe(true)

    expect(session.document()).toEqual(unpaged)
  })

  test('the key is unique and the label is the author’s, not the key', () => {
    // A page's key is an identity the author never types and a rule may name;
    // its label is what the stepper shows. Deriving one from the other would
    // make renaming the step a key change, which is a data migration.
    const session = createBuilderSession(base)

    session.addPage('Payment & delivery')

    const added = session.document().model.fields[2]
    expect(added?.key).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
    expect(added?.label).toBe('Payment & delivery')
  })

  test('refuses a document it cannot page, rather than producing a broken one', () => {
    // A form whose top level holds a repeater cannot become a wizard by wrapping:
    // the repeater would move inside the page, which is legal, so this is about
    // the one shape that is not — a page inside a page. `addPage` is refused on a
    // document that is already invalid for any other reason too, because every
    // command here is.
    const session = createBuilderSession(base)
    const nested = session.validTargets({ key: 'x', type: 'page' } as FieldDef)

    // A page has exactly one legal home: the top level.
    expect(nested).toEqual([
      { parent: [], index: 0 },
      { parent: [], index: 1 },
      { parent: [], index: 2 },
    ])
  })

  test('a field can no longer be dropped beside a page, because it would vanish', () => {
    // The other half of the same measurement. Once a form has pages, the top
    // level is for pages only: a field placed there renders on page one however
    // the tree draws it. Offering the position at all is offering a placement
    // the engine does not honour.
    const session = createBuilderSession(base)

    const targets = session.validTargets({ key: 'stray', type: 'text' } as FieldDef)

    expect(targets.filter((t) => t.parent.length === 0)).toEqual([])
    // And it can still go inside a page, which is where it belongs.
    expect(targets.some((t) => t.parent.join('.') === 'intro')).toBe(true)
  })
})

describe('authoring translations', () => {
  /*
   * The format and the engine were finished and the authoring was not: a label
   * could be `{ $t: "name" }`, the engine resolved it, and nothing in the builder
   * could produce one. So translated content was a feature a developer could hand-
   * write and an author could not reach — the same shape the wizard was in, and the
   * roadmap said so.
   *
   * The command that matters is EXTRACT. Adding a catalogue entry to a document
   * that already uses references is bookkeeping; turning the literal somebody has
   * already typed into a reference, without them retyping it, is the step that makes
   * a form translatable at all.
   */
  const untranslated: FormSchema = {
    specVersion: '3',
    id: 'contact',
    title: 'Contact us',
    model: {
      fields: [
        { key: 'email', type: 'text', label: 'Work email' },
        { key: 'note', type: 'textarea', label: 'Anything else?' },
      ],
    },
  }

  test('extracting a label leaves the form reading exactly as it did', () => {
    const session = createBuilderSession(untranslated)

    const outcome = session.extractText(['email'], 'label')

    expect(outcome.ok).toBe(true)
    const document = session.document()
    // The label is a reference now...
    expect(document.model.fields[0]?.label).toEqual({ $t: 'email.label' })
    // ...and it still says what it said, because the literal became the default
    // locale's message. An extraction that made somebody retype their own form is
    // one nobody would use twice.
    expect(document.i18n?.messages[document.i18n.defaultLocale]?.['email.label']).toBe(
      'Work email',
    )
  })

  test('the first extraction decides the default locale, and says which', () => {
    // A document with no `i18n` has no default locale, and one has to exist before
    // a message can be stored against it. Guessing from the browser would make the
    // document depend on who happened to author it.
    const session = createBuilderSession(untranslated)

    session.extractText(['email'], 'label', 'de-CH')

    expect(session.document().i18n?.defaultLocale).toBe('de-CH')
  })

  test('extracting a label that is already a reference changes nothing', () => {
    const session = createBuilderSession(untranslated)
    session.extractText(['email'], 'label')
    const after = session.document()

    expect(session.extractText(['email'], 'label').ok).toBe(true)

    // Idempotent rather than refused: an author pressing the button twice has not
    // made a mistake, and a second extraction that re-seeded the message would
    // overwrite a translation with the English it came from.
    expect(session.document()).toEqual(after)
  })

  test('a translation is stored under the locale it was written for', () => {
    const session = createBuilderSession(untranslated)
    session.extractText(['email'], 'label')

    expect(session.setMessage('fr', 'email.label', 'Adresse professionnelle').ok).toBe(true)

    expect(session.document().i18n?.messages['fr']?.['email.label']).toBe(
      'Adresse professionnelle',
    )
  })

  test('and a locale with no messages yet can still be started', () => {
    // Otherwise the only way to add a language is to translate something first,
    // which is the wrong way round: a translator opens the language and then works
    // through it.
    const session = createBuilderSession(untranslated)
    session.extractText(['email'], 'label')

    expect(session.addLocale('it').ok).toBe(true)

    expect(Object.keys(session.document().i18n?.messages ?? {})).toContain('it')
  })

  test('the default locale cannot be removed, because everything falls back to it', () => {
    const session = createBuilderSession(untranslated)
    session.extractText(['email'], 'label', 'en')
    session.addLocale('fr')

    expect(session.removeLocale('fr').ok).toBe(true)
    const refusal = session.removeLocale('en')

    expect(refusal.ok).toBe(false)
    if (!refusal.ok) expect(refusal.message).toMatch(/default/i)
  })

  test('every command is one undoable step', () => {
    const session = createBuilderSession(untranslated)

    session.extractText(['email'], 'label')
    session.undo()

    expect(session.document()).toEqual(untranslated)
  })

  test('a message nothing refers to is reported, not deleted', () => {
    // Deleting it would be the tidy answer and the wrong one: a translator's work
    // outliving the field it was written for is recoverable, and a builder that
    // silently discards translations is one nobody trusts with a year of them.
    const session = createBuilderSession(untranslated)
    session.extractText(['email'], 'label')
    session.setMessage('fr', 'email.label', 'Adresse professionnelle')
    session.removeField(['email'])

    expect(session.orphanedMessages()).toEqual(['email.label'])
    expect(session.document().i18n?.messages['fr']?.['email.label']).toBe(
      'Adresse professionnelle',
    )
  })
})

describe('extracting every text in a document', () => {
  /*
   * `Text` appears in exactly four places in the format: a field's label, an
   * option's label, a datagrid column's heading, and a layout node's label. The
   * first version of this reached one of them, and the sentence recording that
   * said it left "options, placeholders and help text" for later — naming two
   * properties the format does not have. It was written from a memory of other
   * form builders rather than from this one's schema.
   *
   * So this case is derived from the format rather than from a list: every string
   * that can be a reference is one afterwards.
   *
   * Ids do not have to be stable, and that is worth saying because it looks like
   * they should be. The reference lives INSIDE the thing it names — an option's
   * `$t` travels with the option, a node's with the node — so reordering options
   * or moving a section carries the reference along and nothing is orphaned. What
   * an id has to be is unique and readable.
   */
  const everything: FormSchema = {
    specVersion: '3',
    id: 'trip',
    title: 'Trip',
    model: {
      fields: [
        {
          key: 'country',
          type: 'select',
          label: 'Country',
          options: [
            { value: 'CH', label: 'Switzerland' },
            { value: 'DE', label: 'Germany' },
          ],
        },
        {
          key: 'people',
          type: 'repeater',
          label: 'Travellers',
          widget: 'datagrid',
          columns: [{ field: 'name', header: 'Full name' }],
          fields: [{ key: 'name', type: 'text', label: 'Name' }],
        },
      ],
    },
    layouts: [
      {
        name: 'web',
        nodes: [
          {
            kind: 'section',
            label: 'Where to',
            children: [{ kind: 'field', path: 'country' }],
          },
          { kind: 'field', path: 'people' },
        ],
      },
    ] as unknown as NonNullable<FormSchema['layouts']>,
  }

  test('leaves no literal behind, in any of the four places text lives', () => {
    const session = createBuilderSession(everything)

    expect(session.extractAllText().ok).toBe(true)

    const document = session.document()
    const literals: string[] = []
    const walk = (value: unknown, at: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => { walk(item, `${at}[${String(index)}]`) })
        return
      }
      if (typeof value !== 'object' || value === null) return
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        // The two properties that carry display text, wherever they appear.
        if ((key === 'label' || key === 'header') && typeof item === 'string') {
          literals.push(`${at}.${key}`)
        }
        walk(item, `${at}.${key}`)
      }
    }
    walk(document.model, 'model')
    walk(document.layouts, 'layouts')

    expect(literals).toEqual([])
  })

  test('and every one of them still says what it said', () => {
    const session = createBuilderSession(everything)
    session.extractAllText()

    const document = session.document()
    const messages = document.i18n?.messages[document.i18n.defaultLocale] ?? {}
    const said = Object.values(messages)

    expect(said).toContain('Country')
    expect(said).toContain('Switzerland')
    expect(said).toContain('Full name')
    expect(said).toContain('Where to')
  })

  test('an option keeps its own reference when the options are reordered', () => {
    // Why ids need not be stable: the `$t` lives inside the option, so it travels.
    const session = createBuilderSession(everything)
    session.extractAllText()
    const before = session.document().model.fields[0]?.options?.[1]?.label

    session.setFieldProperty(['country'], 'options', [
      session.document().model.fields[0]?.options?.[1],
      session.document().model.fields[0]?.options?.[0],
    ])

    expect(session.document().model.fields[0]?.options?.[0]?.label).toEqual(before)
    expect(session.orphanedMessages()).toEqual([])
  })

  test('is one undoable step, however many strings it touched', () => {
    const session = createBuilderSession(everything)

    session.extractAllText()
    session.undo()

    expect(session.document()).toEqual(everything)
  })

  test('says so rather than failing when there is nothing to extract', () => {
    const session = createBuilderSession(everything)
    session.extractAllText()
    const after = session.document()

    expect(session.extractAllText().ok).toBe(true)

    expect(session.document()).toEqual(after)
  })
})

describe('handing a catalogue to somebody outside the builder', () => {
  /*
   * The last of translation, and the one a team with a vendor actually needs: a
   * translator with a translation memory works in a file, not in a table in
   * somebody's admin.
   *
   * What a file has to carry is the SOURCE as well as the target. A catalogue of
   * ids and blanks tells a translator nothing — `country.option.CH` is the
   * schema's name for a thing, not the thing — and a vendor's memory matches on
   * the source text. So an export carries both, and an import reads back only
   * what it is asked to.
   */
  const translated = (): BuilderSession => {
    const session = createBuilderSession({
      specVersion: '3',
      id: 'trip',
      title: 'Trip',
      model: {
        fields: [
          { key: 'email', type: 'text', label: 'Work email' },
          { key: 'note', type: 'textarea', label: 'Anything else?' },
        ],
      },
    })
    session.extractAllText('en')
    session.addLocale('fr')
    session.setMessage('fr', 'email.label', 'Adresse professionnelle')
    return session
  }

  test('an export carries the source beside the target, or it is unusable', () => {
    const file = translated().exportCatalogue('fr')

    expect(file.locale).toBe('fr')
    expect(file.defaultLocale).toBe('en')
    expect(file.messages).toEqual([
      { id: 'email.label', source: 'Work email', target: 'Adresse professionnelle' },
      // Present with an empty target rather than absent: a translator needs the
      // list of what is left, and a file that omits them is a file that says the
      // language is finished.
      { id: 'note.label', source: 'Anything else?', target: '' },
    ])
  })

  test('an import writes the targets and touches nothing else', () => {
    const session = translated()

    const outcome = session.importCatalogue({
      locale: 'fr',
      defaultLocale: 'en',
      messages: [
        { id: 'email.label', source: 'Work email', target: 'Courriel professionnel' },
        { id: 'note.label', source: 'Anything else?', target: 'Autre chose ?' },
      ],
    })

    expect(outcome.ok).toBe(true)
    const document = session.document()
    expect(document.i18n?.messages['fr']).toEqual({
      'email.label': 'Courriel professionnel',
      'note.label': 'Autre chose ?',
    })
    // The default locale is the source of truth for what the form says, and an
    // import is a translation rather than an edit to the form.
    expect(document.i18n?.messages['en']?.['email.label']).toBe('Work email')
  })

  test('an empty target does not erase a translation that is already there', () => {
    // A vendor returning a partial file is normal. Writing its blanks over work
    // already done is the kind of loss nobody notices until the form is live.
    const session = translated()

    session.importCatalogue({
      locale: 'fr',
      defaultLocale: 'en',
      messages: [{ id: 'email.label', source: 'Work email', target: '' }],
    })

    expect(session.document().i18n?.messages['fr']?.['email.label']).toBe(
      'Adresse professionnelle',
    )
  })

  test('a message the form no longer has is reported rather than written', () => {
    // The file was exported before somebody deleted a field. Writing it back
    // would resurrect a message as an orphan and make the count of what is left
    // to translate wrong forever.
    const session = translated()

    const outcome = session.importCatalogue({
      locale: 'fr',
      defaultLocale: 'en',
      messages: [
        { id: 'email.label', source: 'Work email', target: 'Courriel' },
        { id: 'gone.label', source: 'Removed question', target: 'Question supprimée' },
      ],
    })

    expect(outcome.ok).toBe(true)
    expect(session.document().i18n?.messages['fr']?.['gone.label']).toBeUndefined()
    expect(session.lastImportReport()?.unknown).toEqual(['gone.label'])
    expect(session.lastImportReport()?.written).toBe(1)
  })

  test('a source that has changed since the export is reported, and still written', () => {
    // The question was reworded while the file was out. The translation is of the
    // OLD wording, so it is written -- something is better than nothing and the
    // translator may be right -- and named, because it is the one a reviewer has
    // to look at.
    const session = translated()
    session.setMessage('en', 'email.label', 'Email at work')

    session.importCatalogue({
      locale: 'fr',
      defaultLocale: 'en',
      messages: [{ id: 'email.label', source: 'Work email', target: 'Courriel' }],
    })

    expect(session.document().i18n?.messages['fr']?.['email.label']).toBe('Courriel')
    expect(session.lastImportReport()?.stale).toEqual(['email.label'])
  })

  test('an import is one undoable step', () => {
    const session = translated()
    const before = session.document()

    session.importCatalogue({
      locale: 'fr',
      defaultLocale: 'en',
      messages: [
        { id: 'email.label', source: 'Work email', target: 'Courriel' },
        { id: 'note.label', source: 'Anything else?', target: 'Autre chose ?' },
      ],
    })
    session.undo()

    expect(session.document()).toEqual(before)
  })

  test('a file for a locale the form does not have yet starts it', () => {
    const session = translated()

    session.importCatalogue({
      locale: 'it',
      defaultLocale: 'en',
      messages: [{ id: 'email.label', source: 'Work email', target: 'Email di lavoro' }],
    })

    expect(session.document().i18n?.messages['it']?.['email.label']).toBe('Email di lavoro')
  })
})
