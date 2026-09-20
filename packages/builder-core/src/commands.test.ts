import { diffSchemas } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { createBuilderSession } from './session.js'
import { base } from './session.test.js'

function session() {
  return createBuilderSession(base)
}

describe('insertField', () => {
  test('adds a field to a container and accepts', () => {
    const s = session()
    const outcome = s.insertField({ parent: ['intro'], index: 1 }, { key: 'phone', type: 'text' })

    expect(outcome.ok).toBe(true)
    expect(s.document().model.fields[0]!.fields!.map((f) => f.key)).toEqual([
      'email',
      'phone',
      'summary',
    ])
    expect(s.revision()).toBe(1)
  })

  test('inserts at the root when no parent is given', () => {
    const s = session()
    s.insertField({ parent: [], index: 0 }, { key: 'reference', type: 'text' })

    expect(s.document().model.fields[0]!.key).toBe('reference')
  })

  test('refuses a duplicate key with the validator message, leaving the document alone', () => {
    const s = session()
    const before = s.document()

    const outcome = s.insertField({ parent: [], index: 0 }, { key: 'email', type: 'text' })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).toMatch(/already uses the key/)
    expect(s.document()).toBe(before)
    expect(s.revision()).toBe(0)
  })

  test('refuses a repeater inside a repeater, which spec v0 does not support', () => {
    const s = session()
    const outcome = s.insertField(
      { parent: ['details', 'passengers'], index: 0 },
      { key: 'bags', type: 'repeater', fields: [{ key: 'weight', type: 'number' }] },
    )

    expect(outcome.ok).toBe(false)
  })

  test('refuses an unknown parent rather than silently inserting at the root', () => {
    const s = session()
    const outcome = s.insertField({ parent: ['ghost'], index: 0 }, { key: 'x', type: 'text' })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/ghost/)
  })
})

describe('removeField', () => {
  test('removes a leaf that nothing depends on', () => {
    const s = session()
    const outcome = s.removeField(['details', 'address', 'city'])

    expect(outcome.ok).toBe(true)
    expect(s.document().model.fields[1]!.fields![0]!.fields).toEqual([])
  })

  test('removing a container takes its subtree with it', () => {
    const s = session()
    s.removeField(['details', 'address'])

    const details = s.document().model.fields[1]!
    expect(details.fields!.map((f) => f.key)).toEqual(['passengers'])
  })

  test('refuses while a logic rule still targets the field — the rule would dangle', () => {
    const s = session()
    // A visible rule targets `summary`, so removing it would leave that rule
    // pointing at nothing. The validator is the law; the builder refuses and
    // says why, rather than silently deleting logic the author wrote.
    const outcome = s.removeField(['intro', 'summary'])

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/summary/)

    // Removing the rule first makes the same command succeed.
    expect(s.removeRule(0).ok).toBe(true)
    expect(s.removeField(['intro', 'summary']).ok).toBe(true)
  })

  test('refuses an unknown path', () => {
    const s = session()
    expect(s.removeField(['ghost']).ok).toBe(false)
  })
})

describe('moveField', () => {
  test('moves a field into another container', () => {
    const s = session()
    const outcome = s.moveField(['intro', 'email'], { parent: ['details'], index: 0 })

    expect(outcome.ok).toBe(true)
    expect(s.document().model.fields[0]!.fields!.map((f) => f.key)).toEqual(['summary'])
    expect(s.document().model.fields[1]!.fields!.map((f) => f.key)).toEqual([
      'email',
      'address',
      'passengers',
    ])
  })

  test('moving between pages is not a data migration — diffSchemas sees no change', () => {
    const s = session()
    const outcome = s.moveField(['intro', 'email'], { parent: ['details'], index: 0 })

    expect(outcome.ok).toBe(true)
    expect(diffSchemas(base, s.document())).toEqual([])
  })

  test('moving into a group DOES change the data path, and the diff says so', () => {
    const s = session()
    // `email` carries no rule, so the move is about data shape alone.
    const outcome = s.moveField(['intro', 'email'], { parent: ['details', 'address'], index: 0 })
    expect(outcome.ok).toBe(true)

    const kinds = diffSchemas(base, s.document()).map((change) => change.kind)
    expect(kinds).toContain('field.removed')
    expect(kinds).toContain('field.added')
  })

  test('refuses to move a container into its own descendant', () => {
    const s = session()
    const outcome = s.moveField(['details', 'address'], {
      parent: ['details', 'address'],
      index: 0,
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/inside itself/i)
  })
})

describe('renameField', () => {
  test('declares renamedFrom, so the answers already collected follow the field', () => {
    const s = session()
    const outcome = s.renameField(['intro', 'email'], 'workEmail')

    expect(outcome.ok).toBe(true)
    const renamed = s.document().model.fields[0]!.fields![0]!
    expect(renamed.key).toBe('workEmail')
    expect(renamed.renamedFrom).toBe('email')
  })

  test('the declared rename reads as compatible, not as remove-plus-add', () => {
    const s = session()
    s.renameField(['intro', 'email'], 'workEmail')

    const changes = diffSchemas(base, s.document())
    expect(changes.every((change) => change.severity === 'compatible')).toBe(true)
    expect(changes.some((change) => change.kind === 'field.renamed')).toBe(true)
  })

  test('a second rename still points at the BASELINE key, never at the interim one', () => {
    const s = session()
    s.renameField(['intro', 'email'], 'workEmail')
    s.renameField(['intro', 'workEmail'], 'businessEmail')

    const renamed = s.document().model.fields[0]!.fields![0]!
    expect(renamed.key).toBe('businessEmail')
    // Chaining to "workEmail" would point at a key no submission ever used.
    expect(renamed.renamedFrom).toBe('email')
  })

  test('renaming back to the baseline clears renamedFrom entirely', () => {
    const s = session()
    s.renameField(['intro', 'email'], 'workEmail')
    s.renameField(['intro', 'workEmail'], 'email')

    const restored = s.document().model.fields[0]!.fields![0]!
    expect(restored.key).toBe('email')
    expect('renamedFrom' in restored).toBe(false)
    expect(diffSchemas(base, s.document())).toEqual([])
  })

  test('refuses a rename that collides with a live key', () => {
    const s = session()
    const outcome = s.renameField(['intro', 'summary'], 'email')

    expect(outcome.ok).toBe(false)
  })
})

describe('setFieldProperty', () => {
  test('sets a presentation property', () => {
    const s = session()
    const outcome = s.setFieldProperty(['intro', 'email'], 'label', 'Work email')

    expect(outcome.ok).toBe(true)
    expect(s.document().model.fields[0]!.fields![0]!.label).toBe('Work email')
  })

  test('removes the property when given undefined', () => {
    const s = session()
    s.setFieldProperty(['intro', 'email'], 'required', undefined)

    expect('required' in s.document().model.fields[0]!.fields![0]!).toBe(false)
  })

  test('refuses a property the validator will not allow on that type', () => {
    const s = session()
    const outcome = s.setFieldProperty(['intro', 'email'], 'options', [
      { value: 'a', label: 'A' },
    ])

    expect(outcome.ok).toBe(false)
  })

  test('refuses a pattern that does not compile, before any author can publish it', () => {
    const s = session()
    const outcome = s.setFieldProperty(['intro', 'email'], 'pattern', '([')

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.path).toMatch(/pattern/)
  })
})

describe('rules', () => {
  test('adds a rule', () => {
    const s = session()
    const outcome = s.addRule({ target: 'email', kind: 'required', cel: 'true' })

    expect(outcome.ok).toBe(true)
    expect(s.document().logic!.rules).toHaveLength(2)
  })

  test('refuses a rule aimed at a field that does not exist', () => {
    const s = session()
    const outcome = s.addRule({ target: 'ghost', kind: 'visible', cel: 'true' })

    expect(outcome.ok).toBe(false)
  })

  test('refuses a second rule of the same kind on one target', () => {
    const s = session()
    const outcome = s.addRule({ target: 'summary', kind: 'visible', cel: 'false' })

    expect(outcome.ok).toBe(false)
  })

  test('updates and removes by index', () => {
    const s = session()
    expect(s.updateRule(0, { target: 'summary', kind: 'visible', cel: 'email != "x"' }).ok).toBe(true)
    expect(s.document().logic!.rules[0]!.cel).toBe('email != "x"')

    expect(s.removeRule(0).ok).toBe(true)
    expect(s.document().logic!.rules).toHaveLength(0)
  })

  test('refuses an out-of-range index rather than appending by accident', () => {
    const s = session()
    expect(s.removeRule(9).ok).toBe(false)
    expect(s.updateRule(9, { target: 'email', kind: 'visible', cel: 'true' }).ok).toBe(false)
  })
})

describe('undo and redo', () => {
  test('undo restores the previous document exactly; redo replays it', () => {
    const s = session()
    const original = s.exportDocument()

    s.insertField({ parent: [], index: 0 }, { key: 'reference', type: 'text' })
    expect(s.canUndo()).toBe(true)

    expect(s.undo()).toBe(true)
    expect(s.document()).toEqual(original)
    expect(s.canRedo()).toBe(true)

    expect(s.redo()).toBe(true)
    expect(s.document().model.fields[0]!.key).toBe('reference')
  })

  test('a refused command is not undoable — nothing happened', () => {
    const s = session()
    s.insertField({ parent: [], index: 0 }, { key: 'email', type: 'text' })

    expect(s.canUndo()).toBe(false)
  })

  test('a new command after undo clears the redo branch', () => {
    const s = session()
    s.insertField({ parent: [], index: 0 }, { key: 'a', type: 'text' })
    s.undo()
    s.insertField({ parent: [], index: 0 }, { key: 'b', type: 'text' })

    expect(s.canRedo()).toBe(false)
    expect(s.document().model.fields[0]!.key).toBe('b')
  })

  test('subscribers hear accepted commands, undo and redo — and nothing else', () => {
    const s = session()
    let calls = 0
    s.subscribe(() => {
      calls += 1
    })

    s.insertField({ parent: [], index: 0 }, { key: 'a', type: 'text' })
    s.insertField({ parent: [], index: 0 }, { key: 'email', type: 'text' }) // refused
    s.undo()
    s.redo()

    expect(calls).toBe(3)
  })
})

describe('validTargets', () => {
  test('a page may only land at the top level', () => {
    const s = session()
    const targets = s.validTargets({ key: 'newPage', type: 'page', fields: [] })

    expect(targets.some((target) => target.parent.length === 0)).toBe(true)
    expect(targets.every((target) => target.parent.length === 0)).toBe(true)
  })

  test('a repeater may not land inside a repeater', () => {
    const s = session()
    const targets = s.validTargets({ key: 'bags', type: 'repeater', fields: [] })

    expect(targets.some((t) => t.parent.join('.') === 'details.passengers')).toBe(false)
    expect(targets.some((t) => t.parent.join('.') === 'details')).toBe(true)
  })

  test('a leaf may land in any container', () => {
    const s = session()
    const targets = s.validTargets({ key: 'note', type: 'text' })
    const parents = targets.map((t) => t.parent.join('.'))

    expect(parents).toContain('')
    expect(parents).toContain('intro')
    expect(parents).toContain('details.address')
    expect(parents).toContain('details.passengers')
  })

  test('moving an existing container excludes its own descendants', () => {
    const s = session()
    const targets = s.validTargets(['details', 'address'])
    const parents = targets.map((t) => t.parent.join('.'))

    expect(parents).not.toContain('details.address')
    expect(parents).toContain('intro')
  })
})
