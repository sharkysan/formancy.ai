import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import type { FormEngine } from './engine.js'
import { parsePath } from './path.js'
import type { Path } from './path.js'

/**
 * The server's replay of what the browser hands over judges as the browser did, by the roads a
 * browser can take.
 *
 * The browser reaches its answers one at a time — set, change, walk past a page, add a row,
 * remove it — and keeps state between passes: what is hidden, which pages are walked past, which
 * rows exist. The server builds an engine once, in server mode, from exactly what `value()` handed
 * over. If the two disagree about the verdict, an error, a page, what is stored or what a field
 * shows, the person was judged by one form and the response by another — hazard A2, which the one
 * engine build (0006) answers only for the same road. Three defects in one week were that
 * disagreement by another road: a skipped page that hid with a rule's switch, a computed rule
 * ordered by top-level names, and a skipped page's answers left out of what was judged (0246).
 *
 * So the road is chosen at random. Each walk applies what a person could do — an answer to a
 * field that is shown, enabled and theirs to give, a row added or removed where the buttons
 * allow — then the replay is built from `value()` and every reading compared. A failure prints
 * the seed to run it again and a walk shrunk from the one that broke it.
 */

const capabilities = { now: () => 0, today: () => '2026-11-27', random: () => 0.5 }

const page = (key: string, fields: unknown[]): unknown => ({ key, type: 'page', label: key, fields })
const form = (id: string, fields: unknown[], rules: unknown[]): FormSchema =>
  ({ specVersion: '5', id, title: id, model: { fields }, logic: { rules } }) as FormSchema

/**
 * Each form holds one road the engine has got wrong, or one next to it. One road is left out of
 * them, because the engine still gets it wrong: a rule reading an answer that a hiding clears in the
 * same pass. It is pinned below as debt, and joins these forms when it is fixed.
 */
const forms: ReadonlyArray<{ name: string; schema: FormSchema }> = [
  {
    name: 'a visa page walked past, a field shown and a fee computed by what it holds',
    schema: form(
      'visa',
      [
        page('p1', [
          { key: 'needsVisa', type: 'checkbox', label: 'Visa?' },
          { key: 'agreed', type: 'checkbox', label: 'Agreed' },
          { key: 'receipt', type: 'text', label: 'Receipt', required: true },
          { key: 'fee', type: 'number', label: 'Fee' },
        ]),
        page('p2', [
          { key: 'passport', type: 'text', label: 'Passport', required: true },
          { key: 'visaType', type: 'text', label: 'Visa type', default: 'tourist' },
        ]),
      ],
      [
        { target: 'p2', kind: 'skip', cel: 'needsVisa != true' },
        { target: 'visaType', kind: 'visible', cel: 'agreed == true' },
        { target: 'receipt', kind: 'visible', cel: "passport == 'X123'" },
        { target: 'fee', kind: 'computed', cel: "passport == 'X123' ? 60.0 : 0.0" },
      ],
    ),
  },
  {
    name: 'a question required when a page walked past holds no answer',
    schema: form(
      'insurance',
      [
        page('p1', [{ key: 'insured', type: 'checkbox', label: 'Insured?' }]),
        page('p2', [{ key: 'policy', type: 'text', label: 'Policy number' }]),
        page('p3', [{ key: 'selfPay', type: 'checkbox', label: 'I will pay myself' }]),
      ],
      [
        { target: 'p2', kind: 'skip', cel: 'insured != true' },
        { target: 'selfPay', kind: 'required', cel: 'policy == null' },
      ],
    ),
  },
  {
    name: 'a chain of skips, and a skip reading its own page',
    schema: form(
      'chain',
      [
        page('p1', [{ key: 'go', type: 'checkbox', label: 'Go' }]),
        page('p2', [{ key: 'x', type: 'checkbox', label: 'X' }]),
        page('p3', [
          { key: 'y', type: 'text', label: 'Y', required: true },
          { key: 'done', type: 'checkbox', label: 'Done', required: true },
        ]),
      ],
      [
        { target: 'p2', kind: 'skip', cel: 'go != true' },
        { target: 'p3', kind: 'skip', cel: 'x != true || done == true' },
      ],
    ),
  },
  {
    name: 'a payment page walked past by the total computed on it',
    schema: form(
      'pay',
      [
        page('p1', [{ key: 'qty', type: 'number', label: 'Tickets' }]),
        page('p2', [
          { key: 'total', type: 'number', label: 'Total due' },
          { key: 'card', type: 'text', label: 'Card number', required: true },
        ]),
      ],
      [
        { target: 'total', kind: 'computed', cel: 'qty * 10.0' },
        { target: 'p2', kind: 'skip', cel: 'total == 0.0' },
      ],
    ),
  },
  {
    name: 'a group a rule computes into and reads back',
    schema: form(
      'address',
      [
        {
          key: 'addr',
          type: 'group',
          label: 'Address',
          fields: [
            { key: 'city', type: 'text', label: 'City' },
            { key: 'zip', type: 'text', label: 'Postcode' },
            { key: 'line', type: 'text', label: 'Line' },
          ],
        },
        { key: 'confirm', type: 'checkbox', label: 'Confirm' },
      ],
      [
        { target: 'addr.line', kind: 'computed', cel: "'in ' + addr.city" },
        { target: 'addr.zip', kind: 'visible', cel: "addr.city == 'Bern'" },
        { target: 'confirm', kind: 'required', cel: "addr.line == 'in Bern'" },
        { target: 'addr.zip', kind: 'disabled', cel: 'confirm == true' },
      ],
    ),
  },
  {
    name: 'rows of a list in a group, computed row by row and read by position',
    schema: form(
      'order',
      [
        {
          key: 'order',
          type: 'group',
          label: 'Order',
          fields: [
            {
              key: 'lines',
              type: 'repeater',
              label: 'Lines',
              minItems: 1,
              maxItems: 3,
              fields: [
                { key: 'qty', type: 'number', label: 'Quantity', default: 1 },
                { key: 'twice', type: 'number', label: 'Twice' },
                { key: 'note', type: 'text', label: 'Note', required: true },
              ],
            },
          ],
        },
        { key: 'first', type: 'number', label: 'First' },
      ],
      [
        { target: 'order.lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' },
        { target: 'order.lines[].note', kind: 'visible', cel: 'item.qty > 2.0' },
        { target: 'first', kind: 'computed', cel: 'order.lines[0].twice * 1.0' },
      ],
    ),
  },
  {
    name: 'answers a rule hides, one kept and one cleared, and a default shown again',
    schema: form(
      'details',
      [
        { key: 'hasDetails', type: 'checkbox', label: 'Add details' },
        { key: 'notes', type: 'text', label: 'Notes', default: 'none', clearOnHide: true },
        { key: 'reference', type: 'text', label: 'Reference', clearOnHide: false },
        { key: 'extra', type: 'text', label: 'Extra', required: true },
      ],
      [
        { target: 'notes', kind: 'visible', cel: 'hasDetails == true' },
        { target: 'reference', kind: 'visible', cel: 'hasDetails == true' },
        { target: 'extra', kind: 'visible', cel: "reference == 'X123'" },
      ],
    ),
  },
]

/**
 * The answers a walk gives, by type: a few, chosen to meet the conditions above. Never an emptied
 * number, which a control writes as `null`: a computed rule reading one cannot be evaluated, keeps
 * in the browser what it last wrote while the replay computes nothing, and that is SAFETY-ANALYSIS
 * A3's residual, a disagreement accepted by design rather than one this looks for.
 */
const answers: Partial<Record<FieldDef['type'], readonly unknown[]>> = {
  checkbox: [true, false],
  text: ['', 'X123', 'Bern'],
  number: [0, 2, 3],
}

interface Leaf {
  /** The field's path, or a row member's path inside its row. */
  readonly path: Path
  /** The list a row member belongs to. */
  readonly row?: Path
  readonly pool: readonly unknown[]
}

/** Every field a person can answer, a row's members under the list's path, and every list. Throws on a type it has no answers for, so a form cannot gain a field the walks quietly leave alone. */
function walkable(fields: readonly FieldDef[], parent: Path = [], row?: Path): { leaves: Leaf[]; lists: Path[] } {
  const leaves: Leaf[] = []
  const lists: Path[] = []
  for (const def of fields) {
    if (def.type === 'page' || def.type === 'group') {
      const inner = walkable(def.fields ?? [], def.type === 'group' ? [...parent, def.key] : parent, row)
      leaves.push(...inner.leaves)
      lists.push(...inner.lists)
    } else if (def.type === 'repeater') {
      lists.push([...parent, def.key])
      leaves.push(...walkable(def.fields ?? [], [], [...parent, def.key]).leaves)
    } else {
      const pool = answers[def.type]
      if (pool === undefined) throw new Error(`No answers for a ${def.type}: give the walks some before a form holds one.`)
      leaves.push({ path: [...parent, def.key], ...(row === undefined ? {} : { row }), pool })
    }
  }
  return { leaves, lists }
}

/** A step a person could take, in words a failure prints: a field's path and the answer, a list's path. */
type Step = { answer: string; value: unknown; row: number } | { add: string } | { remove: string; row: number }

const rowOf = fc.integer({ min: 0, max: 2 })

/** Walks over one form: answers to its fields and, where it has a list, rows added and removed. */
function walksOf(walk: { leaves: Leaf[]; lists: Path[] }): fc.Arbitrary<Step[]> {
  const wire = (path: Path): string => path.join('.')
  const answer = fc.oneof(
    ...walk.leaves.map((leaf) =>
      fc.record({
        answer: fc.constant(wire(leaf.row === undefined ? leaf.path : [...leaf.row, '[]', ...leaf.path])),
        value: fc.constantFrom(...leaf.pool),
        row: rowOf,
      }),
    ),
  )
  const lists = walk.lists.map(wire)
  const step: fc.Arbitrary<Step> =
    lists.length === 0
      ? answer
      : fc.oneof(
          { weight: 6, arbitrary: answer },
          { weight: 1, arbitrary: fc.record({ add: fc.constantFrom(...lists) }) },
          { weight: 1, arbitrary: fc.record({ remove: fc.constantFrom(...lists), row: rowOf }) },
        )
  // `size: 'max'` because fast-check's default size keeps an array to ten, well short of the
  // roads the forms are named for.
  return fc.array(step, { minLength: 1, maxLength: 30, size: 'max' })
}

/** What a person could do now, or nothing: a field hidden, disabled or computed takes no answer, a row no button offers is not added. */
function take(engine: FormEngine, walk: { leaves: Leaf[]; lists: Path[] }, step: Step): void {
  const listAt = (wire: string): Path => walk.lists.find((list) => list.join('.') === wire)!
  if ('answer' in step) {
    const leaf = walk.leaves.find((each) => (each.row === undefined ? each.path : [...each.row, '[]', ...each.path]).join('.') === step.answer)!
    if (leaf.row !== undefined && step.row >= engine.rowCount(leaf.row)) return
    const path = leaf.row === undefined ? leaf.path : [...leaf.row, step.row, ...leaf.path]
    const snapshot = engine.getFieldSnapshot(path)
    if (!snapshot.visible || snapshot.disabled || snapshot.readOnly) return
    engine.setValue(path, step.value)
    return
  }
  const list = listAt('add' in step ? step.add : step.remove)
  if (!engine.getFieldSnapshot(list).visible) return
  if ('add' in step) {
    if (engine.canAddRow(list)) engine.addRow(list)
  } else if (step.row < engine.rowCount(list) && engine.canRemoveRow(list)) {
    engine.removeRow(list, step.row)
  }
}

/** Everything the two must agree on, read after a submit, so every field has been validated. */
function readings(engine: FormEngine): { accepted: boolean; errors: unknown; skipped: boolean[]; stored: unknown; fields: Record<string, Reading> } {
  const outcome = engine.submit()
  return {
    accepted: outcome.ok,
    errors: outcome.errors,
    skipped: engine.pages().map((each) => each.skipped),
    stored: engine.submission(),
    fields: Object.fromEntries(
      engine.fieldPaths().map((wire) => {
        const { value, visible, required, disabled } = engine.getFieldSnapshot(parsePath(wire))
        return [wire, { value, visible, required, disabled }]
      }),
    ),
  }
}

interface Reading {
  readonly value: unknown
  readonly visible: boolean
  readonly required: boolean
  readonly disabled: boolean
}

/** A value as text with every object's keys in one order: the two engines write keys in different orders. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, held: unknown) =>
    held !== null && typeof held === 'object' && !Array.isArray(held) ? Object.fromEntries(Object.entries(held).sort(([a], [b]) => a.localeCompare(b))) : held,
  ) ?? 'undefined'

/**
 * Where the two disagree, as lines a failure prints. None is allowed. SAFETY-ANALYSIS A3 names one
 * disagreement by design — a computed rule whose inputs are emptied keeps in the browser what it
 * last wrote, while the replay computes nothing — and no form here can reach it: no answer a walk
 * gives empties a computed rule's input, and a row is added with its quantity's default. Allowing
 * it instead let a computed field a pass behind in the browser, which is a defect, through as the
 * same thing (#358's, measured 2026-11-27).
 */
function disagreements(browser: ReturnType<typeof readings>, replay: ReturnType<typeof readings>): string[] {
  const lines: string[] = []
  const differ = (what: string, a: unknown, b: unknown): void => {
    if (canonical(a) !== canonical(b)) lines.push(`${what}: browser ${canonical(a)}, replay ${canonical(b)}`)
  }
  differ('accepted', browser.accepted, replay.accepted)
  differ('errors', browser.errors, replay.errors)
  differ('skipped pages', browser.skipped, replay.skipped)
  differ('stored', browser.stored, replay.stored)
  differ('fields shown', Object.keys(browser.fields), Object.keys(replay.fields))
  for (const [wire, seen] of Object.entries(browser.fields)) {
    const other = replay.fields[wire]
    if (other === undefined) continue
    differ(wire, seen, other)
  }
  return lines
}

describe('the replay of what the browser hands over, by random roads', () => {
  for (const { name, schema } of forms) {
    test(
      name,
      () => {
        const walk = walkable(schema.model.fields)
        fc.assert(
          fc.property(walksOf(walk), (road) => {
            const browser = createFormEngine({ schema, capabilities })
            for (const step of road) take(browser, walk, step)
            // What reaches the server is a JSON body, not the browser's own object.
            const sent = JSON.parse(JSON.stringify(browser.value())) as unknown
            const replay = createFormEngine({ schema, initialValue: sent, capabilities, mode: 'server' })

            expect(disagreements(readings(browser), readings(replay))).toEqual([])
          }),
          { numRuns: 300 },
        )
        // Under coverage the slowest form takes most of vitest's default five seconds.
      },
      30_000,
    )
  }
})

/**
 * Debt: a rule reading an answer that a hiding clears in the same pass (SAFETY-ANALYSIS A2,
 * arc42 §11). Found by the walks above on 2026-11-27, against `main`.
 *
 * The rules of a pass read the answers as the pass began. A `visible` rule that hides a field
 * clears its answer in the store, not in what the pass reads — so the order the rules run in does
 * not matter — and nothing runs the pass again for it until the next answer, unless the same pass
 * filled a default or topped a list up to its minimum rows, which runs it again. In the browser whatever the cleared answer decided stays
 * decided; the replay starts without the answer. Both ways round: what it showed stays shown and
 * required and what it computed stays, so the browser refuses what the server accepts; a `required`
 * it switched off stays off, or what it hid stays hidden, so the browser accepts what the server
 * refuses — on a field it shows as optional, or, where it hid the field, on one it does not show. The cases assert the disagreement as it is, so that the fix is seen: it
 * flips them, and the road joins the forms.
 */
describe('debt: a rule reading an answer a hiding clears in the same pass', () => {
  const replayOf = (schema: FormSchema, browser: FormEngine): FormEngine =>
    createFormEngine({ schema, initialValue: JSON.parse(JSON.stringify(browser.value())) as unknown, capabilities, mode: 'server' })

  test('a field shown by the cleared answer stays shown, and holds the form up, in the browser only', () => {
    const schema = form(
      'details',
      [
        { key: 'hasDetails', type: 'checkbox', label: 'Add details' },
        { key: 'notes', type: 'text', label: 'Notes' },
        { key: 'extra', type: 'text', label: 'Extra', required: true },
      ],
      [
        { target: 'notes', kind: 'visible', cel: 'hasDetails == true' },
        { target: 'extra', kind: 'visible', cel: "notes == 'X123'" },
      ],
    )
    const browser = createFormEngine({ schema, capabilities })
    browser.setValue(['hasDetails'], true)
    browser.setValue(['notes'], 'X123')
    browser.setValue(['hasDetails'], false)
    const replay = replayOf(schema, browser)

    expect(browser.value()).toEqual({ hasDetails: false })
    expect(browser.getFieldSnapshot(['extra']).visible).toBe(true)
    expect(browser.submit()).toMatchObject({ ok: false, errors: { extra: ['required'] } })
    expect(replay.getFieldSnapshot(['extra']).visible).toBe(false)
    expect(replay.submit().ok).toBe(true)
  })

  test('a value computed from the cleared answer stays, in the browser only', () => {
    const schema = form(
      'fee',
      [
        { key: 'agreed', type: 'checkbox', label: 'Agreed' },
        { key: 'passport', type: 'text', label: 'Passport' },
        { key: 'fee', type: 'number', label: 'Fee' },
      ],
      [
        { target: 'passport', kind: 'visible', cel: 'agreed == true' },
        { target: 'fee', kind: 'computed', cel: "passport == 'X123' ? 60.0 : 0.0" },
      ],
    )
    const browser = createFormEngine({ schema, capabilities })
    browser.setValue(['agreed'], true)
    browser.setValue(['passport'], 'X123')
    browser.setValue(['agreed'], false)
    const replay = replayOf(schema, browser)

    expect(browser.value()).toEqual({ agreed: false, fee: 60 })
    expect(replay.value()).toEqual({ agreed: false, fee: 0 })
  })

  test('a field the cleared answer hid stays hidden, and the server refuses what the browser sent', () => {
    // The direction that costs the person: the browser accepts and sends, and the server answers
    // with an error on a field the browser does not show, so there is nothing for them to answer.
    const schema = form(
      'withdrawn',
      [
        { key: 'hasDetails', type: 'checkbox', label: 'Add details' },
        { key: 'notes', type: 'text', label: 'Notes' },
        { key: 'extra', type: 'text', label: 'Extra', required: true },
      ],
      [
        { target: 'notes', kind: 'visible', cel: 'hasDetails == true' },
        { target: 'extra', kind: 'visible', cel: "notes != 'X123'" },
      ],
    )
    const browser = createFormEngine({ schema, capabilities })
    browser.setValue(['hasDetails'], true)
    browser.setValue(['notes'], 'X123')
    browser.setValue(['hasDetails'], false)
    const replay = replayOf(schema, browser)

    expect(browser.getFieldSnapshot(['extra']).visible).toBe(false)
    expect(browser.submit().ok).toBe(true)
    expect(replay.submit()).toMatchObject({ ok: false, errors: { extra: ['required'] } })
  })

  test('a field the cleared answer made optional stays optional, and the server refuses it empty', () => {
    // The same direction, on a field the browser does show: the person can answer it once the
    // server says so, which is why A2 tells the two apart.
    const schema = form(
      'optional',
      [
        { key: 'hasDetails', type: 'checkbox', label: 'Add details' },
        { key: 'notes', type: 'text', label: 'Notes' },
        { key: 'extra', type: 'text', label: 'Extra' },
      ],
      [
        { target: 'notes', kind: 'visible', cel: 'hasDetails == true' },
        { target: 'extra', kind: 'required', cel: "notes != 'X123'" },
      ],
    )
    const browser = createFormEngine({ schema, capabilities })
    browser.setValue(['hasDetails'], true)
    browser.setValue(['notes'], 'X123')
    browser.setValue(['hasDetails'], false)
    const replay = replayOf(schema, browser)

    expect(browser.getFieldSnapshot(['extra'])).toMatchObject({ visible: true, required: false })
    expect(browser.submit().ok).toBe(true)
    expect(replay.submit()).toMatchObject({ ok: false, errors: { extra: ['required'] } })
  })
})
