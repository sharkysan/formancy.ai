import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { unknownReferences } from './unknown-paths.js'

/**
 * Rules that read a path no field provides.
 *
 * The builder keeps rules and fields in step: renaming a field or unwrapping a
 * group rewrites every rule that names it
 * ([0093](../../../docs/decisions/0093-a-rule-follows-the-path-it-reads.md)). A
 * document written by hand, generated, or edited by a script has no such help.
 *
 * Measured, the gap is narrower than it reads: an unknown **root** is already
 * refused at publish, because the engine compiles each rule against the fields
 * that exist. What gets through is `address.nope` and `item.nope`, since a
 * member of a `map` is `dyn` — and those publish, then evaluate as nothing for
 * the life of an immutable version. This function answers the whole question
 * anyway, root included, because a caller that is not the publish path wants
 * the whole answer.
 *
 * **This reports; it does not refuse.** Tightening what `validateSchema`
 * accepts would make documents that are valid today invalid tomorrow, and what
 * a reader accepts is the version contract — frozen. So the finding travels as
 * a warning on a *successful* publish.
 *
 * It is a model question rather than a type question, which is why it is not
 * folded into `expressionProblems`. CEL's checker catches an unknown **root**
 * and nothing deeper: measured, `address.nope` and `item.nope` both type-check,
 * because a member of a `map` is `dyn`. Comparing what a rule reads against
 * what the model defines catches all three.
 */
const schema = (rules: unknown[]): FormSchema =>
  ({
    specVersion: '2',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'note', type: 'text', label: 'Note' },
        {
          key: 'address',
          type: 'group',
          label: 'Address',
          fields: [{ key: 'city', type: 'text', label: 'City' }],
        },
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          fields: [
            { key: 'qty', type: 'number', label: 'Quantity' },
            { key: 'total', type: 'number', label: 'Total' },
          ],
        },
      ],
    },
    logic: { rules },
  }) as unknown as FormSchema

const pathsOf = (rules: unknown[]): string[][] =>
  unknownReferences(schema(rules)).map((found) => [...found.paths])

describe('a rule that reads a path no field provides', () => {
  test('is reported when the root does not exist', () => {
    // The case the builder used to create: `postcode` was renamed and the rule
    // kept reading the old name.
    expect(pathsOf([{ target: 'note', kind: 'visible', cel: 'postcode == "8000"' }])).toEqual([
      ['postcode'],
    ])
  })

  test('and when a member of a group does not exist, which CEL cannot see', () => {
    /*
     * Measured: `address.nope` type-checks, because `address` is declared `map`
     * and a member of a map is `dyn`. So the checker is not the oracle here —
     * the model is. This is the case `unwrapField` and `renameField` touch most
     * often, since a grouped path is where the data path and the tree path
     * differ.
     */
    expect(
      pathsOf([{ target: 'note', kind: 'visible', cel: 'address.nope == "Zug"' }]),
    ).toEqual([['address.nope']])
  })

  test('and when a member of a repeater row does not exist', () => {
    // `item` is the row variable, so `item.nope` means `items[].nope`. Also
    // `dyn` to the checker, also absent from the model.
    expect(
      pathsOf([{ target: 'items[].total', kind: 'computed', cel: 'item.nope * 2.0' }]),
    ).toEqual([['items[].nope']])
  })

  test('says nothing about a rule that reads only what exists', () => {
    /*
     * The half that decides whether this is usable. A warning channel that
     * cries wolf is a warning channel people turn off, so every shape the
     * demos and the documentation actually use has to come back clean:
     * a group member, a row variable, the row index, a capability function,
     * `has()`, and a comprehension's own binding.
     */
    expect(
      pathsOf([
        { target: 'note', kind: 'visible', cel: 'address.city == "Zug"' },
        { target: 'items[].total', kind: 'computed', cel: 'item.qty * 2.0' },
        { target: 'address.city', kind: 'required', cel: 'note != ""' },
        { target: 'items[].qty', kind: 'validate', cel: 'index >= 0', code: 'bad' },
        { target: 'note', kind: 'disabled', cel: 'has(address.city)' },
      ]),
    ).toEqual([])
  })

  test('and nothing about a comprehension variable, which is not a field', () => {
    // `x` is bound by the macro. Reporting it would invent a field nobody wrote
    // — and `referencedPaths` already knows this, which is why this reuses it
    // rather than walking the source.
    expect(
      pathsOf([{ target: 'note', kind: 'visible', cel: 'items.all(x, x.qty > 0.0)' }]),
    ).toEqual([])
  })

  test('and nothing about a check, which carries no expression at all', () => {
    expect(pathsOf([{ target: 'note', kind: 'check', check: 'known-note' }])).toEqual([])
  })

  test('and nothing about an expression that does not parse', () => {
    // That is the engine's business and already fatal at publish. Reporting it
    // here too, in different words, helps nobody.
    expect(pathsOf([{ target: 'note', kind: 'visible', cel: 'postcode ==' }])).toEqual([])
  })

  test('reports a row path as the model writes it, not as the rule does', () => {
    // So the message names something the author can find in their document.
    // `item.nope` is not a path anybody could search for; `items[].nope` is.
    const found = unknownReferences(
      schema([{ target: 'items[].total', kind: 'computed', cel: 'item.nope * 2.0' }]),
    )

    expect(found[0]?.message).toContain('items[].nope')
    expect(found[0]?.target).toBe('items[].total')
  })

  test('names every missing path in one rule, not the first', () => {
    // A rule repaired halfway is a rule still broken, and a report that stops
    // at the first path invites exactly that.
    expect(
      pathsOf([{ target: 'note', kind: 'visible', cel: 'postcode == "8000" && nope != true' }]),
    ).toEqual([['nope', 'postcode']])
  })

  test('treats a literal row index as the row, since the model has no row numbers', () => {
    // `items[0].qty` is a real thing to write and reads the same field as
    // `items[].qty`. Reporting it would be a false alarm on valid logic.
    expect(
      pathsOf([{ target: 'note', kind: 'visible', cel: 'items[0].qty > 0.0' }]),
    ).toEqual([])
  })
})
