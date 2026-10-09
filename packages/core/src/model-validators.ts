import { TEMPORAL_SHAPES, fitsMask } from '@formancy/spec'
import type { FieldDef, FieldFormat } from '@formancy/spec'

/**
 * The spec's built-in model validators: bounds, pattern, format.
 *
 * Emptiness is `required`'s job alone — an empty optional field trips nothing
 * here, so an author never has to write "unless it is empty" into a bound.
 * Codes are stable machine words (`min`, `maxLength`, `pattern`) except
 * formats, which carry their own name (`email`), because "format" tells a
 * message catalog nothing about what to say.
 */
export function modelViolations(def: FieldDef, value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []

  const codes: string[] = []

  // A list answer — the ticks on a selectboxes field, the files on a file
  // field — bounds its length rather than its magnitude. `minItems` and
  // `maxItems` are the same two properties a repeater uses, deliberately:
  // "how many" is one question however it is asked.
  if (LIST_VALUED.has(def.type)) {
    if (!Array.isArray(value)) {
      // A scalar where a list belongs is the hostile-payload path. Failing it
      // here rather than letting `.length` be undefined is what stops a
      // bounded field being unbounded for anyone who sends the wrong shape.
      codes.push('type')
      return codes
    }
    if (def.minItems !== undefined && value.length < def.minItems) codes.push('minItems')
    if (def.maxItems !== undefined && value.length > def.maxItems) codes.push('maxItems')
    if (def.type === 'file') codes.push(...fileViolations(def, value))
    // An order names each option once: a repeat would put one option both second and
    // fourth. A ranking's alone — ticking the same box twice on a `selectboxes` has
    // always been accepted, and refusing it now would refuse answers already stored.
    if (def.type === 'ranking' && new Set(value).size !== value.length) codes.push('duplicate')
    // Every tick is one of the offered options, or the list is not an answer. One code
    // for the list rather than one per bad member: the field is wrong, and naming which
    // index would describe a payload rather than the question.
    if (offersOptions(def) && !value.every((tick) => offers(def, tick))) codes.push('option')
    return codes
  }

  // A signature is the one answer here whose value is a nested array, which makes
  // it a payload question before it is a drawing one: refusing a shape the
  // control could never have produced is what stops the field being unbounded for
  // anybody who posts at the endpoint instead.
  if (def.type === 'signature') return signatureViolations(def, value)

  // A chooser stores ONE OPTION'S VALUE, which is a string. Anything else is the
  // hostile-payload path, and refusing it here is what stops it from being invisible:
  // a field whose options live elsewhere (`optionsSource`) has no list to compare
  // against, and the server's own membership check walks only strings — so an object or
  // an array produced no answer to ask about and was stored unexamined. Measured before
  // this existed: `sourcedAnswers` returned `[]` for `{"canton": {"$gt": ""}}`.
  //
  // Before the type, because "not a string" is a better answer than "not an offered
  // option" for a value that could never have been one.
  if (CHOOSER_TYPES.has(def.type) && typeof value !== 'string') {
    codes.push('type')
    return codes
  }

  // A chosen answer is one of the options offered, checked here because this is the one
  // function the browser and the server both run: a payload posted straight at the
  // server never went through a control
  // ([0076](../../../docs/decisions/0076-an-answer-is-one-of-the-options.md)).
  //
  // The VALUE and never the label: a check that matched labels would accept
  // "Switzerland" and refuse "CH".
  //
  // Only when the document carries options. A `select` may have none, and a field with
  // none has nothing to be outside of -- which is also the seam `optionsSource` needs,
  // since a list living outside the document cannot be checked against it.
  if (offersOptions(def) && !offers(def, value)) codes.push('option')

  if (def.min !== undefined || def.max !== undefined) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      // A non-number where a number belongs must fail, not sail through NaN
      // comparisons vacuously — this is the hostile-payload path on the server.
      codes.push(def.min !== undefined ? 'min' : 'max')
    } else {
      if (def.min !== undefined && value < def.min) codes.push('min')
      if (def.max !== undefined && value > def.max) codes.push('max')
    }
  }

  /*
   * A `step`, which says which numbers on the scale count (spec 4).
   *
   * Enforced here rather than left to the control, which is the reason `step` is
   * a field property and not widget configuration: a slider is presentation and
   * the server never sees one, so a value the client accepted and the server
   * refused would be exactly the drift this engine exists to prevent.
   *
   * **Counted from `min` when there is one, and from zero when there is not.**
   * `min: 2, step: 5` is a scale of 2, 7, 12 — which is what an author who wrote
   * both of those meant; counting from zero would refuse every value on their own
   * scale and accept 0, which their minimum forbids.
   *
   * **Compared with a tolerance, not a remainder**, and that is not fussiness:
   * `0.30000000000000004 % 0.1` is `0.09999999999999998`, so a slider at 0.3 with
   * a step of 0.1 — an ordinary configuration — would report an invalid answer
   * that the control itself produced, on a value the person never typed. The
   * tolerance is a millionth of a step, which is far below any granularity a
   * person can express and far above the error binary fractions accumulate.
   */
  if (def.step !== undefined && def.step > 0) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      codes.push('step')
    } else {
      const from = def.min ?? 0
      const steps = (value - from) / def.step
      if (Math.abs(steps - Math.round(steps)) > 1e-6) codes.push('step')
    }
  }

  const text = typeof value === 'string' ? value : undefined

  // A temporal answer, bounded by comparing strings, which is only correct because the
  // format fixes one canonical shape per type -- `TEMPORAL_SHAPES` has the arithmetic.
  //
  // So the SHAPE is checked before the bound, and a value of the wrong shape fails
  // rather than being compared: a malformed answer compared against a bound gives an
  // ordering nobody predicted, which on the server is the hostile-payload path.
  //
  // `shape` rather than `pattern` as the code: `pattern` is the author's own regular
  // expression, and a message catalogue needs to tell these two apart.
  const shape = TEMPORAL_SHAPE_CHECKS[def.type]
  if (shape !== undefined) {
    if (text === undefined || !shape.test(text)) {
      codes.push('shape')
    } else {
      if (def.earliest !== undefined && text < def.earliest) codes.push('earliest')
      if (def.latest !== undefined && text > def.latest) codes.push('latest')
    }
  }

  if (def.minLength !== undefined && text !== undefined && text.length < def.minLength) {
    codes.push('minLength')
  }
  if (def.maxLength !== undefined && text !== undefined && text.length > def.maxLength) {
    codes.push('maxLength')
  }

  if (def.pattern !== undefined && text !== undefined && !patternFor(def).test(text)) {
    codes.push('pattern')
  }

  if (def.format !== undefined && text !== undefined && !FORMAT_CHECKS[def.format](text)) {
    codes.push(def.format)
  }

  // An answer fills its mask, or it is not one: a character in every position, each
  // the kind the position takes, and none of the characters the mask writes. Here
  // rather than in the control because a payload posted straight at the server never
  // went through one (0125). A value that is not text at all fails it too.
  if (def.mask !== undefined && (text === undefined || !fitsMask(def.mask, text))) {
    codes.push('mask')
  }

  return codes
}

/**
 * Field types whose answer is a list.
 *
 * A repeater is absent on purpose: its rows are fields in their own right and
 * the engine bounds them where it manages them, not here where it would only
 * see an opaque array.
 */
/**
 * Field types whose answer is ONE option's value.
 *
 * `selectboxes` is absent because its answer is a list; the branch above already
 * refuses a scalar there, and each tick is checked against the options separately.
 */
const CHOOSER_TYPES = new Set(['select', 'radio'])

const LIST_VALUED = new Set(['selectboxes', 'ranking', 'file'])

/** Whether this field's document carries a list of options to be one of. */
function offersOptions(def: FieldDef): boolean {
  return Array.isArray(def.options) && def.options.length > 0
}

/** Whether one value is an offered option's own value. */
function offers(def: FieldDef, value: unknown): boolean {
  return (def.options ?? []).some((option) => option.value === value)
}

/**
 * The shape each temporal answer must take, compiled once from the format's own
 * declaration.
 *
 * Read from `TEMPORAL_SHAPES` rather than written again here: two closed
 * descriptions of one rule is the drift this repository keeps finding, and a shape
 * that disagreed with the schema's would accept on the server what the document
 * refuses, or the reverse.
 *
 * **`date` is included, and that is a behaviour change to a frozen type.** Version 1
 * fixed `date` as a date-only ISO 8601 string and nothing ever checked it, so a
 * deployment posting `19/09/2026` has been accepted until now and will start failing.
 * Taken deliberately: the freeze promises a version 1 *document* keeps validating, not
 * that a malformed *answer* keeps being accepted — and an unchecked date is one that
 * cannot be bounded, sorted or exported without the reader guessing. Called out in
 * the changelog rather than slipped in.
 */
const TEMPORAL_SHAPE_CHECKS: Partial<Record<string, RegExp>> = Object.fromEntries(
  Object.entries(TEMPORAL_SHAPES).map(([type, source]) => [type, new RegExp(source)]),
)

/** One attached file, as the submission stores it. Never the bytes. */
interface StoredFile {
  id: string
  name: string
  size: number
  contentType: string
  storageKey: string
}

function isStoredFile(value: unknown): value is StoredFile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const file = value as Record<string, unknown>
  return ['id', 'name', 'storageKey'].every((key) =>
    typeof file[key] === 'string' && file[key].length > 0,
  ) && typeof file['contentType'] === 'string' &&
    typeof file['size'] === 'number' && Number.isSafeInteger(file['size']) && file['size'] >= 0
}

/**
 * What the server checks about attached files, and the browser only suggests.
 *
 * `accept` and `maxFileSize` are enforced here rather than left to the file
 * picker, because a picker's filter is a convenience for the person using the
 * form and nothing at all to somebody posting to the endpoint directly.
 */
function fileViolations(def: FieldDef, files: readonly unknown[]): string[] {
  if (!files.every(isStoredFile)) return ['type']
  const codes: string[] = []

  for (const entry of files) {
    const file = entry as StoredFile
    if (def.maxFileSize !== undefined && typeof file.size === 'number' && file.size > def.maxFileSize) {
      codes.push('maxFileSize')
      break
    }
  }

  if (def.accept !== undefined && def.accept.length > 0) {
    for (const entry of files) {
      const file = entry as StoredFile
      if (!accepted(def.accept, file)) {
        codes.push('accept')
        break
      }
    }
  }

  return codes
}

/** The HTML `accept` grammar: `.ext`, `type/subtype`, or `type/*`. */
function accepted(accept: readonly string[], file: StoredFile): boolean {
  const name = typeof file.name === 'string' ? file.name.toLowerCase() : ''
  const contentType = typeof file.contentType === 'string' ? file.contentType.toLowerCase() : ''

  return accept.some((raw) => {
    const rule = raw.trim().toLowerCase()
    if (rule === '') return false
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return contentType.startsWith(rule.slice(0, -1))
    return contentType === rule
  })
}

/** Compiled once per definition: patterns are the hot path's hot path. */
const compiledPatterns = new WeakMap<FieldDef, RegExp>()

function patternFor(def: FieldDef): RegExp {
  let compiled = compiledPatterns.get(def)
  if (compiled === undefined) {
    // Anchored: the schema documents pattern as matching the WHOLE answer.
    // A substring match quietly accepts "xxABCxx" against "[A-Z]{3}", which is
    // never what a form author meant.
    compiled = new RegExp(`^(?:${def.pattern!})$`, 'u')
    compiledPatterns.set(def, compiled)
  }
  return compiled
}

const FORMAT_CHECKS: Record<FieldFormat, (value: string) => boolean> = {
  // One mailbox, one dotted domain, no whitespace: the pragmatic check.
  // Deliverability is the server's business; this catches typos.
  //
  // The domain labels exclude `.` on purpose. The obvious spelling —
  // `[^\s@]+\.[^\s@]+` — lets both halves match a dot, so the engine can split
  // a long dotted string in quadratically many ways before failing. recheck
  // rates that polynomial degree 2 and produces an attack string; this
  // spelling is linear and accepts and rejects exactly the same addresses.
  email: (value) => /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value),

  // No URL constructor here: this package runs with neither DOM nor Node lib
  // types on purpose, and the global is exactly the kind of dependency that
  // rule exists to catch. An absolute http(s) URL shape is enough for v0.
  url: (value) => /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(value),

  uuid: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}

/**
 * A signature is drawn strokes or a typed name — never both, and never anything else.
 *
 * Integers, because a submission is bound to a canonical hash and that hash must not
 * depend on how one browser rounded a pointer event. Inside the field's box, because
 * the box is what makes a stored point redrawable at any size and a point outside it
 * draws over whatever sits next to the field. Bounded, because an unbounded point
 * list is a payload amplifier
 * ([0083](../../../docs/decisions/0083-a-signature-is-points-or-a-name.md)).
 */
function signatureViolations(def: FieldDef, value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['type']

  const answer = value as { drawn?: unknown; typed?: unknown }
  const hasDrawn = answer.drawn !== undefined
  const hasTyped = answer.typed !== undefined
  // Both would leave a reader choosing which one to show, and a signed document
  // that renders differently depending on that choice is worse than a refusal.
  if (hasDrawn === hasTyped) return ['type']

  if (hasTyped) return typeof answer.typed === 'string' ? [] : ['type']

  if (!Array.isArray(answer.drawn)) return ['type']
  const codes: string[] = []
  let points = 0
  for (const stroke of answer.drawn) {
    if (!Array.isArray(stroke)) return ['type']
    for (const point of stroke) {
      if (!Array.isArray(point) || point.length !== 2) return ['type']
      const [x, y] = point as unknown[]
      if (!Number.isInteger(x) || !Number.isInteger(y)) return ['type']
      points += 1
      if (def.box !== undefined && !codes.includes('box')) {
        const [width, height] = def.box
        const outside = (x as number) < 0 || (y as number) < 0 || (x as number) > width || (y as number) > height
        if (outside) codes.push('box')
      }
    }
  }
  // Across every stroke: ten strokes of ten points is the same hundred points as
  // one stroke of a hundred, and a per-stroke cap would bound neither.
  if (def.maxPoints !== undefined && points > def.maxPoints) codes.push('maxPoints')
  return codes
}
