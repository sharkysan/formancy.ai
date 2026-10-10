import type { Completer } from '@formancy/server-core'
import { createAnthropicCompleter } from './anthropic-completer.js'
import { OPENAI_BASE_URL, XAI_BASE_URL, createOpenAiCompleter } from './openai-completer.js'
import type { ModelSettings } from './model-settings.js'

/**
 * The adapter for the provider the operator named (0165): Anthropic through its own SDK,
 * OpenAI and xAI through OpenAI's, at each one's base URL.
 *
 * `fetch` is for the tests, which check where each provider's requests go.
 */
export function createCompleter(
  settings: Extract<ModelSettings, { kind: 'configured' }>,
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): Completer {
  const { apiKey, model } = settings
  const transport = fetch === undefined ? {} : { fetch }
  switch (settings.provider) {
    case 'anthropic':
      return createAnthropicCompleter({ apiKey, model, ...transport })
    case 'openai':
      return createOpenAiCompleter({ apiKey, model, baseURL: OPENAI_BASE_URL, ...transport })
    case 'xai':
      return createOpenAiCompleter({ apiKey, model, baseURL: XAI_BASE_URL, ...transport })
  }
}
