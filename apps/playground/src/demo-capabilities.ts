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
import type { RelayChat } from '@formancy/builder-core'

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
 * Where a visitor takes the model's turn: a chat of their own, in a new tab.
 *
 * formancy.ai makes no request to any other site
 * ([0154](../../../docs/decisions/0154-the-website-makes-no-request-to-any-other-site.md)),
 * so the playground's model is a relay: both prompt panes ask it, the relay pane shows the
 * request, the visitor copies it into a chat with a model under their own account and
 * pastes the answer back, and every check after the paste runs in this tab
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)). It replaced
 * a stand-in that had the visitor *play* the model in a dialog showing the request's last
 * line, so nobody could use a real one here.
 *
 * **The one place a service is named**, and it is this deployment's choice: neither
 * builder names one, and without this the pane links nowhere and the request is copied
 * all the same. A link is navigation the visitor chooses, not a request the page makes,
 * and the address is the chat's front door — no prompt is ever put in a URL, where it
 * would sit in a history, a log and a referrer.
 */
export const RELAY_CHAT: RelayChat = { name: 'Claude', href: 'https://claude.ai/new' }
