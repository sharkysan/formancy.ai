import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EnvironmentInjector,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core'
import type { Injector } from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import { FormancyForm } from '@formancy/angular'
import {
  createTranslationRun,
  missingMessages,
  translationHeading,
  translationOn,
  translationStatus,
  translationToReview,
} from '@formancy/builder-core'
import type { BuilderMessageId } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import { previewInjector } from './translations-preview.js'
import type { AskModel, BuilderSession, FormSchema, TranslationRun, TranslationRunState } from './types.js'
import { injectBuilderView } from './view.js'

/** What each mark says, in the catalogue's words. */
const FLAGS: Readonly<Record<'stale' | 'unchanged', BuilderMessageId>> = {
  stale: 'translate.flag.stale',
  unchanged: 'translate.flag.unchanged',
}

/**
 * Asking a model for the messages a language is missing, and reviewing its answer message
 * by message before it lands — the Angular half of the React `TranslationReview`.
 *
 * A model's translation is a model's edit, and one that changes what a question asks in a
 * language the person reviewing may read less well than the source
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)). So it
 * is shown rather than applied (0109): every message it would write, its source beside
 * what was there and what is proposed, a mark on anything to look at, and the form as it
 * would read in that language. Apply is `applyProposal`, refused when the form has moved
 * since, one undo step otherwise.
 *
 * What is asked, kept, marked, held for review and said — and what a part drawn on one
 * language shows of a run for another — is `@formancy/builder-core`'s, so the two builders
 * cannot decide it differently (0091). Signals and `OnPush`, zoneless: the run's state is
 * one snapshot, set into a signal each time the run says it changed.
 *
 * **Whose run it is, is the host's to say.** Bound to `[run]`, the part draws a run the host
 * holds, and being destroyed ends nothing; drawn on another language than the run's, it says
 * where the run is and draws nothing of it. Unbound, it holds its own, and `DestroyRef` stops
 * it when the part goes — another language chosen, another tab
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 */
@Component({
  selector: 'formancy-translation-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe, NgComponentOutlet],
  template: `
    @if (view().elsewhere) {
      <!-- Under another language than the run's, only where it waits: nothing of it to
           review, stop or apply here, and no Ask that would forget it (0164). -->
      <div data-formancy-part="translate">
        <p role="status" data-formancy-part="translate-status">{{ status() }}</p>
      </div>
    } @else if (shown()) {
      <div data-formancy-part="translate">
        @if (reviewed() === undefined) {
          <button
            type="button"
            data-formancy-part="translate-ask"
            [disabled]="busy()"
            (click)="translate()"
          >
            {{
              busy()
                ? ('translate.asking' | builderText: text())
                : ('translate.ask' | builderText: text() : { count: missing() })
            }}
          </button>
        }
        @if (busy()) {
          <button type="button" (click)="held().stop()">{{ 'prompt.stop' | builderText: text() }}</button>
        }

        <p role="status" data-formancy-part="translate-status">{{ status() }}</p>

        <!-- Outside the review: when everything the model wrote was dropped there is no
             review, and this is what says why. -->
        @if (dropped(); as list) {
          <p data-formancy-part="translate-dropped">
            {{ 'translate.dropped' | builderText: text() : { list: text().list(list) } }}
          </p>
        }

        @if (reviewed(); as waiting) {
          <section data-formancy-part="translate-review" [attr.aria-labelledby]="reviewId">
            <h3 [id]="reviewId">{{ heading() }}</h3>
            <table data-formancy-part="translate-rows">
              <thead>
                <tr>
                  <th scope="col">{{ defaultLocale() }}</th>
                  <th scope="col">{{ 'translate.was' | builderText: text() }}</th>
                  <th scope="col">{{ 'translate.now' | builderText: text() }}</th>
                  <th scope="col">{{ 'translate.flags' | builderText: text() }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of waiting.rows; track row.id) {
                  <tr>
                    <!-- The source, not the id, as the translations table shows it. -->
                    <th scope="row">{{ row.source }}</th>
                    <td>
                      {{ row.was === '' ? ('translations.missing' | builderText: text()) : row.was }}
                    </td>
                    <!-- The model's words, as text, in the language they are written in. -->
                    <td [attr.lang]="locale()">{{ row.now }}</td>
                    <td>
                      @for (flag of row.flags; track flag) {
                        <span data-formancy-part="translate-flag">{{
                          flags[flag] | builderText: text()
                        }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <!-- The form as it would read in this language, with its own ids beside the
                 pane's preview of the form as it is. -->
            <section
              [attr.aria-label]="'translate.preview' | builderText: text() : { locale: locale() }"
              data-formancy-part="translations-preview"
            >
              @if (previewInjector(); as injector) {
                <ng-container
                  [ngComponentOutlet]="form"
                  [ngComponentOutletInjector]="injector"
                  [ngComponentOutletInputs]="previewInputs()"
                />
              }
            </section>
            <button type="button" [disabled]="busy()" (click)="held().apply(session())">
              {{ 'translate.apply' | builderText: text() }}
            </button>
            <button type="button" [disabled]="busy()" (click)="held().discard()">
              {{ 'prompt.discard' | builderText: text() }}
            </button>
            @if (waiting.stillMissing.length > 0) {
              <button type="button" [disabled]="busy()" (click)="rest()">
                {{ 'translate.rest' | builderText: text() }}
              </button>
            }
          </section>
        }

        @if (declined(); as reason) {
          <!-- The model's words, quoted: text, never markup, whatever it wrote. -->
          <blockquote data-formancy-part="translate-declined">{{ reason }}</blockquote>
        }

        @if (failure(); as failed) {
          <div data-formancy-part="translate-problems">
            <!-- What the model was told, as it was told it (0119). -->
            <ul>
              @for (problem of failed.problems; track $index) {
                <li>{{ problem.detail }}</li>
              }
            </ul>
            @if (failed.lastAnswer !== '') {
              <details>
                <summary>{{ 'prompt.lastAnswer' | builderText: text() }}</summary>
                <pre>{{ failed.lastAnswer }}</pre>
              </details>
            }
          </div>
        }
      </div>
    }
  `,
})
export class FormancyTranslationReview {
  readonly session = input.required<BuilderSession>()
  /** How to reach a model: the host's, or a relay a person carries (0160). */
  readonly ask = input.required<AskModel>()
  /** The language drawn. Nothing is, on the default one, but where a held run for another waits. */
  readonly locale = input.required<string>()
  /** How many times to let the model correct itself. Three by default. */
  readonly attempts = input<number | undefined>(undefined)
  /**
   * The run, held by the host, from `createTranslationRun`: it outlives this part. Unbound,
   * the part holds its own, and stops it when it is destroyed — another language, another
   * tab (0157).
   */
  readonly run = input<TranslationRun | undefined>(undefined)

  protected readonly form = FormancyForm
  protected readonly flags = FLAGS
  protected readonly builderView = injectBuilderView(this.session)
  /** Every word this part shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)
  private readonly parent = inject(EnvironmentInjector)

  /**
   * The part's own run, for a host that binds none. It is the part's, so it stops when the
   * part is destroyed, and whatever the model answers afterwards is not proposed (0157). A
   * run the host binds is the host's, and nothing here ends it.
   */
  private readonly own = createTranslationRun()
  /** The run this part draws: the host's, or its own. */
  protected readonly held = computed(() => this.run() ?? this.own)
  /** What the run is doing and came to, as builder-core holds it. */
  private readonly state = signal<TranslationRunState>(this.own.state())
  /** The run as this language shows it: itself, or where it waits. */
  protected readonly view = computed(() => translationOn(this.state(), this.locale()))
  protected readonly busy = computed(() => this.view().busy)

  private static sequence = 0
  private readonly serial = (FormancyTranslationReview.sequence += 1)
  protected readonly reviewId = `formancy-translation-review-${String(this.serial)}`

  constructor() {
    let unsubscribe: (() => void) | undefined
    effect(() => {
      const run = this.held()
      unsubscribe?.()
      // Untracked: the subscription is to the run alone, not renewed for every state it reports.
      untracked(() => this.state.set(run.state()))
      unsubscribe = run.subscribe(() => this.state.set(run.state()))
    })
    const destroyed = inject(DestroyRef)
    destroyed.onDestroy(() => unsubscribe?.())
    destroyed.onDestroy(() => this.own.stop())
  }

  protected readonly defaultLocale = computed(
    () => this.builderView().document.i18n?.defaultLocale ?? 'en',
  )
  protected readonly missing = computed(
    () => missingMessages(this.builderView().document, this.locale()).length,
  )
  /**
   * Drawn, on a language other than the default, while there is something to ask for, or a
   * run, an answer or a proposal to show.
   */
  protected readonly shown = computed(() => {
    const { busy, result, proposal } = this.view()
    return (
      this.locale() !== this.defaultLocale() &&
      (this.missing() > 0 || busy || result !== undefined || proposal !== undefined)
    )
  })
  /** The proposal under review: none when it writes nothing, and Ask is offered again. */
  protected readonly reviewed = computed(() => translationToReview(this.view().proposal))
  /** What the model wrote that was not written, when there is any. */
  protected readonly dropped = computed(() => {
    const dropped = this.view().proposal?.dropped ?? []
    return dropped.length === 0 ? undefined : dropped
  })
  protected readonly heading = computed(() => {
    const waiting = this.reviewed()
    return waiting === undefined ? '' : translationHeading(waiting, this.text())
  })
  protected readonly status = computed(() => translationStatus(this.view(), this.text()))
  /** The model's reason, when it declined: shown in place of the problems. */
  protected readonly declined = computed(() => {
    const outcome = this.view().result
    return outcome === undefined || outcome.ok || outcome.ended !== 'declined'
      ? undefined
      : outcome.reason
  })
  /** A run that ended with answers that did not work. */
  protected readonly failure = computed(() => {
    const outcome = this.view().result
    return outcome === undefined ||
      outcome.ok ||
      outcome.ended === 'declined' ||
      outcome.problems.length === 0
      ? undefined
      : outcome
  })

  /** An engine for the form as the proposal would leave it, under ids of its own. */
  protected readonly previewInjector = computed((): Injector | undefined => {
    const waiting = this.reviewed()
    if (waiting === undefined) return undefined
    const document = waiting.document as FormSchema
    return previewInjector(document, this.locale(), this.parent, `${document.id}.proposed`)
  })
  protected readonly previewInputs = computed(() => ({
    submitLabel: this.text()('translations.previewSubmit'),
  }))

  private options(): { attempts?: number } {
    const attempts = this.attempts()
    return attempts === undefined ? {} : { attempts }
  }

  /** Ask for every message this language is missing. */
  protected translate(): void {
    void this.held().translate(this.ask(), this.session(), this.locale(), this.options())
  }

  /** *Translate the rest*, over the proposal under review. */
  protected rest(): void {
    void this.held().rest(this.ask(), this.session(), this.options())
  }
}
