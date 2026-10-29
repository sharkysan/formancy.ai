import { ANSWER_KINDS, modelDataFields } from '@formancy/spec'
import type { FormModel, LogicRule } from '@formancy/spec'
import { parsePath, templateWire } from './path.js'
import type { Path } from './path.js'
import { stripPaths } from './strip.js'
import { getAt } from './value.js'

/**
 * The fields `computed` rules write, in the rules' own form (`items[].lineTotal` is every
 * row's). Only the rule writes one: the engine refuses a value set on it, takes it out of
 * what it is handed, and says `readOnly` on its snapshot — because a value that stood
 * while the expression could not be evaluated was stored as though computed
 * ([0181](../../../docs/decisions/0181-a-computed-value-is-the-engines.md)).
 */
export function computedTargets(rules: readonly LogicRule[]): ReadonlySet<string> {
  return new Set(rules.filter((rule) => rule.kind === 'computed').map((rule) => rule.target))
}

/**
 * The fields that collect nothing — `static` ones — in the same form. A value handed in
 * or set for one is dropped as a computed field's is: it answers no question, and stored
 * it would read as an answer to every consumer of the submission (0189).
 */
export function staticTargets(model: FormModel): ReadonlySet<string> {
  return new Set(
    modelDataFields(model)
      .filter(({ def }) => ANSWER_KINDS[def.type].shape === 'nothing')
      .map(({ path }) => path),
  )
}

/**
 * Whether the field at `wire`, a row's included, is one of `targets` or lies inside one. A rule
 * may compute a whole repeater or group, and what it writes is its own all the way down: a
 * field in a computed repeater's row is the rule's as the repeater is (0218).
 */
export function withinTarget(targets: ReadonlySet<string>, wire: string): boolean {
  const template = templateWire(wire)
  for (const target of targets) {
    if (template === target || template.startsWith(`${target}.`) || template.startsWith(`${target}[]`)) return true
  }
  return false
}

/** `value` — a draft, a prefill, a request body — with nothing left at any of `targets`. */
export function withoutValuesAt(value: unknown, targets: ReadonlySet<string>): unknown {
  const paths: Path[] = []
  for (const target of targets) {
    const marker = target.indexOf('[]')
    if (marker === -1) {
      paths.push(parsePath(target))
      continue
    }
    const rows = parsePath(target.slice(0, marker))
    const member = parsePath(target.slice(marker + '[].'.length))
    const held = getAt(value, rows)
    if (Array.isArray(held)) held.forEach((_, index) => paths.push([...rows, index, ...member]))
  }
  return stripPaths(value, paths)
}
