import { ModelBusyError, readAnswer } from './answers.js'
import type { AskModel, AuthoringPrompt } from './answers.js'
import type { BuilderMessageId, BuilderText } from './messages.js'
import type { ModelRequestKind } from './model-requests.js'

/**
 * A model whose turn a person carries: the page shows the request, somebody copies it
 * into a chat with a model of their own, and pastes the answer back.
 *
 * **Why it exists.** formancy.ai makes no request to any other site
 * ([0154](../../../docs/decisions/0154-the-website-makes-no-request-to-any-other-site.md)),
 * so the playground cannot call a model, and its stand-in had the visitor *play* one in a
 * dialog showing the last line of the request. Nobody could use a real model there. A
 * relay is an `AskModel` like any host's — `authorForm` asks it, races it against the
 * stop and checks what comes back — and the only part that is not code is the carrying.
 * Every check after the paste runs in the page.
 *
 * **Decided here rather than in a pane**, because both builders draw it and two panes
 * deciding when a paste counts would be two answers to one question
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md),
 * [0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)). A pane
 * subscribes, shows `waiting()`, and hands `answer` what was pasted. No sentence is
 * written here: what a pane says about a turn is the catalogue's, and which of its
 * sentences says what leaves with the turn is `relayLeaves`.
 *
 * Framework-neutral, the shape `BuilderSession` has: `subscribe` and a snapshot whose
 * identity changes only when the turn does, which is what React's
 * `useSyncExternalStore` needs and what an Angular signal is set from.
 */
export interface Relay {
  /** Hand this to `authorForm`, or to a prompt pane as its `ask`. */
  readonly ask: AskModel
  /** The turn waiting for a person to carry it, or nothing. The same object until it changes. */
  waiting(): RelayTurn | undefined
  /** Hear each change of the turn waiting. Returns what stops listening. */
  subscribe(listener: () => void): () => void
  /**
   * What the person pasted back, for the turn waiting.
   *
   * `'no-object'` when there is no JSON object in it, and the turn is still waiting —
   * unless `anyway`, which sends it as it is. `'nothing-waiting'` when no turn is.
   */
  answer(text: string, options?: { readonly anyway?: boolean }): RelayAnswer
}

/** What came of a paste. */
export type RelayAnswer = 'accepted' | 'no-object' | 'nothing-waiting'

/** One turn, as a person carries it. */
export interface RelayTurn {
  /** Exactly what `authorForm` asked: the prompt a host's model would have been sent. */
  readonly prompt: AuthoringPrompt
  /** The whole request as one text to copy — `relayMessage(prompt)`. */
  readonly message: string
  /**
   * From the second turn: what was wrong with the last answer, alone, for a chat that
   * still holds that answer. Absent on the first.
   */
  readonly followUp: string | undefined
}

/**
 * Where a person can take the request: a chat the HOST names, drawn as a link that opens
 * in a new tab.
 *
 * The host's, never this package's: neither builder names a model or a service, and
 * a link is navigation the person chooses rather than a request the page makes. A host
 * that names none gets a pane with no link, and the request is copied all the same.
 */
export interface RelayChat {
  /** What the link calls the service, set into the catalogue's sentence. */
  readonly name: string
  /** Where it opens. Never carries the request: a prompt in a URL is a prompt in a log. */
  readonly href: string
}

/**
 * The whole request as one text: the system briefing, a blank line, the user message.
 *
 * Verbatim. A chat has one box, so the briefing travels with the request rather than as a
 * system prompt — and a briefing trimmed or re-wrapped on the way would be a request the
 * checks were not written against.
 */
export function relayMessage(prompt: AuthoringPrompt): string {
  return `${prompt.system}\n\n${prompt.user}`
}

/** Each kind's sentence about what leaves with it — `relayLeaves`. */
const LEAVES: Readonly<Record<ModelRequestKind, BuilderMessageId>> = {
  authoring: 'relay.leaves.authoring',
  translation: 'relay.leaves.translation',
  scenarios: 'relay.leaves.scenarios',
}

/**
 * What leaves with a request, said for its kind: one of the catalogue's sentences.
 *
 * **One per kind, because the requests carry different things.** A form's edit carries the
 * person's words and the whole document, rules included; a translation carries the
 * messages a language is missing, where each is used and the translations it has, and none
 * of the rules ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md));
 * a request for examples carries the fields, their labels and options, the codes, where
 * examples start, the names already taken and the author's words, and none of the rules
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 * One sentence said "including the form" of all three, which was true of the first and
 * overstated the other two
 * ([0167](../../../docs/decisions/0167-the-relay-says-what-each-request-carries.md)).
 * `relay.test.ts` checks each sentence's claims against the request its run builds.
 *
 * By the kind the run set on the prompt, never by a pane, and decided here so the two
 * builders' panes cannot say different things about one request (0091). A `Record`, so a
 * kind added to `MODEL_REQUEST_KINDS` does not compile until it has a sentence.
 */
export function relayLeaves(kind: ModelRequestKind, text: BuilderText): string {
  return text(LEAVES[kind])
}

export function createRelay(): Relay {
  /** The turn waiting, and how to answer it. One at most. */
  let current: { readonly turn: RelayTurn; readonly settle: (text: string) => void } | undefined
  const listeners = new Set<() => void>()

  const changed = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const ask: AskModel = (prompt, turn) => {
    // **One turn at a time.** Queued, a second request would wait behind a turn the
    // person may never answer, and a paste meant for one could be taken as the other's.
    // Refused as busy, its run ends at once, and its pane says so in the author's
    // language: a host that asks one relay from several panes — the playground's prompt,
    // scenario and translations panes — reaches this from any of them (0162).
    if (current !== undefined) {
      return Promise.reject(new ModelBusyError())
    }
    return new Promise<string>((resolve) => {
      const waiting = {
        turn: { prompt, message: relayMessage(prompt), followUp: prompt.followUp },
        settle: resolve,
      }
      current = waiting
      // A stop clears the turn, so an answer pasted afterwards finds nothing to answer
      // rather than being kept for whatever is asked next — the variant of D10 a stop
      // makes possible, with a person in the middle.
      turn.onCancel(() => {
        if (current !== waiting) return
        current = undefined
        changed()
      })
      changed()
    })
  }

  return {
    ask,
    waiting: () => current?.turn,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    answer(text, options = {}) {
      const waiting = current
      if (waiting === undefined) return 'nothing-waiting'
      // A copy that caught the chat's sentence and not its code block is a mistake of the
      // paste, not the model's. Sent on, it would spend an attempt — and a round trip by
      // hand — on telling the model it wrote no JSON when it did. `readAnswer` is what
      // the run will read it with, so the two cannot disagree about what holds an object;
      // a decline holds one, and is an answer.
      if (options.anyway !== true && readAnswer(text) === undefined) return 'no-object'
      current = undefined
      changed()
      waiting.settle(text)
      return 'accepted'
    },
  }
}
