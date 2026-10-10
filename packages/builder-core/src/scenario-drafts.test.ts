import { runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import type { AskModel, AuthoringPrompt } from './answers.js'
import { createBuilderText } from './messages.js'
import { draftProblems, draftScenarios, draftStatus, draftVerdict, keepDraft } from './scenario-drafts.js'
import type { Drafted } from './scenario-drafts.js'
import { scenarioPrompt } from './scenario-prompt.js'

/**
 * Examples drafted by a model, judged by the engine, kept one at a time.
 *
 * The prompt's own property — that the model is never shown a rule — is
 * `scenario-prompt.test.ts`'s. What is held here is what happens to the answer: that one
 * broken item does not cost the others, that a model is asked again only when nothing in
 * its answer can be used, that a draft's verdict is the one the scenario pane gives after
 * Keep, and what may not be kept
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 */

const FORM: FormSchema = {
  specVersion: '4',
  id: 'travel',
  title: 'Travel',
  model: {
    fields: [
      {
        key: 'country',
        type: 'select',
        label: 'Country',
        required: true,
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      { key: 'canton', type: 'text', label: 'Canton' },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'canton', kind: 'required', cel: 'country == "CH"' },
    ],
  },
}

/** The same form with the rule written backwards: valid, compiled, and wrong. */
const BACKWARDS: FormSchema = {
  ...FORM,
  logic: { rules: FORM.logic!.rules.map((rule) => ({ ...rule, cel: 'country != "CH"' })) },
}

const ASKS_FOR_A_CANTON: Scenario = {
  name: 'Switzerland asks for a canton',
  changes: { country: 'CH' },
  valid: false,
  errors: { canton: ['required'] },
  visible: { canton: true },
}

const GERMANY_DOES_NOT: Scenario = {
  name: 'Germany does not',
  because: 'nowhere else does',
  changes: { country: 'DE' },
  valid: true,
  visible: { canton: false },
}

/** A model that answers each turn with the next of `answers`, and the prompts it was sent. */
function model(...answers: string[]): { ask: AskModel; asked: AuthoringPrompt[] } {
  const asked: AuthoringPrompt[] = []
  return {
    asked,
    ask: (prompt) => {
      asked.push(prompt)
      return Promise.resolve(answers.shift() ?? '')
    },
  }
}

const answer = (...items: unknown[]): string => JSON.stringify({ scenarios: items })

describe('drafting examples', () => {
  test('reads each item on its own, so one broken item does not cost the others', async () => {
    // A model that wrote two good examples and two it got wrong has written two good
    // examples. Reading the answer as one document threw all four away and asked again.
    const { ask, asked } = model(
      answer(
        ASKS_FOR_A_CANTON,
        { changes: {}, valid: true },
        GERMANY_DOES_NOT,
        { name: 'With a stranger', changes: {}, valid: true, expected: { canton: 'Bern' } },
      ),
    )

    const drafted = await draftScenarios(ask, FORM, 'Only Switzerland asks for a canton.')

    expect(asked).toHaveLength(1)
    expect(drafted).toEqual({
      ok: true,
      drafts: [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT],
      unusable: [
        { position: 2, reason: 'no-name' },
        { position: 4, name: 'With a stranger', reason: 'unknown-key', part: 'expected' },
      ],
      attempts: 1,
    })
  })

  test('sends the prompt that withholds the rules, with the names already taken', async () => {
    // Asked with anything else — the document, as `authorForm` sends it — a model would
    // write examples that agree with the rule they were meant to check.
    const existing = [ASKS_FOR_A_CANTON]
    const { ask, asked } = model(answer(GERMANY_DOES_NOT))

    await draftScenarios(ask, FORM, 'Only Switzerland asks.', { existing, initialValue: { country: 'DE' } })

    const expected = scenarioPrompt(FORM, 'Only Switzerland asks.', {
      existing,
      initialValue: { country: 'DE' },
    })
    expect(asked[0]).toMatchObject({ system: expected.system, user: expected.user, attempt: 1 })
  })

  test('asks again only when nothing in the answer is an example, and says what was wrong', async () => {
    // Prose, then a list in which nothing can be used: both are answers with nothing to
    // keep, and the model is told exactly why each item was not an example.
    const { ask, asked } = model(
      'Sure! Here are some examples you might find useful.',
      answer({ name: 'Nameless changes', valid: true }, 'just a string'),
      answer(GERMANY_DOES_NOT),
    )

    const drafted = await draftScenarios(ask, FORM, 'Only Switzerland asks.')

    expect(drafted.ok && drafted.attempts).toBe(3)
    expect(asked[1]?.followUp).toContain('That was not JSON')
    expect(asked[2]?.followUp).toContain('Example 1 ("Nameless changes") has no "changes" object.')
    expect(asked[2]?.followUp).toContain('Example 2 is not an object.')
    // The whole request again, for a host that keeps no conversation.
    expect(asked[2]?.user.startsWith(asked[0]!.user)).toBe(true)
  })

  test('a decline ends it after one turn, with the model’s reason', async () => {
    // Asked again, a model that judged the request impossible says so again — a round trip
    // by hand, through a relay, for the same answer.
    const { ask, asked } = model(JSON.stringify({ declined: 'No examples can check a colour.' }))

    const drafted = await draftScenarios(ask, FORM, 'It should look blue.')

    expect(asked).toHaveLength(1)
    expect(drafted).toMatchObject({ ok: false, ended: 'declined', reason: 'No examples can check a colour.' })
  })

  test('a name already taken, or repeated in the answer, is not an example', async () => {
    // Kept, the second of two examples with one name would make the panel's results
    // ambiguous: a scenario's name is how its result is found.
    const { ask } = model(
      answer({ ...GERMANY_DOES_NOT, name: ASKS_FOR_A_CANTON.name }, GERMANY_DOES_NOT, GERMANY_DOES_NOT),
    )

    const drafted = await draftScenarios(ask, FORM, 'anything', { existing: [ASKS_FOR_A_CANTON] })

    expect(drafted.ok && drafted.drafts).toEqual([GERMANY_DOES_NOT])
    expect(drafted.ok && drafted.unusable).toEqual([
      { position: 1, name: ASKS_FOR_A_CANTON.name, reason: 'name-taken' },
      { position: 3, name: GERMANY_DOES_NOT.name, reason: 'name-repeated' },
    ])
  })

  test('an expectation of the wrong shape makes the item unusable rather than quietly unchecked', async () => {
    // The runner compares what it is given. An `errors` of strings rather than lists, or a
    // `valid` of "yes", would be compared as written and fail — or pass — for a reason
    // that is about the draft's spelling, not the form.
    const { ask } = model(
      answer(
        { ...GERMANY_DOES_NOT, name: 'a', errors: { canton: 'required' } },
        { ...GERMANY_DOES_NOT, name: 'b', valid: 'yes' },
        { ...GERMANY_DOES_NOT, name: 'c', visible: { canton: 'no' } },
        { ...GERMANY_DOES_NOT, name: 'd', absent: 'canton' },
        { ...GERMANY_DOES_NOT, name: 'e', because: 42 },
        { ...GERMANY_DOES_NOT, name: 'f', values: ['x'] },
        GERMANY_DOES_NOT,
      ),
    )

    const drafted = await draftScenarios(ask, FORM, 'anything')

    expect(drafted.ok && drafted.unusable.map(({ name, reason, part }) => [name, reason, part])).toEqual([
      ['a', 'malformed', 'errors'],
      ['b', 'no-verdict', undefined],
      ['c', 'malformed', 'visible'],
      ['d', 'malformed', 'absent'],
      ['e', 'malformed', 'because'],
      ['f', 'malformed', 'values'],
    ])
  })
})

describe('what may be kept', () => {
  test('a draft that fails against the form can be kept: that is where the person decides', () => {
    // Refusing it would decide for them that the rule is right. The example may be the one
    // that is right, and keeping it is how the panel goes on saying so.
    const kept = keepDraft(BACKWARDS, [GERMANY_DOES_NOT], ASKS_FOR_A_CANTON)

    expect(draftVerdict(BACKWARDS, ASKS_FOR_A_CANTON).passed).toBe(false)
    expect(kept).toEqual({ ok: true, scenarios: [GERMANY_DOES_NOT, ASKS_FOR_A_CANTON] })
  })

  test('a draft naming a field this form does not have cannot be kept', () => {
    // It would set nothing and check nothing, and fail forever for a reason that is not
    // about any rule.
    const ghost: Scenario = { ...ASKS_FOR_A_CANTON, name: 'ghost', visible: { region: true } }

    expect(keepDraft(FORM, [], ghost)).toEqual({ ok: false, refused: 'unknown-path' })
  })

  test('a name already in the list cannot be kept, which also stops one draft being kept twice', () => {
    const once = keepDraft(FORM, [], GERMANY_DOES_NOT)
    expect(once.ok).toBe(true)

    expect(keepDraft(FORM, once.ok ? once.scenarios : [], GERMANY_DOES_NOT)).toEqual({
      ok: false,
      refused: 'name-taken',
    })
  })

  test('a draft’s verdict is the one the scenario pane gives after Keep', () => {
    /*
     * The pane runs the whole list with its own options; a draft is judged alone. If the
     * two ran differently — a draft judged without the form's sample, or in another mode —
     * the person would keep an example the panel then reports differently.
     */
    const options = { initialValue: { canton: 'Bern' }, mode: 'server' as const }
    const startsFilled: Scenario = {
      name: 'Germany drops the canton it was given',
      changes: { country: 'DE' },
      valid: true,
      absent: ['canton'],
    }
    for (const document of [FORM, BACKWARDS]) {
      for (const draft of [ASKS_FOR_A_CANTON, GERMANY_DOES_NOT, startsFilled]) {
        const others = [GERMANY_DOES_NOT, ASKS_FOR_A_CANTON].filter((one) => one !== draft)
        const kept = keepDraft(document, others, draft, options)
        const panel = runScenarios(document, kept.ok ? kept.scenarios : [], options)

        expect(panel.find((result) => result.name === draft.name)).toEqual(draftVerdict(document, draft, options))
      }
    }
  })

  test('and is the document’s, so an edit changes it', () => {
    // A verdict stored when the draft arrived would go on saying "holds" about a rule
    // somebody has since turned round.
    expect(draftVerdict(FORM, ASKS_FOR_A_CANTON).passed).toBe(true)
    expect(draftVerdict(BACKWARDS, ASKS_FOR_A_CANTON).passed).toBe(false)
  })
})

describe('what the drafting part says', () => {
  const text = createBuilderText()
  const ready: Drafted = {
    ok: true,
    drafts: [GERMANY_DOES_NOT],
    unusable: [{ position: 2, reason: 'no-name' }],
    attempts: 1,
  }

  test('what a Keep did outranks what the run came to', () => {
    // It is about the press somebody just made; the count of drafts is about a run that
    // ended a while ago.
    expect(draftStatus({ busy: false, result: ready, note: undefined }, text)).toBe(
      '1 example drafted. None is kept until you keep it. 1 item in the answer could not be used.',
    )
    const refused = { kind: 'refused', why: 'unknown-path', name: 'ghost' } as const
    expect(draftStatus({ busy: false, result: ready, note: refused }, text)).toContain(
      'Not kept: ghost names a field',
    )
  })

  test('lists the items that were not examples, and when no answer held one, what was wrong with the last', () => {
    // "Nothing was drafted" alone sends somebody to reword what they said when the model
    // wrote examples with no names.
    expect(draftProblems(ready, text)).toEqual(['Item 2 has no name.'])
    expect(
      draftProblems(
        {
          ok: false,
          attempts: 2,
          lastAnswer: '{}',
          ended: 'gave-up',
          problems: [{ kind: 'not-json' }, { kind: 'no-list' }],
        },
        text,
      ),
    ).toEqual(['The last answer held no list of examples.'])
  })
})
