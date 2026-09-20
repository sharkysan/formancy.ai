import { describe, expect, test } from 'vitest'
import type { ConformanceSchema, Fixture } from './types.js'
import { FixtureError, parseFixture, stepKind, validateFixture } from './validate.js'

const minimal = {
  name: 'a minimal fixture',
  schema: {
    specVersion: '1',
    id: 'contact',
    title: 'Contact us',
    model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
  },
  steps: [{ set: { email: 'ada@example.com' } }],
}

/** JSON round-trip rather than structuredClone: no Node or DOM globals, and a
 *  fixture is JSON by definition. */
function revise(edit: (draft: Record<string, unknown>) => void): unknown {
  const draft = JSON.parse(JSON.stringify(minimal)) as Record<string, unknown>
  edit(draft)
  return draft
}
const nested: ConformanceSchema = {
  specVersion: '1',
  id: 'nested',
  title: 'Nested',
  model: {
    fields: [
      {
        key: 'details',
        type: 'page',
        label: 'Your details',
        fields: [
          { key: 'firstName', type: 'text', label: 'First name' },
          {
            key: 'address',
            type: 'group',
            label: 'Address',
            fields: [{ key: 'street', type: 'text', label: 'Street' }],
          },
          {
            key: 'contacts',
            type: 'repeater',
            label: 'Contacts',
            addLabel: 'Add contact',
            removeLabel: 'Remove contact',
            fields: [{ key: 'email', type: 'text', label: 'Email' }],
          },
        ],
      },
    ],
  },
}

describe('parseFixture', () => {
  test('returns the fixture when it is well formed', () => {
    expect(parseFixture(minimal)).toEqual(minimal)
  })

  test('throws a FixtureError naming the fixture and every problem', () => {
    const broken = revise((draft) => {
      draft['steps'] = [{ nonsense: true }, { expectVisible: ['nope'] }]
    })

    const error = (() => {
      try {
        parseFixture(broken)
        return undefined
      } catch (thrown) {
        return thrown
      }
    })()

    expect(error).toBeInstanceOf(FixtureError)
    expect((error as FixtureError).problems).toHaveLength(2)
    expect((error as FixtureError).message).toContain('a minimal fixture')
    expect((error as FixtureError).message).toContain('steps[0]')
    expect((error as FixtureError).message).toContain('steps[1]')
  })
})

describe('validateFixture rejects', () => {
  function problemsOf(value: unknown): string[] {
    return validateFixture(value).map((problem) => `${problem.path}: ${problem.message}`)
  }

  test('a value that is not an object', () => {
    expect(problemsOf('nope')[0]).toContain('$: expected an object')
  })

  test('a missing name', () => {
    expect(problemsOf(revise((draft) => delete draft['name']))).toEqual([
      'name: expected a non-empty string',
    ])
  })

  test('an empty step list, because a fixture that asserts nothing passes for free', () => {
    expect(problemsOf(revise((draft) => (draft['steps'] = [])))).toEqual([
      'steps: expected at least one step',
    ])
  })

  test('a step with no recognised key', () => {
    const problems = problemsOf(revise((draft) => (draft['steps'] = [{ expectVisable: ['email'] }])))
    expect(problems[0]).toContain('steps[0]')
    expect(problems[0]).toContain('expectVisable')
  })

  test('a step carrying two step keys, because its order of effect is undefined', () => {
    const problems = problemsOf(
      revise((draft) => (draft['steps'] = [{ submit: true, expectVisible: ['email'] }])),
    )
    expect(problems[0]).toContain('steps[0]')
    expect(problems[0]).toContain('exactly one')
  })

  test('a schema without the fields array', () => {
    const problems = problemsOf(revise((draft) => (draft['schema'] = { specVersion: '1' })))
    expect(problems).toContain('schema.model: expected an object, got undefined')
  })

  test('a field with an unknown type', () => {
    const problems = problemsOf(
      revise((draft) => {
        draft['schema'] = {
          ...minimal.schema,
          model: { fields: [{ key: 'email', type: 'emale' }] },
        }
      }),
    )
    expect(problems[0]).toContain('schema.model.fields[0].type')
  })

  test('a step referencing a path that no field in the schema has', () => {
    const problems = problemsOf(
      revise((draft) => (draft['steps'] = [{ expectVisible: ['emial'] }])),
    )
    expect(problems).toEqual(['steps[0].expectVisible[0]: no field at path "emial"'])
  })

  test('an expectErrors key that no field in the schema has', () => {
    const problems = problemsOf(
      revise((draft) => (draft['steps'] = [{ expectErrors: { emial: ['required'] } }])),
    )
    expect(problems[0]).toContain('steps[0].expectErrors.emial')
  })

  test('an expectPage naming something that is not a page', () => {
    const problems = problemsOf(revise((draft) => (draft['steps'] = [{ expectPage: 'email' }])))
    expect(problems[0]).toContain('steps[0].expectPage')
  })

  test('an expectSubmit with no submit before it, which would assert on nothing', () => {
    const problems = problemsOf(
      revise((draft) => (draft['steps'] = [{ expectSubmit: { status: 'accepted' } }])),
    )
    expect(problems[0]).toContain('steps[0].expectSubmit')
    expect(problems[0]).toContain('submit')
  })

  test('an initialValues key that no field in the schema has', () => {
    const problems = problemsOf(revise((draft) => (draft['initialValues'] = { emial: 'x' })))
    expect(problems[0]).toContain('initialValues.emial')
  })

  test('an index on a field that is not a repeater, which addresses nothing', () => {
    const problems = problemsOf(revise((draft) => (draft['steps'] = [{ expectVisible: ['email[0]'] }])))
    expect(problems).toEqual(['steps[0].expectVisible[0]: no field at path "email[0]"'])
  })

  /**
   * An expectation with nothing to expect against passes for free forever.
   * `set` and `expectValue` already refuse an empty map; the four below must
   * hold the same line.
   */
  describe('a vacuous assertion, which would certify nothing', () => {
    test('expectVisible with no paths', () => {
      expect(problemsOf(revise((draft) => (draft['steps'] = [{ expectVisible: [] }])))).toEqual([
        'steps[0].expectVisible: expected at least one path',
      ])
    })

    test('expectHidden with no paths', () => {
      expect(problemsOf(revise((draft) => (draft['steps'] = [{ expectHidden: [] }])))).toEqual([
        'steps[0].expectHidden: expected at least one path',
      ])
    })

    test('expectErrors with no paths', () => {
      expect(problemsOf(revise((draft) => (draft['steps'] = [{ expectErrors: {} }])))).toEqual([
        'steps[0].expectErrors: expected at least one path',
      ])
    })

    test('expectNoErrors with an empty path list', () => {
      expect(problemsOf(revise((draft) => (draft['steps'] = [{ expectNoErrors: [] }])))).toEqual([
        'steps[0].expectNoErrors: expected true or at least one path',
      ])
    })
  })

  /**
   * `'toString' in object` walks Object.prototype, so a hostile or mistyped
   * key inherited from there must neither crash the validator (its contract is
   * to return problems, never to throw) nor pass as a known name.
   */
  describe('a key inherited from Object.prototype', () => {
    test('as a step key is a returned problem, not a thrown TypeError', () => {
      const value = revise((draft) => (draft['steps'] = [{ toString: true }]))

      const problems = validateFixture(value)

      expect(problems).toHaveLength(1)
      expect(problems[0]?.message).toContain('unknown step')
    })

    test('as a field type is a problem', () => {
      const problems = problemsOf(
        revise((draft) => {
          draft['schema'] = {
            ...minimal.schema,
            model: { fields: [{ key: 'email', type: 'constructor', label: 'Email' }] },
          }
        }),
      )
      expect(problems[0]).toContain('schema.model.fields[0].type')
    })
  })

  /**
   * A driver reaches a control by role and accessible name, and nothing else —
   * see driver.ts. A fixture without the names is therefore a case no driver
   * can run honestly, so the validator refuses it.
   */
  describe('a fixture a driver cannot reach by accessible name', () => {
    test('a visible leaf field without a label', () => {
      const problems = problemsOf(
        revise((draft) => {
          draft['schema'] = {
            ...minimal.schema,
            model: { fields: [{ key: 'email', type: 'text' }] },
          }
        }),
      )
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain('schema.model.fields[0].label')
    })

    test('hidden and static fields carry no accessible name, so they are exempt', () => {
      const problems = problemsOf(
        revise((draft) => {
          draft['schema'] = {
            ...minimal.schema,
            model: {
              fields: [
                { key: 'email', type: 'text', label: 'Email' },
                { key: 'trackingId', type: 'hidden' },
                { key: 'blurb', type: 'static' },
              ],
            },
          }
        }),
      )
      expect(problems).toEqual([])
    })

    test('an addItem step on a repeater without an addLabel', () => {
      const problems = problemsOf({
        name: 'nested',
        schema: withoutRepeaterLabels(),
        steps: [{ addItem: 'contacts' }],
      })
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain('steps[0].addItem')
      expect(problems[0]).toContain('addLabel')
    })

    test('a removeItem step on a repeater without a removeLabel', () => {
      const problems = problemsOf({
        name: 'nested',
        schema: withoutRepeaterLabels(),
        steps: [{ removeItem: { path: 'contacts', index: 0 } }],
      })
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain('steps[0].removeItem.path')
      expect(problems[0]).toContain('removeLabel')
    })

    /** The nested schema minus the repeater's control labels. */
    function withoutRepeaterLabels(): unknown {
      const draft = JSON.parse(JSON.stringify(nested)) as {
        model: { fields: { fields: Record<string, unknown>[] }[] }
      }
      const page = draft.model.fields[0]
      const contacts = page?.fields[2]
      if (contacts !== undefined) {
        delete contacts['addLabel']
        delete contacts['removeLabel']
      }
      return draft
    }
  })

  /**
   * The pre-spec fixture dialect: `children`, and behaviour inlined on the
   * field. The review proved a `children` schema mounts as an EMPTY form in
   * the engine and passes anyway, so the old spelling must be a loud error
   * rather than an ignored extra key.
   */
  describe('the pre-spec fixture dialect', () => {
    test('a field declaring children instead of fields', () => {
      const problems = problemsOf(
        revise((draft) => {
          draft['schema'] = {
            ...minimal.schema,
            model: {
              fields: [
                {
                  key: 'details',
                  type: 'group',
                  label: 'Details',
                  children: [{ key: 'email', type: 'text', label: 'Email' }],
                },
              ],
            },
          }
        }),
      )
      expect(problems.some((problem) => problem.includes('.children') && problem.includes('fields'))).toBe(
        true,
      )
    })

    test.each(['visibleWhen', 'requiredWhen', 'calculate'])('a field declaring inline %s', (key) => {
      const problems = problemsOf(
        revise((draft) => {
          draft['schema'] = {
            ...minimal.schema,
            model: { fields: [{ key: 'email', type: 'text', label: 'Email', [key]: 'x' }] },
          }
        }),
      )
      expect(problems.some((problem) => problem.includes(key) && problem.includes('logic'))).toBe(true)
    })
  })

  /**
   * The logic section is the spec's, verbatim, so the validator holds it to
   * the spec: a rule aiming at a path the model does not define would run
   * against nothing, and the case would pass while asserting nothing.
   */
  describe('the logic section', () => {
    function withLogic(logic: unknown): unknown {
      return {
        name: 'nested',
        schema: { ...JSON.parse(JSON.stringify(nested)), logic },
        steps: [{ expectVisible: ['firstName'] }],
      }
    }

    test('accepts rules aimed at form-scope and row-scope data paths', () => {
      expect(
        validateFixture(
          withLogic({
            rules: [
              { target: 'address.street', kind: 'visible', cel: "firstName != ''" },
              { target: 'contacts[].email', kind: 'validate', cel: "item.email.contains('@')", code: 'email' },
            ],
          }),
        ),
      ).toEqual([])
    })

    test('rejects a rule whose target is no data path of the model', () => {
      const problems = problemsOf(
        withLogic({ rules: [{ target: 'contacts.email', kind: 'visible', cel: 'true' }] }),
      )
      expect(problems).toEqual([
        'schema.logic.rules[0].target: no field at data path "contacts.email"',
      ])
    })

    test('rejects a row target written with a concrete index, which is a step path, not a rule target', () => {
      const problems = problemsOf(
        withLogic({ rules: [{ target: 'contacts[0].email', kind: 'visible', cel: 'true' }] }),
      )
      expect(problems[0]).toContain('schema.logic.rules[0].target')
    })

    test('rejects a kind that is not one of the five', () => {
      const problems = problemsOf(
        withLogic({ rules: [{ target: 'firstName', kind: 'shown', cel: 'true' }] }),
      )
      expect(problems[0]).toContain('schema.logic.rules[0].kind')
      expect(problems[0]).toContain('visible')
    })

    test('rejects an empty cel expression', () => {
      const problems = problemsOf(withLogic({ rules: [{ target: 'firstName', kind: 'visible', cel: '' }] }))
      expect(problems).toEqual(['schema.logic.rules[0].cel: expected a non-empty CEL expression'])
    })

    test('rejects a code that is not a non-empty string', () => {
      const problems = problemsOf(
        withLogic({ rules: [{ target: 'firstName', kind: 'validate', cel: 'true', code: 7 }] }),
      )
      expect(problems).toEqual(['schema.logic.rules[0].code: expected a non-empty string'])
    })

    test('rejects a logic section that is not an object with rules', () => {
      expect(problemsOf(withLogic('nope'))[0]).toContain('schema.logic')
      expect(problemsOf(withLogic({ rules: 'nope' }))[0]).toContain('schema.logic.rules')
    })

    test('rejects an empty rules array, which says there is behaviour and then has none', () => {
      expect(problemsOf(withLogic({ rules: [] }))[0]).toContain('schema.logic.rules')
    })
  })
})

describe('validateFixture accepts', () => {
  function fixtureWithSteps(steps: readonly unknown[]): unknown {
    return { name: 'nested', schema: nested, steps }
  }

  test('a path through a page, a group and a repeater item', () => {
    expect(
      validateFixture(
        fixtureWithSteps([
          { expectVisible: ['firstName', 'address.street', 'contacts[0].email'] },
          { expectPage: 'details' },
          { addItem: 'contacts' },
          { removeItem: { path: 'contacts', index: 0 } },
          { activate: 'contacts#add' },
          { next: true },
          { back: true },
          { expectNoErrors: true },
          { submit: true },
          { expectSubmit: { status: 'rejected' } },
        ]),
      ),
    ).toEqual([])
  })
})

describe('stepKind', () => {
  test('names the single key of the step, for reporting', () => {
    const fixture: Fixture = parseFixture(minimal)
    expect(fixture.steps.map(stepKind)).toEqual(['set'])
  })
})
