import { describe, expect, test } from 'vitest'
import type { Cancellation } from '@formancy/server-core'
import { ANTHROPIC_MAX_OUTPUT_TOKENS, createAnthropicCompleter } from './anthropic-completer.js'

/**
 * Claude, through Anthropic's own SDK, against a fake transport (0166).
 *
 * The SDK takes a `fetch`, so every case here is the real client — its request building,
 * its stream parser, its error classes — with only the network replaced. What is under
 * test is what leaves for Anthropic and how each way a turn can end is read: an answer, a
 * refusal, an answer cut off at the limit, an error, and a browser that went away.
 */
const PROMPT = { system: 'The briefing.', user: 'The request.' }
const never: Cancellation = { onCancel: () => undefined }

interface Sent {
  readonly url: string
  readonly headers: Headers
  readonly body: Record<string, unknown>
  readonly signal: AbortSignal | null | undefined
}

type Block = { readonly type: 'text'; readonly text: string } | { readonly type: 'thinking'; readonly thinking: string }

/** The events Anthropic streams for one message holding `blocks`, ending for `stopReason`. */
function streamed(
  blocks: readonly Block[],
  stopReason: string,
  stopDetails: Record<string, unknown> | null = null,
): Response {
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 12, output_tokens: 1 },
      },
    },
  ]
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
    } else {
      events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: block.thinking } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig' } })
    }
    events.push({ type: 'content_block_stop', index })
  })
  events.push({
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null, stop_details: stopDetails },
    usage: { output_tokens: 40 },
  })
  events.push({ type: 'message_stop' })
  const text = events.map((event) => `event: ${String(event['type'])}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** A completer over a transport that answers every request with `answer`, and what it was sent. */
function over(answer: (sent: Sent) => Response | Promise<Response>): {
  completer: ReturnType<typeof createAnthropicCompleter>
  sent: Sent[]
} {
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
  return { completer: createAnthropicCompleter({ apiKey: 'sk-ant-test', model: 'claude-opus-5', fetch }), sent }
}

describe('what is sent to Anthropic', () => {
  test('the model, the briefing as the system prompt, the request as the one user message, and the limits', async () => {
    // The request a provider bills for. A briefing sent as a user message, a model other
    // than the operator's, or no output limit would each cost somebody without anybody
    // seeing the request. And it goes to the host the deployment view names whatever the
    // environment says: the SDK would otherwise take ANTHROPIC_BASE_URL from it.
    const ambient = process.env['ANTHROPIC_BASE_URL']
    process.env['ANTHROPIC_BASE_URL'] = 'https://elsewhere.example'
    const { completer, sent } = over(() => streamed([{ type: 'text', text: '{}' }], 'end_turn'))
    try {
      await completer.complete(PROMPT, never)
    } finally {
      if (ambient === undefined) delete process.env['ANTHROPIC_BASE_URL']
      else process.env['ANTHROPIC_BASE_URL'] = ambient
    }

    expect(sent).toHaveLength(1)
    const [request] = sent
    expect(new URL(request?.url ?? '').origin).toBe('https://api.anthropic.com')
    expect(new URL(request?.url ?? '').pathname).toBe('/v1/messages')
    expect(request?.headers.get('x-api-key')).toBe('sk-ant-test')
    expect(request?.body).toEqual({
      model: 'claude-opus-5',
      max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
      thinking: { type: 'adaptive' },
      system: 'The briefing.',
      messages: [{ role: 'user', content: 'The request.' }],
      stream: true,
    })
  })
})

describe('how an answer is read', () => {
  test('the text, and only the text: a thinking block is not part of the answer', async () => {
    // Adaptive thinking streams its own blocks first. Joined into the answer, they would
    // put prose in front of the JSON the browser is about to parse.
    const { completer } = over(() =>
      streamed(
        [
          { type: 'thinking', thinking: 'The person wants a phone field.' },
          { type: 'text', text: '{"specVersion":' },
          { type: 'text', text: '"4"}' },
        ],
        'end_turn',
      ),
    )
    expect(await completer.complete(PROMPT, never)).toEqual({ ok: true, text: '{"specVersion":"4"}' })
  })

  test('a refusal is a refusal, with Anthropic’s explanation, and none of the text before it', async () => {
    // Read as text, a refusal is a half-written answer the browser would check, complain
    // about, and pay to ask again — three times — for the same refusal.
    const { completer } = over(() =>
      streamed([{ type: 'text', text: '{"specVer' }], 'refusal', {
        type: 'refusal',
        category: null,
        explanation: 'This request was declined.',
      }),
    )
    const outcome = await completer.complete(PROMPT, never)
    expect(outcome).toMatchObject({ ok: false, failure: 'refused' })
    expect(outcome.ok === false && outcome.failure === 'refused' && outcome.reason).toContain('This request was declined.')
    expect(JSON.stringify(outcome)).not.toContain('specVer')
  })

  test('a refusal with no explanation still has a reason to show', async () => {
    // A decline needs a reason for the person; a blank one would not read as a decline.
    const { completer } = over(() => streamed([], 'refusal'))
    const outcome = await completer.complete(PROMPT, never)
    expect(outcome.ok === false && outcome.failure === 'refused' && outcome.reason.trim()).not.toBe('')
  })

  test.each(['max_tokens', 'model_context_window_exceeded'])('an answer stopped by %s is cut off, never half a document', async (reason) => {
    // The failure: the first half of a form handed over as the answer.
    const { completer } = over(() => streamed([{ type: 'text', text: '{"specVersion":"4","model":{"fie' }], reason))
    expect(await completer.complete(PROMPT, never)).toEqual({ ok: false, failure: 'truncated' })
  })

  test.each(['pause_turn', 'tool_use'])('a turn stopped for %s is not an answer', async (reason) => {
    // Both need tools this request does not offer. Whatever stopped it, the text so far is
    // not a finished answer and is not handed over as one.
    const { completer } = over(() => streamed([{ type: 'text', text: '{"spec' }], reason))
    expect(await completer.complete(PROMPT, never)).toMatchObject({ ok: false, failure: 'unavailable' })
  })

  test('an HTTP error is unavailable, with the status, and never the key', async () => {
    // 401 is a key the provider refused. Said as a status the route can word, rather than
    // the provider's body, which is the operator's to read in the log.
    const { completer } = over(
      () =>
        new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const outcome = await completer.complete(PROMPT, never)
    expect(outcome).toMatchObject({ ok: false, failure: 'unavailable', status: 401 })
    expect(JSON.stringify(outcome)).not.toContain('sk-ant-test')
  })

  test('a network failure is unavailable, with no status', async () => {
    // Nothing answered, so there is no status to word; the cause goes to the log.
    const { completer } = over(() => Promise.reject(new TypeError('fetch failed')))
    const outcome = await completer.complete(PROMPT, never)
    expect(outcome).toMatchObject({ ok: false, failure: 'unavailable' })
    expect(outcome.ok === false && 'status' in outcome ? outcome.status : undefined).toBeUndefined()
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
    // Told at once, as a cancellation registered after the browser left is: nothing is
    // paid for at all.
    const cancellation: Cancellation = { onCancel: (listener) => listener() }
    const { completer, sent } = over(() => streamed([{ type: 'text', text: '{}' }], 'end_turn'))

    expect(await completer.complete(PROMPT, cancellation)).toEqual({ ok: false, failure: 'cancelled' })
    expect(sent).toEqual([])
  })
})
