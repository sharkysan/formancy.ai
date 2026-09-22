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
    return codes
  }

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

  const text = typeof value === 'string' ? value : undefined

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

  return codes
}

/**
 * Field types whose answer is a list.
 *
 * A repeater is absent on purpose: its rows are fields in their own right and
 * the engine bounds them where it manages them, not here where it would only
 * see an opaque array.
 */
const LIST_VALUED = new Set(['selectboxes', 'file'])

/** One attached file, as the submission stores it. Never the bytes. */
interface StoredFile {
  name?: unknown
  size?: unknown
  contentType?: unknown
}

/**
 * What the server checks about attached files, and the browser only suggests.
 *
 * `accept` and `maxFileSize` are enforced here rather than left to the file
 * picker, because a picker's filter is a convenience for the person using the
 * form and nothing at all to somebody posting to the endpoint directly.
 */
function fileViolations(def: FieldDef, files: readonly unknown[]): string[] {
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
