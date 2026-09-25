import { authoringBriefing, canonicalize } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { FormSchema } from '@formancy/spec'
import { engineRefusal, expressionProblems } from '@formancy/core'

/**
 * Writing a form from an instruction, and refusing to hand back one that does
 * not work.
 *
 * ── THE LOOP IS THE PRODUCT ─────────────────────────────────────────────────
 *
 * Asking a model for JSON and putting the answer in an editor is a demo. What
 * makes this worth shipping is that the answer is **checked, and the model is
 * told what was wrong with it and asked again**. A form document is one of the
 * few things where that closes properly: the format has a published JSON
 * Schema, the expressions type-check, and both failures come back as sentences
 * rather than as a stack trace. So the model gets `no such overload: double *
 * int … write 4.0` and fixes it in the next turn.
 *
 * The alternative is what every other prompt-to-form feature does: produce
 * something plausible, put it in front of somebody, and let them find out at
 * the first submission that the conditional is inverted.
 *
 * ── WHOSE MODEL ─────────────────────────────────────────────────────────────
 *
 * Not ours. `AskModel` is supplied by the host, exactly as `Uploader` is: this
 * package has no vendor, no API key, no network call and no opinion about who
 * pays for tokens. A self-hoster points it at whatever they already run,
 * including something on their own hardware, and nothing about a form's
 * contents leaves their network unless they decide it does.
 */

/** One turn with whatever model the host has. Text in, text out. */
export type AskModel = (prompt: AuthoringPrompt) => Promise<string>

export interface AuthoringPrompt {
  /** What the model is, and the rules of the format. Stable across turns. */
  readonly system: string
  /** The instruction, plus whatever went wrong last time. */
  readonly user: string
}

/**
 * Why an attempt was rejected, in the words the model is given back.
 *
 * `logic` is the engine refusing to open the document at all — a misspelled
 * field, a cycle, a condition that is not certain to be a bool — and
 * `expression` is one it would open whose rule then never does anything.
 */
export interface AuthoringProblem {
  readonly kind: 'not-json' | 'invalid-document' | 'logic' | 'expression'
  readonly detail: string
}

export type AuthoringResult =
  | { readonly ok: true; readonly document: FormSchema; readonly attempts: number }
  | {
      readonly ok: false
      readonly attempts: number
      readonly problems: readonly AuthoringProblem[]
      /** The last thing the model said, so a person can see what went wrong. */
      readonly lastAnswer: string
    }

export interface AuthoringOptions {
  /**
   * How many times to ask. Three by default: the first answer, one correction,
   * and one more for the mistake the correction introduced. Past that a model
   * is usually circling rather than converging, and a person reading four
   * failed attempts is better served by the first error than the fourth.
   */
  readonly attempts?: number
  /**
   * The document being edited, when there is one. Its presence changes the
   * instruction from "write a form" to "change this form", which is a
   * different request and produces a different answer.
   */
  readonly current?: FormSchema
}

const DEFAULT_ATTEMPTS = 3

export async function authorForm(
  ask: AskModel,
  instruction: string,
  options: AuthoringOptions = {},
): Promise<AuthoringResult> {
  const limit = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const system = authoringBriefing()
  const problems: AuthoringProblem[] = []
  let lastAnswer = ''

  for (let attempt = 1; attempt <= limit; attempt += 1) {
    const answer = await ask({ system, user: userPrompt(instruction, options.current, problems) })
    lastAnswer = answer

    const parsed = readDocument(answer)
    if (parsed === undefined) {
      problems.push({
        kind: 'not-json',
        detail: 'That was not JSON. Answer with the document alone: no commentary, no code fence.',
      })
      continue
    }

    const validated = validateSchema(parsed)
    if (!validated.valid) {
      problems.push({
        kind: 'invalid-document',
        detail: validated.errors.map((error) => `${error.path}: ${error.message}`).join('\n'),
      })
      continue
    }

    // The engine's own compile, which is what the preview and the server run.
    // Without it a document with one misspelled field name passed this loop,
    // landed in the editor, and the preview could not open it.
    const refusal = engineRefusal(parsed as FormSchema)
    if (refusal !== undefined) {
      problems.push({ kind: 'logic', detail: refusal })
      continue
    }

    const silent = expressionProblems(parsed as FormSchema)
    if (silent.length > 0) {
      // The failure worth the whole loop. These compile and then evaluate to
      // nothing, so the form would publish cleanly and quietly do nothing.
      problems.push({
        kind: 'expression',
        detail: silent.map((problem) => problem.message).join('\n'),
      })
      continue
    }

    return { ok: true, document: parsed as FormSchema, attempts: attempt }
  }

  return { ok: false, attempts: limit, problems, lastAnswer }
}

/**
 * The instruction, and what went wrong last time.
 *
 * Only the most recent problem is repeated. A model given three rounds of
 * accumulated complaints starts fixing the first one again.
 */
function userPrompt(
  instruction: string,
  current: FormSchema | undefined,
  problems: readonly AuthoringProblem[],
): string {
  const parts: string[] = []

  if (current !== undefined) {
    parts.push('Here is the current document. Change it as asked and answer with the whole thing:')
    // Canonical, so the model is not distracted by key order that means
    // nothing, and two identical documents look identical to it.
    parts.push(canonicalize(current))
    parts.push('')
  }

  parts.push(instruction)

  const last = problems.at(-1)
  if (last !== undefined) {
    parts.push('')
    parts.push('Your previous answer was rejected. Fix exactly this and answer again:')
    parts.push(last.detail)
  }

  return parts.join('\n')
}

/**
 * The document out of whatever the model said.
 *
 * Models put JSON in code fences and add a sentence in front of it however
 * firmly they are told not to, and refusing those answers would spend a turn
 * on formatting rather than on the form. So a fence is stripped and, failing
 * that, the outermost braces are taken. Anything looser would start accepting
 * prose that happens to contain a bracket.
 */
function readDocument(answer: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer)
  const candidates = [fenced?.[1], answer, betweenBraces(answer)]

  for (const candidate of candidates) {
    if (candidate === undefined) continue
    try {
      const parsed: unknown = JSON.parse(candidate.trim())
      // A bare string or number is valid JSON and is not a document; letting
      // one through would report it as an invalid document rather than as an
      // answer that was not one.
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // Try the next reading.
    }
  }
  return undefined
}

function betweenBraces(answer: string): string | undefined {
  const start = answer.indexOf('{')
  const end = answer.lastIndexOf('}')
  return start === -1 || end <= start ? undefined : answer.slice(start, end + 1)
}
