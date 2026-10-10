import { describe, expect, test } from 'vitest'
import { modelSettings } from './model-settings.js'

/**
 * Which model the environment names, and which configurations are refused (0165).
 *
 * Read once, at startup. A wrong answer here is a server that starts with no model while
 * the operator believes they configured one — the builders then simply draw no prompt
 * pane, and nothing says why — or one that sends every form to a provider it was not told
 * to use.
 */
const anthropic = {
  FORMANCY_MODEL_PROVIDER: 'anthropic',
  FORMANCY_MODEL_API_KEY: 'sk-ant-example',
  FORMANCY_MODEL: 'claude-opus-5',
} as const

describe('which model the environment names', () => {
  test('none when nothing is set', () => {
    // Off unless set: a deployment that never asked for a model sends no form anywhere.
    expect(modelSettings({})).toEqual({ kind: 'none' })
  })

  test('none when compose passed all three through blank', () => {
    // Compose can blank a variable but not drop one, so blank is how an operator turns a
    // model off again without editing the compose file.
    expect(
      modelSettings({ FORMANCY_MODEL_PROVIDER: '', FORMANCY_MODEL_API_KEY: '', FORMANCY_MODEL: '' }),
    ).toEqual({ kind: 'none' })
  })

  test.each([
    ['anthropic', 'claude-opus-5'],
    ['openai', 'a-model-id'],
    ['xai', 'grok-4.7'],
  ])('%s, with its key and the model named', (provider, model) => {
    // A setting read under the wrong name is a request signed with nothing, which the
    // provider answers 401 on every turn.
    expect(
      modelSettings({ FORMANCY_MODEL_PROVIDER: provider, FORMANCY_MODEL_API_KEY: 'key', FORMANCY_MODEL: model }),
    ).toEqual({ kind: 'configured', provider, apiKey: 'key', model })
  })
})

describe('what is refused', () => {
  test('a provider formancy has no adapter for, naming the three it has', () => {
    // Started anyway, the server would have no model and the operator would think it had
    // one; `gemini` and `Anthropic` are both refused, rather than one guessed at.
    expect(() => modelSettings({ ...anthropic, FORMANCY_MODEL_PROVIDER: 'gemini' })).toThrow(
      /anthropic, openai or xai/,
    )
    expect(() => modelSettings({ ...anthropic, FORMANCY_MODEL_PROVIDER: 'Anthropic' })).toThrow(
      /FORMANCY_MODEL_PROVIDER/,
    )
  })

  test.each(['FORMANCY_MODEL_API_KEY', 'FORMANCY_MODEL'])('a provider without %s, missing or blank', (name) => {
    // No key is a model that answers 401 to every turn. No model is refused rather than
    // defaulted: a default goes stale when the provider retires it, and which model runs
    // is what the operator pays for.
    expect(() => modelSettings({ ...anthropic, [name]: undefined })).toThrow(name)
    expect(() => modelSettings({ ...anthropic, [name]: '' })).toThrow(name)
  })

  test.each(['FORMANCY_MODEL_API_KEY', 'FORMANCY_MODEL'])('%s without a provider', (name) => {
    // Half a configuration: somebody set a key and believes the server has a model. It
    // would start with none, and the builders would draw nothing to say so.
    expect(() => modelSettings({ [name]: anthropic[name as keyof typeof anthropic] })).toThrow(
      /FORMANCY_MODEL_PROVIDER/,
    )
  })

  test.each([
    ['anthropic', 'ANTHROPIC_CUSTOM_HEADERS'],
    ['openai', 'OPENAI_CUSTOM_HEADERS'],
    ['xai', 'OPENAI_CUSTOM_HEADERS'],
  ])('%s with %s set, which its SDK would add to every request', (provider, name) => {
    // The provider's SDK reads that variable and sends each line of it as a header with
    // every form — to xAI as well, through OpenAI's client — and no option undoes it. Set
    // for something else on the same host, it would change what goes to the provider
    // without anybody reading the adapter, so the server does not start with it.
    const configured = { ...anthropic, FORMANCY_MODEL_PROVIDER: provider }
    expect(() => modelSettings({ ...configured, [name]: 'x-ambient: yes' })).toThrow(name)
    // Blank is unset, as for the server's own variables; and the other SDK's variable is
    // read by a client this server never builds.
    expect(modelSettings({ ...configured, [name]: '' })).toMatchObject({ kind: 'configured', provider })
    expect(modelSettings({ ...configured, [name === 'ANTHROPIC_CUSTOM_HEADERS' ? 'OPENAI_CUSTOM_HEADERS' : 'ANTHROPIC_CUSTOM_HEADERS']: 'x: y' })).toMatchObject({ kind: 'configured', provider })
  })

  test('with no model, the SDKs’ own variables are not the server’s business', () => {
    // Neither SDK is asked for anything, so neither reads them.
    expect(modelSettings({ ANTHROPIC_CUSTOM_HEADERS: 'x: y', OPENAI_CUSTOM_HEADERS: 'x: y' })).toEqual({ kind: 'none' })
  })

  test('and never says the key', () => {
    // A refusal at startup lands in a container log, which is read by more people than
    // the secret was meant for.
    let message = ''
    try {
      modelSettings({ FORMANCY_MODEL_PROVIDER: 'gemini', FORMANCY_MODEL_API_KEY: 'sk-secret-value', FORMANCY_MODEL: 'm' })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toBe('')
    expect(message).not.toContain('sk-secret-value')
  })
})
