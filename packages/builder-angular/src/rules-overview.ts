import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { explainRule, rulesOverview } from '@formancy/builder-core'
import type { BuilderSession, Capabilities, RuleVerdict } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import { injectBuilderView } from './view.js'

/**
 * Every rule in the form, in words, grouped by the field or page it is about — and,
 * given a preview's answers, why each field is shown, hidden, required or not now.
 *
 * What it says is `@formancy/builder-core`'s, for this overview and the React one
 * (0128); this draws it. Not a live region, for the reason the React one is not: the
 * verdicts change with every keystroke in the preview.
 */
@Component({
  selector: 'formancy-rules-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe],
  template: `
    <section
      data-formancy-part="rules-overview"
      [attr.aria-label]="'overview.heading' | builderText: text()"
    >
      <h3>{{ 'overview.heading' | builderText: text() }}</h3>
      @if (groups().length === 0) {
        <p data-formancy-part="rules-overview-empty">
          {{ 'overview.empty' | builderText: text() }}
        </p>
      } @else {
        <ul data-formancy-part="rules-overview-list">
          @for (group of groups(); track group.target) {
            <li data-formancy-part="rules-overview-target">
              <h4>{{ group.targetLabel }}</h4>
              <ul>
                @for (summary of group.rules; track summary.index) {
                  <li data-formancy-part="rules-overview-rule">
                    <span data-formancy-part="logic-kind">{{ summary.kindLabel }}</span>
                    @if (summary.sentence; as sentence) {
                      {{ sentence }}
                    } @else {
                      {{ 'overview.written' | builderText: text() }}
                      <code>{{ summary.written }}</code>
                    }
                    @if (verdictOf(summary.index); as verdict) {
                      <div
                        data-formancy-part="rules-overview-now"
                        [attr.data-outcome]="verdict.outcome"
                      >
                        <p>{{ verdict.effect }}</p>
                        @if (verdict.because.length > 0) {
                          <ul>
                            @for (line of verdict.because; track line) {
                              <li>{{ line }}</li>
                            }
                          </ul>
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class FormancyRulesOverview {
  readonly session = input.required<BuilderSession>()
  /** The answers a preview holds, if the host has one; absent, the rules are listed alone. */
  readonly answers = input<Readonly<Record<string, unknown>> | undefined>(undefined)
  /** The clock the preview uses — the host's, never this package's. Needed with `answers`. */
  readonly capabilities = input<Capabilities | undefined>(undefined)

  protected readonly view = injectBuilderView(this.session)
  protected readonly text = computed(() => this.session().text)
  protected readonly groups = computed(() => rulesOverview(this.view().document, this.text()))

  /** Every verdict at once, so the template reads them rather than computing per row. */
  private readonly verdicts = computed(() => {
    const answers = this.answers()
    const capabilities = this.capabilities()
    const document = this.view().document
    if (answers === undefined || capabilities === undefined) return new Map<number, RuleVerdict>()
    const found = new Map<number, RuleVerdict>()
    ;(document.logic?.rules ?? []).forEach((rule, index) => {
      const verdict = explainRule(rule, document, answers, this.text(), capabilities)
      if (verdict !== undefined) found.set(index, verdict)
    })
    return found
  })

  protected verdictOf(index: number): RuleVerdict | undefined {
    return this.verdicts().get(index)
  }
}
