import { authoringBriefing, canonicalize, DECLINE_KEY } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { FormSchema } from '@formancy/spec'
import { engineRefusal, expressionProblems } from '@formancy/core'
import { askChecked } from './answers.js'
import type { AskModel, Checkable, Stop, Verdict } from './answers.js'

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

export { createStop, declinedAnswer, ModelBusyError } from './answers.js'
export type { AskModel, AskTurn, AuthoringPrompt, Stop } from './answers.js'

/**
 * Why an attempt was rejected, in the words the model is given back.
 *
 * `logic` is the engine refusing to open the document at all — a misspelled
 * field, a cycle, a condition that is not certain to be a bool — and
 * `expression` is one it would open whose rule then never does anything.
 * `unexplained-decline` is not a document at all: a decline with no reason in it,
 * which is asked for the reason rather than checked as a form (0158).
 */
export interface AuthoringProblem {
  readonly kind: 'not-json' | 'invalid-document' | 'logic' | 'expression' | 'unexplained-decline'
  readonly detail: string
}

export type AuthoringResult =
  | { readonly ok: true; readonly document: FormSchema; readonly attempts: number }
  | {
      readonly ok: false
      /** Turns asked, counting one that was stopped or could not be made. */
      readonly attempts: number
      /** What was wrong with each answer that came, in order. */
      readonly problems: readonly AuthoringProblem[]
      /** The last answer that was checked, so a person can see what went wrong. */
      readonly lastAnswer: string
      /**
       * Why there is no document. `gave-up`: every attempt answered and none
       * worked. `stopped`: the person stopped the run, and an answer still on its
       * way is discarded. `unreachable`: the host's model threw — the network, a
       * refused key — so nothing about the instruction was tried. `busy`: the host's
       * model rejected with `ModelBusyError`, answering another request — through a
       * relay, another pane's turn (0162). `declined`: the model answered that the
       * format cannot express what was asked, and was not asked again (0158).
       */
      readonly ended: 'gave-up' | 'stopped' | 'unreachable' | 'busy' | 'declined'
      /**
       * When unreachable: the message of what the host's model threw, absent when it
       * had none — `undefined`, an event, an empty string. When declined: the model's
       * reason, as it wrote it. Either is shown as text.
       */
      readonly reason?: string
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
  /**
   * The person's stop, from `createStop`. Pressed while a turn waits, the run
   * ends at once as `stopped` — whether or not the host's model listens for
   * it — and whatever that turn answers later is discarded.
   */
  readonly stop?: Stop
}

/**
 * A working form from an instruction, or why there is none.
 *
 * Resolves on every ending, the host's model throwing included: an unreachable
 * model is a way the run ended, not an error in it, and a caller that had to
 * catch it built the failure by hand and called it a document that did not work.
 */
export async function authorForm(
  ask: AskModel,
  instruction: string,
  options: AuthoringOptions = {},
): Promise<AuthoringResult> {
  const system = authoringBriefing()
  const asked = await askChecked(
    ask,
    (latest: AuthoringProblem | undefined) => ({
      kind: 'authoring',
      system,
      user: userPrompt(instruction, options.current, latest),
      // For a host that keeps a conversation: the model has its last answer
      // already, and needs only what was wrong with it.
      ...(latest === undefined ? {} : { followUp: complaint(latest) }),
    }),
    checkDocument,
    {
      ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
      ...(options.stop === undefined ? {} : { stop: options.stop }),
    },
  )
  return asked.ok ? { ok: true, document: asked.value, attempts: asked.attempts } : asked
}

/**
 * The decline as the briefing shows it, for a model that sent one with no reason.
 *
 * Shown again rather than referred to, because a host that keeps a conversation
 * sends the complaint alone. Built from the key, as the briefing's is, and
 * `authoring.test.ts` holds the two to the same text.
 */
const DECLINE_EXAMPLE = JSON.stringify({ [DECLINE_KEY]: '<why, for the person who asked>' })

/** Whether what an answer held is a document that works, or the first thing wrong with it. */
function checkDocument(answer: Checkable): Verdict<FormSchema, AuthoringProblem> {
  if (answer === undefined) {
    return {
      ok: false,
      problem: {
        kind: 'not-json',
        detail: 'That was not JSON. Answer with the document alone: no commentary, no code fence.',
      },
    }
  }

  if (answer.kind === 'unexplained-decline') {
    // Not validated: the schema would call the key a misspelling to remove, which
    // tells a model that judged the request impossible to write a document anyway.
    return {
      ok: false,
      problem: {
        kind: 'unexplained-decline',
        detail:
          'A decline needs a reason, written for the person who asked. If the format cannot ' +
          `express what was asked, answer ${DECLINE_EXAMPLE}; if it can, answer with the document.`,
      },
    }
  }

  const parsed = answer.value
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

  if (latest !== undefined) parts.push('', complaint(latest))

  return parts.join('\n')
}

/** What was wrong last time, as the model is told it — in the full prompt and as a follow-up alike. */
function complaint(problem: AuthoringProblem): string {
  return `Your previous answer was rejected. Fix exactly this and answer again:\n${problem.detail}`
}
