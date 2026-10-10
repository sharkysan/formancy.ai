/**
 * Which model the environment names for the builders: none, or a provider, its key and
 * the model.
 *
 * A function of the environment rather than lines in `main.ts`, as `fileStoreSettings` is:
 * the rules are where a deployment goes wrong, and `main.ts` is a composition root no test
 * imports. Constructing the adapter stays in `main.ts`; this only says which
 * ([0166](../../../docs/decisions/0166-a-deployments-model-is-asked-through-its-server.md)).
 */
export const MODEL_PROVIDERS = ['anthropic', 'openai', 'xai'] as const

/** Anthropic's Claude, OpenAI's models, or xAI's Grok — each through its own key. */
export type ModelProvider = (typeof MODEL_PROVIDERS)[number]

export type ModelSettings =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'configured'
      readonly provider: ModelProvider
      readonly apiKey: string
      readonly model: string
    }

type Environment = Readonly<Record<string, string | undefined>>

/**
 * Absent — all three unset or blank — is a supported state, and the default: this
 * deployment has no model, the server says so to the admin, and no prompt pane is drawn.
 *
 * Throws on anything in between, so the server refuses to start rather than starting
 * without the model the operator thinks they configured: a key or a model with no
 * provider, a provider formancy has no adapter for, or a provider without its key or
 * its model. **No provider has a default model.** A model id goes stale when the provider
 * retires it, and then every turn fails as a model that could not be reached, after an
 * upgrade nobody made; and which model runs is what the operator pays for. Neither is
 * this file's to decide. The message never repeats a value, because the key is one.
 */
export function modelSettings(env: Environment): ModelSettings {
  const provider = setting(env, 'FORMANCY_MODEL_PROVIDER')
  const apiKey = setting(env, 'FORMANCY_MODEL_API_KEY')
  const model = setting(env, 'FORMANCY_MODEL')

  if (provider === undefined) {
    if (apiKey === undefined && model === undefined) return { kind: 'none' }
    throw new Error(
      'FORMANCY_MODEL_API_KEY or FORMANCY_MODEL is set without FORMANCY_MODEL_PROVIDER: name the ' +
        'provider (anthropic, openai or xai), or unset both to run without a model.',
    )
  }

  if (!isProvider(provider)) {
    throw new Error('FORMANCY_MODEL_PROVIDER must be anthropic, openai or xai.')
  }
  if (apiKey === undefined) {
    throw new Error('FORMANCY_MODEL_API_KEY is required when FORMANCY_MODEL_PROVIDER is set.')
  }
  if (model === undefined) {
    throw new Error(
      'FORMANCY_MODEL is required when FORMANCY_MODEL_PROVIDER is set: name the model as the ' +
        "provider's documentation does. There is no default.",
    )
  }
  return { kind: 'configured', provider, apiKey, model }
}

function isProvider(value: string): value is ModelProvider {
  return (MODEL_PROVIDERS as readonly string[]).includes(value)
}

/** A setting, with the empty string read as unset — compose blanks a variable, it cannot drop one. */
function setting(env: Environment, name: string): string | undefined {
  const value = env[name]
  return value === undefined || value.trim() === '' ? undefined : value
}
