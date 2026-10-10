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
  signal,
  viewChild,
} from '@angular/core'
import {
  applyProposal,
  authorForm,
  createStop,
  proposalHeading,
  proposalStatus,
  proposeEdit,
} from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import type {
  AskModel,
  AuthoringResult,
  BuilderSession,
  EditProposal,
  Scenario,
  Stop,
} from './types.js'

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
 * Signals and `OnPush`, zoneless: the state here is four values a template
 * reads, and the work that changes them is one `await` deep inside a click.
 *
 * The host's model. `ask` is an input, exactly as it is a prop in React. No
 * vendor, no key, no network call in this package — and with no model given
 * the pane renders nothing at all rather than a button that cannot work.
 *
 * **A run can be stopped**, by the button while it waits and by the pane being
 * destroyed. Either ends it at once, tells the host so it can abandon the
 * request, and discards whatever the model says afterwards
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)).
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
          [value]="instruction()"
          [disabled]="busy()"
          [attr.placeholder]="'prompt.example' | builderText: text()"
          (input)="instruction.set($any($event.target).value)"
        ></textarea>
        <button
          #writeButton
          type="button"
          [disabled]="busy() || instruction().trim() === ''"
          (click)="run()"
        >
          {{ (busy() ? 'prompt.writing' : 'prompt.write') | builderText: text() }}
        </button>
        @if (busy()) {
          <button #stopButton type="button" (click)="stop()">
            {{ 'prompt.stop' | builderText: text() }}
          </button>
        }

        <!-- One polite region. The work takes seconds, and a proposal that only
             appears visually is one a screen-reader user never learns about. -->
        <p role="status" data-formancy-part="prompt-status">{{ status() }}</p>

        @if (proposal(); as waiting) {
          <section data-formancy-part="prompt-review" [attr.aria-labelledby]="reviewId">
            <h3 [id]="reviewId">{{ heading() }}</h3>
            <ul data-formancy-part="prompt-changes">
              @for (change of waiting.changes; track change.kind + change.path) {
                <!-- The path and the sentence. The kind is for machines; a person
                     reading this wants to know what it costs them. -->
                <li [attr.data-severity]="change.severity">
                  <code>{{ change.path }}</code> — {{ change.detail }}
                </li>
              }
            </ul>
            <button type="button" (click)="apply()">
              {{ 'prompt.apply' | builderText: text() }}
            </button>
            <button type="button" (click)="discard()">
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

  protected readonly instruction = signal('')
  protected readonly busy = signal(false)
  protected readonly proposal = signal<EditProposal | undefined>(undefined)
  protected readonly result = signal<AuthoringResult | undefined>(undefined)
  /** What applying said, when it refused. Cleared by anything that moves on. */
  protected readonly refusal = signal<string | undefined>(undefined)

  private static sequence = 0
  private readonly serial = (FormancyPromptPane.sequence += 1)
  protected readonly inputId = `formancy-prompt-${String(this.serial)}`
  protected readonly reviewId = `formancy-prompt-review-${String(this.serial)}`

  /** The model's reason, when it declined: shown in place of the problems. */
  protected readonly declined = computed(() => {
    const outcome = this.result()
    return outcome === undefined || outcome.ok || outcome.ended !== 'declined' ? undefined : outcome.reason
  })

  /**
   * A run that ended with answers that did not work — not one stopped, or unreachable,
   * before any came, and not one the model declined: what the checks said about an
   * earlier answer is about a document, and the model has said there is none to fix.
   */
  protected readonly failure = computed(() => {
    const outcome = this.result()
    return outcome === undefined ||
      outcome.ok ||
      outcome.ended === 'declined' ||
      outcome.problems.length === 0
      ? undefined
      : outcome
  })

  /**
   * The stop for the run in flight, if one is. A field, not a signal: pressing
   * it changes nothing on screen by itself — the run ending does, through `busy`.
   */
  private running: Stop | undefined

  private readonly writeButton = viewChild<ElementRef<HTMLButtonElement>>('writeButton')
  private readonly stopButton = viewChild<ElementRef<HTMLButtonElement>>('stopButton')
  private readonly injector = inject(Injector)

  constructor() {
    // A pane that is destroyed stops its run, so the host's request does not
    // run on for an answer nothing will show.
    inject(DestroyRef).onDestroy(() => this.running?.stop())
  }

  /** Every word this pane shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)

  /** The review's heading and accessible name — builder-core's, as the React pane's is. */
  protected readonly heading = computed(() => {
    const waiting = this.proposal()
    return waiting === undefined ? '' : proposalHeading(waiting, this.text())
  })

  /** The one sentence the live region carries — builder-core's, as the React pane's is. */
  protected readonly status = computed(() =>
    proposalStatus(
      {
        busy: this.busy(),
        result: this.result(),
        proposal: this.proposal(),
        refusal: this.refusal(),
      },
      this.text(),
    ),
  )

  protected async run(): Promise<void> {
    const ask = this.ask()
    if (ask === undefined || this.instruction().trim() === '' || this.busy()) return

    this.busy.set(true)
    this.result.set(undefined)
    this.proposal.set(undefined)
    this.refusal.set(undefined)
    const stop = createStop()
    this.running = stop
    try {
      const session = this.session()
      const current = session.document()
      const attempts = this.attempts()
      // The examples in force with the document the answer is for, taken together.
      const scenarios = this.scenarios()
      const examples =
        scenarios === undefined
          ? undefined
          : { scenarios, initialValue: this.initialValue(), mode: this.mode() }
      // Resolves however the run ends — a host's model that threw included, which
      // it reports as unreachable with the host's reason rather than as a document
      // that failed.
      const outcome = await authorForm(ask, this.instruction(), {
        // The document being edited, so "add a phone number" is a change
        // rather than a new form written from nothing.
        current,
        stop,
        ...(attempts === undefined ? {} : { attempts }),
      })
      this.result.set(outcome)
      // Held against the document it was written for. Applying later checks
      // that the form has not moved in the meantime.
      if (outcome.ok) this.proposal.set(proposeEdit(current, outcome.document, examples))
    } finally {
      // Stop is drawn only while a run waits, so it leaves with the focus if it has
      // it, and focus falls to <body>. Read while it is still drawn; Write, where the
      // run began, takes focus back once the template has enabled it again.
      const stopDrawn = this.stopButton()?.nativeElement
      const refocus = stopDrawn !== undefined && document.activeElement === stopDrawn
      this.running = undefined
      this.busy.set(false)
      if (refocus) {
        afterNextRender(() => this.writeButton()?.nativeElement.focus(), { injector: this.injector })
      }
    }
  }

  protected stop(): void {
    this.running?.stop()
  }

  protected apply(): void {
    const waiting = this.proposal()
    if (waiting === undefined) return

    const outcome = applyProposal(this.session(), waiting)
    if (outcome.ok) {
      this.discard()
      this.instruction.set('')
      return
    }
    // The proposal stays on screen. The commonest refusal is "the form changed
    // since this was proposed", and throwing it away would lose the one thing
    // the person needs in order to ask again.
    this.refusal.set(outcome.message)
  }

  protected discard(): void {
    this.proposal.set(undefined)
    this.refusal.set(undefined)
    this.result.set(undefined)
  }
}
