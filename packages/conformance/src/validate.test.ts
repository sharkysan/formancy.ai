import { describe, expect, test } from 'vitest'
import type { ConformanceSchema, Fixture } from './types.js'
import { FixtureError, parseFixture, stepKind, validateFixture } from './validate.js'

const minimal = {
  name: 'a minimal fixture',
  schema: {
    specVersion: '0',
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
  specVersion: '0',
  id: 'nested',
  title: 'Nested',
  model: {
    fields: [
      {
        key: 'details',
        type: 'page',
        label: 'Your details',
        children: [
          { key: 'firstName', type: 'text', label: 'First name' },
          {
            key: 'address',
            type: 'group',
            label: 'Address',
            children: [{ key: 'street', type: 'text', label: 'Street' }],
          },
          {
            key: 'contacts',
            type: 'repeater',
            label: 'Contacts',
            children: [{ key: 'email', type: 'text', label: 'Email' }],
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
    const problems = problemsOf(revise((draft) => (draft['schema'] = { specVersion: '0' })))
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
