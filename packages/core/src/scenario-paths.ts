import type { FieldDef, FormSchema } from '@formancy/spec'
import { formatPath, parsePath } from './path.js'
import type { Path } from './path.js'

/*
 * What a path a scenario names is, when it is not one answer the engine has.
 *
 * Every such path was told the form has no field by that name and that it was probably
 * renamed. That is the right sentence for `otherReson` and the wrong one for `colleagues`:
 * the list is there, and a sentence sending somebody to look for a rename sends them away
 * from the one thing they need, which is how to name what is in it
 * ([0182](../../../docs/decisions/0182-a-list-is-filled-row-by-row.md)).
 *
 * So the document is walked along the path the way the engine scopes it — a group and a
 * row scope their fields, a page scopes none — and the sentence says what the walk found,
 * with a path to name instead. Only a path the engine takes is offered, because a second
 * wrong path is worse than none.
 *
 * Block comments rather than JSDoc in this file: nothing outside the package calls it.
 */

// What each finding is, and how a scenario names what is in it.
const SAYS = {
  group: ['is a group, not one answer', 'each field in it through the group'],
  list: ['is a repeater, a list of rows, not one answer', "a field in one of its rows by the row's position from 0"],
  row: ['is one row of a repeater, not one answer', 'a field in it'],
  unplaced: ['does not say which row of the repeater it is in', 'a row by its position from 0'],
  // `items[].total` is how a rule names every row. A scenario sets one.
  every: ['names every row at once, as a rule does', 'one row by its position from 0'],
  page: ['names a page, and a page scopes nothing', 'a field on it as though the page were not there'],
} as const

type Kind = keyof typeof SAYS

interface Found {
  readonly kind: Kind | 'field' | 'missing' | 'nested'
  readonly example?: Path | undefined
}

export function notOneAnswer(schema: FormSchema, wire: string, known: (wire: string) => boolean): string {
  let segments: Path
  try {
    // A rule's `[]` is read as the first row, so the walk can say what is past it.
    segments = parsePath(wire.replaceAll('[]', '[0]'))
  } catch {
    return renamed(wire)
  }
  const found = walk(schema.model.fields, segments, [], false)
  if (found.kind === 'nested') {
    return `"${wire}" goes into a repeater inside another repeater's row. A form cannot have one, and the engine has no field there to name.`
  }
  // One answer the walk reached is only something else when it was reached through `[]`.
  const kind = found.kind === 'missing' ? found.kind : wire.includes('[]') ? 'every' : found.kind
  if (kind === 'missing' || kind === 'field') return renamed(wire)

  const example = found.kind === 'field' ? segments : found.example
  const offered = example === undefined ? undefined : formatPath(example)
  const [what, how] = SAYS[kind]
  return (
    `"${wire}" ${what}. A scenario names ${how}${offered !== undefined && known(offered) ? `, as "${offered}"` : ''}.` +
    (kind === 'list' ? ' Naming a row the list does not have yet adds it.' : '')
  )
}

function renamed(wire: string): string {
  return `This form has no "${wire}". A scenario naming a field that is not there checks nothing — it was probably renamed.`
}

function walk(defs: readonly FieldDef[], rest: Path, at: Path, inRow: boolean): Found {
  const [head, ...tail] = rest
  const def = typeof head === 'string' ? byKey(defs, head) : undefined
  if (def === undefined) return { kind: 'missing' }
  const inside = def.fields ?? []
  // Named alone or as though it scoped what is on it, a page's fields are named without it.
  if (def.type === 'page') return { kind: 'page', example: tail.length > 0 ? [...at, ...tail] : firstField(inside, at) }

  const here = [...at, def.key]
  if (def.type === 'group') {
    return tail.length > 0 ? walk(inside, tail, here, inRow) : { kind: 'group', example: firstField(inside, here) }
  }
  if (def.type !== 'repeater') return { kind: tail.length > 0 ? 'missing' : 'field' }
  if (inRow) return { kind: 'nested' }

  const [index, ...after] = tail
  if (index === undefined) return { kind: 'list', example: firstField(inside, [...here, 0]) }
  if (typeof index === 'string') {
    // A field of the row's template, with only its position left out.
    const placed = walk(inside, tail, [...here, 0], true)
    if (placed.kind === 'missing' || placed.kind === 'nested') return placed
    return { kind: 'unplaced', example: placed.kind === 'field' ? [...here, 0, ...tail] : placed.example }
  }
  return after.length > 0 ? walk(inside, after, [...here, index], true) : { kind: 'row', example: firstField(inside, [...here, index]) }
}

// The field keyed `key` among `defs`, looking through pages, which scope nothing; or the page itself.
function byKey(defs: readonly FieldDef[], key: string): FieldDef | undefined {
  for (const def of defs) {
    if (def.key === key) return def
    const inside = def.type === 'page' ? byKey(def.fields ?? [], key) : undefined
    if (inside !== undefined) return inside
  }
  return undefined
}

// The path of the first answer among `defs`, as the engine names it from `at`.
function firstField(defs: readonly FieldDef[], at: Path): Path | undefined {
  for (const def of defs) {
    const inside = def.fields ?? []
    const found =
      def.type === 'page'
        ? firstField(inside, at)
        : def.type === 'group'
          ? firstField(inside, [...at, def.key])
          : def.type === 'repeater'
            ? firstField(inside, [...at, def.key, 0])
            : [...at, def.key]
    if (found !== undefined) return found
  }
  return undefined
}
