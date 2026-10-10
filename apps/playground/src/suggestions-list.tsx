import { useId, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { LEADS, canTry, suggestionsFor, trySuggestion } from './suggestions.js'
import type { Feature, Suggesting } from './suggestions.js'

/**
 * Something to try with the page's model, beside the pane it is for: in the React builder.
 *
 * Which ones, when they can be pressed and what pressing one does are `suggestions.ts`'s, and
 * the Angular builder draws the same list from it (`angular-suggestions-list.ts`); this is the
 * markup and a subscription to the run the suggestions fill.
 *
 * The page's, not a package's: a host's builder suggests nothing, because what is worth
 * trying depends on the form. So it is dressed in `app.css`, under a class, rather than given
 * a `data-formancy-part` the themes would be expected to know.
 */
export function SuggestionsList({
  feature,
  onTried,
  ...from
}: Suggesting & {
  /** Which pane this is drawn beside. */
  feature: Feature
  /** Told after one is pressed: the translations tab opens its pane again, on the language asked for. */
  onTried?: (() => void) | undefined
}): ReactElement | null {
  const { suggestions, runs, session } = from
  const open = useSyncExternalStore(runs[feature].subscribe, () => canTry(feature, runs, session))
  const lead = useId()
  const offered = suggestionsFor(suggestions, feature)
  if (offered.length === 0) return null

  return (
    <div className="suggestions">
      <p id={lead}>{LEADS[feature]}</p>
      <ul aria-labelledby={lead}>
        {offered.map((suggestion, index) => (
          <li key={suggestion.words}>
            <button
              type="button"
              disabled={!open}
              aria-describedby={`${lead}-${String(index)}`}
              onClick={() => {
                trySuggestion(suggestion, from)
                onTried?.()
              }}
            >
              {suggestion.words}
            </button>
            <span id={`${lead}-${String(index)}`}>{suggestion.shows}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
