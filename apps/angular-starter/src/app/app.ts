import { JsonPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core'
import type { SubmitOutcome } from '@formancy/angular'
import {
  FormancyBuilder,
  FormancyLogicPanel,
  FormancyPropertyPanel,
  injectBuilderView,
} from '@formancy/builder-angular'
import { createBuilderSession } from '@formancy/builder-core'
import { EXPENSE_CLAIM } from './expense-claim.js'
import { StarterPreview } from './preview.js'

/**
 * An Angular form builder and the form it builds, side by side: the builder edits the
 * document, and the preview — drawn with Angular Material — is that document, filled in.
 *
 * Everything a host decides is here and nowhere else: which document to start from,
 * which builder panels to show, where a submitted claim goes. The builder and the form are
 * formancy's; this file is yours to change.
 */
@Component({
  selector: 'starter-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyBuilder, FormancyLogicPanel, FormancyPropertyPanel, JsonPipe, StarterPreview],
  template: `
    <header>
      <h1>{{ title() }}</h1>
      <p>Edit the form on the left; fill it in on the right.</p>
    </header>
    <main class="panes">
      <section class="pane" aria-labelledby="starter-build">
        <h2 id="starter-build">Build</h2>
        <formancy-builder [session]="session" (selected)="selected.set($event)" />
        @if (selected(); as keyPath) {
          <formancy-property-panel [session]="session" [keyPath]="keyPath" />
          <formancy-logic-panel [session]="session" [keyPath]="keyPath" />
        }
      </section>
      <section class="pane" aria-labelledby="starter-fill">
        <h2 id="starter-fill">Fill in</h2>
        <starter-preview [document]="document()" (submitted)="submitted.set($event)" />
        @if (submitted(); as outcome) {
          <section aria-labelledby="starter-result">
            <h3 id="starter-result">{{ outcome.ok ? 'Submitted' : 'Not submitted yet' }}</h3>
            @if (outcome.ok) {
              <pre>{{ outcome.data | json }}</pre>
            }
          </section>
        }
      </section>
    </main>
  `,
})
export class StarterApp {
  /** One session for the app's lifetime: the builder's undo history is the document's. */
  protected readonly session = createBuilderSession(EXPENSE_CLAIM)
  private readonly view = injectBuilderView(signal(this.session))
  protected readonly document = computed(() => this.view().document)
  protected readonly title = computed(() => this.document().title)
  protected readonly selected = signal<readonly string[] | null>(null)
  protected readonly submitted = signal<SubmitOutcome | undefined>(undefined)
}
