import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core'
import { LEADS, canTry, suggestionsFor, trySuggestion } from './suggestions.js'
import type { Feature, Suggesting, Suggestion } from './suggestions.js'

/**
 * Something to try with the page's model, beside the pane it is for: in the Angular builder.
 *
 * The same list as the React builder's `SuggestionsList`, from the same `suggestions.ts` —
 * which ones, when they can be pressed, what pressing one does — so this is the markup and a
 * subscription to the run the suggestions fill. `suggestions.test.tsx` compares the two
 * drawings.
 *
 * Bound to what the host holds, `[from]="host"`, rather than injecting the host's token: the
 * host imports this component, and a token read back from it would make the two files import
 * each other.
 */
@Component({
  selector: 'formancy-playground-suggestions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offered().length > 0) {
      <div class="suggestions">
        <p [id]="leadId">{{ lead() }}</p>
        <ul [attr.aria-labelledby]="leadId">
          @for (suggestion of offered(); track suggestion.words; let index = $index) {
            <li>
              <button
                type="button"
                [disabled]="!open()"
                [attr.aria-describedby]="leadId + '-' + index"
                (click)="press(suggestion)"
              >
                {{ suggestion.words }}
              </button>
              <span [id]="leadId + '-' + index">{{ suggestion.shows }}</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class PlaygroundSuggestionsList {
  /** Which pane this is drawn beside. */
  readonly feature = input.required<Feature>()
  /** The open demo's suggestions, and the page's runs, relay and session they reach. */
  readonly from = input.required<Suggesting>()
  /** Said after one is pressed: the translations tab opens its pane again, on the language asked for. */
  readonly tried = output<void>()

  private static sequence = 0
  protected readonly leadId = `playground-suggestions-${String((PlaygroundSuggestionsList.sequence += 1))}`

  protected readonly offered = computed(() => suggestionsFor(this.from().suggestions, this.feature()))
  protected readonly lead = computed(() => LEADS[this.feature()])
  /** Whether they can be pressed now, as `canTry` says, following the run they fill. */
  protected readonly open = signal(true)

  constructor() {
    let unsubscribe: (() => void) | undefined
    effect(() => {
      const feature = this.feature()
      const { runs, session } = this.from()
      const follow = (): void => this.open.set(canTry(feature, runs, session))
      unsubscribe?.()
      untracked(follow)
      unsubscribe = runs[feature].subscribe(follow)
    })
    inject(DestroyRef).onDestroy(() => unsubscribe?.())
  }

  protected press(suggestion: Suggestion): void {
    trySuggestion(suggestion, this.from())
    this.tried.emit()
  }
}
