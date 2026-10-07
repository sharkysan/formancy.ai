import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { applyProposal, authorForm, proposeEdit } from '@formancy/builder-core'
import type { AskModel, AuthoringResult, BuilderSession, EditProposal } from './types.js'

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
 */
@Component({
  selector: 'formancy-prompt-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ask() !== undefined) {
      <section data-formancy-part="prompt-pane">
        <label [attr.for]="inputId">Describe the form, or the change you want</label>
        <textarea
          [id]="inputId"
          rows="3"
          [value]="instruction()"
          [disabled]="busy()"
          placeholder="A contact form with an email address and a message, and a phone number only if they ask to be called back"
          (input)="instruction.set($any($event.target).value)"
        ></textarea>
        <button type="button" [disabled]="busy() || instruction().trim() === ''" (click)="run()">
          {{ busy() ? 'Writing…' : 'Write it' }}
        </button>

        <!-- One polite region. The work takes seconds, and a proposal that only
             appears visually is one a screen-reader user never learns about. -->
        <p role="status" data-formancy-part="prompt-status">{{ status() }}</p>

        @if (proposal(); as waiting) {
          <section data-formancy-part="prompt-review" [attr.aria-labelledby]="reviewId">
            <h3 [id]="reviewId">
              {{
                waiting.costsAnswers
                  ? 'Review these changes — some affect answers already collected'
                  : 'Review these changes'
              }}
            </h3>
            <ul data-formancy-part="prompt-changes">
              @for (change of waiting.changes; track change.kind + change.path) {
                <!-- The path and the sentence. The kind is for machines; a person
                     reading this wants to know what it costs them. -->
                <li [attr.data-severity]="change.severity">
                  <code>{{ change.path }}</code> — {{ change.detail }}
                </li>
              }
            </ul>
            <button type="button" (click)="apply()">Apply these changes</button>
            <button type="button" (click)="discard()">Discard</button>
          </section>
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
                <summary>What the model last answered</summary>
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

  protected readonly failure = computed(() => {
    const outcome = this.result()
    return outcome === undefined || outcome.ok ? undefined : outcome
  })

  /**
   * The one sentence the live region carries.
   *
   * The order matters: a refusal is the most recent thing that happened and
   * outranks the proposal still on screen behind it.
   */
  protected readonly status = computed(() => {
    if (this.busy()) return 'Writing the form, and checking it.'
    const refused = this.refusal()
    if (refused !== undefined) return `Not applied. ${refused}`

    const waiting = this.proposal()
    if (waiting !== undefined) {
      const count = waiting.changes.length
      const what = `${String(count)} change${count === 1 ? '' : 's'}`
      const outcome = this.result()
      /* How many goes it took, when it took more than one. A model that
         needed correcting is one to read more carefully, and this is the
         moment somebody is deciding how closely. */
      const tries = outcome?.ok === true && outcome.attempts > 1 ? ` after ${String(outcome.attempts)} attempts` : ''
      return waiting.costsAnswers
        ? `Ready to review${tries}: ${what}, and some of them affect answers already collected. Nothing has been applied.`
        : `Ready to review${tries}: ${what}, none of which affect answers already collected. Nothing has been applied.`
    }

    const outcome = this.result()
    if (outcome === undefined || outcome.ok) return ''
    return `Nothing was applied. ${String(outcome.attempts)} attempt(s), and the document still did not work.`
  })

  protected async run(): Promise<void> {
    const ask = this.ask()
    if (ask === undefined || this.instruction().trim() === '' || this.busy()) return

    this.busy.set(true)
    this.result.set(undefined)
    this.proposal.set(undefined)
    this.refusal.set(undefined)
    try {
      const session = this.session()
      const current = session.document()
      const attempts = this.attempts()
      const outcome = await authorForm(ask, this.instruction(), {
        // The document being edited, so "add a phone number" is a change
        // rather than a new form written from nothing.
        current,
        ...(attempts === undefined ? {} : { attempts }),
      })
      this.result.set(outcome)
      // Held against the document it was written for. Applying later checks
      // that the form has not moved in the meantime.
      if (outcome.ok) this.proposal.set(proposeEdit(current, outcome.document))
    } catch (error) {
      // The host's model threw: a network failure, a rate limit, a missing
      // key. Said out loud, because a button that silently does nothing is
      // the worst version of this.
      this.result.set({
        ok: false,
        attempts: 0,
        problems: [
          { kind: 'not-json', detail: error instanceof Error ? error.message : String(error) },
        ],
        lastAnswer: '',
      })
    } finally {
      this.busy.set(false)
    }
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
