import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  Injector,
  computed,
  createEnvironmentInjector,
  inject,
  input,
  signal,
} from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import { referencedMessages } from '@formancy/builder-core'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, provideFormancy } from '@formancy/angular'
import type { BuilderSession, CatalogueFile, FormSchema } from './types.js'
import { injectBuilderView } from './view.js'

/**
 * Translating a form.
 *
 * The format and the engine were finished long before either pane: a label could
 * be `{ $t: "name" }` and the engine resolved it against the catalogue, and
 * nothing in a builder could produce one.
 *
 * **Two jobs, and they belong to different people.** An author *extracts*, once:
 * the words already typed become the default locale's messages and the document
 * starts referring to them. A translator *works through a language*, for an hour
 * at a time, and never touches the form's structure. This pane is built around
 * the second and keeps the first to a single button, because the first is a step
 * and the second is the work.
 *
 * **An untranslated message is marked rather than left to the fallback.** Falling
 * back silently is right when a form is rendered and wrong here: "it looked fine
 * in the preview" is exactly how a language ships half-finished.
 */
@Component({
  selector: 'formancy-translations-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    <div data-formancy-part="translations">
      @if (referenced().length === 0) {
        <p data-formancy-part="translations-hint">
          Nothing in this form is translatable yet: its words are written into the document
          rather than referred to. Extracting them keeps what they say and lets a language be
          added beside them.
        </p>
        <!-- Every text in one step, and one undo. Field by field is a chore people
             abandon halfway, leaving a form that is half translatable and a
             catalogue that looks finished. -->
        <button type="button" (click)="extract()">Make this form translatable</button>
      } @else {
        <div data-formancy-part="translations-toolbar">
          <label>
            Language
            <select [value]="chosen()" (change)="onLocale($event)">
              @for (locale of locales(); track locale) {
                <option [value]="locale" [selected]="locale === chosen()">
                  {{ locale === defaultLocale() ? locale + ' (default)' : locale }}
                </option>
              }
            </select>
          </label>

          <label>
            New language
            <input type="text" [value]="adding()" (input)="onAdding($event)" />
          </label>
          <button type="button" (click)="addLocale()">Add language</button>

          <!-- For a team with a vendor and a translation memory, who work in a
               file rather than in a table in somebody's admin. The file carries
               the source beside every target, because a list of ids and blanks
               tells a translator nothing and a memory matches on source text. -->
          <button type="button" (click)="download()">Download {{ chosen() }}</button>

          <label>
            Upload a translated file
            <input type="file" accept="application/json,.json" (change)="upload($event)" />
          </label>
        </div>

        @if (problem() !== null) {
          <p data-formancy-part="translations-problem">{{ problem() }}</p>
        }

        @if (report(); as written) {
          <div data-formancy-part="translations-report">
            <p>{{ written.written }} {{ written.written === 1 ? 'translation' : 'translations' }} written.</p>
            @if (written.unknown.length > 0) {
              <p>
                Not written, because this form no longer has them — the file was exported
                before a field was removed: {{ written.unknown.join(', ') }}
              </p>
            }
            @if (written.stale.length > 0) {
              <p>
                Written, but translated from wording that has since changed, so worth a look:
                {{ written.stale.join(', ') }}
              </p>
            }
          </div>
        }

        <table data-formancy-part="translations-table">
          <thead>
            <tr>
              <th scope="col">{{ defaultLocale() }}</th>
              <th scope="col">{{ chosen() }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr>
                <!-- The default locale's words, not the id: a translator reading
                     'email.label' is reading the schema's name for a question
                     rather than the question. -->
                <th scope="row">{{ row.source }}</th>
                <td>
                  <input
                    type="text"
                    [attr.aria-label]="row.source"
                    [value]="row.shown"
                    (input)="setMessage(row.id, $event)"
                  />
                  @if (row.missing) {
                    <span data-formancy-part="translations-missing">Not translated</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>

        <!-- The form as the language being worked on renders it. A translator
             could otherwise write a language and not see it: an engine resolves
             text in one locale fixed for its lifetime, so the only way to look
             was to change the document's 'defaultLocale' — an edit to the form in
             order to read it, which is then published, diffed and migrated like
             any other edit. This builds its own engine and touches nothing. -->
        <section
          [attr.aria-label]="'Preview in ' + chosen()"
          data-formancy-part="translations-preview"
        >
          @if (previewInjector(); as injector) {
            <ng-container
              [ngComponentOutlet]="form"
              [ngComponentOutletInjector]="injector"
            />
          }
        </section>
      }

      @if (orphaned().length > 0) {
        <!-- Shown in BOTH branches, which the React pane's first version did not
             do: a form whose fields have all been removed refers to no messages
             and still has a translator's work sitting behind it, and the "nothing
             is translatable yet" branch hid exactly that case. -->
        <div data-formancy-part="translations-orphaned">
          <p>
            These messages are no longer used by the form. They are kept rather than removed —
            a field can come back, and a year of somebody’s translations should not disappear
            because a key changed.
          </p>
          <ul>
            @for (id of orphaned(); track id) {
              <li><code>{{ id }}</code>: {{ sourceOf(id) }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class FormancyTranslationsPane {
  readonly session = input.required<BuilderSession>()

  protected readonly form = FormancyForm
  protected readonly view = injectBuilderView(this.session)
  private readonly parent = inject(EnvironmentInjector)

  protected readonly showing = signal<string | null>(null)
  protected readonly adding = signal('')
  protected readonly problem = signal<string | null>(null)

  protected readonly defaultLocale = computed(
    () => this.view().document.i18n?.defaultLocale ?? 'en',
  )
  protected readonly locales = computed(() =>
    Object.keys(this.view().document.i18n?.messages ?? {}),
  )
  protected readonly chosen = computed(() => {
    const showing = this.showing()
    return showing !== null && this.locales().includes(showing) ? showing : this.defaultLocale()
  })
  protected readonly referenced = computed(() => referencedMessages(this.view().document))
  protected readonly orphaned = computed(() => {
    void this.view()
    return this.session().orphanedMessages()
  })
  protected readonly report = computed(() => {
    void this.view()
    return this.session().lastImportReport()
  })
  protected readonly rows = computed(() => {
    const messages = this.view().document.i18n?.messages ?? {}
    const source = messages[this.defaultLocale()] ?? {}
    const target = messages[this.chosen()] ?? {}
    const isDefault = this.chosen() === this.defaultLocale()
    return this.referenced().map((id) => {
      const words = source[id] ?? id
      const translated = target[id]
      return {
        id,
        source: words,
        shown: isDefault ? words : (translated ?? ''),
        missing: !isDefault && (translated === undefined || translated === ''),
      }
    })
  })

  /**
   * An injector holding an engine at the chosen locale.
   *
   * A new one per locale and per document, because an engine's locale is fixed
   * for its lifetime — which is the whole reason this preview exists rather than
   * the pane changing `defaultLocale` to look at a language.
   */
  protected readonly previewInjector = computed((): Injector | undefined => {
    const document = this.view().document
    const locale = this.chosen()
    try {
      const engine = createFormEngine({
        schema: document as FormSchema,
        locale,
        capabilities: {
          now: () => Date.now(),
          today: () => new Date().toISOString().slice(0, 10),
          random: () => Math.random(),
        },
      })
      return createEnvironmentInjector([provideFormancy(engine)], this.parent)
    } catch {
      // A document the engine refuses is the builder's problem to report, not
      // this pane's: a translator seeing a compile error about a colleague's
      // expression has been handed somebody else's failure.
      return undefined
    }
  })

  protected sourceOf(id: string): string {
    return this.view().document.i18n?.messages[this.defaultLocale()]?.[id] ?? '—'
  }

  protected extract(): void {
    this.session().extractAllText()
  }

  protected onLocale(event: Event): void {
    this.showing.set((event.target as HTMLSelectElement).value)
  }

  protected onAdding(event: Event): void {
    this.adding.set((event.target as HTMLInputElement).value)
  }

  protected addLocale(): void {
    const locale = this.adding().trim()
    if (locale === '') return
    this.session().addLocale(locale)
    this.showing.set(locale)
    this.adding.set('')
  }

  protected setMessage(id: string, event: Event): void {
    this.session().setMessage(this.chosen(), id, (event.target as HTMLInputElement).value)
  }

  protected download(): void {
    const file = this.session().exportCatalogue(this.chosen())
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${this.view().document.id}.${this.chosen()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  protected upload(event: Event): void {
    const picked = (event.target as HTMLInputElement).files?.[0]
    if (picked === undefined) return
    void picked.text().then((content) => {
      // Said rather than swallowed, either way: a silent no-op after a translator
      // uploads an afternoon's work is the worst available outcome. Not JSON at
      // all is the builder's sentence — the parser's own names a token and a
      // position — and not a catalogue is the session's refusal, which this pane
      // used to drop on the floor.
      let file: unknown
      try {
        file = JSON.parse(content)
      } catch {
        this.problem.set(this.session().text('translations.unreadable'))
        return
      }
      const outcome = this.session().importCatalogue(file as CatalogueFile)
      this.problem.set(outcome.ok ? null : outcome.message)
    })
  }
}
