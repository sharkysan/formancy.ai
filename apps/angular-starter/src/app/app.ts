import { JsonPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core'
import { MatButton } from '@angular/material/button'
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
import { saveForm, savedForm } from './saved-form.js'

/**
 * An Angular form builder and the form it builds, side by side: the builder edits the
 * document, and the preview — drawn with Angular Material — is that document, filled in.
 *
 * Everything a host decides is here and nowhere else: which document to start from,
 * which builder panels to show, where a submitted claim goes — and, in `saved-form.ts`,
 * where the form being built is kept. The builder and the form are
 * formancy's; this file is yours to change.
 */
@Component({
  selector: 'starter-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormancyBuilder,
    FormancyLogicPanel,
    FormancyPropertyPanel,
    JsonPipe,
    MatButton,
    StarterPreview,
  ],
  template: `
    <header>
      <h1>{{ title() }}</h1>
      <p>Edit the form on the left; fill it in on the right.</p>
      <p class="actions">
        <button matButton="filled" type="button" (click)="save()">Save</button>
        <button matButton="outlined" type="button" (click)="reload()">Reload saved</button>
        <span role="status">{{ said() }}</span>
      </p>
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
  /**
   * One session for the app's lifetime: the builder's undo history is the document's. It
   * opens on the saved form when there is one, so a reload of the page is a reload of it.
   */
  protected readonly session = createBuilderSession(savedForm() ?? EXPENSE_CLAIM)
  private readonly view = injectBuilderView(signal(this.session))
  protected readonly document = computed(() => this.view().document)
  protected readonly title = computed(() => this.document().title)
  protected readonly selected = signal<readonly string[] | null>(null)
  protected readonly submitted = signal<SubmitOutcome | undefined>(undefined)
  protected readonly said = signal('')

  protected save(): void {
    this.said.set(
      saveForm(this.document())
        ? 'Saved. Reload the page and it opens on this form.'
        : 'Not saved: this browser keeps nothing for this page.',
    )
  }

  /** The saved form, back in the same session — one edit, so undo in the tree returns. */
  protected reload(): void {
    const saved = savedForm()
    if (saved === undefined) {
      this.said.set('Nothing saved yet.')
      return
    }
    const outcome = this.session.replaceDocument(saved)
    this.said.set(outcome.ok ? 'Reloaded the saved form.' : outcome.message)
  }
}
