import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { runScenarios } from './scenarios.js'
import type { Scenario } from './scenarios.js'

/**
 * Running what a form is supposed to do, and saying where it stopped doing it.
 *
 * A condition type-checks and is still the wrong business rule. `visible:
 * leaveType == 'other'` and `visible: leaveType != 'other'` are both valid
 * CEL, both compile, both pass every gate this repository has — and one of
 * them asks a question nobody should be asked. Neither the validator, the
 * engine's compile nor the expression checker can tell them apart, because the
 * difference is not in the document: it is between the document and what
 * somebody meant.
 *
 * The one thing that can is an example with its answer written down. The
 * starter templates have carried those since they shipped — `*.scenarios.json`
 * beside each form — and the runner lived **inside one test file**, as a
 * `Scenario` interface and twenty lines of `expect`. So a capability the
 * product demonstrably needs was available to this repository's own test suite
 * and to nobody else: not to a form author, not to a consumer's CI, not to an
 * agent about to publish ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 *
 * What this adds is the runner, as a published function that **reports**
 * rather than asserts — because the caller is sometimes a test and sometimes a
 * panel in a builder, and a panel cannot be built out of `expect`.
 */
const leave: FormSchema = {
  specVersion: '2',
  id: 'leave',
  title: 'Leave request',
  model: {
    fields: [
      { key: 'fullName', type: 'text', label: 'Full name', required: true },
      {
        key: 'leaveType',
        type: 'radio',
        label: 'Type of leave',
        options: [
          { value: 'holiday', label: 'Holiday' },
          { value: 'other', label: 'Other' },
        ],
      },
      { key: 'otherReason', type: 'text', label: 'Please say more' },
      { key: 'days', type: 'number', label: 'Days', min: 1 },
    ],
  },
  logic: {
    rules: [
      { target: 'otherReason', kind: 'visible', cel: "leaveType == 'other'" },
      { target: 'otherReason', kind: 'required', cel: "leaveType == 'other'" },
    ],
  },
}

const start = { fullName: 'Ada', leaveType: 'holiday', days: 2 }

const run = (scenarios: readonly Scenario[]) =>
  runScenarios(leave, scenarios, { initialValue: start })

describe('a scenario that holds', () => {
  test('passes, and says which it was', () => {
    const [result] = run([
      { name: 'other needs a reason', changes: { leaveType: 'other' }, valid: false, errors: { otherReason: ['required'] } },
    ])

    expect(result?.name).toBe('other needs a reason')
    expect(result?.passed).toBe(true)
    expect(result?.failures).toEqual([])
  })

  test('and visibility, values and absence are all checkable', () => {
    /*
     * The four things a scenario can pin, and the reason there are four:
     * "is the form valid" alone cannot tell a cleared branch from one that was
     * never filled, and that distinction is the whole of `clearOnHide`.
     */
    const [result] = run([
      {
        name: 'switching away clears the branch',
        changes: { leaveType: 'other', otherReason: 'a reason', days: 3 },
        valid: true,
        visible: { otherReason: true },
        values: { days: 3 },
      },
    ])

    expect(result?.failures, result?.failures.map((f) => f.detail).join('; ')).toEqual([])
  })
})

describe('what a hidden field leaves behind', () => {
  test('is checkable, because validity cannot tell a cleared branch from an empty one', () => {
    /*
     * `clearOnHide`'s own question, and the reason `absent` exists beside
     * `values`. A branch switched off must drop what somebody already typed
     * — and a form where it did not is still perfectly valid, because the
     * field is hidden and a hidden field is not validated. Nothing but the
     * submission itself can say which happened.
     */
    const clearing: FormSchema = {
      ...leave,
      model: {
        fields: leave.model.fields.map((field) =>
          field.key === 'otherReason' ? { ...field, clearOnHide: true } : field,
        ),
      },
    }

    const [kept] = runScenarios(
      clearing,
      [
        {
          name: 'switching away takes the reason with it',
          changes: { leaveType: 'other', otherReason: 'because', ...{} },
          valid: true,
          absent: ['otherReason'],
        },
      ],
      { initialValue: start },
    )

    // Still visible, so the answer is still there: the scenario is wrong and
    // has to say so rather than pass on the form being valid.
    expect(kept?.passed).toBe(false)
    expect(kept?.failures[0]?.about).toBe('absent')
    expect(kept?.failures[0]?.detail).toContain('because')

    /*
     * And the other way, so the check is not simply always failing: start with
     * the branch open and an answer in it, then close it.
     *
     * It has to start that way rather than set the field and close the branch
     * in one scenario, because `changes` is a map — a path appears in it once.
     * That is the format the templates have carried since they shipped, and
     * the cost is that a sequence needs an initial value.
     */
    const [gone] = runScenarios(
      clearing,
      [
        {
          name: 'and is gone once the branch closes again',
          changes: { leaveType: 'holiday' },
          valid: true,
          absent: ['otherReason'],
        },
      ],
      { initialValue: { ...start, leaveType: 'other', otherReason: 'because' } },
    )

    expect(gone?.failures.map((failure) => failure.detail)).toEqual([])
  })
})

describe('a scenario that no longer holds', () => {
  test('fails with what was expected and what happened, not just "failed"', () => {
    /*
     * The report is the feature. "3 of 5 scenarios fail" sends somebody back
     * to the document to work out which rule they broke; "otherReason was
     * expected to be invisible and is visible" names it.
     */
    const [result] = run([
      { name: 'other hides the reason', changes: { leaveType: 'other' }, valid: true, visible: { otherReason: false } },
    ])

    expect(result?.passed).toBe(false)
    const detail = result?.failures.map((failure) => failure.detail).join(' | ') ?? ''
    expect(detail).toContain('otherReason')
    expect(detail).toMatch(/visible/i)
    /*
     * All three, not the first. The rule is inverted, so the form is invalid
     * where the scenario says valid, `otherReason` carries a `required` the
     * scenario does not expect, and it is visible where the scenario says
     * hidden. Reporting only the first would send somebody round the loop
     * three times for one mistake.
     */
    expect(result?.failures.map((failure) => failure.about).sort()).toEqual([
      'errors',
      'valid',
      'visible',
    ])
  })

  test('and an unexpected error is reported as loudly as a missing one', () => {
    // Asymmetry here is a real failure mode: a rule that fires when it should
    // not is as wrong as one that does not fire, and easier to miss because
    // the form still looks strict.
    const [missing] = run([
      { name: 'expects an error that does not happen', changes: { days: 5 }, valid: false, errors: { days: ['min'] } },
    ])
    const [extra] = run([
      { name: 'does not expect the error that does', changes: { days: 0 }, valid: true },
    ])

    expect(missing?.passed).toBe(false)
    expect(extra?.passed).toBe(false)
    expect(extra?.failures.some((failure) => failure.detail.includes('min'))).toBe(true)
  })

  test('and a path the form does not have is a failure rather than a silent pass', () => {
    /*
     * The trap this repository keeps meeting. A scenario naming `otherReson`
     * sets nothing, asserts nothing and passes — green while checking a field
     * that does not exist, which is exactly how a renamed field leaves its
     * scenarios behind.
     */
    const [result] = run([
      { name: 'a typo in the path', changes: { otherReson: 'x' }, valid: true },
    ])

    expect(result?.passed, 'a scenario about a field that does not exist passed').toBe(false)
    expect(result?.failures[0]?.detail).toContain('otherReson')
  })
})

describe('running a set of them', () => {
  test('runs every one rather than stopping at the first failure', () => {
    // A panel that showed one failure at a time would make fixing a rule a
    // sequence of reruns, and the second failure is often the explanation of
    // the first.
    const results = run([
      { name: 'one', changes: { leaveType: 'other' }, valid: true },
      { name: 'two', changes: { days: 0 }, valid: true },
      { name: 'three', changes: {}, valid: true },
    ])

    expect(results.map((result) => result.passed)).toEqual([false, false, true])
  })

  test('and each starts from the same state, so one cannot poison the next', () => {
    /*
     * Each scenario gets its own engine. Sharing one would make the order of
     * the list part of the meaning of every scenario in it, and reordering a
     * list in a panel would change what it checks.
     */
    const results = run([
      { name: 'sets a reason', changes: { leaveType: 'other', otherReason: 'because' }, valid: true },
      { name: 'expects the start state back', changes: {}, valid: true, values: { leaveType: 'holiday' } },
    ])

    expect(results.every((result) => result.passed)).toBe(true)
  })

  test('and a document the engine refuses is reported once, not once per scenario', () => {
    // Twenty identical failures saying "no such field: wehre" is noise around
    // one fact. The scenarios cannot run at all, and that is the report.
    const broken: FormSchema = {
      ...leave,
      logic: { rules: [{ target: 'otherReason', kind: 'visible', cel: 'leavType == 1' }] },
    }

    const results = runScenarios(broken, [{ name: 'anything', changes: {}, valid: true }], {
      initialValue: start,
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.passed).toBe(false)
    expect(results[0]?.failures[0]?.about).toBe('document')
  })
})

describe('the mode a scenario runs in', () => {
  test('is the client by default and the server when asked', () => {
    /*
     * The two the engine has, and the difference is not cosmetic: server mode
     * is what the publish gate and the submission endpoint run. A scenario
     * that passes in one and fails in the other is the client/server drift
     * this whole product exists to prevent, so the runner has to be able to
     * ask both.
     */
    const scenario: Scenario = { name: 'holds in both', changes: { leaveType: 'other', otherReason: 'why' }, valid: true }

    expect(runScenarios(leave, [scenario], { initialValue: start })[0]?.passed).toBe(true)
    expect(
      runScenarios(leave, [scenario], { initialValue: start, mode: 'server' })[0]?.passed,
    ).toBe(true)
  })
})
