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
import { LEADS, canTry, followTrying, suggestionsFor, trySuggestion } from './suggestions.js'
import type { Feature, Suggesting, Suggestion } from './suggestions.js'

/**
 * Something to try with the page's model, beside the pane it is for: in the Angular builder.
 *
 * The same list as the React builder's `SuggestionsList`, from the same `suggestions.ts` —
 * which ones, when they can be pressed, what pressing one does — so this is the markup and a
 * subscription to what can change whether each can be pressed: the run they fill, and the form. `suggestions.test.tsx` compares the two
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
                [disabled]="!open()[index]"
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
  /**
   * Whether each can be pressed now, as `canTry` says, in the order drawn. Following the run
   * they fill and the form too: Apply and Undo change what the French is missing, and only
   * Apply changes the run.
   */
  protected readonly open = signal<readonly boolean[]>([], { equal: sameEach })

  constructor() {
    let unfollow: (() => void) | undefined
    effect(() => {
      const offered = this.offered()
      const { runs, session } = this.from()
      const read = (): void => this.open.set(offered.map((suggestion) => canTry(suggestion, runs, session)))
      unfollow?.()
      untracked(read)
      unfollow = followTrying(this.feature(), runs, session, read)
    })
    inject(DestroyRef).onDestroy(() => unfollow?.())
  }

  protected press(suggestion: Suggestion): void {
    trySuggestion(suggestion, this.from())
    this.tried.emit()
  }
}

/** Two readings the same, so a change that moves none of the buttons draws nothing. */
function sameEach(a: readonly boolean[], b: readonly boolean[]): boolean {
  return a.length === b.length && a.every((open, index) => open === b[index])
}
