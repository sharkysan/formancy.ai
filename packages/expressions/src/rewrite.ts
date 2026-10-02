import { readChains } from './chains.js'
import { ExpressionError } from './errors.js'
import { parse } from './parse.js'
import { referencedPaths } from './references.js'
import type { ParseOptions } from './parse.js'

export type RewriteOutcome =
  | {
      readonly ok: true
      readonly source: string
      /** False when the path never appeared, so the caller can skip a write. */
      readonly changed: boolean
    }
  | { readonly ok: false; readonly error: ExpressionError }

/**
 * Rewrite every read of one data path into a read of another.
 *
 * This is what lets a field be renamed, or a group unwrapped, without leaving
 * the rules that mention it aiming at a path no field has. Before it existed
 * both commands either refused the document or — worse, and this is what was
 * actually shipped — succeeded and left the condition reading the old path: the
 * rule still compiles, because the engine types an unknown leaf as `dyn`, and
 * then evaluates against nothing for the rest of the form's life.
 *
 * **It splices source, it does not reprint it.** Every AST node carries its
 * span, so the rewrite replaces exactly the characters of the renamed prefix
 * and leaves every other character alone. That keeps the author's spacing and
 * their choice of notation, which matters because the published document is
 * diffed in git: a reprinter would show changes nobody made beside the one
 * somebody did. It also means no precedence or parenthesisation logic, which is
 * only safe because the replacement is always a path — a path binds tighter
 * than every operator, so it can never need bracketing.
 *
 * **The splice is the mechanism; the verification is the guard.** Afterwards the
 * result is parsed again and asked what it reads, and that is compared against
 * what the input read with the rename applied. A rewrite that passes cannot
 * have lost a reference, invented one, or had its new name captured by a local
 * — see the `items.all(zip, …)` case in the tests, where a perfectly correct
 * splice produces valid CEL that means something else. Reasoning about scope a
 * second time would be a second place to be wrong; comparing the read sets is
 * one place, and it is the property the callers actually depend on.
 */
export function rewritePath(
  source: string,
  from: string,
  to: string,
  options?: ParseOptions,
): RewriteOutcome {
  const parsed = parse(source, options)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const target = onePath(to, source)
  if (target !== undefined) return { ok: false, error: target }

  // Collected across every chain, because one condition may read the renamed
  // path more than once and rewriting only the first is the subtler bug: the
  // rule goes on working for some values and not others.
  const spans = []
  for (const chain of readChains(parsed.ast)) {
    const prefix = chain.prefixes.find((candidate) => candidate.path === from)
    if (prefix !== undefined) spans.push(prefix)
  }
  if (spans.length === 0) return { ok: true, source, changed: false }

  // Right to left, so an earlier span's offsets are still the offsets of the
  // string being spliced.
  let rewritten = source
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    rewritten = rewritten.slice(0, span.start) + to + rewritten.slice(span.end)
  }

  const after = parse(rewritten, options)
  if (!after.ok) {
    return {
      ok: false,
      error: new ExpressionError({
        kind: 'syntax',
        code: 'rewrite_broke_source',
        message: `Rewriting "${from}" to "${to}" produced an expression that no longer parses.`,
        source: rewritten,
        hint: `The original was ${JSON.stringify(source)} and is unchanged.`,
        cause: after.error,
      }),
    }
  }

  const expected = [...referencedPaths(parsed.ast)]
    .map((path) => (path === from || isUnder(path, from) ? `${to}${path.slice(from.length)}` : path))
    .sort()
  const actual = referencedPaths(after.ast)
  if (actual.join('\u0000') !== expected.join('\u0000')) {
    return {
      ok: false,
      error: new ExpressionError({
        kind: 'policy',
        code: 'rewrite_changed_references',
        message:
          `Rewriting "${from}" to "${to}" would change what the expression reads: ` +
          `${describe(expected)} was intended, ${describe(actual)} resulted.`,
        source,
        // The case this almost always is, named rather than left to be worked
        // out from two lists of paths.
        hint:
          `"${to}" may already be bound as a local by a comprehension or by bind(), ` +
          `which would capture the reference instead of reading the field.`,
      }),
    }
  }

  return { ok: true, source: rewritten, changed: true }
}

/**
 * Undefined when `to` is exactly one data path, or the error explaining why it
 * is not.
 *
 * Checked by parsing it and asking what it reads, rather than by matching it
 * against a pattern for paths. The two can disagree — and the parser is the
 * thing that decides, so asking anything else is asking the wrong oracle. It
 * also settles notation for free: `a["b c"]` reads back as `a["b c"]`, so a
 * path that needs brackets is accepted written that way and spliced verbatim.
 */
function onePath(to: string, source: string): ExpressionError | undefined {
  const refuse = (why: string): ExpressionError =>
    new ExpressionError({
      kind: 'policy',
      code: 'rewrite_target_not_a_path',
      message: `"${to}" is not a data path, so it cannot replace one: ${why}`,
      source,
      hint: 'A path is an identifier, optionally followed by .member or ["member"].',
    })

  const parsed = parse(to)
  if (!parsed.ok) return refuse('it does not parse.')
  const reads = referencedPaths(parsed.ast)
  if (reads.length !== 1) {
    return refuse(reads.length === 0 ? 'it reads nothing.' : `it reads ${describe(reads)}.`)
  }
  if (reads[0] !== to) {
    // `a. b` parses and reads `a.b`, and splicing the author's spelling in
    // would put whitespace inside a chain that a later rewrite would then
    // fail to recognise as the path it is.
    return refuse(`it is a way of writing ${JSON.stringify(reads[0])} rather than that path.`)
  }
  return undefined
}

/** Whether `path` sits inside `prefix`, as a member rather than as a name that starts the same way. */
function isUnder(path: string, prefix: string): boolean {
  return path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)
}

function describe(paths: readonly string[]): string {
  return paths.length === 0 ? 'nothing' : paths.map((path) => `"${path}"`).join(', ')
}
