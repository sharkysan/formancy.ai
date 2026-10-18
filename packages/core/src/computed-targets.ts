import type { LogicRule } from '@formancy/spec'
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

/** Whether a computed rule writes the field at `wire`, a row's included. */
export function isComputed(targets: ReadonlySet<string>, wire: string): boolean {
  return targets.has(templateWire(wire))
}

/** `value` — a draft, a prefill, a request body — with nothing left at a computed field. */
export function withoutComputedValues(value: unknown, targets: ReadonlySet<string>): unknown {
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
