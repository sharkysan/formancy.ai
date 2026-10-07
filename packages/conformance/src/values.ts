/**
 * Reading an `unknown` that is supposed to be JSON.
 *
 * Four predicates with no opinion about fixtures, split out when the budget
 * refused the next thing added to `validate.ts` and the message catalogue left
 * for `validate-text.ts`. Both files need these, and a shared vocabulary is
 * the honest reason for a module — not a layer that forwards.
 */

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isJsonValue(value: unknown): boolean {
  if (value === null) return true
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true
    case 'number':
      // JSON has no NaN or Infinity, so a fixture carrying one would not
      // survive the file round-trip that every driver reads it through.
      return Number.isFinite(value)
    case 'object':
      return Array.isArray(value)
        ? value.every(isJsonValue)
        : Object.values(value as Record<string, unknown>).every(isJsonValue)
    default:
      return false
  }
}

export function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}
