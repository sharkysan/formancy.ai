import { describe, expect, test } from 'vitest'
import type { RendererDriver } from './driver.js'
import { runFixture, runSuite } from './runner.js'
import type { ConformanceSchema, Fixture } from './types.js'
import { createFakeDriver } from './testing/fake-driver.js'

const contact: ConformanceSchema = {
  specVersion: '0',
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
    const driver = swissDriver()
    const spied = {
      ...driver,
      unmount: async (): Promise<void> => {
        calls.push('unmount')
      },
    }

    await runFixture(passing, spied)
    expect(calls).toEqual(['unmount'])
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
        specVersion: '0',
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
              children: [{ key: 'name', type: 'text', label: 'Name' }],
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
})
