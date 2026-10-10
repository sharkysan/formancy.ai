import { DECLINE_KEY } from '@formancy/spec'

/**
 * Asking a model for something checkable, and reading what it says.
 *
 * Two halves every request to a model has, whatever it asks for: getting a JSON
 * object out of text a model wrote, and asking again — told what was wrong — until
 * an answer passes or the run ends. A form is the first thing asked for this way
 * ([0056](../../../docs/decisions/0056-agents-get-the-checks.md)), and it will not
 * be the last, so neither half knows what a form is. The caller says what to ask
 * and how to check the answer.
 *
 * **A run ends one of five ways**, and only the first is a success: an answer
 * passed; every attempt was used and none did; the person stopped it; the host
 * could not ask its model at all; or the model said it cannot be done. The last
 * three are not an answer that failed, and saying "the document did not work" for
 * them sent somebody to reword an instruction when the network was down
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)), or when
 * no wording would have helped
 * ([0158](../../../docs/decisions/0158-a-model-may-decline.md)).
 *
 * **No sentences here.** What a model is told — the briefing, the instruction, the
 * complaint — is worded by whoever asks, because that wording is about the thing
 * being asked for. This file only decides how many times, and what comes back.
 */

/**
 * One turn with whatever model the host has. Text in, text out.
 *
 * A function written with one parameter is still one of these: the second is
 * there for a host that can abandon a request, and one that cannot is stopped
 * all the same.
 */
export type AskModel = (prompt: AuthoringPrompt, turn: AskTurn) => Promise<string>

export interface AuthoringPrompt {
  /** What the model is, and the rules of the format. Stable across turns. */
  readonly system: string
  /**
   * The instruction, plus whatever went wrong last time — everything, every
   * turn, for a host that keeps no conversation. Only the latest complaint
   * (0056).
   */
  readonly user: string
  /** Which turn this is, from 1. */
  readonly attempt: number
  /** How many turns the run will take at most. */
  readonly limit: number
  /** From attempt 2: the complaint alone, for a conversation that still holds the last answer. */
  readonly followUp?: string
}

/** What a turn is told while it waits. */
export interface AskTurn {
  /**
   * Called at most once, if the person stops the run while this turn waits — at
   * once, if they already have. Never for a turn that has answered.
   *
   * A callback rather than an `AbortSignal`, which this package's types do not
   * have: `const c = new AbortController(); turn.onCancel(() => c.abort())`.
   */
  onCancel(stop: () => void): void
}

/**
 * The person's stop button, as a run sees it.
 *
 * Made by whoever draws the button, handed to the run, and pressed from outside
 * it — which is why it is an object and not a flag the run owns.
 */
export interface Stop {
  /** End the run. The turn waiting is abandoned and its host told; pressing again does nothing. */
  stop(): void
  /** Whether it has been pressed. */
  readonly stopped: boolean
  /**
   * Hear about it once: when it is pressed, or at once if it already has been.
   * Returns what stops listening, which a turn that answered calls.
   */
  onStop(listener: () => void): () => void
}

export function createStop(): Stop {
  let stopped = false
  const listeners = new Set<() => void>()
  return {
    stop() {
      if (stopped) return
      stopped = true
      const heard = [...listeners]
      listeners.clear()
      for (const listener of heard) listener()
    },
    get stopped() {
      return stopped
    },
    onStop(listener) {
      if (stopped) {
        listener()
        return () => undefined
      }
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
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
      /** Turns asked, counting one that was stopped or could not be made. */
      readonly attempts: number
      /** What was wrong with each answer that came, in order. */
      readonly problems: readonly P[]
      /** The last answer that was checked, so a person can see what went wrong. */
      readonly lastAnswer: string
      readonly ended: 'gave-up' | 'stopped' | 'unreachable' | 'declined'
      /**
       * When unreachable: why, in the words of whatever the host's model threw — absent
       * when it had none. When declined: why, in the model's.
       */
      readonly reason?: string
    }

export interface AskOptions {
  /** How many times to ask. Three by default — `AuthoringOptions.attempts` says why. */
  readonly attempts?: number
  /** Pressed by the person to end the run while a turn waits. */
  readonly stop?: Stop
}

const DEFAULT_ATTEMPTS = 3

/** What one turn came to, before anything checks the answer. */
type Turn =
  | { readonly kind: 'answered'; readonly answer: string }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'unreachable'; readonly reason: string | undefined }

/**
 * Ask, check, and ask again with the complaint, until an answer passes or the run ends.
 *
 * `build` is given only the **latest** problem, never the list: a model handed
 * three rounds of accumulated complaints starts fixing the first one again, and
 * a loop that passes one cannot be called in a way that repeats them all.
 *
 * `check` is given what the answer held, and never a decline: that ends the run
 * here, whatever was asked for, so a caller cannot check one as an answer that
 * failed and ask again. A decline with no reason in it does reach `check`, because
 * it is an answer that failed — the run asks again — and only the caller can word
 * what the model is told about it.
 *
 * It resolves on every ending, a host's error included, so a caller reads what
 * happened from the result rather than from whether it threw.
 */
export async function askChecked<T, P>(
  ask: AskModel,
  build: (latest: P | undefined) => Omit<AuthoringPrompt, 'attempt' | 'limit'>,
  check: (answer: Checkable) => Verdict<T, P>,
  options: AskOptions = {},
): Promise<Asked<T, P>> {
  const limit = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const problems: P[] = []
  let lastAnswer = ''
  const ended = (
    how: 'gave-up' | 'stopped' | 'unreachable' | 'declined',
    attempts: number,
    reason?: string,
  ): Asked<T, P> => ({
    ok: false,
    attempts,
    problems,
    lastAnswer,
    ended: how,
    ...(reason === undefined ? {} : { reason }),
  })

  for (let attempt = 1; attempt <= limit; attempt += 1) {
    if (options.stop?.stopped === true) return ended('stopped', attempt - 1)

    const turn = await take(ask, { ...build(problems.at(-1)), attempt, limit }, options.stop)
    if (turn.kind === 'stopped') return ended('stopped', attempt)
    if (turn.kind === 'unreachable') return ended('unreachable', attempt, turn.reason)

    lastAnswer = turn.answer
    const read = readAnswer(turn.answer)
    // Not asked again: another turn would be a call paid for — through a relay, two
    // pastes by hand — to hear the same answer, or to talk the model out of it.
    if (read?.kind === 'declined') return ended('declined', attempt, read.reason)
    const verdict = check(read)
    if (verdict.ok) return { ok: true, value: verdict.value, attempts: attempt }
    problems.push(verdict.problem)
  }

  return ended('gave-up', limit)
}

/**
 * One turn, raced against the stop.
 *
 * Raced rather than left to the host: a host that never registers `onCancel` —
 * every `AskModel` written before it existed — would otherwise hold the run for
 * as long as its request took, and its answer would arrive after the person had
 * walked away and become a proposal for an instruction they abandoned. So the
 * turn ends the moment the stop is pressed, and whatever the host says later
 * settles a promise nobody is waiting on.
 */
function take(ask: AskModel, prompt: AuthoringPrompt, stop: Stop | undefined): Promise<Turn> {
  return new Promise<Turn>((resolve) => {
    let over = false
    let cancelled = false
    const cancels: Array<() => void> = []
    let forget = (): void => undefined

    const settle = (turn: Turn): void => {
      if (over) return
      over = true
      forget()
      resolve(turn)
    }

    if (stop !== undefined) {
      forget = stop.onStop(() => {
        cancelled = true
        settle({ kind: 'stopped' })
        for (const cancel of cancels.splice(0)) cancel()
      })
    }

    const turn: AskTurn = {
      onCancel(cancel) {
        // Registered after the stop, as a host does after an await of its own:
        // told now, or its request runs on for an answer nobody reads.
        if (cancelled) cancel()
        else if (!over) cancels.push(cancel)
      },
    }

    let answer: Promise<string>
    try {
      answer = Promise.resolve(ask(prompt, turn))
    } catch (error) {
      // Thrown before it returned a promise — a configuration read up front —
      // and still the host's failure to ask, not the run's to rethrow.
      settle({ kind: 'unreachable', reason: reasonOf(error) })
      return
    }
    answer.then(
      (text) => settle({ kind: 'answered', answer: text }),
      (error: unknown) => settle({ kind: 'unreachable', reason: reasonOf(error) }),
    )
  })
}

/**
 * What the host's error says, if it says anything: its message, its name when the
 * message is empty, or the string it was rejected with.
 *
 * Read by shape rather than by `instanceof Error`, which an error from another realm
 * fails. Anything else has no words of its own, so it has no reason: `String()` of it
 * reads "undefined" or "[object ProgressEvent]" to a person, and of an object with no
 * prototype it throws — here, inside the handler that ends the run.
 */
function reasonOf(error: unknown): string | undefined {
  if (typeof error === 'string') return saysSomething(error)
  if (typeof error !== 'object' || error === null) return undefined
  const { message, name } = error as { message?: unknown; name?: unknown }
  if (typeof message !== 'string') return undefined
  return saysSomething(message) ?? (typeof name === 'string' ? saysSomething(name) : undefined)
}

function saysSomething(text: string): string | undefined {
  return text.trim() === '' ? undefined : text
}

/**
 * What a model's text held: an object to check, a decline and its reason, or a
 * decline with no reason in it.
 */
export type Reading =
  | { readonly kind: 'object'; readonly value: object }
  | { readonly kind: 'declined'; readonly reason: string }
  | { readonly kind: 'unexplained-decline' }

/** What `check` is given: a reading that is not a decline, or `undefined` when there was no object. */
export type Checkable = Exclude<Reading, { readonly kind: 'declined' }> | undefined

/**
 * The JSON object in whatever the model said, or `undefined` when there is none.
 *
 * Models put JSON in code fences and add a sentence in front of it however
 * firmly they are told not to, and refusing those answers would spend a turn
 * on formatting rather than on the content. So a fence is stripped and, failing
 * that, the outermost braces are taken. Anything looser would start accepting
 * prose that happens to contain a bracket.
 *
 * **An object whose only key is `DECLINE_KEY`, holding a reason, is a decline**:
 * what a model briefed by `authoringBriefing` answers when the format cannot
 * express the request. Recognised by its whole shape, never by the word, so a form
 * about declined claims is a form. Whatever is asked for this way must not itself
 * be such an object, and a form cannot be: it needs `specVersion`, `id`, `title`
 * and `model`. That shape with no reason in it is an `unexplained-decline`.
 */
export function readAnswer(text: string): Reading | undefined {
  const candidates = [insideFence(text), text, betweenBraces(text)]

  for (const candidate of candidates) {
    if (candidate === undefined) continue
    try {
      const parsed: unknown = JSON.parse(candidate.trim())
      // A bare string or number is valid JSON and is not an object; letting
      // one through would report it as the wrong object rather than as an
      // answer that was not one.
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return declineIn(parsed) ?? { kind: 'object', value: parsed }
      }
    } catch {
      // Try the next reading.
    }
  }
  return undefined
}

/**
 * The decline an object is, if it has a decline's shape.
 *
 * **One with no reason — blank, or not a string — does not end the run**: "the
 * model declined" and then nothing gives a person nothing to act on, and asked
 * again the model can say why, or write the form after all. Nor is it the thing
 * asked for. Checked as a form, it draws the schema's complaints — the key is a
 * misspelling to remove, four properties are missing — which tell a model to write
 * a document for a request it judged no document could satisfy. So it is a reading
 * of its own, and the caller's complaint asks for the reason.
 */
function declineIn(parsed: object): Reading | undefined {
  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== DECLINE_KEY) return undefined
  const reason: unknown = (parsed as Record<string, unknown>)[DECLINE_KEY]
  return typeof reason === 'string' && reason.trim() !== ''
    ? { kind: 'declined', reason: reason.trim() }
    : { kind: 'unexplained-decline' }
}

/**
 * A decline, as a model writes one, for a host to answer with.
 *
 * For a model service that refuses a request itself — a refusal in the response
 * rather than in its text — so the run ends after that turn with the host's
 * sentence, as it would had the model said so, rather than spending every
 * remaining attempt on answers that were not JSON.
 *
 * Throws on a reason with nothing in it: written out, that is not a decline, and
 * the run would ask again — the waste a decline exists to end. A host doing that
 * is wired wrongly, and hears so at once.
 */
export function declinedAnswer(reason: string): string {
  if (reason.trim() === '') {
    throw new Error('declinedAnswer needs a reason to show the person who asked; a blank one is not a decline.')
  }
  return JSON.stringify({ [DECLINE_KEY]: reason })
}

/**
 * What the first code fence holds, without a leading `json` label.
 *
 * Found with `indexOf` rather than a pattern: a paste reaches this reader straight from
 * the relay, and `/```(?:json)?\s*([\s\S]*?)```/` backtracks quadratically on a fence
 * opened and never closed — a long one hung the tab (CodeQL js/polynomial-redos).
 * Whitespace around the object is the caller's `trim()`.
 */
function insideFence(text: string): string | undefined {
  const open = text.indexOf('```')
  if (open === -1) return undefined
  const close = text.indexOf('```', open + 3)
  if (close === -1) return undefined
  const inside = text.slice(open + 3, close)
  return inside.startsWith('json') ? inside.slice('json'.length) : inside
}

function betweenBraces(text: string): string | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start === -1 || end <= start ? undefined : text.slice(start, end + 1)
}
