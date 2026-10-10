import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EnvironmentInjector,
  computed,
  inject,
  input,
  signal,
} from '@angular/core'
import type { Injector } from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import { FormancyForm } from '@formancy/angular'
import {
  applyProposal,
  createStop,
  missingMessages,
  proposeTranslation,
  translateCatalogue,
  translationHeading,
  translationStatus,
  translationToReview,
} from '@formancy/builder-core'
import type { BuilderMessageId } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import { previewInjector } from './translations-preview.js'
import type {
  AskModel,
  BuilderSession,
  FormSchema,
  Stop,
  TranslationProposal,
  TranslationResult,
} from './types.js'
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
 * What is asked, kept, marked, held for review and said is `@formancy/builder-core`'s, so
 * the two builders cannot decide it differently (0091). Signals and `OnPush`, zoneless; the run is one
 * `await` inside a click, and `DestroyRef` stops it when the part goes — another language
 * chosen, another tab.
 */
@Component({
  selector: 'formancy-translation-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe, NgComponentOutlet],
  template: `
    @if (shown()) {
      <div data-formancy-part="translate">
        @if (reviewed() === undefined) {
          <button
            type="button"
            data-formancy-part="translate-ask"
            [disabled]="busy()"
            (click)="run()"
          >
            {{
              busy()
                ? ('translate.asking' | builderText: text())
                : ('translate.ask' | builderText: text() : { count: missing() })
            }}
          </button>
        }
        @if (busy()) {
          <button type="button" (click)="stop()">{{ 'prompt.stop' | builderText: text() }}</button>
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
            <button type="button" [disabled]="busy()" (click)="apply()">
              {{ 'translate.apply' | builderText: text() }}
            </button>
            <button type="button" [disabled]="busy()" (click)="discard()">
              {{ 'prompt.discard' | builderText: text() }}
            </button>
            @if (waiting.stillMissing.length > 0) {
              <button type="button" [disabled]="busy()" (click)="run(waiting)">
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
  /** The language to fill in. The pane draws this only for one that is not the default. */
  readonly locale = input.required<string>()
  /** How many times to let the model correct itself. Three by default. */
  readonly attempts = input<number | undefined>(undefined)

  protected readonly form = FormancyForm
  protected readonly flags = FLAGS
  protected readonly view = injectBuilderView(this.session)
  /** Every word this part shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)
  private readonly parent = inject(EnvironmentInjector)

  protected readonly busy = signal(false)
  protected readonly result = signal<TranslationResult | undefined>(undefined)
  protected readonly proposal = signal<TranslationProposal | undefined>(undefined)
  /** What applying said, when it refused. Cleared by anything that moves on. */
  protected readonly refusal = signal<string | undefined>(undefined)

  private static sequence = 0
  private readonly serial = (FormancyTranslationReview.sequence += 1)
  protected readonly reviewId = `formancy-translation-review-${String(this.serial)}`

  /** The stop for the run in flight. A field: pressing it changes nothing on screen by itself. */
  private running: Stop | undefined

  constructor() {
    // Destroyed — another language chosen, another tab — the run stops, and whatever the
    // model answers afterwards is not proposed (0157).
    inject(DestroyRef).onDestroy(() => this.running?.stop())
  }

  protected readonly defaultLocale = computed(() => this.view().document.i18n?.defaultLocale ?? 'en')
  protected readonly missing = computed(
    () => missingMessages(this.view().document, this.locale()).length,
  )
  /** Drawn while there is something to ask for, or a run, an answer or a proposal to show. */
  protected readonly shown = computed(
    () =>
      this.missing() > 0 ||
      this.busy() ||
      this.result() !== undefined ||
      this.proposal() !== undefined,
  )
  /** The proposal under review: none when it writes nothing, and Ask is offered again. */
  protected readonly reviewed = computed(() => translationToReview(this.proposal()))
  /** What the model wrote that was not written, when there is any. */
  protected readonly dropped = computed(() => {
    const dropped = this.proposal()?.dropped ?? []
    return dropped.length === 0 ? undefined : dropped
  })
  protected readonly heading = computed(() => {
    const waiting = this.reviewed()
    return waiting === undefined ? '' : translationHeading(waiting, this.text())
  })
  protected readonly status = computed(() =>
    translationStatus(
      {
        busy: this.busy(),
        result: this.result(),
        proposal: this.proposal(),
        refusal: this.refusal(),
      },
      this.text(),
    ),
  )
  /** The model's reason, when it declined: shown in place of the problems. */
  protected readonly declined = computed(() => {
    const outcome = this.result()
    return outcome === undefined || outcome.ok || outcome.ended !== 'declined'
      ? undefined
      : outcome.reason
  })
  /** A run that ended with answers that did not work. */
  protected readonly failure = computed(() => {
    const outcome = this.result()
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

  /** Ask for what is missing — over `after`'s document, for the rest of an answer under review. */
  protected async run(after?: TranslationProposal): Promise<void> {
    if (this.busy()) return
    this.busy.set(true)
    this.result.set(undefined)
    this.refusal.set(undefined)
    if (after === undefined) this.proposal.set(undefined)
    const stop = createStop()
    this.running = stop
    try {
      const session = this.session()
      const attempts = this.attempts()
      const outcome = await translateCatalogue(
        this.ask(),
        after?.document ?? session.document(),
        this.locale(),
        { stop, ...(attempts === undefined ? {} : { attempts }) },
      )
      this.result.set(outcome)
      // Held against the form as it is now. Applying later checks it has not moved.
      if (outcome.ok) this.proposal.set(proposeTranslation(session, outcome.answer, after))
    } finally {
      this.running = undefined
      this.busy.set(false)
    }
  }

  protected stop(): void {
    this.running?.stop()
  }

  protected apply(): void {
    const waiting = this.reviewed()
    if (waiting === undefined) return
    const outcome = applyProposal(this.session(), waiting)
    // Kept on screen when refused: the commonest refusal is a form that moved, and the
    // proposal is what the person needs to decide whether to ask again.
    if (outcome.ok) this.discard()
    else this.refusal.set(outcome.message)
  }

  protected discard(): void {
    this.proposal.set(undefined)
    this.refusal.set(undefined)
    this.result.set(undefined)
  }
}
