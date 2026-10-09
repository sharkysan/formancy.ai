import { authoringBriefing, canonicalize } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { FormSchema } from '@formancy/spec'
import { engineRefusal, expressionProblems } from '@formancy/core'
import { askChecked, readAnswer } from './answers.js'
import type { AskModel, Verdict } from './answers.js'

/**
 * Writing a form from an instruction, and refusing to hand back one that does not work.
 *
 * The answer is **checked, and the model is told what was wrong with it and asked
 * again**: the format has a published JSON Schema and the expressions type-check, so
 * both failures come back as sentences a model can act on — `no such overload: double *
 * int … write 4.0` — rather than as a stack trace. Nothing reaches the editor until it
 * would work.
 *
 * **The model is the host's.** `AskModel` is supplied exactly as `Uploader` is: no
 * vendor, no API key, no network call and no opinion about who pays for tokens.
 */

export type { AskModel, AuthoringPrompt } from './answers.js'

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

export async function authorForm(
  ask: AskModel,
  instruction: string,
  options: AuthoringOptions = {},
): Promise<AuthoringResult> {
  const system = authoringBriefing()
  const asked = await askChecked(
    ask,
    (latest: AuthoringProblem | undefined) => ({
      system,
      user: userPrompt(instruction, options.current, latest),
    }),
    checkDocument,
    options.attempts === undefined ? {} : { attempts: options.attempts },
  )
  return asked.ok ? { ok: true, document: asked.value, attempts: asked.attempts } : asked
}

/** Whether an answer is a document that works, or the first thing wrong with it. */
function checkDocument(answer: string): Verdict<FormSchema, AuthoringProblem> {
  const parsed = readAnswer(answer)
  if (parsed === undefined) {
    return {
      ok: false,
      problem: {
        kind: 'not-json',
        detail: 'That was not JSON. Answer with the document alone: no commentary, no code fence.',
      },
    }
  }

  const validated = validateSchema(parsed)
  if (!validated.valid) {
    return {
      ok: false,
      problem: {
        kind: 'invalid-document',
        detail: validated.errors.map((error) => `${error.path}: ${error.message}`).join('\n'),
      },
    }
  }

  // The engine's own compile, which is what the preview and the server run.
  // Without it a document with one misspelled field name passed this loop,
  // landed in the editor, and the preview could not open it.
  const refusal = engineRefusal(parsed as FormSchema)
  if (refusal !== undefined) return { ok: false, problem: { kind: 'logic', detail: refusal } }

  const silent = expressionProblems(parsed as FormSchema)
  if (silent.length > 0) {
    // The failure worth the whole loop. These compile and then evaluate to
    // nothing, so the form would publish cleanly and quietly do nothing.
    return {
      ok: false,
      problem: {
        kind: 'expression',
        detail: silent.map((problem) => problem.message).join('\n'),
      },
    }
  }

  return { ok: true, value: parsed as FormSchema }
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
  latest: AuthoringProblem | undefined,
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

  if (latest !== undefined) {
    parts.push('')
    parts.push('Your previous answer was rejected. Fix exactly this and answer again:')
    parts.push(latest.detail)
  }

  return parts.join('\n')
}
