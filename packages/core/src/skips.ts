import type { FieldDef, LogicRule } from '@formancy/spec'
import { compile, evaluate } from '@formancy/expressions'
import type { Capabilities, VariableDeclarations } from '@formancy/expressions'
import { formatPath, withinAny } from './path.js'
import type { Path } from './path.js'
import { refusedRule } from './rule-refusal.js'
import { stripPaths } from './strip.js'

/**
 * Pages the answers walk past
 * ([0087](../../../docs/decisions/0087-a-page-can-be-walked-past.md)), and what a response stores
 * without them ([0246](../../../docs/decisions/0246-a-skipped-pages-answers-are-left-out-of-what-is-stored.md)).
 *
 * A `skip` rule is an expression like `visible`, and it is compiled as one: same policy, same
 * boolean result, same refusal of anything that could reach outside the document. What differs
 * is its TARGET — a page's key rather than a data path, because a page is transparent for data
 * and has no path at all.
 *
 * The fields on a skipped page are hidden, so not validated: a required answer on a page
 * somebody never saw does not hold the form up where they cannot reach it. Hidden in a set of
 * its own, apart from the one a `visible` rule switches — a skip and a rule are two reasons to
 * hide a field, either hides it, and when they shared one switch the next answer anywhere re-ran
 * the rule and showed the field again on the page nobody could reach.
 *
 * What a skipped page holds is left out of what a response stores, and only of that: `value()`
 * keeps it, so what a binding sends is what the browser judged, and the server's replay of it
 * judges the same. Leaving it out of `value()` made the replay judge without answers the browser
 * judged with; pruning it from the store, as a field a rule hides is pruned, let a skip that
 * reads its own page undo itself, the page's total pruned and the page brought back.
 */
export interface Skips {
  /** Whether the document has a skip rule at all. */
  readonly any: boolean
  /** Decide every page again from the answers; the wires of the fields, groups and lists on the pages that changed. */
  apply(bag: Record<string, unknown>, capabilities: Capabilities): string[]
  isSkipped(index: number): boolean
  /** On a page walked past: hidden, whatever a rule of its own says. */
  hides(path: Path): boolean
  /**
   * What a response stores of the answers: without each field, group and list on a page walked
   * past, whole, unless its own `clearOnHide` is false — as a group a rule hides is
   * ([0184](../../../docs/decisions/0184-a-repeater-is-validated-as-a-field-is.md)).
   */
  strip(root: unknown): unknown
}

export function createSkips(options: {
  rules: readonly LogicRule[]
  /** Each page by absolute index: its key, its definition, and the data path it stands at. */
  pages: ReadonlyArray<{ key: string; def: FieldDef; parent: Path }>
  declarations: VariableDeclarations
  fields: ReadonlyMap<string, FieldDef>
}): Skips {
  const compiled = options.rules.map((rule) => {
    // `visible` rather than a policy of its own: the question is the same shape, the result is
    // the same boolean, and giving it a second policy would be a second list of allowed
    // functions for somebody to forget to keep level.
    const outcome = compile(rule.cel ?? '', { kind: 'visible', variables: options.declarations })
    if (!outcome.ok) throw new Error(refusedRule(rule, outcome.error, options.fields))
    return { program: outcome.program, index: options.pages.findIndex((page) => page.key === rule.target) }
  })
  /** What walking past each page hides whole: each field, group and list standing directly on it. */
  const items = options.pages.map(({ def, parent }) => (def.fields ?? []).map((child) => ({ path: [...parent, child.key], def: child })))

  const skipped = new Set<number>()
  const hidden = new Set<string>()
  let left: Path[] = []

  return {
    any: compiled.length > 0,

    apply(bag, capabilities) {
      const changed: string[] = []
      for (const entry of compiled) {
        if (entry.index === -1) continue
        const outcome = evaluate(entry.program, bag, { capabilities })
        // A rule that cannot evaluate does NOT skip. Failing open here is the one place it is
        // right: a page hidden by a broken expression takes its questions away silently, while
        // a page shown in error is visible and answerable ([0054] on what a rule that never
        // works costs).
        const skip = outcome.ok && outcome.value === true
        if (skip === skipped.has(entry.index)) continue
        if (skip) skipped.add(entry.index)
        else skipped.delete(entry.index)
        for (const { path } of items[entry.index]!) {
          const wire = formatPath(path)
          if (skip) hidden.add(wire)
          else hidden.delete(wire)
          changed.push(wire)
        }
      }
      if (changed.length > 0) {
        left = [...skipped].flatMap((index) => items[index]!.filter(({ def }) => def.clearOnHide !== false).map(({ path }) => path))
      }
      return changed
    },

    isSkipped: (index) => skipped.has(index),
    hides: (path) => withinAny(hidden, path),

    strip: (root) => (left.length === 0 ? root : stripPaths(root, left)),
  }
}
