/**
 * Asking a model for something checkable, and reading what it says.
 *
 * Two halves every request to a model has, whatever it asks for: getting a JSON
 * object out of text a model wrote, and asking again — told what was wrong — until
 * an answer passes or the run gives up. A form is the first thing asked for this
 * way ([0056](../../../docs/decisions/0056-agents-get-the-checks.md)), and it will
 * not be the last, so neither half knows what a form is. The caller says what to
 * ask and how to check the answer.
 *
 * **No sentences here.** What a model is told — the briefing, the instruction, the
 * complaint — is worded by whoever asks, because that wording is about the thing
 * being asked for. This file only decides how many times, and what comes back.
 */

/** One turn with whatever model the host has. Text in, text out. */
export type AskModel = (prompt: AuthoringPrompt) => Promise<string>

export interface AuthoringPrompt {
  /** What the model is, and the rules of the format. Stable across turns. */
  readonly system: string
  /** The instruction, plus whatever went wrong last time. */
  readonly user: string
}

/** What one answer came to: the thing asked for, or what was wrong with it. */
export type Verdict<T, P> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: P }

/** How a run of turns ended. */
export type Asked<T, P> =
  | { readonly ok: true; readonly value: T; readonly attempts: number }
  | {
      readonly ok: false
      readonly attempts: number
      /** What was wrong with each answer, in the order they came. */
      readonly problems: readonly P[]
      /** The last thing the model said, so a person can see what went wrong. */
      readonly lastAnswer: string
    }

export interface AskOptions {
  /** How many times to ask. Three by default — `AuthoringOptions.attempts` says why. */
  readonly attempts?: number
}

const DEFAULT_ATTEMPTS = 3

/**
 * Ask, check, and ask again with the complaint, until an answer passes.
 *
 * `build` is given only the **latest** problem, never the list: a model handed
 * three rounds of accumulated complaints starts fixing the first one again, and
 * a loop that passes one cannot be called in a way that repeats them all.
 */
export async function askChecked<T, P>(
  ask: AskModel,
  build: (latest: P | undefined) => AuthoringPrompt,
  check: (answer: string) => Verdict<T, P>,
  options: AskOptions = {},
): Promise<Asked<T, P>> {
  const limit = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const problems: P[] = []
  let lastAnswer = ''

  for (let attempt = 1; attempt <= limit; attempt += 1) {
    const answer = await ask(build(problems.at(-1)))
    lastAnswer = answer

    const verdict = check(answer)
    if (verdict.ok) return { ok: true, value: verdict.value, attempts: attempt }
    problems.push(verdict.problem)
  }

  return { ok: false, attempts: limit, problems, lastAnswer }
}

/**
 * The JSON object in whatever the model said, or `undefined` when there is none.
 *
 * Models put JSON in code fences and add a sentence in front of it however
 * firmly they are told not to, and refusing those answers would spend a turn
 * on formatting rather than on the content. So a fence is stripped and, failing
 * that, the outermost braces are taken. Anything looser would start accepting
 * prose that happens to contain a bracket.
 */
export function readAnswer(text: string): object | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const candidates = [fenced?.[1], text, betweenBraces(text)]

  for (const candidate of candidates) {
    if (candidate === undefined) continue
    try {
      const parsed: unknown = JSON.parse(candidate.trim())
      // A bare string or number is valid JSON and is not an object; letting
      // one through would report it as the wrong object rather than as an
      // answer that was not one.
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // Try the next reading.
    }
  }
  return undefined
}

function betweenBraces(text: string): string | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start === -1 || end <= start ? undefined : text.slice(start, end + 1)
}
