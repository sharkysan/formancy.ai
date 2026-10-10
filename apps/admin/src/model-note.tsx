import type { ReactElement } from 'react'
import type { ServerModel } from './api.js'

/** The providers this server has an adapter for, as a person would name them. */
const PROVIDERS: Readonly<Record<string, string>> = { anthropic: 'Anthropic', openai: 'OpenAI', xai: 'xAI' }

/**
 * Where a request to the model goes, said before anybody asks (0166).
 *
 * The request leaves: the server sends it on to the provider the operator chose, under that
 * provider's terms. Nothing here calls that private, and the person asking should not have
 * to find out from the operator.
 */
export function ModelNote({ model, sends }: { model: ServerModel; sends: string }): ReactElement {
  const provider = PROVIDERS[model.provider] ?? model.provider
  return (
    <p className="wb-hint">
      Asked through this server, which sends {sends} to {provider}’s {model.model}.
    </p>
  )
}
