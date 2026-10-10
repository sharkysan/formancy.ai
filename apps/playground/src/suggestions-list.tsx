import { useCallback, useId, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { LEADS, canTry, followTrying, suggestionsFor, trySuggestion } from './suggestions.js'
import type { Feature, Suggesting, Suggestion, TryingWith } from './suggestions.js'

/**
 * Something to try with the page's model, beside the pane it is for: in the React builder.
 *
 * Which ones, when they can be pressed and what pressing one does are `suggestions.ts`'s, and
 * the Angular builder draws the same list from it (`angular-suggestions-list.ts`); this is the
 * markup and a subscription to what can change whether each can be pressed.
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
  const lead = useId()
  const offered = suggestionsFor(from.suggestions, feature)
  if (offered.length === 0) return null

  return (
    <div className="suggestions">
      <p id={lead}>{LEADS[feature]}</p>
      <ul aria-labelledby={lead}>
        {offered.map((suggestion, index) => (
          <li key={suggestion.words}>
            <SuggestionButton
              suggestion={suggestion}
              from={from}
              describedBy={`${lead}-${String(index)}`}
              onTried={onTried}
            />
            <span id={`${lead}-${String(index)}`}>{suggestion.shows}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * One suggestion's button, pressable when `canTry` says it is. Subscribed to its run and to
 * the form, through `followTrying`, rather than read again whenever a parent happens to draw:
 * an Undo changes what the French is missing and nothing in the run.
 */
function SuggestionButton({
  suggestion,
  from,
  describedBy,
  onTried,
}: {
  suggestion: Suggestion
  from: TryingWith
  describedBy: string
  onTried: (() => void) | undefined
}): ReactElement {
  const { runs, session } = from
  const follow = useCallback(
    (listener: () => void) => followTrying(suggestion.feature, runs, session, listener),
    [suggestion.feature, runs, session],
  )
  const open = useSyncExternalStore(follow, () => canTry(suggestion, runs, session))

  return (
    <button
      type="button"
      disabled={!open}
      aria-describedby={describedBy}
      onClick={() => {
        trySuggestion(suggestion, from)
        onTried?.()
      }}
    >
      {suggestion.words}
    </button>
  )
}
