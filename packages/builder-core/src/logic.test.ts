import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import {
  RULE_KIND_CHOICES,
  composeRule,
  conditionOf,
  draftIsComplete,
  emptyRow,
  kindCarriesCondition,
  kindWrites,
  referencedMessages,
  rowTakesValue,
  ruleKindsFor,
  ruleTargetFor,
} from './logic.js'
import { RULE_KINDS } from '@formancy/spec'

/**
 * What a builder offers when somebody writes a rule.
 *
 * This was a table and four helpers inside React's logic panel, which made every
 * one of them testable only by rendering a React tree — and made a second
 * builder a choice between importing React or writing the table again. Two
 * copies drift the first time the format grows a kind: one builder would offer
 * it, the other would not, and nobody using one of them could see the
 * difference.
 */
const paged: FormSchema = {
  specVersion: '3',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'about',
        type: 'page',
        label: 'About you',
        fields: [{ key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' }],
      },
      {
        key: 'visa',
        type: 'page',
        label: 'Visa details',
        fields: [{ key: 'passport', type: 'text', label: 'Passport' }],
      },
    ],
  },
} as unknown as FormSchema

describe('which kinds a builder offers', () => {
  test('covers every kind the format defines, so none is unreachable', () => {
    // Derived from the spec's own list. A kind added to the format and not to
    // this table is a kind no builder can write — which is the wizard's shape
    // all over again, and how `check` and `skip` shipped reachable only by hand.
    expect([...RULE_KIND_CHOICES].map((choice) => choice.id).sort()).toEqual(
      [...RULE_KINDS].sort(),
    )
  })

  test('offers a page only what a page can carry', () => {
    // `visible` on a page is refused by the validator — a page has no data path —
    // so offering it would be offering a choice refused every time.
    expect(ruleKindsFor('page').map((choice) => choice.id)).toEqual(['skip'])
  })

  test('and never offers a field the one that is about a page', () => {
    expect(ruleKindsFor('field').map((choice) => choice.id)).not.toContain('skip')
  })

  test('and every kind says what it does, in words rather than in its name', () => {
    for (const choice of RULE_KIND_CHOICES) {
      expect(choice.label.length, choice.id).toBeGreaterThan(6)
      expect(choice.hint.length, choice.id).toBeGreaterThan(20)
    }
  })
})

describe('what a rule on this node is addressed by', () => {
  test('a field inside a page is its DATA path, not its key path', () => {
    // The bug this replaces: the panel joined the key path, so a rule on
    // `about.needsVisa` was refused with "No field has the data path" — in the
    // builder, for as long as pages have existed.
    expect(ruleTargetFor(paged, ['about', 'needsVisa'])).toEqual({
      target: 'needsVisa',
      on: 'field',
    })
  })

  test('and a page is addressed by its key, because it carries no answer', () => {
    expect(ruleTargetFor(paged, ['visa'])).toEqual({ target: 'visa', on: 'page' })
  })
})

describe('what the editor composes', () => {
  test('a condition rule carries CEL and the structured form beside it', () => {
    const rule = composeRule({
      kind: 'visible',
      target: 'passport',
      rows: [{ field: 'needsVisa', operator: 'is', text: 'true' }],
      join: 'all',
      check: '',
    })

    expect(rule.kind).toBe('visible')
    expect(typeof rule.cel).toBe('string')
    // The CEL is the single source of truth and the structured form is metadata.
    // If both were evaluable, client and server could disagree about which one
    // meant what, which is the drift this project exists to prevent.
    expect(rule.editor).toBeDefined()
    expect(rule.check).toBeUndefined()
  })

  test('and a check carries a name and no expression at all', () => {
    const rule = composeRule({
      kind: 'check',
      target: 'email',
      rows: [],
      join: 'all',
      check: 'email-not-taken',
    })

    // A rule carrying both would be two rules in one object with no answer to
    // which verdict wins. The schema refuses it, so this does not compose it.
    expect(rule.check).toBe('email-not-taken')
    expect(rule.cel).toBeUndefined()
    expect(rule.editor).toBeUndefined()
  })

  test('a number typed into a box is compared as a number', () => {
    // Comparing a number field to "5" is a type error CEL catches at save time,
    // so the narrowing happens where the author can still see what happened.
    expect(conditionOf({ field: 'qty', operator: 'is', text: '5' }).value).toBe(5)
    expect(conditionOf({ field: 'ok', operator: 'is', text: 'true' }).value).toBe(true)
    expect(conditionOf({ field: 'name', operator: 'is', text: 'Zug' }).value).toBe('Zug')
  })

  test('and a comparison that takes no value carries none', () => {
    const condition = conditionOf({ field: 'note', operator: 'isAnswered', text: 'ignored' })

    expect('value' in condition).toBe(false)
  })
})

describe('when a draft is enough to add', () => {
  test('a condition rule needs every comparison to name a field', () => {
    expect(
      draftIsComplete({ kind: 'visible', rows: [{ field: '', operator: 'is', text: '' }], check: '' }),
    ).toBe(false)
  })

  test('and a check needs a name, because a check with none asks nobody', () => {
    expect(draftIsComplete({ kind: 'check', rows: [], check: '   ' })).toBe(false)
    expect(draftIsComplete({ kind: 'check', rows: [], check: 'visa-eligible' })).toBe(true)
  })

  test('and a calculation needs an expression, because an empty one calculates nothing', () => {
    expect(draftIsComplete({ kind: 'computed', rows: [], check: '', expression: ' ' })).toBe(false)
    expect(
      draftIsComplete({ kind: 'computed', rows: [], check: '', expression: 'qty * price' }),
    ).toBe(true)
  })

  test('a calculation is written as CEL and carries no editor metadata', () => {
    // The comparison editor composes booleans and did not write this, so it
    // cannot regenerate it — metadata claiming otherwise would be a lie the next
    // opening of the panel tells.
    const rule = composeRule({
      kind: 'computed',
      target: 'total',
      rows: [],
      join: 'all',
      check: '',
      expression: 'qty * price',
    })

    expect(rule.cel).toBe('qty * price')
    expect(rule.editor).toBeUndefined()
  })
})

describe('what a kind is written with', () => {
  /*
   * Three answers rather than two, and the UI reads this to decide which surface
   * to show. Getting it wrong does not throw: a `check` would be offered the
   * comparison editor, which composes booleans, and an author would compose one
   * for a rule that takes a NAME. Covered because nothing did — the file scored
   * 46% of its lines and these four exported functions were among the gaps.
   */
  test('a condition for the kinds the comparison editor composes', () => {
    expect(kindWrites('visible')).toBe('condition')
    expect(kindCarriesCondition('visible')).toBe(true)
  })

  test('a name for a check, which is answered by the deployment', () => {
    // Not a condition at all. Showing the comparison editor for one would ask an
    // author to compose a boolean for a rule that names a validator.
    expect(kindWrites('check')).toBe('check')
    expect(kindCarriesCondition('check')).toBe(false)
  })

  test('an expression for a computed value, because the editor makes booleans', () => {
    // The kind is `computed`, not `computedValue` — the first version of this
    // case guessed the latter, got the `condition` fallback, and failed. Worth a
    // line: the fallback is what makes a wrong name look like a working rule.
    expect(kindWrites('computed')).toBe('expression')
    expect(kindCarriesCondition('computed')).toBe(false)
  })

  test('and a condition for a kind it has never heard of, which is the safe default', () => {
    /*
     * The fallback matters more than it looks. A kind added to the format and not
     * to this list would otherwise get `undefined` and render no surface at all —
     * a rule an author can select and cannot write. Defaulting to the comparison
     * editor shows something wrong rather than nothing, and
     * `covers every kind the format defines` above is what stops it being needed.
     */
    expect(kindWrites('invented' as never)).toBe('condition')
    expect(kindCarriesCondition('invented' as never)).toBe(true)
  })
})

describe('a fresh comparison row', () => {
  test('is aimed at a field, so the first thing an author sees is answerable', () => {
    // A row with no field is a row whose operator and value mean nothing, and the
    // builder has to offer SOME field — the palette has already decided which.
    expect(emptyRow('email')).toEqual({ field: 'email', operator: 'is', text: '' })
  })

  test('and opens on "is", which is the comparison that needs no explaining', () => {
    // Asserted separately because it is a product decision rather than a shape:
    // opening on `is not` or on a bound would make the common case two edits.
    expect(emptyRow('x').operator).toBe('is')
    expect(rowTakesValue(emptyRow('x'))).toBe(true)
  })
})

describe('whether a row takes a value at all', () => {
  test('yes for a comparison, no for one that asks about emptiness', () => {
    /*
     * The UI hides the value box when this is false. If it answered yes for
     * `is empty`, an author would type into a box whose contents are discarded —
     * and `conditionOf` drops the value, so the typed text would vanish on save
     * with no explanation.
     */
    expect(rowTakesValue({ field: 'a', operator: 'is', text: '1' })).toBe(true)
    // `isAnswered`, not `isEmpty`: the operator asks whether there IS an answer,
    // which reads the way a person says it. Guessing the other name got the
    // `true` fallback, which is the same lesson as above.
    expect(rowTakesValue({ field: 'a', operator: 'isAnswered', text: '' })).toBe(false)
    expect(rowTakesValue({ field: 'a', operator: 'isNotAnswered', text: '' })).toBe(false)
  })

  test('and yes for an operator it does not know, which keeps the box rather than losing it', () => {
    // The same reasoning as `kindWrites`' fallback: showing a box that may be
    // unnecessary costs an author a glance, and hiding one that is necessary
    // costs them the answer.
    expect(rowTakesValue({ field: 'a', operator: 'invented' as never, text: '' })).toBe(true)
  })
})

describe('which messages a document refers to', () => {
  /*
   * The list a translator works down, and it was **entirely untested** — 22 lines
   * of a 271-line file at 46% coverage, in the core both translation panes read.
   * Its own docblock argues that the ORDER is load-bearing: a translator meets
   * the questions in the order somebody filling the form does, which is the only
   * order that makes the words next to each other mean anything. Nothing checked
   * that order, so nothing would have noticed it changing.
   */
  // Typed, because `referencedMessages` takes a `FormSchema` and an object
  // literal widens `type` to `string`. An `as never` would have hidden a real
  // mistake; this keeps the fixture checked against the format it claims to be.
  /*
   * Typed, and the type corrected three assumptions this fixture started with.
   * A form's `title` is a plain `string` — it is not translatable, which is a
   * fact about the format worth knowing. There is no `hint`; the translatable
   * properties on a field are `label` and, on an option, its own `label`. And a
   * section's text is `label`, not `heading`.
   *
   * An `as never` would have hidden all three and left this asserting an order
   * over properties that do not exist.
   */
  const document_ = (over: Partial<FormSchema> = {}): FormSchema => ({
    specVersion: '4',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'name', type: 'text', label: { $t: 'name' } },
        {
          key: 'colour',
          type: 'radio',
          label: { $t: 'colour' },
          options: [{ value: 'red', label: { $t: 'colour.red' } }],
        },
      ],
    },
    ...over,
  })

  test('every reference it carries, in the order a person meets them', () => {
    expect(referencedMessages(document_())).toEqual(['name', 'colour', 'colour.red'])
  })

  test('and the layouts too, because a heading is text a reader sees', () => {
    /*
     * A section's heading lives in the ARRANGEMENT rather than in the model, so
     * walking the model alone would leave every heading untranslatable — and the
     * pane would show a complete-looking list with the headings missing from it,
     * which is the worst kind of incomplete.
     */
    const messages = referencedMessages(
      document_({
        layouts: [
          {
            // `name`, not `id` — a layout is addressed by the name a document
            // refers to it with. The fourth thing the type checker corrected in
            // this fixture, and the reason none of them was written `as never`.
            name: 'web',
            nodes: [{ kind: 'section', label: { $t: 'section.label' }, children: [] }],
          },
        ],
      }),
    )

    expect(messages).toContain('section.label')
    // After the model's, because the model is what a person fills in first.
    expect(messages.indexOf('section.label')).toBeGreaterThan(messages.indexOf('colour'))
  })

  test('and each one once, however many times it is used', () => {
    // A catalogue listing one message three times is three rows a translator has
    // to notice are the same row.
    const twice = document_({
      model: {
        fields: [
          { key: 'a', type: 'text', label: { $t: 'shared' } },
          { key: 'b', type: 'text', label: { $t: 'shared' } },
        ],
      },
    })

    expect(referencedMessages(twice)).toEqual(['shared'])
  })

  test('and nothing from a document with no references at all', () => {
    // A guard on the guard: a walker that returned every string it met would make
    // every case above pass and fill the pane with labels nobody can translate.
    expect(
      referencedMessages({
        specVersion: '1',
        id: 'plain',
        title: 'Plain',
        model: { fields: [{ key: 'a', type: 'text', label: 'Not a reference' }] },
      }),
    ).toEqual([])
  })

  test('and does not mistake a nested object for one, or stop at the first it finds', () => {
    /*
     * The walker returns as soon as a node has a `$t`, which is right — a message
     * reference has nothing inside it worth walking. What it must NOT do is stop
     * walking its siblings, which is what a `return` one level too high would do:
     * the first translated label would be the only one in the catalogue.
     */
    const nested = referencedMessages({
      specVersion: '1',
      id: 'nested',
      title: 'Nested',
      model: {
        fields: [
          {
            key: 'group',
            type: 'group',
            label: { $t: 'group.label' },
            fields: [
              { key: 'inner', type: 'text', label: { $t: 'inner.label' } },
              { key: 'after', type: 'text', label: { $t: 'after.label' } },
            ],
          },
        ],
      },
    })

    expect(nested).toEqual(['group.label', 'inner.label', 'after.label'])
  })
})

describe('how typed text is narrowed', () => {
  test('a boolean typed as a word is compared as a boolean', () => {
    /*
     * `true` in a text box is a string, and comparing a checkbox to `"true"` is a
     * CEL type error caught at save time. The narrowing happens where the author
     * can still see what happened rather than at publish — and the existing cases
     * covered the number path and not this one.
     */
    expect(conditionOf({ field: 'agreed', operator: 'is', text: 'true' }).value).toBe(true)
    expect(conditionOf({ field: 'agreed', operator: 'is', text: 'false' }).value).toBe(false)
  })

  test('and empty text stays a string rather than becoming zero', () => {
    // `Number('')` is 0, so a nullish check would compare an empty box to the
    // number zero — which is a comparison that quietly succeeds against any
    // field whose answer is 0.
    expect(conditionOf({ field: 'qty', operator: 'is', text: '' }).value).toBe('')
  })

  test('and text that merely starts with digits stays text', () => {
    // `Number('5 apples')` is NaN, so this is the branch that keeps a postcode
    // like `8001 Zurich` a string. Without it the comparison would be against
    // NaN, which is false for everything including itself.
    expect(conditionOf({ field: 'postcode', operator: 'is', text: '8001 Zurich' }).value).toBe('8001 Zurich')
  })
})
