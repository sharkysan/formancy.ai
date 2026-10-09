/**
 * What the rest of the document does when a path moves, or goes.
 *
 * A field lives in four places at once: the model, the layouts that arrange it,
 * the rules that read and target it, and the metadata the logic panel reopens
 * from. `renameField` and `unwrapField` change where an answer lives, and every
 * one of those four has to follow in the same edit or the document is quietly
 * wrong — a layout node placing a path nothing has, or worse, a condition
 * reading one, which goes on compiling and evaluates to null forever.
 *
 * Its own file because `session.ts` is where everything went and the size
 * budget refused the next thing added to it. This is the family the refusal
 * named: eight functions, one subject.
 */
import { ruleKindLabel } from './logic.js'
import type { BuilderText } from './messages.js'
import type { FieldDef, FormSchema, LayoutNode, LogicRule } from '@formancy/spec'
import { PAGE_TARGETED_RULE_KINDS, layoutChildren } from '@formancy/spec'
import { rewritePath } from '@formancy/expressions'

/** Whether `path` is `prefix` itself or a field inside it. */
export function underPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`)
}

/** Drop every layout node placing `dataPath`, or anything inside it. */
export function unplaceEverywhere(draft: FormSchema, dataPath: string): void {
  for (const layout of draft.layouts ?? []) {
    layout.nodes = pruned(layout.nodes, (path) => underPath(path, dataPath))
  }
}

/**
 * Drop every layout node placing `dataPath` ITSELF, leaving what is inside it.
 *
 * What unwrapping a group needs, and the reason the two are separate: a group is
 * placeable in its own right, so the node placing it goes with it — while the
 * nodes placing its children stay, repointed at where those answers moved to.
 */
export function unplaceOnly(draft: FormSchema, dataPath: string): void {
  for (const layout of draft.layouts ?? []) {
    layout.nodes = pruned(layout.nodes, (path) => path === dataPath)
  }
}

function pruned(nodes: readonly LayoutNode[], goes: (path: string) => boolean): LayoutNode[] {
  const kept: LayoutNode[] = []
  for (const node of nodes) {
    if (node.kind === 'field' || node.kind === 'qrcode') {
      // A code goes when the answer it encodes goes, exactly as its placement does:
      // what would remain is a node drawing a picture of nothing, and the validator
      // would then refuse the document the builder had just produced.
      if (!goes(node.path)) kept.push(node)
      continue
    }
    // The container stays even when it empties. Removing one field should not
    // silently take a row with it and rearrange everything beside it.
    kept.push({ ...node, children: pruned(layoutChildren(node) as LayoutNode[], goes) })
  }
  return kept
}


/**
 * Drop every rule that could only ever have been about this page.
 *
 * `skip` names a page KEY rather than a data path, because a page carries no
 * answer of its own. So a page that goes leaves a rule aimed at nothing, the
 * validator refuses the whole edit, and the page becomes undeletable — which is
 * what it was between 0.3.0 and this.
 */
export function unskipEverywhere(draft: FormSchema, pageKey: string): void {
  const rules = draft.logic?.rules
  if (rules === undefined) return
  draft.logic = {
    ...draft.logic,
    rules: rules.filter(
      (rule) => !(PAGE_TARGETED_RULE_KINDS.includes(rule.kind as never) && rule.target === pageKey),
    ),
  }
}


/**
 * Point every rule at the new path: its target, its condition, and the metadata
 * the visual panel reopens from. Returns a sentence naming what refused, or
 * undefined when every rule followed.
 *
 * All three, because a rule names a field in three places and a change that
 * moves two of them is the worst of the three outcomes. Rewriting the condition
 * and not `editor` holds only until somebody reopens the logic panel, which
 * recompiles the CEL **from** that metadata and silently restores the path this
 * was called to change.
 *
 * `check` is left alone deliberately: it is the NAME of a validator the
 * deployment answers, never a data path
 * ([0086](../../../docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).
 */
export function repathRules(
  draft: FormSchema,
  before: string,
  after: string,
  text: BuilderText,
): string | undefined {
  const rules = draft.logic?.rules ?? []
  // Every rule is rewritten into a copy first, so a refusal on rule 4 does not
  // leave rules 1 to 3 changed. `attempt` discards the draft on a refusal, but
  // relying on that would make this function correct only where it is called.
  const rewrites = new Map<number, LogicRule>()

  for (const [index, rule] of rules.entries()) {
    const next: LogicRule = { ...rule }

    // A page-targeted rule names a PAGE KEY, which is not a data path and does
    // not move when a field does.
    if (!PAGE_TARGETED_RULE_KINDS.includes(rule.kind as never) && underPath(rule.target, before)) {
      next.target = `${after}${rule.target.slice(before.length)}`
    }

    // A `check` carries no expression at all: it names a validator the
    // deployment answers. An EMPTY one is not a state to handle — the schema
    // refuses `cel: ""` and `draftIsComplete` will not compose one — so there is
    // no third case here.
    if (rule.cel !== undefined) {
      const outcome = rewritePath(rule.cel, before, after)
      if (!outcome.ok) {
        // In the session's language, because it is set into a refusal that is:
        // half a German sentence and half an English one was what this said.
        return text('refuse.ruleCannotFollow', {
          number: index + 1,
          kind: ruleKindLabel(rule.kind, text),
          target: rule.target,
          reason: outcome.error.message,
        })
      }
      if (outcome.changed) next.cel = outcome.source
    }

    const editor = repathEditor(rule.editor, before, after)
    if (editor !== undefined) next.editor = editor

    rewrites.set(index, next)
  }

  for (const [index, rule] of rewrites) rules[index] = rule
  return undefined
}

/**
 * The editor metadata with every condition's field repathed, or undefined when
 * it is not the shape this builder writes.
 *
 * Shape-checked rather than cast: `editor` is `unknown` in the spec on purpose,
 * so another tool's metadata may be anything at all, and rewriting a field of
 * an object we do not recognise is how a document acquires nonsense that
 * validates.
 */
function repathEditor(editor: unknown, before: string, after: string): unknown {
  if (typeof editor !== 'object' || editor === null) return undefined
  const group = editor as { conditions?: unknown }
  if (!Array.isArray(group.conditions)) return undefined

  return {
    ...editor,
    conditions: group.conditions.map((condition: unknown) => {
      if (typeof condition !== 'object' || condition === null) return condition
      const field = (condition as { field?: unknown }).field
      if (typeof field !== 'string' || !underPath(field, before)) return condition
      return { ...condition, field: `${after}${field.slice(before.length)}` }
    }),
  }
}

/** Point every layout node at the new path, including fields inside a group. */
export function repathEverywhere(draft: FormSchema, before: string, after: string): void {
  const walk = (nodes: LayoutNode[]): void => {
    for (const [index, node] of nodes.entries()) {
      if (node.kind === 'field' || node.kind === 'qrcode') {
        // A code follows a rename. A declared rename keeps the answer, so a code of it
        // must keep encoding the same answer -- leaving the old path behind would turn
        // a rename into a silently broken code.
        if (underPath(node.path, before)) {
          nodes[index] = { ...node, path: after + node.path.slice(before.length) }
        }
        continue
      }
      walk(layoutChildren(node) as LayoutNode[])
    }
  }
  for (const layout of draft.layouts ?? []) walk(layout.nodes)
}
