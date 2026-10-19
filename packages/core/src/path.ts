import { UNSTORABLE_KEY } from '@formancy/spec'

/**
 * The path model.
 *
 * A path addresses one value inside a submission: `items[2].name` is the
 * segments `['items', 2, 'name']`. The array form is what the engine computes
 * with; the wire form is what schemas, fixtures, the server API and error
 * payloads carry. parsePath/formatPath are the only translation points, so the
 * two forms cannot drift.
 *
 * Indices are real numbers, not strings, because repeating-group rows are
 * ordered and the engine moves them: `['items', 2]` must compare and arithmetic
 * like a position, not a key.
 */
export type PathSegment = string | number
export type Path = readonly PathSegment[]

/* The spec's one key no value can hold, refused at both translation points as a "." is, so
 * an engine handed a document no validator saw refuses to open rather than lose answers (0185). */
const UNSTORABLE = `the key "${UNSTORABLE_KEY}" names no member a value can hold: written, it replaces the object's prototype`

export function parsePath(wire: string): Path {
  if (wire === '') return []

  const segments: PathSegment[] = []
  let i = 0

  while (i < wire.length) {
    // A key: everything up to the next structural character.
    const keyStart = i
    while (i < wire.length && wire[i] !== '.' && wire[i] !== '[' && wire[i] !== ']') i++
    if (i === keyStart) {
      throw new Error(`Invalid path "${wire}": expected a key at position ${keyStart}`)
    }
    const key = wire.slice(keyStart, i)
    if (key === UNSTORABLE_KEY) throw new Error(`Invalid path "${wire}": ${UNSTORABLE}`)
    segments.push(key)

    // Zero or more [index] directly after the key.
    while (i < wire.length && wire[i] === '[') {
      i++
      const digitStart = i
      while (i < wire.length && wire[i] !== ']') i++
      if (i === wire.length) {
        throw new Error(`Invalid path "${wire}": unclosed "[" at position ${digitStart - 1}`)
      }
      const digits = wire.slice(digitStart, i)
      if (!/^\d+$/.test(digits)) {
        throw new Error(`Invalid path "${wire}": index "${digits}" is not a non-negative integer`)
      }
      segments.push(Number(digits))
      i++
    }

    if (i < wire.length) {
      if (wire[i] !== '.') {
        throw new Error(`Invalid path "${wire}": unexpected "${wire[i]}" at position ${i}`)
      }
      i++
      if (i === wire.length) {
        throw new Error(`Invalid path "${wire}": trailing "."`)
      }
    }
  }

  return segments
}

export function formatPath(path: Path): string {
  let wire = ''
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Number.isInteger(segment) || segment < 0) {
        throw new Error(`Invalid path segment ${segment}: an index must be a non-negative integer`)
      }
      wire += `[${segment}]`
    } else {
      // A key containing a structural character would parse back as a
      // different path — a silent identity change on the wire. Refuse instead.
      if (segment === '' || /[.\[\]]/.test(segment)) {
        throw new Error(`Invalid path key ${JSON.stringify(segment)}: keys must be non-empty and free of ".", "[" and "]"`)
      }
      if (segment === UNSTORABLE_KEY) throw new Error(`Invalid path key "${segment}": ${UNSTORABLE}`)
      wire += wire === '' ? segment : `.${segment}`
    }
  }
  return wire
}

/** The template form of an instance wire: `items[1].qty` -> `items[].qty`.
 *  Static wires come back unchanged; repeaters do not nest. */
export function templateWire(wire: string): string {
  return wire.replace(/\[\d+\]/, '[]')
}

/**
 * Whether `wires` holds the path's own wire or the wire of anything above it — `a`, `a.b`,
 * `a.b[0]` for `a.b[0].c`. What a rule hides or disables, it does to everything inside.
 */
export function withinAny(wires: ReadonlySet<string>, path: Path): boolean {
  if (wires.size === 0) return false
  for (let end = 1; end <= path.length; end++) if (wires.has(formatPath(path.slice(0, end)))) return true
  return false
}
