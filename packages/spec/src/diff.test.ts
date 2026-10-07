import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { diffSchemas } from './diff.js'
import type { FormSchema } from './types.js'

const base: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'textarea' },
    ],
  },
}

/** A deep clone with an edit applied, so tests never mutate `base`.
 *  JSON round-trip rather than structuredClone: this package must not depend
 *  on Node or DOM globals, and schemas are JSON by definition. */
function clone(schema: FormSchema): FormSchema {
  return JSON.parse(JSON.stringify(schema)) as FormSchema
}

function revise(edit: (draft: FormSchema) => void): FormSchema {
  const draft = clone(base)
  edit(draft)
  return draft
}

describe('diffSchemas', () => {
  test('reports no changes for a schema against itself', () => {
    expect(diffSchemas(base, base)).toEqual([])
  })

  test('reports no changes when only key order differs', () => {
    const reordered = { title: base.title, model: base.model, id: base.id, specVersion: base.specVersion }
    expect(diffSchemas(base, reordered as FormSchema)).toEqual([])
  })
})

/** The one change in the diff, asserted to be the only one. */
function only(changes: ReturnType<typeof diffSchemas>) {
  expect(changes).toHaveLength(1)
  return changes[0]!
}

describe('diffSchemas severity', () => {
  test('adding an optional field is compatible', () => {
    const after = revise((d) => {
      d.model.fields.push({ key: 'company', type: 'text' })
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.added',
      severity: 'compatible',
      path: 'model.fields.company',
    })
  })

  test('adding a required field is lossy, because existing submissions lack it', () => {
    const after = revise((d) => {
      d.model.fields.push({ key: 'company', type: 'text', required: true })
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.added',
      severity: 'lossy',
    })
  })

  test('removing a field is lossy', () => {
    const after = revise((d) => {
      d.model.fields = d.model.fields.filter((f) => f.key !== 'message')
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.removed',
      severity: 'lossy',
      path: 'model.fields.message',
    })
  })

  test('a declared rename is compatible, because old data can be mapped across', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'body', type: 'textarea', renamedFrom: 'message' }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.renamed',
      severity: 'compatible',
      path: 'model.fields.body',
    })
  })

  test('an undeclared rename is lossy, and is not silently treated as a rename', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'body', type: 'textarea' }
    })

    const changes = diffSchemas(base, after)
    expect(changes.map((c) => c.kind).sort()).toEqual(['field.added', 'field.removed'])
    expect(changes.some((c) => c.severity === 'lossy')).toBe(true)
  })

  test('changing a field type is lossy', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'message', type: 'text' }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.typeChanged',
      severity: 'lossy',
    })
  })

  test('relaxing a required field is compatible', () => {
    const after = revise((d) => {
      d.model.fields[0] = { key: 'email', type: 'text', required: false }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.requiredRelaxed',
      severity: 'compatible',
    })
  })

  test('tightening a field to required is lossy', () => {
    const after = revise((d) => {
      d.model.fields[1] = { key: 'message', type: 'textarea', required: true }
    })

    expect(only(diffSchemas(base, after))).toMatchObject({
      kind: 'field.requiredTightened',
      severity: 'lossy',
    })
  })

  test('moving up a spec version is compatible, because the newer one only adds', () => {
    // This rule was written as "any bump is breaking" before spec 2 existed,
    // which was the safe guess and turned out to be the wrong one: version 2
    // adds field types and layout kinds and removes nothing, so every answer
    // keeps its path and nothing has to be rebound.
    const after = { ...clone(base), specVersion: '2' as const }

    expect(diffSchemas(base, after)).toContainEqual(
      expect.objectContaining({ kind: 'specVersion.changed', severity: 'compatible' }),
    )
  })

  test('moving down one is breaking, because what the newer version added cannot be expressed', () => {
    const before = { ...clone(base), specVersion: '2' as const }
    const after = { ...clone(base), specVersion: '1' as const }

    expect(diffSchemas(before, after)).toContainEqual(
      expect.objectContaining({ kind: 'specVersion.changed', severity: 'breaking' }),
    )
  })

  test('reordering fields is not a change, because keys carry identity', () => {
    const after = revise((d) => {
      d.model.fields.reverse()
    })

    expect(diffSchemas(base, after)).toEqual([])
  })
})

const fieldTypes = ['text', 'textarea', 'number', 'checkbox', 'select', 'radio', 'date'] as const

const arbField = fc.record(
  {
    key: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
    type: fc.constantFrom(...fieldTypes),
    required: fc.boolean(),
  },
  { requiredKeys: ['key', 'type'] },
)

const arbSchema = fc
  .record({
    specVersion: fc.constant('1' as const),
    id: fc.string({ minLength: 1, maxLength: 8 }),
    title: fc.string({ maxLength: 20 }),
    fields: fc.uniqueArray(arbField, { maxLength: 8, selector: (f) => f.key }),
  })
  .map(({ fields, ...rest }): FormSchema => ({ ...rest, model: { fields } }))

describe('diffSchemas invariants', () => {
  test('a schema never differs from itself', () => {
    fc.assert(
      fc.property(arbSchema, (schema) => {
        expect(diffSchemas(schema, schema)).toEqual([])
      }),
    )
  })

  test('never reports a change without a severity and a path', () => {
    fc.assert(
      fc.property(arbSchema, arbSchema, (before, after) => {
        for (const change of diffSchemas(before, after)) {
          expect(change.severity).toMatch(/^(compatible|lossy|breaking)$/)
          expect(change.path.length).toBeGreaterThan(0)
          expect(change.detail.length).toBeGreaterThan(0)
        }
      }),
    )
  })
})

describe('diffSchemas inside containers', () => {
  const nested: FormSchema = {
    specVersion: '1',
    id: 'f',
    title: 'T',
    model: {
      fields: [
        {
          key: 'g',
          type: 'group',
          fields: [
            { key: 'child', type: 'text', required: true },
            { key: 'other', type: 'text' },
          ],
        },
        {
          key: 'items',
          type: 'repeater',
          fields: [{ key: 'name', type: 'text' }],
        },
      ],
    },
  }

  test('deleting a required field inside a group is lossy — the reviewer repro', () => {
    const after = clone(nested)
    after.model.fields[0]!.fields = after.model.fields[0]!.fields!.filter((f) => f.key !== 'child')

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.removed', severity: 'lossy', path: 'model.fields.g.child' }),
    )
  })

  test('changing a nested field type is lossy', () => {
    const after = clone(nested)
    after.model.fields[0]!.fields![0] = { key: 'child', type: 'number', required: true }

    expect(diffSchemas(nested, after)).toContainEqual(
      expect.objectContaining({ kind: 'field.typeChanged', severity: 'lossy', path: 'model.fields.g.child' }),
    )
  })

  test('tightening a repeater template field is lossy, reported at the row-scoped path', () => {
    const after = clone(nested)
    after.model.fields[1]!.fields![0] = { key: 'name', type: 'text', required: true }

    expect(diffSchemas(nested, after)).toContainEqual(
      expect.objectContaining({
        kind: 'field.requiredTightened',
        severity: 'lossy',
        path: 'model.fields.items[].name',
      }),
    )
  })

  test('a declared rename inside a group maps data across as compatible', () => {
    const after = clone(nested)
    after.model.fields[0]!.fields![0] = { key: 'kid', type: 'text', required: true, renamedFrom: 'child' }

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.renamed', severity: 'compatible', path: 'model.fields.g.kid' }),
    )
    expect(changes.some((c) => c.kind === 'field.removed')).toBe(false)
  })

  test('renaming a group with renamedFrom carries its children along — no spurious removals', () => {
    const after = clone(nested)
    after.model.fields[0] = { ...after.model.fields[0]!, key: 'g2', renamedFrom: 'g' }

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.renamed', severity: 'compatible', path: 'model.fields.g2' }),
    )
    expect(changes.filter((c) => c.kind === 'field.removed')).toEqual([])
    expect(changes.filter((c) => c.kind === 'field.added')).toEqual([])
  })

  test('turning a group into a repeater is a lossy type change and re-homes every child', () => {
    const after = clone(nested)
    after.model.fields[0] = { ...after.model.fields[0]!, type: 'repeater' }

    const changes = diffSchemas(nested, after)

    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'field.typeChanged', severity: 'lossy', path: 'model.fields.g' }),
    )
    // Children move from g.child to g[].child — a different data shape.
    expect(changes.some((c) => c.kind === 'field.removed' && c.path === 'model.fields.g.child')).toBe(true)
  })
})

describe('diffSchemas and pages', () => {
  const paged: FormSchema = {
    specVersion: '1',
    id: 'f',
    title: 'T',
    model: {
      fields: [
        { key: 'p1', type: 'page', fields: [{ key: 'email', type: 'text' }] },
        { key: 'p2', type: 'page', fields: [{ key: 'message', type: 'text' }] },
      ],
    },
  }

  test('moving a field to another page is NO change: pages scope presentation, not data', () => {
    const after = clone(paged)
    after.model.fields[0]!.fields = []
    after.model.fields[1]!.fields = [{ key: 'email', type: 'text' }, { key: 'message', type: 'text' }]

    expect(diffSchemas(paged, after)).toEqual([])
  })

  test('moving a field INTO a group changes its data path and is reported as remove plus add', () => {
    const after = clone(paged)
    after.model.fields[0]!.fields = [{ key: 'wrap', type: 'group', fields: [{ key: 'email', type: 'text' }] }]

    const kinds = diffSchemas(paged, after).map((c) => c.kind).sort()
    expect(kinds).toContain('field.removed')
    expect(kinds).toContain('field.added')
  })
})

/**
 * Everything a document can change that is not a field arriving or leaving.
 *
 * `diffSchemas` reported seven kinds, all of them about a field's identity, its
 * type or its `required` flag. Everything else — an option withdrawn from a
 * radio, a bound tightened, a rule added, a translation rewritten, a layout
 * rearranged — produced **no change at all**, so two materially different
 * documents diffed to `[]`.
 *
 * That silence is worse than a wrong severity. Four readers trust this
 * function: draft migration, the builder's "what changed before you publish"
 * view, export column unioning and the consumer CI gate
 * ([0015](../../../docs/decisions/0015-diff-before-server.md)). An empty answer
 * tells all four that nothing happened — so a draft rebinds silently against a
 * form that now rejects it, and a publish review shows an empty list.
 *
 * The option case loses data outright: a stored answer of `"post"` against a
 * radio that no longer offers it is a value outside the document's own
 * vocabulary, and nothing said so.
 */
const choice: FormSchema = {
  specVersion: '2',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      {
        key: 'contactBy',
        type: 'radio',
        label: 'How should we reach you?',
        options: [
          { value: 'email', label: 'By email' },
          { value: 'post', label: 'By post' },
        ],
      },
      { key: 'note', type: 'text', label: 'Note', maxLength: 500 },
    ],
  },
  logic: { rules: [{ target: 'note', kind: 'visible', cel: "contactBy == 'post'" }] },
  layouts: [
    { name: 'web', nodes: [{ kind: 'field', path: 'contactBy' }, { kind: 'field', path: 'note' }] },
  ],
  i18n: { defaultLocale: 'en', messages: { en: { greeting: 'Hello' } } },
}

function amend(edit: (draft: FormSchema) => void): FormSchema {
  const draft = JSON.parse(JSON.stringify(choice)) as FormSchema
  edit(draft)
  return draft
}

/** A real edit, and the kind and severity the diff must answer it with. */
const EDITS: ReadonlyArray<{
  what: string
  edit: (draft: FormSchema) => void
  kind: string
  severity: string
}> = [
  {
    what: 'an option is withdrawn',
    // The answer `"post"` is in submissions already and is no longer a value
    // the document offers. Nothing else here loses data this directly.
    edit: (draft) => void draft.model.fields[0]!.options!.pop(),
    kind: 'field.optionRemoved',
    severity: 'lossy',
  },
  {
    what: 'an option is offered',
    edit: (draft) => void draft.model.fields[0]!.options!.push({ value: 'phone', label: 'By phone' }),
    kind: 'field.optionAdded',
    severity: 'compatible',
  },
  {
    what: 'an option is relabelled',
    // The stored value is the `value`, never the label, so every answer survives.
    edit: (draft) => void (draft.model.fields[0]!.options![0]!.label = 'Email me'),
    kind: 'field.optionRelabelled',
    severity: 'compatible',
  },
  {
    what: 'a length bound is tightened',
    // An existing 300-character note is now invalid.
    edit: (draft) => void (draft.model.fields[1]!.maxLength = 100),
    kind: 'field.constraintTightened',
    severity: 'lossy',
  },
  {
    what: 'a length bound is relaxed',
    edit: (draft) => void (draft.model.fields[1]!.maxLength = 1000),
    kind: 'field.constraintRelaxed',
    severity: 'compatible',
  },
  {
    what: 'a constraint appears where there was none',
    // A new constraint can only reject what it used to accept.
    edit: (draft) => void (draft.model.fields[1]!.pattern = '^[A-Z]'),
    kind: 'field.constraintTightened',
    severity: 'lossy',
  },
  {
    what: 'a constraint is dropped',
    edit: (draft) => void delete draft.model.fields[1]!.maxLength,
    kind: 'field.constraintRelaxed',
    severity: 'compatible',
  },
  {
    what: 'a rule is added',
    // Behaviour changed, and `required` or `visible` decides whether an
    // existing answer is still acceptable or still kept at all.
    edit: (draft) => void draft.logic!.rules.push({ target: 'contactBy', kind: 'required', cel: 'true' }),
    kind: 'rule.added',
    severity: 'lossy',
  },
  {
    what: 'a rule is withdrawn',
    edit: (draft) => void draft.logic!.rules.pop(),
    kind: 'rule.removed',
    severity: 'lossy',
  },
  {
    what: 'a rule says something else',
    edit: (draft) => void (draft.logic!.rules[0]!.cel = "contactBy == 'email'"),
    kind: 'rule.changed',
    severity: 'lossy',
  },
  {
    what: 'a translation is rewritten',
    // The form reads differently; every answer keeps its path and its validity.
    edit: (draft) => void (draft.i18n!.messages['en']!['greeting'] = 'Good morning'),
    kind: 'text.changed',
    severity: 'compatible',
  },
  {
    what: 'a locale is added',
    edit: (draft) => void (draft.i18n!.messages['de'] = { greeting: 'Guten Tag' }),
    kind: 'text.changed',
    severity: 'compatible',
  },
  {
    what: 'the arrangement changes',
    // A layout places fields; it never decides what they collect.
    edit: (draft) => void draft.layouts![0]!.nodes.reverse(),
    kind: 'layout.changed',
    severity: 'compatible',
  },
  {
    what: "a field's own label changes",
    edit: (draft) => void (draft.model.fields[1]!.label = 'Anything else?'),
    kind: 'field.relabelled',
    severity: 'compatible',
  },
]

describe('every kind of change a document can carry', () => {
  for (const { what, edit, kind, severity } of EDITS) {
    test(`${what}: reported as ${kind}, ${severity}`, () => {
      const changes = diffSchemas(choice, amend(edit))
      const reported = changes.map((change) => change.kind)

      expect(reported, 'the diff said nothing at all').not.toEqual([])
      const found = changes.find((change) => change.kind === kind)
      expect(found, `kinds reported: ${reported.join(', ') || '(none)'}`).toBeDefined()
      expect(found?.severity).toBe(severity)
      expect(found?.detail.length ?? 0).toBeGreaterThan(0)
    })
  }

  test('and none of them falls through to the catch-all, which would make the table vacuous', () => {
    /*
     * The guard on the guard. One `document.changed` entry covering everything
     * would satisfy "never silent" while classifying nothing, and every row
     * above would still find its kind — because the table was written to match
     * the implementation rather than the other way round. So for an edit this
     * function claims to understand, the unexplained entry must be absent.
     */
    for (const { what, edit } of EDITS) {
      const kinds = diffSchemas(choice, amend(edit)).map((change) => change.kind)
      // Both backstops, because a field edit falling through to `field.changed`
      // is the same vacuity one level down.
      expect(kinds, `"${what}" was never actually classified`).not.toContain('document.changed')
      expect(kinds, `"${what}" fell through to the field backstop`).not.toContain('field.changed')
    }
  })

  test('a pattern that changed counts as stricter even when it sorts later', () => {
    /*
     * The branch that keeps the bound table honest. `pattern`, `format`,
     * `step` and `accept` cannot be put in order — "stricter" is not a
     * question about their text — so a change to any of them counts as a
     * tightening whatever it changed to, which is the fail-closed direction.
     *
     * The new pattern has to sort *after* the old one. Written the other way
     * round the case passes with the rule removed, because the generic
     * comparison treats anything that is not a floor as a ceiling and reaches
     * the same answer by accident. Found by mutating the rule away and
     * watching the first version of this case stay green.
     */
    const later = diffSchemas(
      amend((draft) => void (draft.model.fields[1]!.pattern = 'aaa')),
      amend((draft) => void (draft.model.fields[1]!.pattern = 'zzz')),
    )

    const constraint = later.find((change) => change.kind === 'field.constraintTightened')
    expect(constraint, 'a changed pattern was read as a relaxation').toBeDefined()
    expect(constraint?.severity).toBe('lossy')
  })

  test("a property of a field nobody wrote a comparator for is reported too", () => {
    /*
     * The backstop one level down. `clearOnHide` is the example that matters:
     * it decides whether a hidden field's answer survives at all, and nothing
     * here compares it by name. Reported as `field.changed` and `lossy`,
     * because a property nobody examined must not be assumed harmless — and
     * the alternative, which is what used to happen, is a field that changed
     * and a diff that says it did not.
     */
    const changes = diffSchemas(
      choice,
      amend((draft) => void (draft.model.fields[1]!.clearOnHide = true)),
    )

    const residual = changes.find((change) => change.kind === 'field.changed')
    expect(residual, 'a field property changed and nothing said so').toBeDefined()
    expect(residual?.severity).toBe('lossy')
    expect(residual?.detail, 'the report does not name what changed').toContain('clearOnHide')
  })

  test('a change it has no comparator for is reported rather than swallowed, and fails closed', () => {
    /*
     * What makes silence impossible. A document gains something this function
     * has never heard of; it must still say so, and it must not call a change
     * it did not look at harmless. A draft rebinding against a form nobody
     * compared is the failure `SAFETY-ANALYSIS.md` E3 describes.
     */
    const changed = amend((draft) => {
      ;(draft as unknown as Record<string, unknown>)['somethingNobodyHasWrittenYet'] = { a: 1 }
    })

    const unexplained = diffSchemas(choice, changed).find((change) => change.kind === 'document.changed')

    expect(unexplained, 'a document that changed diffed to nothing').toBeDefined()
    expect(unexplained?.severity, 'an unexamined change was called harmless').toBe('lossy')
  })

  test('while a document identical but for key order is still no change at all', () => {
    // The other half of the catch-all: it must not fire on a canonical
    // equivalence, or republishing an untouched form would report a migration.
    const reordered: Record<string, unknown> = {}
    for (const key of Object.keys(choice).reverse()) {
      reordered[key] = (choice as unknown as Record<string, unknown>)[key]
    }

    expect(diffSchemas(choice, reordered as unknown as FormSchema)).toEqual([])
  })
})

/**
 * A declared rename and the expressions that referenced the field.
 *
 * `renamedFrom` promises that a rename costs the data nothing. A field lives in
 * four places — the model, the layouts, the rules that read it and the logic
 * panel's metadata — and the builder rewrites all four in one edit. So the
 * first version of the rule comparator reported the rewritten expression as a
 * rule that "says something else now", and the promise held for the fields
 * while breaking on their logic.
 *
 * The comparator reads the before-side as though the renames had happened, by
 * textual substitution on path boundaries. `@formancy/spec` sits below
 * `@formancy/expressions` ([0008](../../../docs/decisions/0008-layered-packages.md))
 * so there is no CEL parser here and there must not be one — which is safe
 * only because of the direction: a substitution that is wrong produces an
 * expression that does not match, and the rule is then reported as changed.
 * Only an exact match is read as "this followed a renamed field".
 */
describe('a rename and the rules that mention the field', () => {
  const named: FormSchema = {
    specVersion: '2',
    id: 'trip',
    title: 'Trip',
    model: {
      fields: [
        { key: 'email', type: 'text' },
        { key: 'emailAddress', type: 'text' },
        { key: 'summary', type: 'textarea' },
      ],
    },
    logic: { rules: [{ target: 'summary', kind: 'visible', cel: 'email != "" && emailAddress != ""' }] },
  }

  const renamedTo = (cel: string): FormSchema => ({
    ...named,
    model: {
      fields: [
        { key: 'workEmail', type: 'text', renamedFrom: 'email' },
        { key: 'emailAddress', type: 'text' },
        { key: 'summary', type: 'textarea' },
      ],
    },
    logic: { rules: [{ target: 'summary', kind: 'visible', cel }] },
  })

  test('carries them along, so the rename stays compatible end to end', () => {
    const changes = diffSchemas(named, renamedTo('workEmail != "" && emailAddress != ""'))

    expect(changes.map((change) => change.kind)).toEqual(['field.renamed'])
    expect(changes.every((change) => change.severity === 'compatible')).toBe(true)
  })

  test('without eating a neighbour whose name merely starts the same way', () => {
    /*
     * `emailAddress` begins with `email`. A substring substitution would turn
     * it into `workEmailAddress`, the expressions would then disagree, and the
     * rename would report a rule change for a field nobody touched. The path
     * boundary is what stops it — and the assertion is the *absence* of a rule
     * change, which is only meaningful because the case above shows one can
     * appear.
     */
    const changes = diffSchemas(named, renamedTo('workEmail != "" && emailAddress != ""'))

    expect(changes.map((change) => change.kind)).not.toContain('rule.changed')
  })

  test('and a rule that really did change its mind in the same version is still reported', () => {
    /*
     * The half that keeps the substitution honest. Rename the field AND alter
     * what the rule asks; the translated before-expression no longer matches,
     * so the change surfaces rather than hiding inside the rename.
     */
    const changes = diffSchemas(named, renamedTo('workEmail != "" || emailAddress != ""'))

    const rule = changes.find((change) => change.kind === 'rule.changed')
    expect(rule, 'a rule edited alongside a rename vanished into it').toBeDefined()
    expect(rule?.severity).toBe('lossy')
  })

  test('and a rule targeting the renamed field follows it rather than looking removed', () => {
    // The target is a data path too, so the same translation applies — without
    // it, every rule on a renamed field reads as one removed and one added.
    const changes = diffSchemas(
      { ...named, logic: { rules: [{ target: 'email', kind: 'required', cel: 'true' }] } },
      {
        ...renamedTo('true'),
        logic: { rules: [{ target: 'workEmail', kind: 'required', cel: 'true' }] },
      },
    )

    expect(changes.map((change) => change.kind)).toEqual(['field.renamed'])
  })
})
