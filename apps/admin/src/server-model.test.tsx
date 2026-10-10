import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { declinedAnswer, modelBriefing } from '@formancy/builder-core'
import type { AuthoringPrompt } from '@formancy/builder-core'
import { App } from './app.js'
import { askServerModel, fetchModel, setToken } from './api.js'

/**
 * The deployment's model, as the admin asks it (0165).
 *
 * The key is on the server, so the admin's `AskModel` is a request to it and to nothing
 * else: the prompt pane appears only when the server says it has a model, every turn goes
 * to the server's own route, and no browser request ever names a provider's host. The
 * Translations tab is given the same ask.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => <textarea aria-label="Schema" readOnly value={value ?? ''} />,
}))

const SCHEMA = {
  specVersion: '4',
  id: 'contact',
  title: 'Contact us',
  model: { fields: [{ key: 'email', type: 'text', label: { $t: 'email' } }] },
  i18n: { defaultLocale: 'en', messages: { en: { email: 'Email' }, de: {} } },
}

/** What the model answers through the server: the form with a phone field added. */
const ANSWER = {
  ...SCHEMA,
  model: { fields: [...SCHEMA.model.fields, { key: 'phone', type: 'text', label: 'Phone' }] },
}

interface Call {
  readonly url: string
  readonly method: string
  readonly body: unknown
}

/** The server, with or without a model; every request the page makes is recorded. */
function serve(model: { provider: string; model: string } | undefined, answer: unknown = { text: JSON.stringify(ANSWER) }): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
      calls.push({ url: input, method, body })
      const json = (value: unknown, status = 200): Response =>
        new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

      if (input === '/api/model') {
        return Promise.resolve(model === undefined ? json({ error: 'model_not_configured' }, 404) : json(model))
      }
      if (input === '/api/model/complete') return Promise.resolve(json(answer))
      if (input === '/api/forms' && method === 'GET') {
        return Promise.resolve(json({ forms: [{ path: 'contact', title: 'Contact us', version: 1, schemaHash: 'hash-1' }] }))
      }
      return Promise.resolve(json({ version: 1, schemaHash: 'hash-1', schema: SCHEMA }))
    }),
  )
  return calls
}

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  await user.click(await screen.findByRole('button', { name: /Contact us/ }, { timeout: 5000 }))
  await screen.findByRole('button', { name: 'build' })
  return user
}

beforeEach(() => {
  sessionStorage.clear()
  setToken('t_abc')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the prompt pane', () => {
  test('is not drawn when the server has no model', async () => {
    // Off unless the operator set one: a pane whose every turn ends "could not be
    // reached" is worse than none.
    const calls = serve(undefined)
    await open()
    await waitFor(() => expect(calls.some((call) => call.url === '/api/model')).toBe(true))
    await screen.findByRole('button', { name: 'Publish' })
    expect(screen.queryByLabelText(/Describe the form/)).toBeNull()
  })

  test('is drawn when the server has one, and says where a request goes', async () => {
    // The form leaves for the provider the operator chose; the person asking is told
    // which before they ask, rather than finding out from the operator.
    serve({ provider: 'anthropic', model: 'claude-opus-5' })
    await open()
    expect(await screen.findByLabelText(/Describe the form/)).toBeTruthy()
    expect(screen.getByText(/Anthropic/).textContent).toContain('claude-opus-5')
  })

  test('sends a turn to this server alone, by kind, and never a system part', async () => {
    // The key is on the server. A request to a provider's host from the page would be a
    // key in the browser, or a request without one; and a system part sent along is
    // one the server ignores.
    const calls = serve({ provider: 'openai', model: 'a-model' })
    const user = await open()
    await user.type(await screen.findByLabelText(/Describe the form/), 'Add a phone number.')
    await user.click(screen.getByRole('button', { name: 'Write it' }))

    expect(await screen.findByRole('button', { name: 'Apply these changes' }, { timeout: 5000 })).toBeTruthy()
    const turns = calls.filter((call) => call.url === '/api/model/complete')
    expect(turns).toHaveLength(1)
    expect(turns[0]?.method).toBe('POST')
    expect(turns[0]?.body).toMatchObject({ kind: 'authoring' })
    expect((turns[0]?.body as { user: string }).user).toContain('Add a phone number.')
    expect(turns[0]?.body).not.toHaveProperty('system')
    // Every request the page made went to its own origin's API.
    for (const call of calls) expect(call.url.startsWith('/api/'), call.url).toBe(true)
  })
})

describe('the Translations tab', () => {
  test('asks the same server for a language’s missing messages', async () => {
    // The same ask, so a translation is asked under the server's translation briefing and
    // counted against the same limit, rather than through a second way to the provider.
    const calls = serve(
      { provider: 'xai', model: 'grok-4.7' },
      { text: JSON.stringify({ locale: 'de', defaultLocale: 'en', messages: [{ id: 'email', source: 'Email', target: 'E-Mail' }] }) },
    )
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'translations' }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'de')
    await user.click(await screen.findByRole('button', { name: /Ask a model for the 1 missing message/ }))

    await waitFor(() => expect(calls.filter((call) => call.url === '/api/model/complete')).toHaveLength(1))
    expect(calls.find((call) => call.url === '/api/model/complete')?.body).toMatchObject({ kind: 'translation' })
    expect(within(document.body).getByText(/xAI/).textContent).toContain('grok-4.7')
  })
})

describe('askServerModel', () => {
  const prompt = (system: string): AuthoringPrompt => ({ system, user: 'The request.', attempt: 1, limit: 3 })
  const turn = { onCancel: () => undefined }

  test('refuses a system part formancy did not write, and sends nothing', async () => {
    // The server would answer it under formancy's briefing, which is not what was asked.
    const calls = serve({ provider: 'anthropic', model: 'm' })
    await expect(askServerModel(prompt('You are a poet.'), turn)).rejects.toThrow(/not one formancy makes/)
    expect(calls).toEqual([])
  })

  test('hands a provider’s refusal back as a decline, so the run ends on that turn', async () => {
    // As the model's own `{"declined": …}` would (0158): one turn, and the reason shown.
    serve({ provider: 'anthropic', model: 'm' }, { declined: 'The model service declined this request.' })
    expect(await askServerModel(prompt(modelBriefing('scenarios')), turn)).toBe(
      declinedAnswer('The model service declined this request.'),
    )
  })

  test('rejects with the server’s sentence when there is no answer', async () => {
    // The pane shows it as the reason the run ended; "502" would tell the person nothing.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'model_unavailable', message: 'The model service refused this server’s key.' }), {
            status: 502,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )
    await expect(askServerModel(prompt(modelBriefing('authoring')), turn)).rejects.toThrow(
      'The model service refused this server’s key.',
    )
  })

  test('rejects with the status when the server gave no sentence', async () => {
    // A proxy's error page, or a rate limit answered by something in front of the server:
    // the reason the person reads still says which request failed and how.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))))
    await expect(askServerModel(prompt(modelBriefing('translation')), turn)).rejects.toThrow(
      'The server could not ask its model (502).',
    )
  })

  test('abandons the request when the person stops the run', async () => {
    // The server aborts the provider's call when this request goes away, so the stop
    // reaches the provider only if the browser actually lets go.
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        )
      }),
    )
    let stop: () => void = () => undefined
    const pending = askServerModel(prompt(modelBriefing('authoring')), { onCancel: (listener) => (stop = listener) })
    await waitFor(() => expect(signal).toBeDefined())
    stop()
    await expect(pending).rejects.toThrow()
    expect(signal?.aborted).toBe(true)
  }, 5_000)
})

describe('fetchModel', () => {
  test('is none for an answer that is not a model, whatever its status', async () => {
    // A server older than this route answers `/model` some other way; reading any 200 as
    // a model would draw a pane whose every turn fails.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: 1 }), { status: 200 }))))
    expect(await fetchModel()).toBeUndefined()
  })
})
