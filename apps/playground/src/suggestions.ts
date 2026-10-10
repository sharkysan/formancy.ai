import { draftsOn, translationToReview } from '@formancy/builder-core'
import type { BuilderSession, Relay } from '@formancy/builder-core'
import type { ModelRuns } from './angular-builder-host.js'

/**
 * Something to try with the page's model, drawn beside the pane it is for.
 *
 * **Why it exists.** formancy.ai lets a visitor ask a model of their own for a change, the
 * French a form is missing, or examples, by carrying each turn through the relay
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)). An empty box
 * said nothing about what to ask, and the requests that show what the review, the examples
 * verdict and a decline are for are not the ones a visitor thinks of first. A feature nobody
 * can see working is only documented, so the demo suggests them.
 *
 * **A suggestion asks nothing.** One with words fills in the box a visitor would type them
 * into, through the run the page holds — `instruct`, `describe` — and the visitor still
 * presses the pane's own button, and still carries the turn by hand. A translation has no
 * words of the visitor's to fill in: the language is the whole request. So its suggestion
 * asks for that language, which puts the request on the relay for the visitor to carry, and
 * is what pressing the pane's own Ask on that language does.
 *
 * Decided here, once, for both builders: which suggestions a pane is drawn beside, when one
 * can be pressed, and what pressing it does. `suggestions-list.tsx` and
 * `angular-suggestions-list.ts` are the markup and a subscription, as a package pane is over
 * builder-core ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 */
export type Suggestion = Phrased | Translated

/** Which of the page's model runs a suggestion is for: where its pane is. */
export type Feature = keyof ModelRuns

/** Words for a box: a change to describe, or what the form should do. */
export interface Phrased {
  readonly feature: 'prompt' | 'drafting'
  /** What the button says, and what it fills the box with. */
  readonly words: string
  /** What it is chosen to show, said beside it as the button's description. */
  readonly shows: string
}

/** A language to ask for what is missing in it. */
export interface Translated {
  readonly feature: 'translation'
  /** What the button says. */
  readonly words: string
  /** The language asked for: the whole of the request. */
  readonly locale: string
  readonly shows: string
}

/**
 * What heads each pane's suggestions, and names the list for a screen reader. Each says what
 * pressing one does, since the three do not all do the same.
 */
export const LEADS: Readonly<Record<Feature, string>> = {
  prompt: 'Try a change — it fills in the box, and asks nothing',
  drafting: 'Try saying what the form should do — it fills in the box, and asks nothing',
  translation: 'Try a translation — the request goes to the top of the builder, for you to carry',
}

/** The suggestions drawn beside `feature`'s pane, in the order given. None for a form with none. */
export function suggestionsFor(
  all: readonly Suggestion[] | undefined,
  feature: Feature,
): readonly Suggestion[] {
  return (all ?? []).filter((suggestion) => suggestion.feature === feature)
}

/**
 * Whether `feature`'s suggestions can be pressed now. A button that did nothing would be the
 * worse lie, and one of them would do harm:
 *
 * - **a change**, not while the prompt run waits: its box is the run's words then, and
 *   `instruct` leaves it alone;
 * - **what the form should do**, not while drafting for this form waits, when its box is
 *   disabled;
 * - **a translation**, not while one waits, and not while one is held for review — asked
 *   again, the run would forget the review the visitor carried a turn for. The pane offers
 *   its own Ask under the same two conditions.
 */
export function canTry(feature: Feature, runs: ModelRuns, session: BuilderSession): boolean {
  switch (feature) {
    case 'prompt':
      return !runs.prompt.state().busy
    case 'drafting':
      return !draftsOn(runs.drafting.state(), session).busy
    case 'translation': {
      const { busy, proposal } = runs.translation.state()
      return !busy && translationToReview(proposal) === undefined
    }
  }
}

/** What pressing one reaches: the page's runs, its relay, and the form open in the builder. */
export interface TryingWith {
  readonly runs: ModelRuns
  readonly relay: Relay
  readonly session: BuilderSession
}

/** What a pane's suggestions are drawn from: the open demo's, and what pressing one reaches. */
export interface Suggesting extends TryingWith {
  /** The open demo's suggestions, or none. */
  readonly suggestions: readonly Suggestion[] | undefined
}

/**
 * Press `suggestion`: fill in its box, or, for a translation, ask for its language. Nothing
 * when it cannot be pressed now (`canTry`).
 */
export function trySuggestion(suggestion: Suggestion, { runs, relay, session }: TryingWith): void {
  if (!canTry(suggestion.feature, runs, session)) return
  switch (suggestion.feature) {
    case 'prompt':
      runs.prompt.instruct(suggestion.words)
      return
    case 'drafting':
      runs.drafting.describe(suggestion.words)
      return
    case 'translation':
      void runs.translation.translate(relay.ask, session, suggestion.locale)
      return
  }
}
