import { childNodes } from './ast.js'
import type { CelNode, ExpressionAst } from './ast.js'
import { readChains } from './chains.js'
import { ExpressionError } from './errors.js'
import { parse } from './parse.js'
import type { ParseOptions, ParsedExpression } from './parse.js'
import type { RewriteOutcome } from './rewrite.js'

/** The operators that compare one value with another. `in` is not one: its right side is a collection. */
export type ComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>='

const COMPARISONS: ReadonlySet<string> = new Set<ComparisonOperator>(['==', '!=', '<', '<=', '>', '>='])

/** A field compared with a string written into the expression. */
export interface ComparedLiteral {
  /** The field, named as `referencedPaths` names it, so `a["b"]` is `a.b`. */
  readonly path: string
  /** As written: `"x" < a` is reported as `<`, not turned round. */
  readonly operator: ComparisonOperator
  readonly literal: string
}

/**
 * Every place the expression compares a field with a string, in the order they are written.
 *
 * The question a check needs answered before it can tell a date compared with something
 * that is not a date (0236). The answer is a comparison's two sides, which nothing outside
 * this package can see: an AST is opaque to its callers (`ast.ts`).
 *
 * **A side is a field only where `readChains` found a whole read at exactly its span.** That
 * walk is the one answer to which names are fields and which a comprehension or `bind` binds
 * itself, kept in one place so the dependency graph and the text of a rule cannot disagree
 * (`chains.ts`). A second walk deciding it again would be a second answer, so this one asks
 * the first: `x.at` in `legs.all(x, x.at == "1")` is no read there, and so no field here.
 */
export function comparedLiterals(ast: ExpressionAst): readonly ComparedLiteral[] {
  return literalNodes(ast).map(({ node: _node, ...compared }) => compared)
}

interface LiteralNode extends ComparedLiteral {
  readonly node: CelNode
}

function literalNodes(ast: ExpressionAst): readonly LiteralNode[] {
  const reads = wholeReads(ast)

  const found: LiteralNode[] = []
  const visit = (node: CelNode): void => {
    if (COMPARISONS.has(node.op)) {
      const [left, right] = node.args as [CelNode, CelNode]
      const compared = fieldAndLiteral(left, right, reads) ?? fieldAndLiteral(right, left, reads)
      if (compared !== undefined) found.push({ ...compared, operator: node.op as ComparisonOperator })
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit((ast as ParsedExpression).node)
  return found
}

/**
 * Write the strings a field is compared with again, in place (0238): what a builder needs to
 * carry a rule along when the width of the field's answers changes.
 *
 * `replace` is asked once per compared literal and answers the text to put there, or nothing to
 * leave it. **It splices source, as `rewritePath` does**: only the characters between the quotes
 * change, so the author's spacing and quotes survive and a published form's diff shows the one
 * change. A literal whose source is not its plain text (an escape, a raw or triple-quoted string)
 * is refused rather than spliced, because the value read and the text written would differ.
 * The result is parsed again and must compare the same fields in the same order, with the
 * literals that were asked to change changed and the rest not.
 */
export function rewriteComparedLiterals(source: string, replace: (compared: ComparedLiteral) => string | undefined, options?: ParseOptions): RewriteOutcome {
  const parsed = parse(source, options)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const splices: Array<{ start: number; end: number; text: string }> = []
  const expected: ComparedLiteral[] = []
  for (const { node, ...compared } of literalNodes(parsed.ast)) {
    const text = replace(compared)
    expected.push({ ...compared, literal: text ?? compared.literal })
    if (text === undefined || text === compared.literal) continue
    const written = source.slice(node.start, node.end)
    const quote = written.charAt(0)
    if ((quote !== '"' && quote !== "'") || written !== `${quote}${compared.literal}${quote}`) {
      return {
        ok: false,
        error: refusal('rewrite_literal_not_plain', `The literal ${written} is not written as plain text, so it cannot be replaced without guessing.`, source),
      }
    }
    splices.push({ start: node.start + 1, end: node.end - 1, text })
  }
  if (splices.length === 0) return { ok: true, source, changed: false }

  // Right to left, so an earlier splice's offsets are still the offsets of the string spliced.
  let rewritten = source
  for (const splice of [...splices].sort((a, b) => b.start - a.start)) {
    rewritten = rewritten.slice(0, splice.start) + splice.text + rewritten.slice(splice.end)
  }

  const after = parse(rewritten, options)
  if (!after.ok) return { ok: false, error: refusal('rewrite_broke_source', 'Replacing a literal produced an expression that no longer parses.', source) }
  if (JSON.stringify(comparedLiterals(after.ast)) !== JSON.stringify(expected)) {
    return { ok: false, error: refusal('rewrite_changed_comparisons', 'Replacing a literal would change what the expression compares.', source) }
  }
  return { ok: true, source: rewritten, changed: true }
}

function refusal(code: string, message: string, source: string): ExpressionError {
  return new ExpressionError({ kind: 'policy', code, message, source, hint: 'The expression is unchanged.' })
}

/** Two fields compared with each other. */
export interface ComparedFields {
  /** The field on the left as written, named as `referencedPaths` names it. */
  readonly left: string
  readonly right: string
  /** As written: `a > b` is reported as `>`, not turned round. */
  readonly operator: ComparisonOperator
}

/**
 * Every place the expression compares one field with another, in the order they are written.
 *
 * What a check across a field's width needs: `startedAt < endedAt` compares two answers as
 * text, which is only right when both have one width (0067). The reads come from the same
 * walk as `comparedLiterals`, so a comprehension's own variable is never a field, and
 * **`steps.all(s, s.at >= startedAt)` is not seen**: `s.at` is no read in the model. That is
 * the named limit decided in 0238, and closing it would mean teaching this package what a
 * variable stands for, which 0236 avoided on purpose.
 */
export function comparedFields(ast: ExpressionAst): readonly ComparedFields[] {
  const reads = wholeReads(ast)
  const found: ComparedFields[] = []
  const visit = (node: CelNode): void => {
    if (COMPARISONS.has(node.op)) {
      const [left, right] = node.args as [CelNode, CelNode]
      const leftPath = reads.get(spanOf(left))
      const rightPath = reads.get(spanOf(right))
      if (leftPath !== undefined && rightPath !== undefined) {
        found.push({ left: leftPath, right: rightPath, operator: node.op as ComparisonOperator })
      }
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit((ast as ParsedExpression).node)
  return found
}

/** The field each whole read names, keyed by the span it covers: the one answer to which names are fields. */
function wholeReads(ast: ExpressionAst): ReadonlyMap<string, string> {
  const reads = new Map<string, string>()
  for (const chain of readChains(ast)) {
    const whole = chain.prefixes[chain.prefixes.length - 1]!
    reads.set(spanOf(whole), whole.path)
  }
  return reads
}

function fieldAndLiteral(field: CelNode, literal: CelNode, reads: ReadonlyMap<string, string>): { path: string; literal: string; node: CelNode } | undefined {
  const path = reads.get(spanOf(field))
  if (path === undefined || literal.op !== 'value' || typeof literal.args !== 'string') return undefined
  return { path, literal: literal.args, node: literal }
}

function spanOf(node: { readonly start: number; readonly end: number }): string {
  return `${String(node.start)}:${String(node.end)}`
}
