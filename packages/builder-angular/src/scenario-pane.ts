import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { createRunHistory, scenarioStatus } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import { runScenarios } from '@formancy/core'
import type { BuilderSession, Scenario, ScenarioResult } from './types.js'
import { injectBuilderView } from './view.js'

/**
 * What this form is supposed to do, run against what it does now.
 *
 * The Angular half of the React pane, and the same two things it adds over the
 * runner: it reruns when the document changes, and it names **what stopped
 * holding** rather than how many fail. A standing total is a number somebody
 * reads once; what was holding before you touched this and is not now is the
 * sentence that gets acted on
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 *
 * What counts as a regression is `comparedToLastRun` in
 * `@formancy/builder-core`, and what it is compared with is `createRunHistory`
 * there, so the two builders cannot tell two people different things about one edit
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * **The scenarios are the host's**, arriving as an input and leaving through
 * an output, exactly as the prompt pane's model does. With none given the pane
 * renders nothing rather than an empty table.
 *
 * Signals and `OnPush`, zoneless. The rerun is a `computed` over the session's
 * revision — the same subscription every other pane here uses — and the
 * previous run is held in a plain field, the history, because it is read to
 * compare and never rendered on its own.
 */
@Component({
  selector: 'formancy-scenario-pane',
  imports: [BuilderTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (scenarios() !== undefined) {
      <section
        data-formancy-part="scenario-pane"
        [attr.aria-label]="'scenarios.label' | builderText: text()"
      >
        <!-- One polite region. A regression that only appears visually is one a
             screen-reader user learns about by submitting a broken form. -->
        <p role="status" data-formancy-part="scenario-status">{{ status() }}</p>

        @if (results().length === 0) {
          <p data-formancy-part="scenario-empty">{{ 'scenarios.empty' | builderText: text() }}</p>
        } @else {
          <ul data-formancy-part="scenario-list">
            @for (result of results(); track result.name) {
              <li
                [attr.data-passed]="result.passed"
                [attr.data-regressed]="change().regressions.includes(result.name)"
              >
                <strong>{{ result.name }}</strong>
                @if (result.failures.length > 0) {
                  <ul>
                    @for (failure of result.failures; track $index) {
                      <!-- What was expected and what happened. "Failed" sends
                           somebody back to the document to find the rule. -->
                      <li [attr.data-about]="failure.about">{{ failure.detail }}</li>
                    }
                  </ul>
                }
                @if (removable()) {
                  <button type="button" (click)="remove(result.name)">
                    {{ 'scenarios.remove' | builderText: text() : { name: result.name } }}
                  </button>
                }
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class FormancyScenarioPane {
  readonly session = input.required<BuilderSession>()
  /** Held by the host. Absent means the feature is not configured. */
  readonly scenarios = input<readonly Scenario[] | undefined>(undefined)
  /**
   * Where every scenario starts — the templates' `sample`, by another name.
   *
   * Not optional in practice for any real form: a document with required
   * fields is invalid before a scenario has set anything, so every scenario
   * would report the same `required` errors and none would be about what the
   * scenario is for.
   */
  readonly initialValue = input<Readonly<Record<string, unknown>> | undefined>(undefined)
  /**
   * `client` by default. `server` is what the publish gate and the submission
   * endpoint run, and a form that behaves differently in the two is the drift
   * this product exists to prevent.
   */
  readonly mode = input<'client' | 'server' | undefined>(undefined)
  /** Emitted when somebody removes one. Unsubscribed makes the list read-only. */
  readonly scenariosChange = output<readonly Scenario[]>()
  /**
   * Whether the remove buttons are drawn.
   *
   * An input rather than "is anybody listening to the output", which Angular
   * does not answer: a button whose event goes nowhere is worse than no
   * button, and guessing at a subscription would be guessing.
   */
  readonly removable = input(false)

  private readonly view = injectBuilderView(this.session)
  /** The previous run and its session; a run over another session is compared with nothing. */
  private readonly history = createRunHistory()

  protected readonly results = computed<readonly ScenarioResult[]>(() => {
    const scenarios = this.scenarios()
    if (scenarios === undefined) return []
    // Read for the dependency: the view changes identity when the document
    // does, which is what makes this rerun on an edit and not on a render.
    this.view()
    const mode = this.mode()
    const initialValue = this.initialValue()
    return runScenarios(this.session().document(), scenarios, {
      ...(initialValue === undefined ? {} : { initialValue }),
      ...(mode === undefined ? {} : { mode }),
    })
  })

  protected readonly change = computed(() => {
    const results = this.results()
    return this.history.compare(this.session(), results)
  })

  /** Every word this panel shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)

  /** The one sentence the live region carries — builder-core's, as the React panel's is. */
  protected readonly status = computed(() => {
    const results = this.results()
    const failing = results.filter((result) => !result.passed).length
    return scenarioStatus(results.length, failing, this.change(), this.text())
  })

  protected remove(name: string): void {
    this.scenariosChange.emit((this.scenarios() ?? []).filter((one) => one.name !== name))
  }
}
