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
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import { createPromptRun, proposalHeading, proposalStatus } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import type { AskModel, BuilderSession, PromptRun, PromptRunState, Scenario } from './types.js'

/**
 * Describing a form in words, seeing what that did, and then deciding.
 *
 * The Angular half of the React pane, and the same two properties. **Nothing
 * reaches the document unless it would work**: the model's answer is parsed,
 * validated against the spec's own schema, compiled by the real engine and
 * type-checked, and the model is told what was wrong and asked again
 * ([0056](../../../docs/decisions/0056-agents-get-the-checks.md)). **And then
 * it is shown rather than applied**, because valid is not the same as wanted
 * ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
 *
 * Everything the two panes agree about lives in `@formancy/builder-core`:
 * `authorForm` writes, `proposeEdit` holds the answer against the document it
 * was written for, `applyProposal` decides whether it may still land. Two
 * renderers implementing one control by hand is deliberate
 * ([0033](../../../docs/decisions/0033-one-suite-n-drivers.md)); two
 * implementations of the same *decision* is what this core exists to prevent
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * Signals and `OnPush`, zoneless: the run's state is one snapshot, set into a signal each
 * time the run says it changed, and the template reads it.
 *
 * The host's model. `ask` is an input, exactly as it is a prop in React. No
 * vendor, no key, no network call in this package — and with no model given
 * the pane renders nothing at all rather than a button that cannot work.
 *
 * **A run can be stopped**, by the button while it waits. That ends it at once, tells the
 * host so it can abandon the request, and discards whatever the model says afterwards
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)).
 *
 * **Whose run it is, is the host's to say.** Bound to `[run]`, from `createPromptRun`, the
 * pane draws a run the host holds: it goes on when the pane is destroyed, and the pane drawn
 * next — under another tab, in the other builder — shows it waiting, or what it came to.
 * Without one the pane holds its own and stops it when it is destroyed, as it always did
 * ([0163](../../../docs/decisions/0163-a-models-run-belongs-to-the-host.md)). The run, the
 * proposal, Apply and Discard are builder-core's either way, as they are for the React pane.
 *
 * **A model can decline**, when the format cannot express what was asked. The run
 * ends on that answer, and the pane shows the model's reason, as text, where the
 * problems would be ([0158](../../../docs/decisions/0158-a-model-may-decline.md)).
 *
 * **Given the form's examples, it runs them before Apply**, and the review names the
 * ones the answer would stop holding
 * ([0159](../../../docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).
 */
@Component({
  selector: 'formancy-prompt-pane',
  imports: [BuilderTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ask() !== undefined) {
      <section data-formancy-part="prompt-pane">
        <label [attr.for]="inputId">{{ 'prompt.label' | builderText: text() }}</label>
        <textarea
          [id]="inputId"
          rows="3"
          [value]="state().instruction"
          [disabled]="state().busy"
          [attr.placeholder]="'prompt.example' | builderText: text()"
          (input)="held().instruct($any($event.target).value)"
        ></textarea>
        <button
          #writeButton
          type="button"
          [disabled]="state().busy || state().instruction.trim() === ''"
          (click)="write()"
        >
          {{ (state().busy ? 'prompt.writing' : 'prompt.write') | builderText: text() }}
        </button>
        @if (state().busy) {
          <button #stopButton type="button" (click)="held().stop()">
            {{ 'prompt.stop' | builderText: text() }}
          </button>
        }

        <!-- One polite region. The work takes seconds, and a proposal that only
             appears visually is one a screen-reader user never learns about. -->
        <p role="status" data-formancy-part="prompt-status">{{ status() }}</p>

        @if (state().proposal; as waiting) {
          <section data-formancy-part="prompt-review" [attr.aria-labelledby]="reviewId">
            <h3 [id]="reviewId">{{ heading() }}</h3>
            <!-- The words this answers. Once the run has answered the box above is the
                 person's again, and may say something else — typed here, or in a pane over
                 the same run in the other builder (0163). -->
            @if (state().asked; as words) {
              <p data-formancy-part="prompt-asked">
                {{ 'prompt.asked' | builderText: text() : { instruction: words } }}
              </p>
            }
            <ul data-formancy-part="prompt-changes">
              @for (change of waiting.changes; track change.kind + change.path) {
                <!-- The path and the sentence. The kind is for machines; a person
                     reading this wants to know what it costs them. -->
                <li [attr.data-severity]="change.severity">
                  <code>{{ change.path }}</code> — {{ change.detail }}
                </li>
              }
            </ul>
            <button type="button" (click)="held().apply(session())">
              {{ 'prompt.apply' | builderText: text() }}
            </button>
            <button type="button" (click)="held().discard()">
              {{ 'prompt.discard' | builderText: text() }}
            </button>
          </section>
        }

        @if (declined(); as reason) {
          <!-- The model's words, quoted: text, never markup, whatever it wrote. -->
          <blockquote data-formancy-part="prompt-declined">{{ reason }}</blockquote>
        }

        @if (failure(); as problems) {
          <div data-formancy-part="prompt-problems">
            <!-- What was actually wrong, not "something went wrong". The person
                 reading this can usually fix it by rewording one sentence. -->
            <ul>
              @for (problem of problems.problems; track $index) {
                <li>{{ problem.detail }}</li>
              }
            </ul>
            @if (problems.lastAnswer !== '') {
              <details>
                <summary>{{ 'prompt.lastAnswer' | builderText: text() }}</summary>
                <pre>{{ problems.lastAnswer }}</pre>
              </details>
            }
          </div>
        }
      </section>
    }
  `,
})
export class FormancyPromptPane {
  readonly session = input.required<BuilderSession>()
  /** How to reach a model. Absent means the feature is not configured. */
  readonly ask = input<AskModel | undefined>(undefined)
  /** How many times to let the model correct itself. Three by default. */
  readonly attempts = input<number | undefined>(undefined)
  /**
   * The form's examples, as `formancy-scenario-pane` takes them. Bound, an answer is run
   * against them before it is shown, and the review names any that would stop holding.
   */
  readonly scenarios = input<readonly Scenario[] | undefined>(undefined)
  /** Where every example starts — the form's sample, as the scenario pane takes it. */
  readonly initialValue = input<Readonly<Record<string, unknown>> | undefined>(undefined)
  /** `client` by default; `server` is what the publish gate and the submission endpoint run. */
  readonly mode = input<'client' | 'server' | undefined>(undefined)
  /**
   * The run, held by the host, from `createPromptRun`: it outlives this pane, and a pane
   * drawn over it later shows it as it is. Unbound, the pane holds its own, and stops it
   * when it is destroyed (0157).
   */
  readonly run = input<PromptRun | undefined>(undefined)

  /**
   * The pane's own run, for a host that binds none. It is the pane's, so it stops when the
   * pane is destroyed: the host's request does not run on for an answer nothing will show
   * (0157). A run the host binds is the host's, and nothing here ends it.
   */
  private readonly own = createPromptRun()
  /** The run this pane draws: the host's, or its own. */
  protected readonly held = computed(() => this.run() ?? this.own)
  /** What the run is doing and came to, as builder-core holds it. */
  protected readonly state = signal<PromptRunState>(this.own.state())

  private static sequence = 0
  private readonly serial = (FormancyPromptPane.sequence += 1)
  protected readonly inputId = `formancy-prompt-${String(this.serial)}`
  protected readonly reviewId = `formancy-prompt-review-${String(this.serial)}`

  /** The model's reason, when it declined: shown in place of the problems. */
  protected readonly declined = computed(() => {
    const outcome = this.state().result
    return outcome === undefined || outcome.ok || outcome.ended !== 'declined' ? undefined : outcome.reason
  })

  /**
   * A run that ended with answers that did not work — not one stopped, or unreachable,
   * before any came, and not one the model declined: what the checks said about an
   * earlier answer is about a document, and the model has said there is none to fix.
   */
  protected readonly failure = computed(() => {
    const outcome = this.state().result
    return outcome === undefined ||
      outcome.ok ||
      outcome.ended === 'declined' ||
      outcome.problems.length === 0
      ? undefined
      : outcome
  })

  private readonly writeButton = viewChild<ElementRef<HTMLButtonElement>>('writeButton')
  private readonly stopButton = viewChild<ElementRef<HTMLButtonElement>>('stopButton')
  private readonly injector = inject(Injector)

  constructor() {
    let unsubscribe: (() => void) | undefined
    effect(() => {
      const run = this.held()
      unsubscribe?.()
      // Untracked: `follow` reads the state it replaces, and the subscription is to the
      // run alone — not renewed every time the state it reports changes.
      untracked(() => this.follow(run.state()))
      unsubscribe = run.subscribe(() => this.follow(run.state()))
    })
    const destroyed = inject(DestroyRef)
    destroyed.onDestroy(() => unsubscribe?.())
    destroyed.onDestroy(() => this.own.stop())
  }

  /** Every word this pane shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)

  /** The review's heading and accessible name — builder-core's, as the React pane's is. */
  protected readonly heading = computed(() => {
    const waiting = this.state().proposal
    return waiting === undefined ? '' : proposalHeading(waiting, this.text())
  })

  /** The one sentence the live region carries — builder-core's, as the React pane's is. */
  protected readonly status = computed(() => proposalStatus(this.state(), this.text()))

  /**
   * The run's state now. Read as the run says it changed, before the template draws it: if
   * the run has just ended, Stop is still in the document, and if it has the focus it leaves
   * with it and the focus falls to <body>. Write, where the run began, takes it back once the
   * template has enabled it again. The run ends in a promise the pane no longer awaits — it
   * may be another pane's, or none's — so this is the one moment every ending passes through.
   */
  private follow(next: PromptRunState): void {
    const stop = this.stopButton()?.nativeElement
    if (!next.busy && stop !== undefined && document.activeElement === stop) {
      afterNextRender(() => this.writeButton()?.nativeElement.focus(), { injector: this.injector })
    }
    this.state.set(next)
  }

  protected write(): void {
    const ask = this.ask()
    if (ask === undefined) return
    // The examples in force with the document the answer is for, taken together.
    const scenarios = this.scenarios()
    const examples =
      scenarios === undefined ? undefined : { scenarios, initialValue: this.initialValue(), mode: this.mode() }
    void this.held().write(ask, this.session(), { examples, attempts: this.attempts() })
  }
}
