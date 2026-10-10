import { describe, expect, test } from 'vitest'
import type { Completion } from '@formancy/server-core'
import { createCompleter } from './completers.js'
import type { ModelProvider } from './model-settings.js'

/**
 * Which adapter, and so which host, each provider the operator names is sent to (0165).
 *
 * The provider is a word in the environment and the key goes with it. A mapping crossed
 * here sends OpenAI's key to xAI, or a form to a company the operator never chose, and
 * every request would fail with a 401 that reads like a wrong key.
 */
describe('the provider named', () => {
  test.each<[ModelProvider, string]>([
    ['anthropic', 'https://api.anthropic.com'],
    ['openai', 'https://api.openai.com'],
    ['xai', 'https://api.x.ai'],
  ])('%s is asked at %s, and nowhere else', async (provider, origin) => {
    const hosts: string[] = []
    const fetch = (input: string | URL | Request): Promise<Response> => {
      hosts.push(new URL(String(input)).origin)
      // Refused, so the adapter stops at once; only where it went is under test.
      return Promise.resolve(new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } }))
    }
    const completer = createCompleter({ kind: 'configured', provider, apiKey: 'key', model: 'm' }, fetch)
    const outcome: Completion = await completer.complete({ system: 's', user: 'u' }, { onCancel: () => undefined })

    expect(outcome).toMatchObject({ ok: false, failure: 'unavailable', status: 400 })
    expect(hosts).toEqual([origin])
  })
})
