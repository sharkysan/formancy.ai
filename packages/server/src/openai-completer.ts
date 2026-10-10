import OpenAI, { APIError } from 'openai'
import type { Response as ModelResponse } from 'openai/resources/responses/responses'
import type { Cancellation, Completer, Completion, CompletionPrompt } from '@formancy/server-core'

/**
 * Where each provider's requests go. Named rather than left to the SDK, which would take
 * `OPENAI_BASE_URL` from the environment and send every form wherever it pointed.
 */
export const OPENAI_BASE_URL = 'https://api.openai.com/v1'

/**
 * xAI's API, which xAI documents as compatible with OpenAI's SDKs and their Responses API at
 * this base URL. Taken from xAI's documentation as a web search summarised it on
 * 2026-10-10; the pages themselves refused the fetch, and no test here reaches xAI (0165).
 */
export const XAI_BASE_URL = 'https://api.x.ai/v1'

/**
 * The most a turn may write, reasoning included — as generous as Anthropic's, and for the
 * same reason: an answer cut off at the limit is not an answer (`truncated`).
 */
export const OPENAI_MAX_OUTPUT_TOKENS = 64_000

/** What a withheld answer says: the provider gives no words of its own for a filter. */
const FILTERED = 'The model service withheld its answer to this request.'

export interface OpenAiCompleterOptions {
  readonly apiKey: string
  /** As the provider names it. Never defaulted (`model-settings.ts`). */
  readonly model: string
  /** `OPENAI_BASE_URL` or `XAI_BASE_URL`: the provider, as far as this adapter is concerned. */
  readonly baseURL: string
  /** The transport, for the tests; the platform's own `fetch` otherwise. */
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

/**
 * OpenAI's models, or xAI's Grok, through OpenAI's official SDK and the Responses API (0165).
 *
 * The briefing as a system message and the request as a user message, streamed and read
 * with the SDK's final-response helper. `store: false`, so the provider keeps no copy of
 * the form for later retrieval; what it keeps under its own terms is not this adapter's
 * to say. **The response's status is read before its text.** Incomplete at the output
 * limit is `truncated`, never half a document; withheld by the provider's filter, or a
 * refusal in the output, ends the person's run as a decline.
 *
 * The SDK would take an organisation and a project from the environment and send them as
 * headers — to xAI as well — so both are set to nothing here. It would take a log level
 * too, and with OPENAI_LOG=debug write a line for every request and response to the
 * console — a second request log, outside the rule the server's own is built by
 * (SAFETY-ANALYSIS C3) — so the level is set. OPENAI_CUSTOM_HEADERS cannot be undone here, so `modelSettings` refuses to start
 * with it.
 */
export function createOpenAiCompleter(options: OpenAiCompleterOptions): Completer {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    organization: null,
    project: null,
    logLevel: 'off',
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })

  return {
    async complete(prompt: CompletionPrompt, cancellation: Cancellation): Promise<Completion> {
      const controller = new AbortController()
      cancellation.onCancel(() => controller.abort())
      if (controller.signal.aborted) return { ok: false, failure: 'cancelled' }

      let response: ModelResponse
      try {
        response = await client.responses
          .stream(
            {
              model: options.model,
              input: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
              ],
              max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
              store: false,
            },
            { signal: controller.signal },
          )
          .finalResponse()
      } catch (error) {
        if (controller.signal.aborted) return { ok: false, failure: 'cancelled' }
        return unavailable(error)
      }
      return read(response)
    },
  }
}

/** A finished response, by its status first. */
function read(response: ModelResponse): Completion {
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason
    if (reason === 'max_output_tokens') return { ok: false, failure: 'truncated' }
    if (reason === 'content_filter') return { ok: false, failure: 'refused', reason: FILTERED }
    return { ok: false, failure: 'unavailable', cause: `The response was incomplete: ${String(reason)}.` }
  }
  if (response.status !== 'completed') {
    const said = response.error?.message
    const cause = `The response ended ${String(response.status)}${said === undefined ? '' : `: ${said}`}.`
    return { ok: false, failure: 'unavailable', cause }
  }

  const parts = response.output.flatMap((item) => (item.type === 'message' ? item.content : []))
  const refusal = parts.find((part) => part.type === 'refusal')
  if (refusal !== undefined) {
    return { ok: false, failure: 'refused', reason: refusal.refusal.trim() === '' ? FILTERED : refusal.refusal }
  }
  return { ok: true, text: parts.flatMap((part) => (part.type === 'output_text' ? [part.text] : [])).join('') }
}

/** An error from the SDK, as a failure: the status when the provider answered, the message for the log. */
function unavailable(error: unknown): Completion {
  const status = error instanceof APIError && typeof error.status === 'number' ? error.status : undefined
  const cause = error instanceof Error ? error.message : String(error)
  return { ok: false, failure: 'unavailable', ...(status === undefined ? {} : { status }), cause }
}
