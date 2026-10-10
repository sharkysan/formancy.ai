import Anthropic, { APIError } from '@anthropic-ai/sdk'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import type { Cancellation, Completer, Completion, CompletionPrompt } from '@formancy/server-core'

/**
 * Where the request goes. Named rather than left to the SDK, which would otherwise take
 * `ANTHROPIC_BASE_URL` from the environment: the deployment view says which host a form is
 * sent to, and an ambient variable could change it without anybody reading this file.
 */
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'

/**
 * The most a turn may write, thinking included.
 *
 * Generous on purpose: an answer is a whole form document, and one cut off at the limit is
 * not an answer at all (`truncated`), so a limit too low wastes the turn it stopped.
 * Streamed, so a long answer is not cut off by the HTTP timeout either. It is the ceiling
 * on what one turn can cost — the operator pays per token written, not per token allowed.
 */
export const ANTHROPIC_MAX_OUTPUT_TOKENS = 64_000

/** What a refused turn says when Anthropic gave no explanation. */
const DECLINED = 'The model service declined this request.'

export interface AnthropicCompleterOptions {
  readonly apiKey: string
  /** As Anthropic names it — `claude-opus-5`. Never defaulted (`model-settings.ts`). */
  readonly model: string
  /** The transport, for the tests; the platform's own `fetch` otherwise. */
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

/**
 * Claude, through Anthropic's official SDK (0165).
 *
 * One system prompt and one user message, with adaptive thinking — the model decides how
 * much to think — streamed and read with the SDK's final-message helper. **The stop reason
 * is read before the content.** A refusal ends the person's run as a decline, with
 * Anthropic's explanation; an answer stopped at the output limit, or by the context
 * window, is `truncated` and never handed over as the first half of a document. Thinking
 * blocks are not part of the answer.
 *
 * Adaptive thinking needs a model that has it — Claude Opus 4.6, Sonnet 4.6 and later. A
 * model without it is refused by Anthropic with a 400, and every turn ends `unavailable`.
 *
 * The SDK retries what it calls temporary failures (a 429, a 5xx, a dropped connection)
 * twice, by its own default.
 */
export function createAnthropicCompleter(options: AnthropicCompleterOptions): Completer {
  const client = new Anthropic({
    apiKey: options.apiKey,
    // The SDK would also send ANTHROPIC_AUTH_TOKEN, as a second credential beside the key,
    // and with ANTHROPIC_LOG=debug write every request — the whole form — to the console:
    // a second request log, outside the rule the server's own is built by
    // (SAFETY-ANALYSIS C3). Neither is the
    // environment's to switch on. ANTHROPIC_CUSTOM_HEADERS cannot be undone here, so
    // `modelSettings` refuses to start with it.
    authToken: null,
    logLevel: 'off',
    baseURL: ANTHROPIC_BASE_URL,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })

  return {
    async complete(prompt: CompletionPrompt, cancellation: Cancellation): Promise<Completion> {
      const controller = new AbortController()
      cancellation.onCancel(() => controller.abort())
      if (controller.signal.aborted) return { ok: false, failure: 'cancelled' }

      let message: Message
      try {
        message = await client.messages
          .stream(
            {
              model: options.model,
              max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
              thinking: { type: 'adaptive' },
              system: prompt.system,
              messages: [{ role: 'user', content: prompt.user }],
            },
            { signal: controller.signal },
          )
          .finalMessage()
      } catch (error) {
        if (controller.signal.aborted) return { ok: false, failure: 'cancelled' }
        return unavailable(error)
      }
      return read(message)
    },
  }
}

/** A finished message, by its stop reason first. */
function read(message: Message): Completion {
  switch (message.stop_reason) {
    case 'refusal': {
      const explanation = message.stop_details?.explanation
      return {
        ok: false,
        failure: 'refused',
        reason: typeof explanation === 'string' && explanation.trim() !== '' ? explanation : DECLINED,
      }
    }
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return { ok: false, failure: 'truncated' }
    case 'end_turn':
    case 'stop_sequence': {
      const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
      return { ok: true, text }
    }
    default:
      // `tool_use` and `pause_turn` need tools this request does not offer: whatever it
      // is, it is not a finished answer.
      return { ok: false, failure: 'unavailable', cause: `Anthropic stopped for ${String(message.stop_reason)}.` }
  }
}

/** An error from the SDK, as a failure: the status when Anthropic answered, the message for the log. */
function unavailable(error: unknown): Completion {
  const status = error instanceof APIError && typeof error.status === 'number' ? error.status : undefined
  const cause = error instanceof Error ? error.message : String(error)
  return { ok: false, failure: 'unavailable', ...(status === undefined ? {} : { status }), cause }
}
