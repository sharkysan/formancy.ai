import type { Phrased, Suggestion, Translated } from './suggestions.js'

/**
 * What to try with a model on the starter, one or two per thing the page can ask one.
 *
 * Each is chosen to show something real about this form rather than to read well, and is
 * about its fields — so no other demo carries any. `suggestions.test.tsx` holds what each
 * one's `shows` says about the starter against the starter itself.
 */

/**
 * A change whose rule is easy to write the wrong way round. The canton is asked of the Swiss
 * by `country == "CH"`; adding a country is where a model rewrites that condition, and
 * `country != "CH"` passes every check the loop makes. The starter's examples are what tell
 * the two apart, and the review runs them before Apply
 * ([0159](../../../docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).
 */
export const BACKWARDS_EDIT: Phrased = {
  feature: 'prompt',
  words: 'Add Austria to the countries, and ask only people in Switzerland for a canton',
  shows:
    'If the answer turns the canton rule round, the starter’s examples stop holding, and the review names them before anything is applied.',
}

/**
 * A request no document can satisfy. A form says what it asks and checks, not where its
 * answers go, and the briefing offers a model a way to say so
 * ([0158](../../../docs/decisions/0158-a-model-may-decline.md)).
 */
export const OUT_OF_REACH: Phrased = {
  feature: 'prompt',
  words: 'Email me a copy of every order',
  shows:
    'A form says what it asks, not where its answers go, so this is a request a model is asked to decline, with its reason.',
}

/**
 * The starter's French, which is half-finished on purpose: the form pane shows the fallback,
 * and a model can be asked for only what is missing, each message reviewed before it lands
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)).
 */
export const FRENCH: Translated = {
  feature: 'translation',
  words: 'Translate the French this form is missing',
  locale: 'fr',
  shows:
    'The French is half-finished on purpose. Only what is missing is asked for, and each message is reviewed before it lands.',
}

/**
 * A sentence of intent about a rule the starter has and no example of. The model is never
 * shown the rule, and the engine runs each draft against the form before it can be kept
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 */
export const DRAFTING_INTENT: Phrased = {
  feature: 'drafting',
  words: 'Express delivery needs a “wanted by” date; standard delivery does not',
  shows:
    'The starter has this rule and no example of it. The model is not shown the rule; the engine runs each draft before you keep it.',
}

export const STARTER_SUGGESTIONS: readonly Suggestion[] = [
  BACKWARDS_EDIT,
  OUT_OF_REACH,
  FRENCH,
  DRAFTING_INTENT,
]
