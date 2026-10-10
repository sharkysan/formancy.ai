import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'
import { setToken } from './api.js'

/**
 * A form's examples in the admin, kept by the server beside the form (0166).
 *
 * The admin is a deployment's own builder host, so the examples its scenario pane runs are
 * the server's: read when a published form is opened, saved back when one is removed or a
 * draft is kept, drafted through the server's model when it has one, and run by the publish,
 * whose note names each that stops holding.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => <textarea aria-label="Schema" readOnly value={value ?? ''} />,
}))

const contact = (cel: string) => ({
  specVersion: '4',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', required: true },
      { key: 'country', type: 'text', label: 'Country' },
      { key: 'canton', type: 'text', label: 'Canton' },
    ],
  },
  logic: { rules: [{ target: 'canton', kind: 'visible', cel }] },
})

const ASKS_FOR_A_CANTON = { name: 'Switzerland asks for a canton', changes: { country: 'CH' }, valid: true, visible: { canton: true } }
const GERMANY_DOES_NOT = { name: 'Germany does not', changes: { country: 'DE' }, valid: true, visible: { canton: false } }
const FRANCE_DOES_NOT = { name: 'France does not', changes: { country: 'FR' }, valid: true, visible: { canton: false } }
/** Fictional: the one required answer every example starts from. */
const SAMPLE = { email: 'jane@example.ch' }

/** The contact form with a rule that only the server runs: a German address is refused. */
const swissOnly = (runsOn: 'server' | 'client') => ({
  ...contact('country == "CH"'),
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'email', kind: 'validate', cel: 'email.endsWith(".ch")', code: 'swiss_only', runsOn },
    ],
  },
})
const GERMAN_ADDRESS_REFUSED = {
  name: 'A German address is refused',
  changes: { email: 'jane@example.de' },
  valid: false,
  errors: { email: ['swiss_only'] },
}

interface Call {
  readonly url: string
  readonly method: string
  readonly body: unknown
}

/** A request held open: answered when released, or failed as a server that cannot be reached fails it. */
interface Hold {
  release(): void
  fail(): void
}

/** What the server answers with; a test changes it to have the server change its mind. */
interface Answers {
  /** Refuse a save with a 422, or fail it as an unreachable server does. */
  refuseSave: boolean | 'unreachable'
  /** Answer the examples' GET as a viewer is answered, or not at all. */
  refuseRead: boolean | 'unreachable'
}

interface Served {
  readonly calls: Call[]
  readonly answers: Answers
  /** The examples the server keeps now: what it started with, or the last save it took. */
  stored(): unknown
  /** Hold the next PUT of the examples that has no hold yet. */
  holdNextSave(): Hold
  /** Hold the next GET of the examples. */
  holdNextRead(): Hold
}

function hold(): Hold & { readonly reached: Promise<void> } {
  let release: () => void = () => undefined
  let fail: () => void = () => undefined
  const reached = new Promise<void>((resolve, reject) => {
    release = resolve
    fail = () => reject(new TypeError('Failed to fetch'))
  })
  return { reached, release, fail }
}

/**
 * The server: the contact form published, its examples kept, and a model or none. Every
 * request is recorded. A PUT of the examples that is not refused is kept, and a GET answers
 * with what is kept, so a test can compare the screen with the server.
 */
function serve({
  form = contact('country == "CH"'),
  model,
  answer,
  examples = { scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT], sample: SAMPLE },
  refuseSave = false,
  refuseRead = false,
  published = true,
  publishWarnings = [],
}: {
  form?: unknown
  model?: { provider: string; model: string }
  answer?: unknown
  examples?: unknown
  refuseSave?: Answers['refuseSave']
  refuseRead?: Answers['refuseRead']
  published?: boolean
  publishWarnings?: string[]
} = {}): Served {
  const calls: Call[] = []
  const answers: Answers = { refuseSave, refuseRead }
  let stored = examples
  const saveHolds: Array<ReturnType<typeof hold>> = []
  let readHold: ReturnType<typeof hold> | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
      calls.push({ url: input, method, body })
      const json = (value: unknown, status = 200): Response =>
        new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

      if (input === '/api/model') return model === undefined ? json({ error: 'model_not_configured' }, 404) : json(model)
      if (input === '/api/model/complete') return json({ text: JSON.stringify(answer) })
      if (input === '/api/forms' && method === 'GET') {
        return json({ forms: published ? [{ path: 'contact', title: 'Contact us', version: 1, schemaHash: 'hash-1' }] : [] })
      }
      if (input === '/api/forms' && method === 'POST') {
        return json({ version: 2, schemaHash: 'hash-2', ...(publishWarnings.length === 0 ? {} : { warnings: publishWarnings }) }, 201)
      }
      if (input === '/api/f/contact/examples' && method === 'GET') {
        const waiting = readHold
        readHold = undefined
        if (waiting !== undefined) await waiting.reached
        if (answers.refuseRead === 'unreachable') throw new TypeError('Failed to fetch')
        return answers.refuseRead ? json({ error: 'forbidden', action: 'form.publish' }, 403) : json(stored)
      }
      if (input === '/api/f/contact/examples' && method === 'PUT') {
        const waiting = saveHolds.shift()
        if (waiting !== undefined) await waiting.reached
        if (answers.refuseSave === 'unreachable') throw new TypeError('Failed to fetch')
        if (answers.refuseSave) return json({ error: 'invalid_examples', problems: ['Example 1 has no name.'] }, 422)
        stored = body
        return json(body)
      }
      if (input === '/api/f/contact') {
        return published ? json({ version: 1, schemaHash: 'hash-1', schema: form }) : json({ error: 'unknown_form' }, 404)
      }
      return json({ error: 'not_here' }, 404)
    }),
  )
  return {
    calls,
    answers,
    stored: () => stored,
    holdNextSave() {
      const held = hold()
      saveHolds.push(held)
      return held
    },
    holdNextRead() {
      const held = hold()
      readHold = held
      return held
    },
  }
}

const saves = (calls: readonly Call[]): unknown[] =>
  calls.filter((call) => call.url === '/api/f/contact/examples' && call.method === 'PUT').map((call) => call.body)

async function open(path = 'Contact us'): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  if (path === 'Contact us') {
    await user.click(await screen.findByRole('button', { name: /Contact us/ }, { timeout: 5000 }))
  } else {
    await user.type(await screen.findByLabelText(/New form path/), `${path}{Enter}`)
  }
  await screen.findByRole('button', { name: 'Publish' })
  return user
}

const scenarioPane = (): Promise<HTMLElement> => screen.findByRole('region', { name: 'Scenarios' }, { timeout: 5000 })

/** The examples the scenario pane lists, by name. */
const shown = (): string[] =>
  within(screen.getByRole('region', { name: 'Scenarios' }))
    .queryAllByRole('button', { name: /^Remove / })
    .map((button) => (button.textContent ?? '').replace(/^Remove /, ''))

/** The examples the server keeps, by name. */
const names = (examples: unknown): string[] => (examples as { scenarios: Array<{ name: string }> }).scenarios.map((one) => one.name)

beforeEach(() => {
  sessionStorage.clear()
  setToken('t_abc')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the examples the server keeps', () => {
  test('are listed in the build tab and run against the form, from their sample', async () => {
    // Kept on the server and drawn nowhere, they would check nothing anybody sees until a
    // publish named one. Run from the sample, or the required email fails every one.
    serve()
    await open()
    const pane = await scenarioPane()
    expect(within(pane).getByText('Switzerland asks for a canton')).toBeTruthy()
    expect(within(pane).getByText('Germany does not')).toBeTruthy()
    expect(within(pane).getByRole('status').textContent).toContain('All 2 scenarios hold.')
  })

  test('are run as the publish runs them, on the server’s side', async () => {
    // A rule only the server runs refuses what the example says it refuses. Run as a browser
    // would, the pane would call it failing while the publish called it holding.
    serve({ form: swissOnly('server'), examples: { scenarios: [ASKS_FOR_A_CANTON, GERMAN_ADDRESS_REFUSED], sample: SAMPLE } })
    await open()
    expect(within(await scenarioPane()).getByRole('status').textContent).toContain('All 2 scenarios hold.')
  })

  test('removing one saves the list without it, and keeps the sample', async () => {
    // Removed on the screen and still on the server, it would warn at the next publish about
    // an example the person had decided against.
    const { calls } = serve()
    const user = await open()
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))

    await waitFor(() => expect(saves(calls)).toEqual([{ scenarios: [ASKS_FOR_A_CANTON], sample: SAMPLE }]))
    expect(within(await scenarioPane()).queryByText('Germany does not')).toBeNull()
  })

  test('two removals reach the server in the order they were made', async () => {
    // Sent side by side, the first could land last and put back the example the second
    // removed — on the server, where the publish reads it, and not on the screen.
    const served = serve()
    const user = await open()
    const first = served.holdNextSave()
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Switzerland asks for a canton' }))

    await waitFor(() => expect(saves(served.calls)).toHaveLength(1))
    first.release()
    await waitFor(() => expect(saves(served.calls)).toHaveLength(2))
    expect(saves(served.calls)).toEqual([
      { scenarios: [ASKS_FOR_A_CANTON], sample: SAMPLE },
      { scenarios: [], sample: SAMPLE },
    ])
  })

  test('a save the server refuses says so, and the list is the server’s again', async () => {
    // A removal that silently did not happen would leave the screen and the publish
    // disagreeing about what the form is checked against.
    const { calls } = serve({ refuseSave: true })
    const user = await open()
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))

    expect(await screen.findByText(/The examples could not be saved: Example 1 has no name\./)).toBeTruthy()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Scenarios' })).getByText('Germany does not')).toBeTruthy())
    expect(calls.filter((call) => call.url === '/api/f/contact/examples' && call.method === 'GET').length).toBeGreaterThan(1)
  })

  test('a save that fails sends none of the changes queued behind it, and the screen is the server’s list', async () => {
    // Each change queued behind a failed save was made on a list the server never took. Sent
    // anyway, it lands after the list has been read again: the screen shows the server's old
    // list, the server keeps one nobody saw, and that one is what the publish runs.
    const served = serve({ examples: { scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT, FRANCE_DOES_NOT], sample: SAMPLE } })
    const user = await open()
    const first = served.holdNextSave()
    const second = served.holdNextSave()
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Switzerland asks for a canton' }))
    await waitFor(() => expect(saves(served.calls)).toHaveLength(1))

    first.fail()
    expect(await screen.findByText(/The examples could not be saved: Failed to fetch\./)).toBeTruthy()
    await waitFor(() => expect(shown()).toEqual(names(served.stored())))
    second.release()

    await waitFor(() => expect(shown()).toEqual([ASKS_FOR_A_CANTON.name, GERMANY_DOES_NOT.name, FRANCE_DOES_NOT.name]))
    expect(saves(served.calls)).toHaveLength(1)
    expect(names(served.stored())).toEqual(shown())

    // And a change made on the list the server gave back is saved: a failed save does not stop
    // saving for good.
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove France does not' }))
    await waitFor(() => expect(names(served.stored())).toEqual([ASKS_FOR_A_CANTON.name, GERMANY_DOES_NOT.name]))
    expect(shown()).toEqual(names(served.stored()))
  })

  test('nor one made while the server’s list is being read again', async () => {
    // Made on the list the failed save left on the screen, and sent once the read was in, it
    // would replace on the server the list the screen had just been given.
    const served = serve({ examples: { scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT, FRANCE_DOES_NOT], sample: SAMPLE } })
    const user = await open()
    const save = served.holdNextSave()
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))
    await waitFor(() => expect(saves(served.calls)).toHaveLength(1))
    const read = served.holdNextRead()
    save.fail()
    await waitFor(() => expect(served.calls.filter((call) => call.url === '/api/f/contact/examples' && call.method === 'GET')).toHaveLength(2))

    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Switzerland asks for a canton' }))
    read.release()

    expect(await screen.findByText(/The examples could not be saved/)).toBeTruthy()
    await waitFor(() => expect(shown()).toEqual([ASKS_FOR_A_CANTON.name, GERMANY_DOES_NOT.name, FRANCE_DOES_NOT.name]))
    expect(saves(served.calls)).toHaveLength(1)
    expect(names(served.stored())).toEqual(shown())
  })

  test('a save and a read again that both cannot reach the server leave the list it last kept, and say so', async () => {
    // The server gone after the form was opened, the commonest reason a save fails. Cleared
    // by the failed read, the whole pane went without a word and stayed gone.
    const served = serve()
    const user = await open()
    await scenarioPane()
    served.answers.refuseSave = 'unreachable'
    served.answers.refuseRead = 'unreachable'
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))

    expect(await screen.findByText(/The examples could not be saved: Failed to fetch\. Nor could the server’s list be read again/)).toBeTruthy()
    expect(shown()).toEqual([ASKS_FOR_A_CANTON.name, GERMANY_DOES_NOT.name])
  })

  test('a save whose read again the server refuses says why the list went', async () => {
    // The person's role changed, or the form went, between opening it and saving. The list is
    // not drawn over examples that could not be saved; the sentence is what is left to read.
    const served = serve({ refuseSave: true })
    const user = await open()
    await scenarioPane()
    served.answers.refuseRead = true
    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))

    expect(await screen.findByText(/The examples could not be saved: Example 1 has no name\./)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Scenarios' })).toBeNull()
  })

  test('what the server keeps and could not read as an example is named, and the build tab stays usable', async () => {
    // A row edited around the server. Handed on as an example, the pane ran it as it drew, the
    // runner threw, and the whole admin went: the form could not be opened even to remove it.
    // The server leaves it out and says why; drawn nowhere, it would go at the next save unsaid.
    const unreadable = 'Example 3 ("Hand-edited") has no "changes": the answers it sets, by field.'
    const { calls } = serve({
      examples: { scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT], sample: SAMPLE, unreadable: [unreadable] },
    })
    const user = await open()
    await scenarioPane()
    expect(screen.getByText(/Example 3 \("Hand-edited"\) has no "changes"/).textContent).toMatch(/next change saved here/)
    expect(shown()).toEqual([ASKS_FOR_A_CANTON.name, GERMANY_DOES_NOT.name])

    await user.click(within(await scenarioPane()).getByRole('button', { name: 'Remove Germany does not' }))
    await waitFor(() => expect(saves(calls)).toEqual([{ scenarios: [ASKS_FOR_A_CANTON], sample: SAMPLE }]))
    expect(screen.queryByText(/Hand-edited/)).toBeNull()
  })

  test('a form never published has nowhere to keep them, and says so', async () => {
    // Examples are kept beside a form the server has; offering a list that could not be
    // saved would lose what was written in it.
    const { calls } = serve({ published: false })
    await open('new-form')
    expect(await screen.findByText(/Examples are kept on the server once this form is published/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Scenarios' })).toBeNull()
    expect(calls.some((call) => call.url.endsWith('/examples'))).toBe(false)
  })

  test('are drawn nowhere when the server will not show them', async () => {
    // A viewer is refused them (403). An empty list drawn instead would invite writing
    // examples that cannot be saved.
    const { calls } = serve({ refuseRead: true })
    await open()
    await waitFor(() => expect(calls.some((call) => call.url === '/api/f/contact/examples')).toBe(true))
    await screen.findByRole('button', { name: 'Undo' })
    expect(screen.queryByRole('region', { name: 'Scenarios' })).toBeNull()
  })
  test('nor when they cannot be read at all', async () => {
    // The server gone between opening the form and reading its examples. Left unanswered,
    // the failure is an unhandled rejection, and the pane waits for a list that never comes.
    const { calls } = serve({ refuseRead: 'unreachable' })
    await open()
    await waitFor(() => expect(calls.some((call) => call.url === '/api/f/contact/examples')).toBe(true))
    await screen.findByRole('button', { name: 'Undo' })
    expect(screen.queryByRole('region', { name: 'Scenarios' })).toBeNull()
  })
})

describe('drafting examples', () => {
  test('is not offered when the server has no model, and nothing is asked', async () => {
    // A drafting box whose every run ends "could not be reached" is worse than none.
    const { calls } = serve()
    await open()
    await scenarioPane()
    expect(screen.queryByLabelText(/What should this form do/)).toBeNull()
    expect(calls.some((call) => call.url === '/api/model/complete')).toBe(false)
  })

  test('asks the server’s model for the scenarios kind, and a draft kept is saved', async () => {
    // Through this server and nothing else: the key is there. Kept, the draft is one of the
    // form's examples, so the next publish runs it.
    const draft = { name: 'France does not', changes: { country: 'FR' }, valid: true, visible: { canton: false } }
    const { calls } = serve({ model: { provider: 'anthropic', model: 'claude-test' }, answer: { scenarios: [draft] } })
    const user = await open()
    const pane = await scenarioPane()
    // Said before anybody asks: where the request goes, and what of the form it carries.
    const note = screen.getByText(/the names of its examples/)
    expect(note.textContent).toContain('Anthropic’s claude-test')

    await user.type(within(pane).getByLabelText(/What should this form do/), 'Only Switzerland asks for a canton.')
    await user.click(within(pane).getByRole('button', { name: 'Draft examples' }))
    await user.click(await within(pane).findByRole('button', { name: 'Keep France does not' }, { timeout: 5000 }))

    const turns = calls.filter((call) => call.url === '/api/model/complete')
    expect(turns).toHaveLength(1)
    expect(turns[0]?.body).toMatchObject({ kind: 'scenarios' })
    expect(turns[0]?.body).not.toHaveProperty('system')
    await waitFor(() =>
      expect(saves(calls)).toEqual([{ scenarios: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT, draft], sample: SAMPLE }]),
    )
    for (const call of calls) expect(call.url.startsWith('/api/'), call.url).toBe(true)
  })
})

describe('what the examples say elsewhere in the build tab', () => {
  test('a model’s proposal is reviewed against them before Apply', async () => {
    // The rule turned round by a model: the review names the example it breaks while the
    // person is deciding, not after it has landed (0159).
    serve({ model: { provider: 'anthropic', model: 'claude-test' }, answer: contact('country != "CH"') })
    const user = await open()
    await user.type(await screen.findByLabelText(/Describe the form/), 'Show the canton outside Switzerland.')
    await user.click(screen.getByRole('button', { name: 'Write it' }))

    expect(
      await screen.findByRole('region', { name: /would stop holding: Switzerland asks for a canton/ }, { timeout: 5000 }),
    ).toBeTruthy()
  })

  test('and the review runs them as the publish will', async () => {
    // A rule moved to the browser stops refusing what the server is sent. Run as a browser
    // would, the example failed before and after, and the review said nothing about it.
    serve({
      form: swissOnly('server'),
      examples: { scenarios: [GERMAN_ADDRESS_REFUSED], sample: SAMPLE },
      model: { provider: 'anthropic', model: 'claude-test' },
      answer: swissOnly('client'),
    })
    const user = await open()
    await user.type(await screen.findByLabelText(/Describe the form/), 'Check the address in the browser.')
    await user.click(screen.getByRole('button', { name: 'Write it' }))

    expect(
      await screen.findByRole('region', { name: /would stop holding: A German address is refused/ }, { timeout: 5000 }),
    ).toBeTruthy()
  })

  test('the publish note names an example the publish says stops holding', async () => {
    // Published, and told: the warning is the server's, and a note that dropped it, or drew
    // it as a refusal, would have the person press Publish again or never look.
    const warning =
      'The example "Switzerland asks for a canton" held against version 1 and does not hold against version 2: "canton": expected to be visible, and it is hidden.'
    serve({ publishWarnings: [warning] })
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    const note = await screen.findByRole('status', { name: 'Publish warnings' })
    expect(note.textContent).toContain('Switzerland asks for a canton')
    expect(screen.getByText('Published version 2.')).toBeTruthy()
  })
})
