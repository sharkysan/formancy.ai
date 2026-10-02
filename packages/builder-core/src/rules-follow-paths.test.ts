import { describe, expect, test } from 'vitest'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { createBuilderSession } from './session.js'
import type { ConditionGroup } from './conditions.js'

/**
 * A rule's paths follow the field it names.
 *
 * Two commands change where an answer lives: `renameField` moves `postcode` to
 * `zip`, and `unwrapField` moves `address.city` to `city`. A rule names fields
 * in three places — its `target`, its `cel` condition, and the `editor`
 * metadata the visual panel reopens from — and before this none of the three
 * followed.
 *
 * What that cost is worth stating precisely, because it is not what the roadmap
 * said it was. `unwrapField` **refused**, which is loud and recoverable.
 * `renameField` did not: it succeeded, left the condition reading a path no
 * field had, and published. The engine types an unknown leaf as `dyn`, so
 * nothing rejects it — `postcode == "8000"` becomes `null == "8000"`, which is
 * `false` forever, and a field that was conditionally visible is simply gone.
 * No error, at authoring time or afterwards.
 */

const schema = (rules: LogicRule[], extra: unknown[] = []): FormSchema =>
  ({
    specVersion: '3',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'postcode', type: 'text', label: 'Postcode' },
        {
          key: 'address',
          type: 'group',
          label: 'Address',
          fields: [{ key: 'city', type: 'text', label: 'City' }],
        },
        { key: 'note', type: 'text', label: 'Note' },
        ...extra,
      ],
    },
    logic: { rules },
  }) as unknown as FormSchema

const rulesOf = (document: FormSchema): LogicRule[] => document.logic?.rules ?? []

describe('renameField and the rules that name the field', () => {
  test('rewrites a condition that reads it, rather than leaving it reading nothing', () => {
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'postcode == "8000"' }]),
    )

    expect(session.renameField(['postcode'], 'zip').ok).toBe(true)

    expect(rulesOf(session.document())[0]?.cel).toBe('zip == "8000"')
  })

  test('and repoints a rule that targets it, which would otherwise aim at nothing', () => {
    const session = createBuilderSession(
      schema([{ kind: 'required', target: 'postcode', cel: 'note != ""' }]),
    )

    expect(session.renameField(['postcode'], 'zip').ok).toBe(true)

    expect(rulesOf(session.document())[0]?.target).toBe('zip')
  })

  test('and rewrites the editor metadata, so reopening the panel does not undo it', () => {
    /*
     * `editor` is the structured condition the visual panel reads back, and
     * `composeRule` recompiles `cel` FROM it. Rewriting only the CEL would hold
     * for exactly as long as nobody opened the logic panel again: the next edit
     * recompiles from the stale metadata and silently restores the old path.
     */
    const session = createBuilderSession(
      schema([
        {
          kind: 'visible',
          target: 'note',
          cel: 'postcode == "8000" && note != ""',
          editor: {
            join: 'all',
            conditions: [
              { field: 'postcode', operator: 'is', value: '8000' },
              // A second row about a DIFFERENT field, which must not move. One
              // group holds every row of the condition, so a rewrite that walks
              // the group rather than matching each row repoints all of them.
              { field: 'note', operator: 'isAnswered' },
            ],
          },
        } as unknown as LogicRule,
      ]),
    )

    expect(session.renameField(['postcode'], 'zip').ok).toBe(true)

    const editor = rulesOf(session.document())[0]?.editor as ConditionGroup
    expect(editor.conditions.map((condition) => condition.field)).toEqual(['zip', 'note'])
    // The row that did not move kept everything else about it too.
    expect(editor.conditions[1]).toEqual({ field: 'note', operator: 'isAnswered' })
  })

  test('leaves a different field whose name merely starts the same alone', () => {
    // The boundary a pattern over source gets wrong. `postcode_uk` is another
    // field, and repointing it at `zip_uk` invents a path nothing has.
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'postcode_uk == "X" && postcode == 1' }], [
        { key: 'postcode_uk', type: 'text', label: 'UK postcode' },
      ]),
    )

    expect(session.renameField(['postcode'], 'zip').ok).toBe(true)

    expect(rulesOf(session.document())[0]?.cel).toBe('postcode_uk == "X" && zip == 1')
  })

  test('and leaves the name inside a string literal alone, which is data not a reference', () => {
    // A literal mentioning the field is not a read of it. Rewriting here
    // changes what the condition COMPARES, which no test downstream can catch
    // because the document stays valid.
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'note == "postcode"' }]),
    )

    expect(session.renameField(['postcode'], 'zip').ok).toBe(true)

    expect(rulesOf(session.document())[0]?.cel).toBe('note == "postcode"')
  })

  test('refuses rather than rewrite a condition that does not parse', () => {
    /*
     * An unparseable condition cannot be rewritten safely and cannot be left
     * alone either — leaving it is the silent breakage this whole change is
     * about. So the command refuses and names the rule, which is the outcome
     * somebody can act on.
     */
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'postcode ==' }]),
    )

    const outcome = session.renameField(['postcode'], 'zip')

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/rule 1/)
  })

  test('refuses when the new name would be captured by a local in the condition', () => {
    // `zip` is bound by the comprehension, so the spliced text would read the
    // iteration variable instead of the field. Valid CEL, different meaning.
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'note.all(zip, zip != postcode)' }]),
    )

    const outcome = session.renameField(['postcode'], 'zip')

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/rule 1/)
  })

  test('refuses a new key that is a CEL keyword, rather than writing a condition that cannot parse', () => {
    /*
     * A field key is `^[A-Za-z_][A-Za-z0-9_]*$`, so `if` is a legal key — and
     * `if == 1` is not a legal condition. Without this the rename would splice
     * source that does not parse and publish a document whose rule the engine
     * cannot compile.
     *
     * It refuses at the TARGET check rather than after the splice, which is why
     * `rewritePath`'s "the splice broke the source" branch is unreachable: by
     * the time anything is spliced, the replacement is known to be one valid
     * path. The branch stays as the structural answer to a result that cannot
     * be asked what it reads.
     */
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'postcode == 1' }]),
    )

    const outcome = session.renameField(['postcode'], 'if')

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toMatch(/rule 1/)
  })

  test('carries a check along by its target, since a check has no expression to rewrite', () => {
    /*
     * A `check` names a validator the deployment answers and carries no `cel`
     * at all, so it has a target to follow and nothing to parse. Written
     * because the obvious implementation parses `rule.cel` unconditionally and
     * refuses every rename on a form that has a check.
     *
     * An *empty* expression is deliberately not a case: the schema refuses
     * `cel: ""` and `draftIsComplete` will not compose one, so the guard has
     * two branches rather than three.
     */
    const session = createBuilderSession(
      schema([{ kind: 'check', target: 'postcode', check: 'postcode-exists' } as unknown as LogicRule]),
    )

    expect(session.renameField(['postcode'], 'zip').ok).toBe(true)

    const rule = rulesOf(session.document())[0]
    expect(rule?.target).toBe('zip')
    expect(rule?.check).toBe('postcode-exists')
  })

  test('leaves editor metadata it does not recognise exactly as it found it', () => {
    /*
     * `editor` is `unknown` in the spec, so another tool's metadata may be any
     * shape at all. Rewriting a `field` property of an object we do not
     * recognise is how a document acquires nonsense that still validates — so
     * the shape is checked rather than assumed, and anything else is passed
     * through untouched.
     */
    // Both shapes it can be wrong in: metadata that is not a condition group at
    // all, and a group whose rows are not conditions.
    const foreign = [
      { producedBy: 'something else', conditions: 'not an array' },
      { join: 'all', conditions: [null, 'a row', 42, { noFieldHere: true }] },
    ]
    const session = createBuilderSession(
      // Different kinds, because a field carries one rule per kind.
      schema(
        (['visible', 'disabled'] as const).map(
          (kind, index) =>
            ({ kind, target: 'note', cel: 'postcode == 1', editor: foreign[index] }) as unknown as LogicRule,
        ),
      ),
    )

    expect(session.renameField(['postcode'], 'zip').ok).toBe(true)

    expect(rulesOf(session.document()).map((rule) => rule.editor)).toEqual(foreign)
  })

  test('leaves the document untouched when it refuses', () => {
    // A command that half-applies is worse than one that refuses: the field is
    // renamed, the rule is not, and the author has the broken state they were
    // being protected from.
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'postcode ==' }]),
    )

    session.renameField(['postcode'], 'zip')

    expect(session.document().model.fields[0]?.key).toBe('postcode')
    expect(rulesOf(session.document())[0]?.cel).toBe('postcode ==')
  })
})

describe('unwrapField and the rules that read inside the group', () => {
  test('rewrites a condition that reads a path inside it, instead of refusing', () => {
    /*
     * This was refused, and the refusal said *"a rule's condition is CEL, which
     * this cannot rewrite without pattern-matching source"*. That was true and
     * is no longer: the rewrite is an AST walk over spans, so there is no
     * pattern to get wrong.
     */
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'address.city == "Zug"' }]),
    )

    expect(session.unwrapField(['address']).ok).toBe(true)

    expect(rulesOf(session.document())[0]?.cel).toBe('city == "Zug"')
  })

  test('and repoints a rule that targets a field inside it', () => {
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'address.city', cel: 'note != ""' }]),
    )

    expect(session.unwrapField(['address']).ok).toBe(true)

    expect(rulesOf(session.document())[0]?.target).toBe('city')
  })

  test('and stops refusing a rule that only mentions the group inside a string', () => {
    /*
     * The false refusal the old pattern caused. `note == "address"` reads `note`
     * and nothing else; the group name appears only as data. The command was
     * unavailable on a document it was always safe for, and the message named a
     * rule that had nothing to do with it.
     */
    const session = createBuilderSession(
      schema([{ kind: 'visible', target: 'note', cel: 'note == "address"' }]),
    )

    expect(session.unwrapField(['address']).ok).toBe(true)

    expect(rulesOf(session.document())[0]?.cel).toBe('note == "address"')
  })
})
