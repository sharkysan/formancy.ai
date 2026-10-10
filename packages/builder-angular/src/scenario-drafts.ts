import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import {
  createDraftRun,
  draftExpectations,
  draftProblems,
  draftQuotes,
  draftStatus,
  draftVerdict,
  draftsOn,
} from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import type { AskModel, BuilderSession, DraftRun, DraftRunState, Scenario, ScenarioResult } from './types.js'
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
 * kept, what the run says, what the engine makes of a draft and which form's drafts a
 * session is shown are `@formancy/builder-core`'s, so the two parts cannot decide them
 * differently ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * **Whose run it is, is the host's to say.** Bound to `[drafting]`, from `createDraftRun`,
 * the part draws a run the host holds: being destroyed ends nothing, and a part drawn over the
 * same form — a new session of it included — shows its drafts. Unbound, the part holds its
 * own, and ends it when it is destroyed or handed another session, as it always did
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
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
        (input)="held().describe($any($event.target).value)"
      ></textarea>
      <p [id]="withheldId" data-formancy-part="scenario-drafts-withheld">
        {{ 'drafts.withheld' | builderText: text() }}
      </p>
      <button type="button" [disabled]="busy() || intent().trim() === ''" (click)="write()">
        {{ (busy() ? 'drafts.writing' : 'drafts.write') | builderText: text() }}
      </button>
      @if (busy()) {
        <button #stopButton type="button" (click)="held().stop()">
          {{ 'drafts.stop' | builderText: text() }}
        </button>
      }

      <p role="status" data-formancy-part="scenario-drafts-status">{{ status() }}</p>

      @if (quoted().declined; as reason) {
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
          @if (quoted().lastAnswer; as answer) {
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
              <button type="button" (click)="discard(entry.draft)">
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
  /**
   * The run, held by the host, from `createDraftRun`: it outlives this part. Unbound, the part
   * holds its own, and ends it when it is destroyed or handed another session (0157, 0162).
   */
  readonly drafting = input<DraftRun | undefined>(undefined)
  /** The longer list, when a draft is kept. Nothing else emits it. */
  readonly scenariosChange = output<readonly Scenario[]>()

  /**
   * The part's own run, for a host that binds none: the part's, and its session's. Another
   * session is another form to a part that holds its own (0162), so a new one ends the run and
   * forgets its drafts — the words typed stay — and so does the part being destroyed (0157). A
   * run the host binds is the host's, and nothing here ends it.
   */
  private readonly own = createDraftRun()
  /** The run this part draws: the host's, or its own. */
  protected readonly held = computed(() => this.drafting() ?? this.own)
  /** What the run is doing and came to, as builder-core holds it. */
  private readonly state = signal<DraftRunState>(this.own.state())
  private readonly view = injectBuilderView(this.session)
  /** The run as this form shows it: itself, or only the words when it is about another. */
  private readonly shown = computed(() => {
    // Read for the dependency: the form's id is in the document, which the view follows.
    this.view()
    return draftsOn(this.state(), this.session())
  })
  protected readonly intent = computed(() => this.shown().intent)
  protected readonly busy = computed(() => this.shown().busy)
  protected readonly result = computed(() => this.shown().result)
  /** The drafts still waiting: each one leaves on Keep or Discard. */
  protected readonly drafts = computed(() => this.shown().drafts)
  protected readonly note = computed(() => this.shown().note)

  private static sequence = 0
  private readonly serial = (FormancyScenarioDrafts.sequence += 1)
  protected readonly headingId = `formancy-drafts-${String(this.serial)}`
  protected readonly inputId = `formancy-drafts-intent-${String(this.serial)}`
  protected readonly withheldId = `formancy-drafts-withheld-${String(this.serial)}`

  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading')
  private readonly stopButton = viewChild<ElementRef<HTMLButtonElement>>('stopButton')
  private readonly injector = inject(Injector)

  constructor() {
    let unsubscribe: (() => void) | undefined
    effect(() => {
      const run = this.held()
      unsubscribe?.()
      // Untracked: the subscription is to the run alone, not renewed for every state it reports.
      untracked(() => this.state.set(run.state()))
      unsubscribe = run.subscribe(() => this.follow(run.state()))
    })
    // Another session ends the part's own run: the effect reads the session alone.
    let previous: BuilderSession | undefined
    effect(() => {
      const session = this.session()
      if (previous !== undefined && previous !== session) untracked(() => this.own.discard())
      previous = session
    })
    const destroyed = inject(DestroyRef)
    destroyed.onDestroy(() => unsubscribe?.())
    destroyed.onDestroy(() => this.own.discard())
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
  /** The model's words quoted beneath the status — builder-core's choice, as the React part's is. */
  protected readonly quoted = computed(() => draftQuotes(this.result()))

  /**
   * The run's state now. Read as the run says it changed, before the template draws it: if a
   * run this part shows has just ended, Stop is still in the document. Once drawn, a focus
   * with nowhere to be — on Stop, which leaves with it, or on the page's body, where a relay's
   * pane leaves it when its answer is taken — goes to the heading, beside the drafts. A focus
   * somebody put elsewhere stays there. The run ends in a promise this part may never have
   * awaited: another part's, or none's, pressed Draft.
   */
  private follow(next: DraftRunState): void {
    const session = this.session()
    const ended = draftsOn(this.state(), session).busy && !draftsOn(next, session).busy
    if (ended) {
      const stop = this.stopButton()?.nativeElement
      const onStop = stop !== undefined && document.activeElement === stop
      afterNextRender(
        () => {
          if (onStop || document.activeElement === document.body) this.heading()?.nativeElement.focus()
        },
        { injector: this.injector },
      )
    }
    this.state.set(next)
  }

  protected write(): void {
    void this.held().draft(this.ask(), this.session(), {
      initialValue: this.initialValue(),
      existing: this.scenarios(),
      attempts: this.attempts(),
    })
  }

  protected keep(draft: Scenario): void {
    const kept = this.held().keep(draft, this.session(), this.scenarios(), this.options())
    if (kept?.ok !== true) return
    this.scenariosChange.emit(kept.scenarios)
    this.heading()?.nativeElement.focus()
  }

  /** A draft leaves the list, the status says why, and the focus goes back to the heading. */
  protected discard(draft: Scenario): void {
    this.held().discardDraft(draft)
    this.heading()?.nativeElement.focus()
  }
}
