/**
 * How a fixture addresses one field, and how it addresses a control that is not
 * a field. Shared by the validator, the runner and every driver: a path means
 * the same thing everywhere or the suite means nothing.
 */

import type { ConformanceFieldDef, ConformanceSchema } from './types.js'

/**
 * Separates a data path from the command to perform on it: `contacts#add`,
 * `contacts[1]#remove`, or a bare `#next` for a command on the form itself.
 *
 * A command needs its own notation because a driver may only reach a control
 * through role and accessible name, so "the add button of the contacts
 * repeater" has to be addressable as data.
 */
export const COMMAND_SEPARATOR = '#'

export const NEXT_COMMAND = '#next'
export const BACK_COMMAND = '#back'

/** The command path of a repeater's add control. */
export function addItemCommand(path: string): string {
  return `${path}${COMMAND_SEPARATOR}add`
}

/** The command path of the remove control of one repeater item. */
export function removeItemCommand(path: string, index: number): string {
  return `${path}[${index}]${COMMAND_SEPARATOR}remove`
}

interface PathSegment {
  readonly key: string
  readonly indexed: boolean
}

const SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/

function parsePath(path: string): readonly PathSegment[] | undefined {
  if (path === '') return undefined
  const segments: PathSegment[] = []
  for (const raw of path.split('.')) {
    const match = SEGMENT.exec(raw)
    if (match === null) return undefined
    segments.push({ key: match[1] as string, indexed: match[2] !== '' })
  }
  return segments
}

/**
 * The field a data path addresses, or undefined if the schema has no such field.
 *
 * The path rules are the data model, and they are deliberately not the layout:
 *
 * - a `page` is presentation and owns no data, so it is transparent: a field on
 *   page two is addressed by its own key, and moving it to page three does not
 *   rename anyone's data.
 * - a `group` owns its children's data, so it nests: `address.street`.
 * - a `repeater` owns a list, so its children are only addressable through an
 *   item index: `contacts[0].email`. `contacts.email` addresses nothing.
 *
 * Exported because a driver needs it: to find a control by accessible name it
 * must first map the path a fixture names to the field that carries the label.
 */
export function fieldAtPath(
  schema: ConformanceSchema,
  path: string,
): ConformanceFieldDef | undefined {
  const segments = parsePath(path)
  if (segments === undefined) return undefined

  let fields: readonly ConformanceFieldDef[] | undefined = schema.model.fields
  let field: ConformanceFieldDef | undefined

  for (const segment of segments) {
    if (fields === undefined) return undefined
    field = childNamed(fields, segment.key)
    if (field === undefined) return undefined

    if (field.type === 'repeater') fields = segment.indexed ? field.children : undefined
    else if (field.type === 'group') fields = segment.indexed ? undefined : field.children
    else fields = undefined
  }

  return field
}

/** Sees through pages, which own no data, but not through groups, which do. */
function childNamed(
  fields: readonly ConformanceFieldDef[],
  key: string,
): ConformanceFieldDef | undefined {
  for (const field of fields) {
    if (field.type === 'page') {
      const found = childNamed(field.children ?? [], key)
      if (found !== undefined) return found
    } else if (field.key === key) {
      return field
    }
  }
  return undefined
}

/** Every page key in the schema, in document order. */
export function pageKeys(schema: ConformanceSchema): readonly string[] {
  const keys: string[] = []
  const walk = (fields: readonly ConformanceFieldDef[]): void => {
    for (const field of fields) {
      if (field.type === 'page') keys.push(field.key)
      if (field.children !== undefined) walk(field.children)
    }
  }
  walk(schema.model.fields)
  return keys
}
