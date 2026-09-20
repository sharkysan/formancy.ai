import type { FieldDef } from '@formancy/spec'

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

const FORMAT_CHECKS: Record<string, (value: string) => boolean> = {
  // One mailbox, one domain with a dot, no whitespace: the pragmatic check.
  // Deliverability is the server's business; this catches typos.
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),

  url: (value) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  },

  uuid: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}
