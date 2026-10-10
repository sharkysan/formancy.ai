import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Cancellation } from '@formancy/server-core'
import {
  OPENAI_BASE_URL,
  OPENAI_MAX_OUTPUT_TOKENS,
  XAI_BASE_URL,
  createOpenAiCompleter,
} from './openai-completer.js'

/**
 * OpenAI's models and xAI's Grok, through OpenAI's official SDK and its Responses API,
 * against a fake transport (0166).
 *
 * One adapter for both because xAI documents its API as compatible with OpenAI's SDKs at
 * its own base URL; the provider is the base URL and the key. The SDK takes a `fetch`, so
 * every case here is the real client with only the network replaced.
 */
const PROMPT = { system: 'The briefing.', user: 'The request.' }
const never: Cancellation = { onCancel: () => undefined }

interface Sent {
  readonly url: string
  readonly headers: Headers
  readonly body: Record<string, unknown>
  readonly signal: AbortSignal | null | undefined
}

type Part = { readonly type: 'output_text'; readonly text: string } | { readonly type: 'refusal'; readonly refusal: string }

/** A Responses API response, as the provider would finish it. */
function response(
  status: string,
  parts: readonly Part[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'resp_1',
    object: 'response',
    created_at: 1_760_000_000,
    status,
    model: 'a-model',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: {},
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    output:
      parts.length === 0
        ? []
        : [
            {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: parts.map((part) => (part.type === 'output_text' ? { ...part, annotations: [] } : part)),
            },
          ],
    ...extra,
  }
}

/** The events the provider streams: the response begun, then finished as `finished`. */
function streamed(finished: Record<string, unknown>, ending = 'response.completed'): Response {
  const begun = { ...finished, status: 'in_progress', output: [], error: null, incomplete_details: null }
  const events = [
    { type: 'response.created', sequence_number: 0, response: begun },
    { type: ending, sequence_number: 1, response: finished },
  ]
  const text = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function over(
  answer: (sent: Sent) => Response | Promise<Response>,
  baseURL: string = OPENAI_BASE_URL,
): { completer: ReturnType<typeof createOpenAiCompleter>; sent: Sent[] } {
  const sent: Sent[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request: Sent = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      signal: init?.signal,
    }
    sent.push(request)
    return answer(request)
  }
  return { completer: createOpenAiCompleter({ apiKey: 'sk-test', model: 'a-model', baseURL, fetch }), sent }
}

const AMBIENT = ['OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID', 'OPENAI_LOG', 'OPENAI_CUSTOM_HEADERS'] as const
const saved = Object.fromEntries(AMBIENT.map((name) => [name, process.env[name]]))
afterEach(() => {
  for (const name of AMBIENT) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('what the environment cannot add', () => {
  test.each([
    ['OpenAI', OPENAI_BASE_URL],
    ['xAI', XAI_BASE_URL],
  ])('a request log in the console, for %s', async (_, baseURL) => {
    // With OPENAI_LOG=debug the SDK writes a line for every request and every response —
    // where it went, its headers, how long the provider took — which is a request log the
    // server says it does not keep (SAFETY-ANALYSIS C3), switched on by a variable nobody
    // reading this file would see. This version writes the body's length rather than the
    // form; the form is checked for too, in case a later one does not.
    process.env['OPENAI_LOG'] = 'debug'
    const written: unknown[] = []
    const spies = (['debug', 'info', 'log', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void written.push(...args)),
    )
    try {
      const { completer, sent } = over(() => streamed(response('completed', [{ type: 'output_text', text: '{}' }])), baseURL)
      await completer.complete(PROMPT, never)
      expect(sent).toHaveLength(1)
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
    expect(JSON.stringify(written)).not.toContain(PROMPT.user)
    expect(written).toEqual([])
  })

  test('but headers of its own it would add, to xAI as well, which is why the server will not start with them', async () => {
    // The premise of `modelSettings` refusing OPENAI_CUSTOM_HEADERS: with every option this
    // adapter sets, the SDK still sends them. If it ever stops, the refusal can go.
    process.env['OPENAI_CUSTOM_HEADERS'] = 'x-ambient: yes'
    const { completer, sent } = over(() => streamed(response('completed', [{ type: 'output_text', text: '{}' }])), XAI_BASE_URL)
    await completer.complete(PROMPT, never)
    expect(new URL(sent[0]?.url ?? '').origin).toBe('https://api.x.ai')
    expect(sent[0]?.headers.get('x-ambient')).toBe('yes')
  })
})

describe('what is sent', () => {
  test.each([
    ['OpenAI', OPENAI_BASE_URL, 'https://api.openai.com'],
    ['xAI', XAI_BASE_URL, 'https://api.x.ai'],
  ])('to %s: the model, the briefing as the system message, the request as the user message, and the limits', async (_, baseURL, origin) => {
    // What the provider bills for, and where it goes. The SDK would otherwise take the
    // base URL, an organisation and a project from the environment, and send OpenAI's
    // organisation id to xAI as a header.
    process.env['OPENAI_BASE_URL'] = 'https://elsewhere.example/v1'
    process.env['OPENAI_ORG_ID'] = 'org-ambient'
    process.env['OPENAI_PROJECT_ID'] = 'proj-ambient'
    const { completer, sent } = over(() => streamed(response('completed', [{ type: 'output_text', text: '{}' }])), baseURL)
    await completer.complete(PROMPT, never)

    expect(sent).toHaveLength(1)
    const [request] = sent
    expect(new URL(request?.url ?? '').origin).toBe(origin)
    expect(new URL(request?.url ?? '').pathname).toBe('/v1/responses')
    expect(request?.headers.get('authorization')).toBe('Bearer sk-test')
    expect(request?.headers.get('openai-organization')).toBeNull()
    expect(request?.headers.get('openai-project')).toBeNull()
    expect(request?.body).toEqual({
      model: 'a-model',
      input: [
        { role: 'system', content: 'The briefing.' },
        { role: 'user', content: 'The request.' },
      ],
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      // Not kept by the provider for later retrieval: the request is a form, and nothing
      // here asks for it again.
      store: false,
      stream: true,
    })
  })
})

describe('how an answer is read', () => {
  test('the text of a completed response', async () => {
    // The answer the browser checks, exactly as the model wrote it.
    const { completer } = over(() =>
      streamed(
        response('completed', [
          { type: 'output_text', text: '{"specVersion":' },
          { type: 'output_text', text: '"4"}' },
        ]),
      ),
    )
    expect(await completer.complete(PROMPT, never)).toEqual({ ok: true, text: '{"specVersion":"4"}' })
  })

  test('a refusal is a refusal, in the model’s words, and none of the text beside it', async () => {
    // Read as text, a refusal is an answer the browser would check, complain about, and
    // pay to ask again for the same refusal.
    const { completer } = over(() =>
      streamed(
        response('completed', [
          { type: 'output_text', text: '{"spec' },
          { type: 'refusal', refusal: 'I can’t help with that.' },
        ]),
      ),
    )
    const outcome = await completer.complete(PROMPT, never)
    expect(outcome).toEqual({ ok: false, failure: 'refused', reason: 'I can’t help with that.' })
  })

  test('a response the provider filtered is a refusal with a reason to show', async () => {
    // Incomplete for `content_filter`: the provider withheld the answer, which is a
    // decline rather than a model that could not be reached.
    const { completer } = over(() =>
      streamed(
        response('incomplete', [{ type: 'output_text', text: '{"spec' }], {
          incomplete_details: { reason: 'content_filter' },
        }),
        'response.incomplete',
      ),
    )
    const outcome = await completer.complete(PROMPT, never)
    expect(outcome).toMatchObject({ ok: false, failure: 'refused' })
    expect(outcome.ok === false && outcome.failure === 'refused' && outcome.reason.trim()).not.toBe('')
  })

  test('an answer stopped at the output limit is cut off, never half a document', async () => {
    // The failure: the first half of a form handed over as the answer.
    const { completer } = over(() =>
      streamed(
        response('incomplete', [{ type: 'output_text', text: '{"specVersion":"4","model":{"fie' }], {
          incomplete_details: { reason: 'max_output_tokens' },
        }),
        'response.incomplete',
      ),
    )
    expect(await completer.complete(PROMPT, never)).toEqual({ ok: false, failure: 'truncated' })
  })

  test('a response incomplete for any other reason is not an answer', async () => {
    // Neither cut off nor withheld: still not the whole answer, and not handed over.
    const { completer } = over(() =>
      streamed(
        response('incomplete', [{ type: 'output_text', text: '{"spec' }], {
          incomplete_details: { reason: 'max_messages' },
        }),
        'response.incomplete',
      ),
    )
    expect(await completer.complete(PROMPT, never)).toMatchObject({ ok: false, failure: 'unavailable' })
  })

  test('a failed response is unavailable', async () => {
    // The provider's own failure, after it accepted the request.
    const { completer } = over(() =>
      streamed(
        response('failed', [], { error: { code: 'server_error', message: 'The model failed.' } }),
        'response.failed',
      ),
    )
    expect(await completer.complete(PROMPT, never)).toMatchObject({ ok: false, failure: 'unavailable' })
  })

  test('an HTTP error is unavailable, with the status, and never the key', async () => {
    // 401 is a key the provider refused. Said as a status the route can word, rather than
    // the provider's body, which is the operator's to read in the log.
    const { completer } = over(
      () =>
        new Response(JSON.stringify({ error: { message: 'Incorrect API key provided.', type: 'invalid_request_error' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const outcome = await completer.complete(PROMPT, never)
    expect(outcome).toMatchObject({ ok: false, failure: 'unavailable', status: 401 })
    expect(JSON.stringify(outcome)).not.toContain('sk-test')
  })
})

describe('a browser that goes away', () => {
  test('abandons the request at the transport, and the outcome says so', async () => {
    // Without the abort the operator pays for every token of an answer nobody will read.
    let cancel: () => void = () => undefined
    const cancellation: Cancellation = { onCancel: (listener) => (cancel = listener) }
    const { completer, sent } = over(
      ({ signal }) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = completer.complete(PROMPT, cancellation)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(sent).toHaveLength(1)
    cancel()

    expect(await pending).toEqual({ ok: false, failure: 'cancelled' })
    expect(sent[0]?.signal?.aborted).toBe(true)
  }, 5_000)

  test('before the request leaves, sends nothing', async () => {
    const cancellation: Cancellation = { onCancel: (listener) => listener() }
    const { completer, sent } = over(() => streamed(response('completed', [{ type: 'output_text', text: '{}' }])))

    expect(await completer.complete(PROMPT, cancellation)).toEqual({ ok: false, failure: 'cancelled' })
    expect(sent).toEqual([])
  })
})
