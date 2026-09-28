import type { FieldDef, FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { createBuilderSession } from './session.js'

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
