import { describe, expect, test } from 'vitest'
import type { RendererDriver, SubmitResult } from './driver.js'
import {
  AccessibilityAssertionError,
  ConformanceAssertionError,
  assertFixtureResult,
  runFixture,
  runSuite,
  structuralEqual,
} from './runner.js'
import type { ConformanceSchema, Fixture, JsonValue } from './types.js'
import { createFakeDriver } from './testing/fake-driver.js'

const contact: ConformanceSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'country', type: 'select', label: 'Country' },
      { key: 'canton', type: 'text', label: 'Canton', required: true },
      { key: 'email', type: 'text', label: 'Email', required: true },
    ],
  },
}

/** `canton` is shown only for Switzerland, which is what the cases below drive. */
function swissDriver(crashOn?: readonly ['fill'] | readonly ['visibleFields']) {
  return createFakeDriver({
    visibleWhen: { canton: { path: 'country', equals: 'CH' } },
    ...(crashOn === undefined ? {} : { crashOn }),
  })
}

const passing: Fixture = {
  name: 'canton is asked for only in Switzerland',
  schema: contact,
  steps: [
    { set: { country: 'CH' } },
    { expectVisible: ['canton'] },
    { set: { canton: 'Zürich', email: 'ada@example.com' } },
    { expectValue: { canton: 'Zürich' } },
    { submit: true },
    { expectSubmit: { status: 'accepted' } },
  ],
}

describe('runFixture', () => {
  test('reports a fixture whose every step holds as passed', async () => {
    const result = await runFixture(passing, swissDriver())

    expect(result.status).toBe('passed')
    expect(result.fixture).toBe(passing.name)
    expect(result.steps.map((step) => step.status)).toEqual(Array(6).fill('passed'))
    expect(result.failure).toBeUndefined()
  })

  test('reports a wrong expectation as a failure naming the step index and the fixture', async () => {
    const wrong: Fixture = {
      name: 'a deliberately wrong case',
      schema: contact,
      steps: [
        { set: { country: 'US' } },
        { expectVisible: ['canton'] },
        { set: { email: 'ada@example.com' } },
      ],
    }

    const result = await runFixture(wrong, swissDriver())

    expect(result.status).toBe('failed')
    expect(result.failure?.index).toBe(1)
    expect(result.failure?.kind).toBe('expectVisible')
    expect(result.failure?.fixture).toBe('a deliberately wrong case')
    expect(result.failure?.expected).toEqual(['canton'])
    expect(result.failure?.message).toContain('a deliberately wrong case')
    expect(result.failure?.message).toContain('step 1')
  })

  test('stops at the first failure, because a cascade of consequences hides the cause', async () => {
    const wrong: Fixture = {
      name: 'a deliberately wrong case',
      schema: contact,
      steps: [
        { expectVisible: ['canton'] },
        { set: { email: 'ada@example.com' } },
        { expectValue: { email: 'ada@example.com' } },
      ],
    }

    const result = await runFixture(wrong, swissDriver())

    expect(result.steps.map((step) => step.status)).toEqual(['failed', 'skipped', 'skipped'])
  })

  test('attaches the accessible tree to a failure, for whoever has to debug it', async () => {
    const wrong: Fixture = {
      name: 'a deliberately wrong case',
      schema: contact,
      steps: [{ set: { email: 'ada@example.com' } }, { expectValue: { email: 'grace@example.com' } }],
    }

    const result = await runFixture(wrong, swissDriver())

    expect(result.failure?.ariaSnapshot).toContain('Email')
  })

  test('reports a driver that throws as a crash, not as a failed assertion', async () => {
    const result = await runFixture(passing, swissDriver(['fill']))

    expect(result.status).toBe('crashed')
    expect(result.failure).toBeUndefined()
    expect(result.crash?.phase).toBe('step')
    expect(result.crash?.stepIndex).toBe(0)
    expect(result.crash?.message).toContain('fake driver exploded in fill()')
    expect(result.crash?.error).toBeInstanceOf(Error)
  })

  test('reports a driver that throws on mount as a crash before any step', async () => {
    const driver = createFakeDriver({ crashOn: ['mount'] })
    const result = await runFixture(passing, driver)

    expect(result.status).toBe('crashed')
    expect(result.crash?.phase).toBe('mount')
    expect(result.crash?.stepIndex).toBeUndefined()
    expect(result.steps).toEqual([])
  })

  test('never throws past the caller when an assertion fails', async () => {
    const wrong: Fixture = {
      name: 'a deliberately wrong case',
      schema: contact,
      steps: [{ expectVisible: ['canton'] }],
    }

    await expect(runFixture(wrong, swissDriver())).resolves.toMatchObject({ status: 'failed' })
  })

  test('throws on a malformed fixture, because that is a bug in the suite, not a failure', async () => {
    const malformed = { name: 'broken', schema: contact, steps: [{ expectVisable: [] }] }

    await expect(runFixture(malformed as unknown as Fixture, swissDriver())).rejects.toThrow(
      /Invalid fixture/,
    )
  })

  test('unmounts the driver even after a failure, so the next case starts clean', async () => {
    const calls: string[] = []
    const failing: Fixture = {
      name: 'a deliberately wrong case',
      schema: contact,
      steps: [{ expectVisible: ['canton'] }],
    }
    const spied = {
      ...swissDriver(),
      unmount: async (): Promise<void> => {
        calls.push('unmount')
      },
    }

    const result = await runFixture(failing, spied)

    expect(result.status).toBe('failed')
    expect(calls).toEqual(['unmount'])
  })

  test('a teardown throw after a failed step reports both, and the failure stays the verdict', async () => {
    const failing: Fixture = {
      name: 'a deliberately wrong case',
      schema: contact,
      steps: [{ expectVisible: ['canton'] }],
    }
    const spied = {
      ...swissDriver(),
      unmount: async (): Promise<void> => {
        throw new Error('container was already gone')
      },
    }

    const result = await runFixture(failing, spied)

    expect(result.status).toBe('failed')
    expect(result.failure?.kind).toBe('expectVisible')
    expect(result.teardownError?.phase).toBe('unmount')
    expect(result.teardownError?.message).toContain('container was already gone')
    // What a test framework then throws is the assertion, never the teardown
    // noise: a renderer author must see WHY the case failed.
    expect(() => assertFixtureResult(result)).toThrow(ConformanceAssertionError)
  })

  test('a teardown throw after a clean run is still a crash, because a passing case may not leak', async () => {
    const spied = {
      ...swissDriver(),
      unmount: async (): Promise<void> => {
        throw new Error('container was already gone')
      },
    }

    const result = await runFixture(passing, spied)

    expect(result.status).toBe('crashed')
    expect(result.crash?.phase).toBe('unmount')
  })

  test('passes initialValues through to mount()', async () => {
    const prefilled: Fixture = {
      name: 'prefilled',
      schema: contact,
      initialValues: { email: 'ada@example.com' },
      steps: [{ expectValue: { email: 'ada@example.com' } }],
    }

    const result = await runFixture(prefilled, createFakeDriver())

    expect(result.status).toBe('passed')
  })
})

describe('assertion equality is total', () => {
  test('a driver answering undefined is a failure with expected and actual, never a crash', async () => {
    const wrong: Fixture = {
      name: 'undefined answer',
      schema: contact,
      steps: [{ expectValue: { email: 'ada@example.com' } }],
    }
    const spied = {
      ...createFakeDriver(),
      valueOf: async (): Promise<JsonValue> => undefined as unknown as JsonValue,
    }

    const result = await runFixture(wrong, spied)

    expect(result.status).toBe('failed')
    expect(result.crash).toBeUndefined()
    expect(result.failure?.expected).toEqual({ email: 'ada@example.com' })
    expect(result.failure?.actual).toEqual({ email: undefined })
  })

  test('an expected null payload does not match a submit that returned none', async () => {
    const wrong: Fixture = {
      name: 'null is not nothing',
      schema: contact,
      steps: [{ submit: true }, { expectSubmit: { status: 'accepted', data: null } }],
    }
    const spied = {
      ...createFakeDriver(),
      submit: async (): Promise<SubmitResult> => ({ status: 'accepted', messages: [] }),
    }

    const result = await runFixture(wrong, spied)

    expect(result.status).toBe('failed')
    expect(result.failure?.kind).toBe('expectSubmit')
  })

  describe('structuralEqual', () => {
    test('treats NaN as equal to NaN, as an assertion comparator must', () => {
      expect(structuralEqual(Number.NaN, Number.NaN)).toBe(true)
      expect(structuralEqual({ deep: [Number.NaN] }, { deep: [Number.NaN] })).toBe(true)
      expect(structuralEqual(Number.NaN, 0)).toBe(false)
    })

    test('compares the infinities as ordinary values', () => {
      expect(structuralEqual(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(true)
      expect(structuralEqual(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBe(false)
    })

    test('distinguishes null from undefined at every level, including the top', () => {
      expect(structuralEqual(null, undefined)).toBe(false)
      expect(structuralEqual({ a: null }, { a: undefined })).toBe(false)
      expect(structuralEqual([null], [undefined])).toBe(false)
      expect(structuralEqual(undefined, undefined)).toBe(true)
    })

    test('distinguishes an undefined-valued key from an absent one', () => {
      expect(structuralEqual({ a: undefined }, {})).toBe(false)
      expect(structuralEqual({ a: undefined }, { a: undefined })).toBe(true)
    })

    test('compares structures without regard to key order', () => {
      expect(structuralEqual({ a: 1, b: [2, { c: 3 }] }, { b: [2, { c: 3 }], a: 1 })).toBe(true)
      expect(structuralEqual({ a: 1 }, { a: 2 })).toBe(false)
      expect(structuralEqual([1, 2], [2, 1])).toBe(false)
    })
  })
})

describe('per-step assertions', () => {
  test('expectHidden fails naming exactly the paths that are wrongly on screen', async () => {
    const wrong: Fixture = {
      name: 'hidden means hidden',
      schema: contact,
      steps: [{ set: { country: 'CH' } }, { expectHidden: ['canton', 'email'] }],
    }

    const result = await runFixture(wrong, swissDriver())

    expect(result.status).toBe('failed')
    expect(result.failure?.actual).toEqual(['canton', 'email'])
  })

  test('expectHidden passes for a field the driver does not show', async () => {
    const fixture: Fixture = {
      name: 'canton hidden outside Switzerland',
      schema: contact,
      steps: [{ set: { country: 'US' } }, { expectHidden: ['canton'] }],
    }

    expect((await runFixture(fixture, swissDriver())).status).toBe('passed')
  })

  const wizard: ConformanceSchema = {
    specVersion: '1',
    id: 'wizard',
    title: 'Two pages',
    model: {
      fields: [
        { key: 'one', type: 'page', label: 'One', fields: [{ key: 'a', type: 'text', label: 'A' }] },
        { key: 'two', type: 'page', label: 'Two', fields: [{ key: 'b', type: 'text', label: 'B' }] },
      ],
    },
  }

  test('expectPage follows the wizard across next', async () => {
    const fixture: Fixture = {
      name: 'pages',
      schema: wizard,
      steps: [{ expectPage: 'one' }, { next: true }, { expectPage: 'two' }],
    }

    expect((await runFixture(fixture, createFakeDriver())).status).toBe('passed')
  })

  test('expectPage fails with the page the wizard is actually on', async () => {
    const wrong: Fixture = {
      name: 'pages',
      schema: wizard,
      steps: [{ expectPage: 'two' }],
    }

    const result = await runFixture(wrong, createFakeDriver())

    expect(result.status).toBe('failed')
    expect(result.failure?.expected).toBe('two')
    expect(result.failure?.actual).toBe('one')
  })

  test('expectSubmit compares the payload by deep equality', async () => {
    const fixture: Fixture = {
      name: 'payload',
      schema: contact,
      steps: [
        { set: { country: 'CH', canton: 'Zürich', email: 'ada@example.com' } },
        { submit: true },
        {
          expectSubmit: {
            status: 'accepted',
            data: { country: 'CH', canton: 'Zürich', email: 'ada@example.com' },
          },
        },
      ],
    }

    expect((await runFixture(fixture, swissDriver())).status).toBe('passed')
  })

  test('expectSubmit fails when the payload differs anywhere', async () => {
    const wrong: Fixture = {
      name: 'payload',
      schema: contact,
      steps: [
        { set: { country: 'CH', canton: 'Zürich', email: 'ada@example.com' } },
        { submit: true },
        {
          expectSubmit: {
            status: 'accepted',
            data: { country: 'CH', canton: 'Zürich', email: 'grace@example.com' },
          },
        },
      ],
    }

    const result = await runFixture(wrong, swissDriver())

    expect(result.status).toBe('failed')
    expect(result.failure?.message).toContain('payload differs')
  })
})

describe('the command grammar', () => {
  /** Records what the runner asked the driver to press, and nothing else. */
  function recordingDriver(): { driver: RendererDriver; pressed: string[] } {
    const pressed: string[] = []
    const driver = createFakeDriver()
    return {
      pressed,
      driver: {
        ...driver,
        activate: async (path: string): Promise<void> => {
          pressed.push(path)
        },
      },
    }
  }

  test('turns wizard and repeater steps into command paths a driver can resolve', async () => {
    const { driver, pressed } = recordingDriver()
    const fixture: Fixture = {
      name: 'commands',
      schema: {
        specVersion: '1',
        id: 'commands',
        title: 'Commands',
        model: {
          fields: [
            {
              key: 'contacts',
              type: 'repeater',
              label: 'Contacts',
              addLabel: 'Add contact',
              removeLabel: 'Remove contact',
              fields: [{ key: 'name', type: 'text', label: 'Name' }],
            },
          ],
        },
      },
      steps: [
        { addItem: 'contacts' },
        { removeItem: { path: 'contacts', index: 1 } },
        { next: true },
        { back: true },
        { activate: 'contacts[0].name' },
      ],
    }

    await runFixture(fixture, driver)

    expect(pressed).toEqual([
      'contacts#add',
      'contacts[1]#remove',
      '#next',
      '#back',
      'contacts[0].name',
    ])
  })
})

describe('message assertions', () => {
  const required: Fixture = {
    name: 'messages',
    schema: contact,
    steps: [
      { set: { country: 'CH' } },
      { submit: true },
      { expectErrors: { canton: ['required'], country: [] } },
    ],
  }

  /** The cases below all need `canton` on screen, so every one sets country first. */
  const inSwitzerland = { set: { country: 'CH' } }

  test('compare the exact set of codes on each listed path', async () => {
    const result = await runFixture(required, swissDriver())

    expect(result.status).toBe('passed')
  })

  test('fail when a path carries a code the fixture did not list', async () => {
    const wrong: Fixture = {
      ...required,
      steps: [inSwitzerland, { submit: true }, { expectErrors: { canton: [] } }],
    }

    const result = await runFixture(wrong, swissDriver())

    expect(result.failure?.actual).toEqual({ canton: ['required'] })
  })

  test('expectNoErrors on a list of paths ignores messages elsewhere', async () => {
    const scoped: Fixture = {
      ...required,
      steps: [inSwitzerland, { submit: true }, { expectNoErrors: ['country'] }],
    }

    expect((await runFixture(scoped, swissDriver())).status).toBe('passed')
  })

  test('expectNoErrors on the whole form catches a message anywhere', async () => {
    const strict: Fixture = {
      ...required,
      steps: [inSwitzerland, { submit: true }, { expectNoErrors: true }],
    }

    const result = await runFixture(strict, swissDriver())

    expect(result.status).toBe('failed')
    expect(result.failure?.actual).toEqual(['canton: required', 'email: required'])
  })
})

describe('runSuite', () => {
  const wrong: Fixture = {
    name: 'a deliberately wrong case',
    schema: contact,
    steps: [{ expectVisible: ['canton'] }],
  }

  test('runs every fixture and counts the outcomes', async () => {
    const suite = await runSuite([passing, wrong], swissDriver())

    expect(suite.results).toHaveLength(2)
    expect(suite.passed).toBe(1)
    expect(suite.failed).toBe(1)
    expect(suite.crashed).toBe(0)
    expect(suite.status).toBe('failed')
  })

  test('keeps going after a crash, so one broken case does not hide the rest', async () => {
    const suite = await runSuite([passing, wrong], swissDriver(['visibleFields']))

    expect(suite.results.map((result) => result.status)).toEqual(['crashed', 'crashed'])
    expect(suite.status).toBe('crashed')
  })

  test('builds a fresh driver per fixture when given a factory', async () => {
    let built = 0

    await runSuite([passing, passing], () => {
      built += 1
      return swissDriver()
    })

    expect(built).toBe(2)
  })

  test('is passed only when every fixture passed', async () => {
    const suite = await runSuite([passing], swissDriver())

    expect(suite.status).toBe('passed')
    expect(suite.report).toContain('1 passed')
  })

  test('survives a malformed fixture in the middle: reported, and the rest still run', async () => {
    const broken = { name: 'broken', schema: contact, steps: [{ expectVisable: [] }] }

    const suite = await runSuite([passing, broken as unknown as Fixture, passing], swissDriver())

    expect(suite.results.map((result) => result.status)).toEqual(['passed', 'crashed', 'passed'])
    expect(suite.crashed).toBe(1)
    expect(suite.results[1]?.crash?.phase).toBe('fixture')
    expect(suite.results[1]?.crash?.message).toContain('Invalid fixture')
    expect(suite.report).toContain('broken')
  })
})

/**
 * The accessibility gate.
 *
 * A conformance run that only checked behaviour would pass a renderer whose
 * markup nobody can use: the fixtures cannot see a missing label, and the
 * driver contract's name-and-role rule catches only the controls a fixture
 * happens to touch. The audit runs on the mounted form and after every step
 * that can change the DOM, because the states worth checking are the ones the
 * form reaches DURING use — an error appearing, a row arriving, a page turning
 * — and those are exactly the states a manual audit never visits.
 */
describe('the accessibility audit', () => {
  const missingLabel = {
    id: 'label',
    impact: 'critical' as const,
    help: 'Form elements must have labels',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/label',
    nodes: ['<input id="canton">'],
  }

  const auditing = (reports: readonly (readonly (typeof missingLabel)[])[]) =>
    createFakeDriver({ visibleWhen: { canton: { path: 'country', equals: 'CH' } }, auditReports: reports })

  test('a clean form passes, and the audit leaves no trace on the result', async () => {
    const result = await runFixture(passing, auditing([[], [], [], []]))

    expect(result.status).toBe('passed')
    expect(result.accessibility).toBeUndefined()
  })

  test('markup that is wrong before anybody touches it fails the case', async () => {
    const result = await runFixture(passing, auditing([[missingLabel]]))

    expect(result.status).toBe('failed')
    // No step index: wrong on arrival is a different report from wrong after a
    // transition, and it points at the renderer rather than at a state change.
    expect(result.accessibility?.afterStep).toBeUndefined()
    expect(result.accessibility?.violations).toEqual([missingLabel])
  })

  test('a form that only breaks once it is used fails at the step that broke it', async () => {
    // Clean on arrival, clean after the first set, broken after the second.
    const result = await runFixture(passing, auditing([[], [], [missingLabel]]))

    expect(result.status).toBe('failed')
    // Steps 0 and 2 are the `set`s; step 1 is an expectation and is not
    // audited, so the third report belongs to step 2.
    expect(result.accessibility?.afterStep).toBe(2)
  })

  test('every assertion can pass and the case still fail', async () => {
    const result = await runFixture(passing, auditing([[], [], [missingLabel]]))

    // The whole point. A renderer cannot conform by behaving correctly.
    expect(result.steps.filter((step) => step.status === 'failed')).toHaveLength(0)
    expect(result.status).toBe('failed')
  })

  test('auditing stops at the first one, but the steps do not', async () => {
    const result = await runFixture(passing, auditing([[missingLabel]]))

    // One violation reported, not the same one at every state after it — and
    // the behaviour assertions still ran, because unusable markup must not
    // hide a conditional that fires backwards. One run, both bugs.
    expect(result.accessibility?.violations).toHaveLength(1)
    expect(result.steps.every((step) => step.status === 'passed')).toBe(true)
  })

  test('the report names the rule, the impact and every offending node', async () => {
    const twoNodes = { ...missingLabel, nodes: ['<input id="canton">', '<input id="email">'] }
    const result = await runFixture(passing, auditing([[twoNodes]]))

    const message = result.accessibility?.message ?? ''
    expect(message).toContain('label')
    expect(message).toContain('[critical]')
    // Both, not the first: one of four unlabelled inputs sends somebody to fix
    // a quarter of the problem.
    expect(message).toContain('<input id="canton">')
    expect(message).toContain('<input id="email">')
    expect(message).toContain('dequeuniversity.com')
  })

  test('a driver with no audit() is not audited, and that is not a failure', async () => {
    // A driver with no DOM — the engine in Node, the server's replay — has
    // nothing to audit, and demanding a stub from it would be asking for a lie.
    const result = await runFixture(passing, swissDriver())

    expect(result.status).toBe('passed')
    expect(result.accessibility).toBeUndefined()
  })

  test('an auditor that throws is a crash, not a violation', async () => {
    const driver = createFakeDriver({
      visibleWhen: { canton: { path: 'country', equals: 'CH' } },
      auditReports: [[]],
      crashOn: ['audit'],
    })

    const result = await runFixture(passing, driver)

    // A broken auditor says nothing about the renderer, and reporting it as a
    // violation would send somebody looking for a label that is already there.
    expect(result.status).toBe('crashed')
    expect(result.crash?.phase).toBe('audit')
  })

  test('a behaviour failure is reported ahead of an audit failure', async () => {
    const wrong: Fixture = {
      name: 'wrong and inaccessible at once',
      schema: contact,
      steps: [{ set: { country: 'US' } }, { expectVisible: ['canton'] }],
    }

    const result = await runFixture(wrong, auditing([[], [missingLabel]]))

    // Both are reported …
    expect(result.failure?.kind).toBe('expectVisible')
    expect(result.accessibility).toBeDefined()
    // … and the behaviour failure is the one that throws, because it is the
    // more actionable of the two.
    expect(() => {
      assertFixtureResult(result)
    }).toThrow(ConformanceAssertionError)
  })

  test('assertFixtureResult throws its own error type for an audit failure', async () => {
    const result = await runFixture(passing, auditing([[missingLabel]]))

    // Its own class, so a CI log can tell the two kinds apart without parsing
    // a message.
    expect(() => {
      assertFixtureResult(result)
    }).toThrow(AccessibilityAssertionError)
  })

  test('the suite report carries the violation, not just the count', async () => {
    const suite = await runSuite([passing], () => auditing([[missingLabel]]))

    expect(suite.failed).toBe(1)
    expect(suite.report).toContain('Form elements must have labels')
  })
})
