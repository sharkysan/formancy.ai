import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core'
import {
  createStop,
  draftExpectations,
  draftProblems,
  draftScenarios,
  draftStatus,
  draftVerdict,
  keepDraft,
} from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import type { AskModel, BuilderSession, DraftNote, Drafted, Scenario, ScenarioResult, Stop } from './types.js'
import { injectBuilderView } from './view.js'

/**
 * Examples drafted by a model from what the author says the form should do, judged by the
 * engine, and kept one at a time.
 *
 * The Angular half of the React part, drawn inside `formancy-scenario-pane` when the host
 * binds `[ask]` and asks for the pane's buttons. The model is shown the form's fields and
 * the author's words, never its rules — a model shown the rule writes an example that
 * agrees with it — and every draft is run against the form as it is, with the verdict the
 * list gives it once kept
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 *
 * **Nothing is emitted until Keep.** A draft that fails can be kept: that failure is the
 * question — is the example wrong, or the form? — and the person answers it. What may be
 * kept, what the run says and what the engine makes of a draft are
 * `@formancy/builder-core`'s, so the two parts cannot decide them differently
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * Signals and `OnPush`, zoneless. The verdicts are a `computed` over the session's view, so
 * an edit to the form reruns them and none is stored.
 */
@Component({
  selector: 'formancy-scenario-drafts',
  imports: [BuilderTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-formancy-part="scenario-drafts" [attr.aria-labelledby]="headingId">
      <h3 #heading [id]="headingId" tabindex="-1">{{ 'drafts.title' | builderText: text() }}</h3>
      <label [attr.for]="inputId">{{ 'drafts.label' | builderText: text() }}</label>
      <textarea
        [id]="inputId"
        rows="3"
        [value]="intent()"
        [disabled]="busy()"
        [attr.placeholder]="'drafts.example' | builderText: text()"
        [attr.aria-describedby]="withheldId"
        (input)="intent.set($any($event.target).value)"
      ></textarea>
      <p [id]="withheldId" data-formancy-part="scenario-drafts-withheld">
        {{ 'drafts.withheld' | builderText: text() }}
      </p>
      <button type="button" [disabled]="busy() || intent().trim() === ''" (click)="run()">
        {{ (busy() ? 'drafts.writing' : 'drafts.write') | builderText: text() }}
      </button>
      @if (busy()) {
        <button #stopButton type="button" (click)="stop()">
          {{ 'drafts.stop' | builderText: text() }}
        </button>
      }

      <p role="status" data-formancy-part="scenario-drafts-status">{{ status() }}</p>

      @if (declined(); as reason) {
        <!-- The model's words, quoted: text, never markup, whatever it wrote. -->
        <blockquote data-formancy-part="scenario-drafts-declined">{{ reason }}</blockquote>
      }

      @if (problems().length > 0) {
        <div data-formancy-part="scenario-drafts-problems">
          <ul>
            @for (problem of problems(); track $index) {
              <li>{{ problem }}</li>
            }
          </ul>
          @if (lastAnswer(); as answer) {
            <details>
              <summary>{{ 'drafts.lastAnswer' | builderText: text() }}</summary>
              <pre>{{ answer }}</pre>
            </details>
          }
        </div>
      }

      @if (judged().length > 0) {
        <ul data-formancy-part="scenario-drafts-list" [attr.aria-label]="'drafts.list' | builderText: text()">
          @for (entry of judged(); track entry.draft.name) {
            <li [attr.data-passed]="entry.verdict.passed">
              <strong>{{ entry.draft.name }}</strong>
              @if (entry.draft.because; as because) {
                <p>{{ because }}</p>
              }
              <!-- What it sets and what it expects, as the model wrote it: the part a person
                   reads to decide whether the example is right. -->
              <pre>{{ entry.shown }}</pre>
              <p>{{ (entry.verdict.passed ? 'drafts.holds' : 'drafts.fails') | builderText: text() }}</p>
              @if (entry.verdict.failures.length > 0) {
                <ul>
                  @for (failure of entry.verdict.failures; track $index) {
                    <!-- The engine's words, as the scenario panel shows them after Keep. -->
                    <li [attr.data-about]="failure.about">{{ failure.detail }}</li>
                  }
                </ul>
              }
              <button type="button" (click)="keep(entry.draft)">
                {{ 'drafts.keep' | builderText: text() : { name: entry.draft.name } }}
              </button>
              <button type="button" (click)="done(entry.draft, 'discarded')">
                {{ 'drafts.discard' | builderText: text() : { name: entry.draft.name } }}
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class FormancyScenarioDrafts {
  readonly session = input.required<BuilderSession>()
  /** The form's examples as the host holds them: their names are taken, and Keep adds to them. */
  readonly scenarios = input.required<readonly Scenario[]>()
  /** The host's model, as the prompt pane takes it — a relay, on a page that may not call one. */
  readonly ask = input.required<AskModel>()
  /** Where every example starts — the form's sample, as the scenario pane takes it. */
  readonly initialValue = input<Readonly<Record<string, unknown>> | undefined>(undefined)
  /** `client` by default, as the scenario pane takes it. */
  readonly mode = input<'client' | 'server' | undefined>(undefined)
  /** How many times to ask. Three by default. */
  readonly attempts = input<number | undefined>(undefined)
  /** The longer list, when a draft is kept. Nothing else emits it. */
  readonly scenariosChange = output<readonly Scenario[]>()

  protected readonly intent = signal('')
  protected readonly busy = signal(false)
  protected readonly result = signal<Drafted | undefined>(undefined)
  /** The drafts still waiting: each one leaves on Keep or Discard. */
  protected readonly drafts = signal<readonly Scenario[]>([])
  protected readonly note = signal<DraftNote | undefined>(undefined)

  private static sequence = 0
  private readonly serial = (FormancyScenarioDrafts.sequence += 1)
  protected readonly headingId = `formancy-drafts-${String(this.serial)}`
  protected readonly inputId = `formancy-drafts-intent-${String(this.serial)}`
  protected readonly withheldId = `formancy-drafts-withheld-${String(this.serial)}`

  private readonly view = injectBuilderView(this.session)
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading')
  private readonly stopButton = viewChild<ElementRef<HTMLButtonElement>>('stopButton')
  private readonly injector = inject(Injector)
  /** The stop for the run in flight. A field: pressing it changes nothing on screen by itself. */
  private running: Stop | undefined
  /** Set when the part is destroyed: the run its stop ends must not schedule a render. */
  private destroyed = false

  constructor() {
    // A part that is destroyed stops its run, so a relay is not left holding a turn nothing
    // will read (0157).
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true
      this.running?.stop()
    })
  }

  /** Every word this part shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)

  private readonly options = computed(() => {
    const initialValue = this.initialValue()
    const mode = this.mode()
    return {
      ...(initialValue === undefined ? {} : { initialValue }),
      ...(mode === undefined ? {} : { mode }),
    }
  })

  /** Each waiting draft with the engine's verdict on the form as it is now — rerun on an edit. */
  protected readonly judged = computed<
    ReadonlyArray<{ readonly draft: Scenario; readonly verdict: ScenarioResult; readonly shown: string }>
  >(() => {
    // Read for the dependency: the view changes identity when the document does.
    this.view()
    const document = this.session().document()
    const options = this.options()
    return this.drafts().map((draft) => ({
      draft,
      verdict: draftVerdict(document, draft, options),
      shown: draftExpectations(draft),
    }))
  })

  /** The one sentence the live region carries — builder-core's, as the React part's is. */
  protected readonly status = computed(() =>
    draftStatus({ busy: this.busy(), result: this.result(), note: this.note() }, this.text()),
  )
  protected readonly problems = computed(() => draftProblems(this.result(), this.text()))
  protected readonly declined = computed(() => {
    const outcome = this.result()
    return outcome === undefined || outcome.ok || outcome.ended !== 'declined' ? undefined : outcome.reason
  })
  protected readonly lastAnswer = computed(() => {
    const outcome = this.result()
    return outcome === undefined || outcome.ok || outcome.ended !== 'gave-up' || outcome.lastAnswer === ''
      ? undefined
      : outcome.lastAnswer
  })

  protected async run(): Promise<void> {
    const intent = this.intent()
    if (intent.trim() === '' || this.busy()) return
    this.busy.set(true)
    this.result.set(undefined)
    this.drafts.set([])
    this.note.set(undefined)
    const stop = createStop()
    this.running = stop
    let onStop = false
    try {
      const outcome = await draftScenarios(this.ask(), this.session().document(), intent, {
        initialValue: this.initialValue(),
        existing: this.scenarios(),
        stop,
        attempts: this.attempts(),
      })
      this.result.set(outcome)
      this.drafts.set(outcome.ok ? outcome.drafts : [])
    } finally {
      // Read while Stop is still drawn: once it has gone, the focus is already on <body>.
      const stopDrawn = this.stopButton()?.nativeElement
      onStop = stopDrawn !== undefined && document.activeElement === stopDrawn
      this.running = undefined
      this.busy.set(false)
    }
    // A run its destruction stopped ends here: there is no view left to draw or to focus,
    // and a render scheduled on one that has gone throws.
    if (this.destroyed) return
    // Once drawn, a focus with nowhere to be — on Stop, which leaves with it, or on the
    // page's body, where a relay's pane leaves it when its answer is taken — goes to the
    // heading, beside the drafts. A focus somebody put elsewhere stays there.
    afterNextRender(
      () => {
        if (onStop || document.activeElement === document.body) this.heading()?.nativeElement.focus()
      },
      { injector: this.injector },
    )
  }

  protected stop(): void {
    this.running?.stop()
  }

  protected keep(draft: Scenario): void {
    const kept = keepDraft(this.session().document(), this.scenarios(), draft, this.options())
    if (!kept.ok) {
      this.note.set({ kind: 'refused', why: kept.refused, name: draft.name })
      return
    }
    this.scenariosChange.emit(kept.scenarios)
    this.done(draft, 'kept')
  }

  /** A draft leaves the list, the status says why, and the focus goes back to the heading. */
  protected done(draft: Scenario, kind: 'kept' | 'discarded'): void {
    this.drafts.update((current) => current.filter((one) => one !== draft))
    this.note.set({ kind, name: draft.name })
    this.heading()?.nativeElement.focus()
  }
}
