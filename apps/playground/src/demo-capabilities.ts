/*
 * The protocol types, taken from the React package — and that is a smell this
 * module is in a position to notice rather than fix. `OptionsSource`,
 * `OptionsSources` and `Scanner` are declared **independently and identically**
 * in `@formancy/react` and `@formancy/angular`; the two declarations are
 * byte-for-byte the same today and nothing makes them stay that way.
 *
 * The capabilities below are passed to BOTH providers and typecheck structurally
 * against each, which is why this works at all. Recorded as debt in
 * `docs/architecture/11-risks-and-debt.md` rather than moved, because moving a
 * published type is a change to two packages' public surfaces.
 */
import type { OptionsSources, Scanner } from '@formancy/react'
import type { AskModel } from '@formancy/builder-core'

/**
 * What this deployment supplies, for both renderers.
 *
 * A control's real behaviour exists only where a host supplies the capability:
 * without an options source a `select` naming one renders a message instead of a
 * chooser, without an uploader a file field says there is nowhere to put bytes,
 * and without a scanner a code field is an ordinary text input. A playground
 * missing them would show the fallback and call it the feature.
 *
 * **Its own module because the page has two renderers**, and these were local to
 * the React component. The Angular half was therefore bootstrapped without them
 * and quietly rendered one control fewer — `deliveryPoint`, a typeahead over
 * `pickup-points`, which had no list to resolve. Found by comparing the two panes
 * by accessible name rather than by looking at them; the pane was not empty, and
 * one missing control out of twenty-three is not something an eye catches.
 *
 * So the capabilities belong to the DEPLOYMENT rather than to a renderer, and
 * this is the deployment. One source, provided twice.
 */
/**
 * A stand-in for a deployment's own list, so the demo shows the real behaviour.
 *
 * This is the half a form document deliberately does NOT carry: the document says
 * `optionsSource: "pickup-points"` and this says what that name means. In a real
 * deployment `resolve` is a call to whatever already holds the list — an internal
 * API, a database, a directory — and nothing in formancy ever makes a request of
 * its own.
 *
 * Slow on purpose, by a quarter of a second: the busy state, the debounce and the
 * "searching" announcement are the parts of this that only exist under latency, and a
 * demo that answered instantly would show none of them.
 */
export const PICKUP_POINTS = [
  'Zürich Hauptbahnhof',
  'Zürich Oerlikon',
  'Bern Bahnhof',
  'Basel SBB',
  'Genève Cornavin',
  'Lausanne Flon',
  'Luzern Bahnhof',
  'St. Gallen Bahnhof',
  'Lugano Centro',
  'Winterthur Altstadt',
].map((label, index) => ({ value: `p${String(index + 1)}`, label }))

export const DEMO_OPTIONS_SOURCES: OptionsSources = {
  'pickup-points': {
    minQueryLength: 0,
    maxRows: 6,
    resolve: ({ kind, query, values, signal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (kind === 'labels') {
            resolve(PICKUP_POINTS.filter((point) => values.includes(point.value)))
            return
          }
          // The narrowing is the SOURCE's, not the control's: it was handed the
          // query, and a control that re-filtered its answer would drop rows the
          // source matched on data the person cannot see.
          const folded = query.trim().toLowerCase()
          resolve(
            folded === ''
              ? PICKUP_POINTS
              : PICKUP_POINTS.filter((point) => point.label.toLowerCase().includes(folded)),
          )
        }, 250)
        // Honouring the signal is the point of it: a keystroke that supersedes an
        // earlier one should cancel the work, not just ignore the answer.
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('Superseded', 'AbortError'))
        })
      }),
  },
}

export const DEMO_SCANNER: Scanner = async ({ label }) =>
  window.prompt(`Stand-in for a camera. What does the code for "${label}" read?`)

/**
 * A stand-in for a model, in the same spirit as the scanner above.
 *
 * The prompt pane needs an `AskModel`, and this app has no vendor, no key and
 * no business making a network call on a visitor's behalf — which is the whole
 * point of `ask` being supplied by the host rather than built in. A pane that
 * renders nothing because nobody configured a model is honest and shows
 * nothing, so the feature would be documented and invisible: the failure this
 * repository has shipped once.
 *
 * So the person plays the model, exactly as they play the camera. Everything
 * downstream is real — the answer is parsed, validated against the spec's own
 * schema, compiled by the engine, type-checked, diffed against the open
 * document and held for review — and the only part that is pretend is the
 * sentence-to-JSON step, which is the part a key would buy.
 *
 * Each dialog says which attempt it is, of how many, and from the second shows the
 * complaint alone — `followUp`, what a host keeping a conversation with its model
 * sends instead of the whole prompt again.
 *
 * **Cancelling the dialog is a model that could not be asked**, so it rejects, and
 * the run ends at once with the pane saying so
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)). It used
 * to answer with an empty string while this comment said it handed back the
 * current document. An empty string is not JSON, so a cancel bought a dialog for
 * every remaining attempt and then "3 attempts, and the document still did not
 * work". Handing back the document would have meant reading it out of the prompt's
 * English, which is not a contract.
 */
export const DEMO_MODEL: AskModel = ({ user, attempt, limit, followUp }) => {
  const answer = window.prompt(
    `Stand-in for a model, attempt ${String(attempt)} of ${String(limit)}. It was asked:\n\n` +
      `${followUp ?? user.split('\n').at(-1) ?? ''}\n\n` +
      'Answer with the whole form document, as JSON.',
  )
  return answer === null
    ? Promise.reject(new Error('Nobody answered for the stand-in model.'))
    : Promise.resolve(answer)
}
