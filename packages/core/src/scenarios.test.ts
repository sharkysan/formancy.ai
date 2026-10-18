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

  test('is looked for where the field is, inside a group or a repeater’s row', () => {
    /*
     * `absent` was a key looked up at the top of the submission, and no submission has a
     * key `home.street`. So an `absent` on a field inside a group or a row held whatever
     * the form did — green while checking nothing, the failure the path check below exists
     * to prevent, reached through a path that is the form's own. A drafted example names
     * those paths as readily as any other (0162).
     */
    const nested: FormSchema = {
      specVersion: '2',
      id: 'nested',
      title: 'Nested',
      model: {
        fields: [
          {
            key: 'where',
            type: 'radio',
            options: [
              { value: 'home', label: 'At home' },
              { value: 'away', label: 'Away' },
            ],
          },
          { key: 'home', type: 'group', fields: [{ key: 'street', type: 'text' }] },
          { key: 'currency', type: 'text' },
          { key: 'items', type: 'repeater', fields: [{ key: 'discount', type: 'number' }] },
        ],
      },
      logic: {
        rules: [
          { target: 'home.street', kind: 'visible', cel: 'where == "home"' },
          { target: 'items[].discount', kind: 'visible', cel: 'currency == "CHF"' },
        ],
      },
    }
    const filled = { where: 'home', home: { street: 'Main St' }, currency: 'CHF', items: [{ discount: 5 }] }
    const absent = (changes: Record<string, unknown>, path: string) =>
      runScenarios(nested, [{ name: path, changes, valid: true, absent: [path] }], { initialValue: filled })[0]

    // Still shown, so still answered: each expectation is wrong and has to say so.
    const street = absent({}, 'home.street')
    expect(street?.failures.map((failure) => failure.about)).toEqual(['absent'])
    expect(street?.failures[0]?.detail).toContain('Main St')
    expect(absent({}, 'items[0].discount')?.failures.map((failure) => failure.about)).toEqual(['absent'])

    // And hidden, so cleared where it was: the check is not simply always failing.
    expect(absent({ where: 'away' }, 'home.street')?.failures).toEqual([])
    expect(absent({ currency: 'EUR' }, 'items[0].discount')?.failures).toEqual([])
    // A group nobody answered is not in the submission at all, and neither is its field:
    // reading through a missing group is an answer, not an error.
    const [unanswered] = runScenarios(nested, [
      { name: 'never asked', changes: {}, valid: true, absent: ['home.street'] },
    ])
    expect(unanswered?.failures).toEqual([])
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

describe('a path that names something other than one answer', () => {
  /*
   * A conference registration, as the form the report was about was: colleagues to bring,
   * up to three, each with a fee, and a figure the form works out from the list. Pages,
   * groups and a group inside a row are here because each is a path an example can name
   * that is not a field.
   */
  const conference: FormSchema = {
    specVersion: '2',
    id: 'conference',
    title: 'Conference registration',
    model: {
      fields: [
        {
          key: 'details',
          type: 'page',
          fields: [
            {
              key: 'home',
              type: 'group',
              fields: [
                { key: 'street', type: 'text' },
                { key: 'city', type: 'text' },
              ],
            },
            { key: 'name', type: 'text', label: 'Name' },
            { key: 'notes', type: 'group', fields: [] },
          ],
        },
        {
          key: 'party',
          type: 'page',
          fields: [
            {
              key: 'colleagues',
              type: 'repeater',
              maxItems: 3,
              fields: [
                { key: 'who', type: 'text', required: true },
                { key: 'fee', type: 'number' },
                { key: 'badge', type: 'group', fields: [{ key: 'title', type: 'text' }] },
              ],
            },
            { key: 'count', type: 'number' },
          ],
        },
      ],
    },
    logic: { rules: [{ target: 'count', kind: 'computed', cel: 'size(colleagues)' }] },
  }

  const failuresOf = (schema: FormSchema, scenario: Omit<Scenario, 'name'>) =>
    runScenarios(schema, [{ name: 'one', ...scenario }])[0]?.failures ?? []

  /** What the runner says about `path` when it is set. */
  const saidOf = (schema: FormSchema, path: string) =>
    failuresOf(schema, { changes: { [path]: 'x' }, valid: true })

  /**
   * The sentence a path gets from a form that has nothing at all: what "this form has no
   * such field" reads as for exactly that path. Compared, rather than its wording matched,
   * so a sentence about a list cannot pass by containing some other phrase.
   */
  const missing = (path: string) => saidOf({ ...conference, model: { fields: [] }, logic: { rules: [] } }, path)[0]?.detail

  /** The paths a sentence offers in place of the one it is about. */
  const offered = (detail: string, path: string) =>
    [...detail.matchAll(/"([^"]+)"/g)].map((match) => match[1]!).filter((quoted) => quoted !== path)

  /** Whether the runner takes `path` as one answer a scenario can name. */
  const taken = (path: string) => saidOf(conference, path).every((failure) => failure.about !== 'path')

  test('a repeater named whole is said to be a list, with the spelling that fills it', () => {
    /*
     * The report. An example filled `colleagues` in one step and was told the form has no
     * "colleagues", that it was probably renamed. The list was there, so the sentence sent
     * somebody looking for a rename that never happened, and said nothing of how a list
     * is filled.
     */
    const failures = failuresOf(conference, {
      changes: { colleagues: [{ who: 'Ada', fee: 100 }, { who: 'Grace', fee: 120 }] },
      valid: true,
      values: { count: 2 },
    })

    expect(failures.map((failure) => failure.about)).toEqual(['path'])
    const detail = failures[0]!.detail
    expect(detail).toContain('"colleagues"')
    expect(detail, 'a list is told the form does not have it').not.toBe(missing('colleagues'))
    const instead = offered(detail, 'colleagues')
    expect(instead, 'it says what a list is and not how to name what is in it').not.toEqual([])
    for (const path of instead) expect(taken(path), `it offers "${path}", which the runner refuses`).toBe(true)

    // The publish runs the examples in server mode, and its warning is this sentence too.
    const [onTheServer] = runScenarios(
      conference,
      [{ name: 'one', changes: { colleagues: [{ who: 'Ada', fee: 100 }] }, valid: true }],
      { mode: 'server' },
    )
    expect(onTheServer?.failures.map((failure) => failure.detail)).toEqual([detail])
  })

  test('and the spelling it offers fills the list, adding each row it names', () => {
    /*
     * The advice, taken. A row named by its position is there afterwards, so two of them
     * make a list of two and the figure worked out from the list sees both. If naming a row
     * the list does not have set nothing, the sentence would be sending people to a spelling
     * that checks nothing.
     */
    const failures = failuresOf(conference, {
      changes: {
        'colleagues[0].who': 'Ada',
        'colleagues[0].fee': 100,
        'colleagues[1].who': 'Grace',
        'colleagues[1].fee': 120,
      },
      valid: true,
      values: { count: 2, 'colleagues[1].fee': 120 },
    })

    expect(failures.map((failure) => failure.detail)).toEqual([])
  })

  test('and it is said the same wherever an example names it, expectations as well as answers', () => {
    /*
     * Every key an example has goes through the one check before anything is set. An
     * expectation about the list as a whole got the rename sentence just as the answer did,
     * and a fix to `changes` alone would have left four of the five saying it.
     */
    const asAnAnswer = saidOf(conference, 'colleagues')[0]?.detail
    for (const expectation of [
      { errors: { colleagues: ['maxItems'] } },
      { visible: { colleagues: true } },
      { values: { colleagues: [] } },
      { absent: ['colleagues'] },
    ]) {
      const failures = failuresOf(conference, { changes: {}, valid: true, ...expectation })
      expect(failures.map((failure) => failure.detail), JSON.stringify(expectation)).toEqual([asAnAnswer])
    }
  })

  test.each([
    // A group named whole: its fields are named through it, never the group.
    ['home'],
    // A group inside a row: through the row and the group.
    ['colleagues[0].badge'],
    // A row named alone, which is no more one answer than the list is.
    ['colleagues[0]'],
    // A field of a row with the row left out: the field is there, only its position is not.
    ['colleagues.fee'],
    // And a group of a row, the same way: through the row's position and then the group.
    ['colleagues.badge'],
    // The spelling a rule targets every row with. A scenario sets one row, so it is a
    // position that is missing, not a field.
    ['colleagues[].fee'],
    // A page holds fields and scopes none, so its fields are named as though it were not there,
    // whether the first thing on it is a list or a group.
    ['party'],
    ['details'],
    // And a field named through its page is offered without it.
    ['details.name'],
  ])('"%s" is said to be what it is, with a spelling the runner takes', (path) => {
    // Each of these got the rename sentence: told the form has no such field, about a path
    // that names something the form plainly has.
    const failures = saidOf(conference, path)

    expect(failures.map((failure) => failure.about)).toEqual(['path'])
    const detail = failures[0]!.detail
    expect(detail, 'it is told the form does not have it').not.toBe(missing(path))
    const instead = offered(detail, path)
    expect(instead).not.toEqual([])
    for (const offer of instead) expect(taken(offer), `it offers "${offer}", which the runner refuses`).toBe(true)
  })

  test('a sentence with nothing the engine takes to offer offers nothing', () => {
    /*
     * The sentence offers a path only when the engine takes it. A group with no fields has
     * none, and a page named before a field the form does not have would offer that field
     * without the page: `zip`, which is not there either. Either would send somebody from
     * one wrong path to a second.
     */
    for (const path of ['notes', 'details.zip']) {
      const detail = saidOf(conference, path)[0]!.detail
      expect(detail, path).not.toBe(missing(path))
      expect(offered(detail, path), path).toEqual([])
    }
  })

  test('a field that is not there still gets the sentence about a rename', () => {
    /*
     * The other direction, so telling a list from a field cannot turn into telling every
     * missing path it is something else. A misspelt list, a field a group does not have, a
     * field a row does not have, with its position or without, a position on a group, a key
     * under a field that holds one answer, and a path that does not parse are each still a
     * field that is not there.
     */
    for (const path of ['collegues', 'home.zip', 'colleagues[0].feee', 'colleagues.feee', 'home[0]', 'name.first', 'home..street']) {
      expect(saidOf(conference, path).map((failure) => failure.detail), path).toEqual([missing(path)])
    }
  })

  test('a repeater inside a row is said to be one the engine has no fields for', () => {
    /*
     * `validateSchema` refuses a repeater inside a repeater's row, and the engine opens such
     * a document anyway and skips the inner one. The runner is handed documents nobody
     * validated — `check_scenarios` takes whatever an agent sends — so a path into it got
     * the rename sentence about a field the document plainly has, and no spelling can reach.
     */
    const nested: FormSchema = {
      specVersion: '2',
      id: 'nested',
      title: 'Nested',
      model: {
        fields: [
          {
            key: 'outer',
            type: 'repeater',
            fields: [{ key: 'inner', type: 'repeater', fields: [{ key: 'x', type: 'text' }] }],
          },
        ],
      },
    }
    const path = 'outer[0].inner[0].x'
    const detail = saidOf(nested, path)[0]!.detail

    expect(detail).not.toBe(missing(path))
    expect(offered(detail, path)).toEqual([])
  })

  test('a field in a row the list does not have is neither shown nor hidden', () => {
    /*
     * The engine answers for a row's field whatever the number of rows, so `visible` on a
     * third colleague, with two in the list, held: green about a field nobody can see or
     * fill in, the silent pass the path check exists to prevent. Expected hidden, it was
     * reported as visible, which it is not either. Whatever was expected, the answer is that
     * the row is not there.
     */
    const twoRows = { 'colleagues[0].who': 'Ada', 'colleagues[1].who': 'Grace' }
    const shown = failuresOf(conference, { changes: twoRows, valid: true, visible: { 'colleagues[2].fee': true } })
    const hidden = failuresOf(conference, { changes: twoRows, valid: true, visible: { 'colleagues[2].fee': false } })

    expect(shown.map((failure) => failure.about)).toEqual(['visible'])
    expect(hidden.map((failure) => failure.detail)).toEqual(shown.map((failure) => failure.detail))
    // And a row that is there is still answered, so the check is not simply always failing.
    expect(failuresOf(conference, { changes: twoRows, valid: true, visible: { 'colleagues[1].fee': true } })).toEqual([])
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
