import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import type { AskModel, AuthoringPrompt } from './answers.js'
import { declinedAnswer } from './answers.js'
import { authorForm } from './authoring.js'
import { draftScenarios } from './scenario-drafts.js'
import { translateCatalogue } from './translate.js'
import {
  MODEL_REQUEST_KINDS,
  isModelRequestKind,
  modelBriefing,
  modelRequestKind,
} from './model-requests.js'
import type { ModelRequestKind } from './model-requests.js'

/**
 * The requests formancy makes of a model, by name, and the briefing each is asked under
 * (0165).
 *
 * A server that holds the operator's key answers these and nothing else: the browser names
 * the kind and sends the user part, and the server supplies the briefing itself, so its
 * endpoint is not a way to ask the operator's paid model anything at all. That only works
 * while the briefing the server pins is the one the run sends. If they drift apart, every
 * answer is to a request the model was not briefed for, and nothing would say so but a
 * stream of answers that fail their checks.
 */
const form: FormSchema = {
  specVersion: '4',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'name', type: 'text', label: { $t: 'name' } },
      { key: 'email', type: 'text', label: { $t: 'email' }, format: 'email' },
    ],
  },
  i18n: {
    defaultLocale: 'en',
    messages: { en: { name: 'Name', email: 'Email' }, de: { name: 'Name' } },
  },
}

/** An `AskModel` that records the prompt and declines, so each run asks exactly once. */
function recording(): { ask: AskModel; asked: AuthoringPrompt[] } {
  const asked: AuthoringPrompt[] = []
  return {
    asked,
    ask: (prompt) => {
      asked.push(prompt)
      return Promise.resolve(declinedAnswer('Recorded, not answered.'))
    },
  }
}

/** What each kind's own run sends as its system part. */
const RUNS: Record<ModelRequestKind, (ask: AskModel) => Promise<unknown>> = {
  authoring: (ask) => authorForm(ask, 'Add a phone number.', { current: form }),
  translation: (ask) => translateCatalogue(ask, form, 'de'),
  scenarios: (ask) => draftScenarios(ask, form, 'An email address is required.'),
}

describe('the briefing a kind of request is asked under', () => {
  test.each(MODEL_REQUEST_KINDS)('is the system part the %s run sends', async (kind) => {
    // The failure: a server pinning a briefing the run no longer sends, so a form is
    // written under the translator's rules, or a catalogue under nothing at all.
    const { ask, asked } = recording()
    await RUNS[kind](ask)

    expect(asked).toHaveLength(1)
    expect(asked[0]?.system).toBe(modelBriefing(kind))
  })

  test('is a different text for each kind', () => {
    // Recognised by its text alone, so two kinds sharing a briefing would send one of
    // them under the other's name.
    const briefings = MODEL_REQUEST_KINDS.map(modelBriefing)
    expect(new Set(briefings).size).toBe(MODEL_REQUEST_KINDS.length)
    for (const briefing of briefings) expect(briefing.length).toBeGreaterThan(200)
  })
})

describe('the kind a request carries', () => {
  /** An `AskModel` that answers `{}` once — an object no run accepts — and then declines. */
  function twoTurns(): { ask: AskModel; asked: AuthoringPrompt[] } {
    const asked: AuthoringPrompt[] = []
    return {
      asked,
      ask: (prompt) => {
        asked.push(prompt)
        return Promise.resolve(asked.length === 1 ? '{}' : declinedAnswer('Recorded, not answered.'))
      },
    }
  }

  test.each(MODEL_REQUEST_KINDS)('is %s, set by that run, on the first turn and the retry', async (kind) => {
    // The relay pane says what a request carries by its kind (0167). A run that set another
    // kind, or none on the turn that asks again, would have the pane tell the person a
    // translation carries the whole form, or that a form's edit carries none of its rules.
    const { ask, asked } = twoTurns()
    await RUNS[kind](ask)

    expect(asked).toHaveLength(2)
    expect(asked.map((prompt) => prompt.kind)).toEqual([kind, kind])
  })
})

describe('which kind a system part is', () => {
  test.each(MODEL_REQUEST_KINDS)('is %s for that kind’s briefing', (kind) => {
    // How a host's ask names the request to its server: by the briefing the run handed
    // it, so one ask serves the prompt, translations and scenario panes alike.
    expect(modelRequestKind(modelBriefing(kind))).toBe(kind)
  })

  test('is none for a system part formancy did not write, however close', () => {
    // A host's own briefing, or one edited on the way, sent under a kind formancy makes:
    // the server would answer it under formancy's briefing, which is not what was asked.
    const authoring = modelBriefing('authoring')
    expect(modelRequestKind(`${authoring} `)).toBeUndefined()
    expect(modelRequestKind(authoring.slice(1))).toBeUndefined()
    expect(modelRequestKind('You are a helpful assistant.')).toBeUndefined()
    expect(modelRequestKind('')).toBeUndefined()
  })
})

describe('what names a kind', () => {
  test('is one of the list, and nothing an object happens to have', () => {
    // Read from a request body. A lookup by `in` would take `constructor` and
    // `__proto__` as kinds, and the server would pin a function's text as a briefing.
    for (const kind of MODEL_REQUEST_KINDS) expect(isModelRequestKind(kind)).toBe(true)
    for (const other of ['Authoring', 'constructor', '__proto__', 'toString', '', 1, null, undefined, {}]) {
      expect(isModelRequestKind(other)).toBe(false)
    }
  })
})
