import { describe, expect, test, vi } from 'vitest'
import { authorForm } from './authoring.js'
import type { AskModel } from './authoring.js'
import type { FormSchema } from '@formancy/spec'

/**
 * The loop, with a scripted model.
 *
 * No vendor, no network, no key — the model is a function, which is the whole
 * point of `AskModel` and is also what makes this testable at all. Each case
 * scripts what a model would plausibly return and asserts what the loop does
 * about it.
 *
 * What is being tested is not "does it call the model". It is that a document
 * which does not work never comes back as a success, and that the model is
 * told precisely enough to fix it on the next turn.
 */
const GOOD = {
  specVersion: '2',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', format: 'email', required: true },
      { key: 'seats', type: 'number', label: 'Seats' },
    ],
  },
}

/** A model that answers with each of these in turn. */
const scripted = (...answers: string[]): AskModel => {
  let at = 0
  return vi.fn(() => Promise.resolve(answers[Math.min(at++, answers.length - 1)] ?? ''))
}

describe('a good answer', () => {
  test('comes back as the document, on the first attempt', async () => {
    const result = await authorForm(scripted(JSON.stringify(GOOD)), 'a contact form')

    expect(result).toMatchObject({ ok: true, attempts: 1 })
  })

  test('is accepted inside a code fence, because models add one', async () => {
    // Told firmly not to, they still do it. Spending a turn on formatting
    // rather than on the form helps nobody.
    const result = await authorForm(
      scripted('Here you go:\n```json\n' + JSON.stringify(GOOD) + '\n```'),
      'a contact form',
    )

    expect(result.ok).toBe(true)
  })

  test('and with a sentence in front of it', async () => {
    const result = await authorForm(
      scripted('Sure! ' + JSON.stringify(GOOD)),
      'a contact form',
    )

    expect(result.ok).toBe(true)
  })

  test('but prose alone is not a document', async () => {
    // A bare string is valid JSON. Accepting one would report it as an
    // invalid document rather than as an answer that was not one.
    const result = await authorForm(scripted('"I could not do that"'), 'a contact form')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]?.kind).toBe('not-json')
  })
})

describe('an answer that does not work', () => {
  test('is sent back with the validator’s own words, and the retry is accepted', async () => {
    const ask = scripted(JSON.stringify({ specVersion: '2', id: 'x' }), JSON.stringify(GOOD))

    const result = await authorForm(ask, 'a contact form')

    expect(result).toMatchObject({ ok: true, attempts: 2 })
    // The second prompt has to carry the reason, or the model is guessing.
    const second = (ask as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { user: string }
    expect(second.user).toContain('rejected')
  })

  test('an expression that compiles and never runs is caught too', async () => {
    // The failure the whole loop exists for. `seats * 4` is double times int:
    // it type-checks as far as the schema is concerned and then evaluates to
    // nothing, so the form would publish cleanly and quietly do nothing.
    const broken = {
      ...GOOD,
      model: { fields: [...GOOD.model.fields, { key: 'total', type: 'number', label: 'Total' }] },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'seats * 4' }] },
    }
    const fixed = {
      ...broken,
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'seats * 4.0' }] },
    }
    const ask = scripted(JSON.stringify(broken), JSON.stringify(fixed))

    const result = await authorForm(ask, 'total is four times the seats')

    expect(result).toMatchObject({ ok: true, attempts: 2 })
    const second = (ask as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { user: string }
    // Told what to write, not just that it was wrong.
    expect(second.user).toContain('4.0')
  })

  test('only the most recent complaint is repeated', async () => {
    const ask = scripted('not json', JSON.stringify({ specVersion: '2' }), JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const third = (ask as ReturnType<typeof vi.fn>).mock.calls[2]?.[0] as { user: string }
    // Three rounds of accumulated complaints and a model starts fixing the
    // first one again.
    expect(third.user).not.toContain('That was not JSON')
  })

  test('gives up rather than circling, and says what it last saw', async () => {
    const ask = scripted('nonsense')

    const result = await authorForm(ask, 'a contact form', { attempts: 2 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.attempts).toBe(2)
      expect(result.problems).toHaveLength(2)
      // So a person can see what the model actually said, rather than being
      // told only that it failed.
      expect(result.lastAnswer).toBe('nonsense')
    }
    expect(ask).toHaveBeenCalledTimes(2)
  })

  test('a document that never works is never returned as a success', async () => {
    const ask = scripted(JSON.stringify({ specVersion: '2', id: 'x' }))

    const result = await authorForm(ask, 'a contact form', { attempts: 2 })

    // The property that matters. Everything else here is about how helpfully
    // it fails.
    expect(result.ok).toBe(false)
  })
})

describe('editing a form that already exists', () => {
  test('the current document goes in the prompt, canonicalised', async () => {
    const ask = scripted(JSON.stringify(GOOD))

    await authorForm(ask, 'add a phone number', { current: GOOD as unknown as FormSchema })

    const prompt = (ask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { user: string }
    expect(prompt.user).toContain('Here is the current document')
    expect(prompt.user).toContain('"contact"')
    // Canonical, so key order that means nothing does not distract the model
    // and two identical documents look identical to it.
    expect(prompt.user).toContain('"specVersion"')
  })

  test('without one, it is asked to write rather than to change', async () => {
    const ask = scripted(JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const prompt = (ask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { user: string }
    expect(prompt.user).not.toContain('current document')
  })
})

describe('the briefing', () => {
  test('tells the model the rules before it writes anything', async () => {
    const ask = scripted(JSON.stringify(GOOD))

    await authorForm(ask, 'a contact form')

    const prompt = (ask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { system: string }
    // Each of these is something a model gets wrong unprompted, and each has
    // cost time in this repository.
    expect(prompt.system).toContain('selectboxes')
    expect(prompt.system).toContain('4.0 rather than 4')
    expect(prompt.system).toContain('format "email"')
  })
})
