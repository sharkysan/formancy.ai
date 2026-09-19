/**
 * Canonical JSON serialisation.
 *
 * Two schemas that differ only in key order are the same schema, and must
 * therefore produce the same `schemaHash`. Every submission is bound to the
 * hash of the schema version that produced it, so this function's output is
 * load-bearing for tamper evidence and must never change silently.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value, '$'))
}

function normalize(value: unknown, path: string): unknown {
  if (value === null) return null

  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value

    case 'number':
      // JSON has no NaN or Infinity; stringify would coerce them to null and
      // two different schemas would collide on one hash.
      if (!Number.isFinite(value)) {
        throw new TypeError(`Cannot canonicalize non-finite number at ${path}: ${String(value)}`)
      }
      return value

    case 'object': {
      if (Array.isArray(value)) {
        return value.map((item, index) => normalize(item, `${path}[${index}]`))
      }

      const source = value as Record<string, unknown>
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(source).sort()) {
        sorted[key] = normalize(source[key], `${path}.${key}`)
      }
      return sorted
    }

    default:
      // undefined, function, symbol, bigint. Stringify drops the first three
      // from objects entirely, which would make a schema hash the same as one
      // that genuinely lacks the field.
      throw new TypeError(`Cannot canonicalize ${typeof value} at ${path}`)
  }
}
