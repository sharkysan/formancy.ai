import type { FieldDef } from '@formancy/spec'
import type { FormEngine } from './engine.js'
import { parsePath } from './path.js'

/**
 * A group an arrangement places whole, as a renderer draws it.
 *
 * A layout may name a group's path, and the validator accepts it; the engine has no field
 * there, so both renderers asked it for one and threw `Unknown field`. What a placed group
 * draws, and on which page, is decided here once and read by both — the same reason the
 * engine exists beneath the renderers rather than inside either
 * ([0151](../../../docs/decisions/0151-a-group-placed-whole-is-drawn-as-its-fields.md)).
 *
 * Outside `engine.ts`, which answers for fields and repeaters and has no budget left to grow.
 */
export interface PlacedGroup {
  /** The group itself, for its label. */
  readonly def: FieldDef
  /**
   * What it draws, in the order a form with no arrangement draws it: its fields — a nested
   * group's by their dotted paths — and then its repeaters, whose rows are their own.
   */
  readonly fields: readonly string[]
  readonly repeaters: readonly string[]
}

export function placedGroup(engine: FormEngine, path: string): PlacedGroup | undefined {
  const def = groupAt(engine.schema().model.fields, path)
  if (def === undefined) return undefined
  const inside = (wire: string): boolean => wire.startsWith(`${path}.`)
  const repeaters = engine.repeaterPaths().filter(inside)
  return {
    def,
    fields: engine
      .fieldPaths()
      .filter((wire) => inside(wire) && !repeaters.some((repeater) => wire.startsWith(`${repeater}[`))),
    repeaters,
  }
}

/**
 * The page a placed path is on: a field's or a repeater's own, and a group's the page of what
 * it draws — a group sits inside one page, so its first field answers for all of it. Undefined
 * for a group that draws nothing, which no page shows.
 */
export function placedPage(engine: FormEngine, path: string): number | undefined {
  const group = placedGroup(engine, path)
  if (group === undefined) return engine.pageOf(parsePath(path))
  const first = group.fields[0] ?? group.repeaters[0]
  return first === undefined ? undefined : engine.pageOf(parsePath(first))
}

/** The group at a data path: a page is transparent, a group a dot. */
function groupAt(fields: readonly FieldDef[], path: string, scope = ''): FieldDef | undefined {
  for (const field of fields) {
    if (field.type === 'page') {
      const found = groupAt(field.fields ?? [], path, scope)
      if (found !== undefined) return found
    } else if (field.type === 'group') {
      const at = `${scope}${field.key}`
      if (at === path) return field
      if (path.startsWith(`${at}.`)) return groupAt(field.fields ?? [], path, `${at}.`)
    }
  }
  return undefined
}
