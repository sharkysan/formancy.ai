import { same } from './canonical.js'
import type { Change } from './types.js'
import type { LogicRule } from './rules.js'

/**
 * What changed about the form’s behaviour.
 *
 * Its own file for the reason `diff-fields.ts` is: the size budget refused
 * the next thing added to `diff.ts`, and a rule changing is a different
 * reason to change from a field changing. It also carries the one piece of
 * this diff that touches expressions, which is the part most likely to need
 * work when the expression language does.
 */

/**
 * The form's behaviour.
 *
 * A rule has no id, so identity is `target`, `kind` and — for a `validate` —
 * its `code`, which is what distinguishes two validators on one field. Every
 * difference is `lossy`: `visible` with `clearOnHide` decides whether an
 * answer is kept at all, `required` decides whether an existing submission is
 * still complete, and `computed` overwrites what was stored. None of that can
 * be called harmless without evaluating the rule against the data, which is
 * the engine's job and not this function's.
 */
export function compareRules(
  previous: readonly LogicRule[],
  next: readonly LogicRule[],
  renamed: ReadonlyMap<string, string>,
): Change[] {
  const identity = (rule: LogicRule): string =>
    `${rule.target}|${rule.kind}${rule.code === undefined ? '' : `|${rule.code}`}`

  /*
   * The before-side read as though the renames had already happened.
   *
   * A declared rename moves a field and rewrites every expression that
   * mentioned it, so without this the one edit `renamedFrom` exists to make
   * harmless would report a removed rule, an added one, or one that "says
   * something else now" — and the promise that a declared rename is
   * compatible would hold for the fields and break on their logic.
   */
  const translated = previous.map((rule) => repath(rule, renamed))

  const was = new Map(translated.map((rule) => [identity(rule), rule]))
  const now = new Map(next.map((rule) => [identity(rule), rule]))
  const changes: Change[] = []

  for (const [id, rule] of now) {
    const before = was.get(id)
    if (before === undefined) {
      changes.push({
        severity: 'lossy',
        kind: 'rule.added',
        path: `logic.rules.${rule.target}.${rule.kind}`,
        detail: `A ${rule.kind} rule now applies to "${rule.target}". Whether an existing answer is still kept, still required or still correct depends on it.`,
      })
      continue
    }
    if (!same(before, rule)) {
      changes.push({
        severity: 'lossy',
        kind: 'rule.changed',
        path: `logic.rules.${rule.target}.${rule.kind}`,
        detail: `The ${rule.kind} rule on "${rule.target}" says something else now, so it may reach a different verdict on data already collected.`,
      })
    }
  }

  for (const [id, rule] of was) {
    if (now.has(id)) continue
    changes.push({
      severity: 'lossy',
      kind: 'rule.removed',
      path: `logic.rules.${rule.target}.${rule.kind}`,
      detail: `The ${rule.kind} rule on "${rule.target}" is gone. A field it kept hidden, optional or computed now behaves as the model declares it.`,
    })
  }

  return changes
}

/**
 * One rule as it would read after the declared renames.
 *
 * The substitution is textual, and deliberately so: `@formancy/spec` is below
 * `@formancy/expressions` in the layering
 * ([0008](../../../docs/decisions/0008-layered-packages.md)), so there is no
 * CEL parser here and there must not be one. What makes that safe is the
 * direction of the comparison. A substitution that is **wrong** produces an
 * expression that does not match the real one, and the rule is then reported
 * as changed — the conservative answer. Only an exact match is read as "this
 * expression followed a renamed field", and an exact match is what a correct
 * repath produces.
 *
 * The path boundary is `[A-Za-z0-9_$]`, so renaming `email` leaves
 * `emailAddress` alone, and longest-first ordering keeps one rename from
 * eating the start of another.
 */
function repath(rule: LogicRule, renamed: ReadonlyMap<string, string>): LogicRule {
  if (renamed.size === 0) return rule

  const sources = [...renamed.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(
    `(?<![A-Za-z0-9_$])(${sources.map(escapeForPattern).join('|')})(?![A-Za-z0-9_$])`,
    'g',
  )
  const move = (text: string): string => text.replace(pattern, (match) => renamed.get(match) ?? match)

  return {
    ...rule,
    target: move(rule.target),
    ...(rule.cel === undefined ? {} : { cel: move(rule.cel) }),
  }
}

function escapeForPattern(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
