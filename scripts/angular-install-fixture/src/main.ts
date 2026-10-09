/**
 * The Angular packages, installed from their tarballs into a project that knows nothing
 * about the repository, built by the consumer's own Angular, and run in a browser (0134).
 *
 * A form drawn with Angular Material, a file field drawn by the default control beside it,
 * and a submit that writes the answers where the runner can read them — so the run proves
 * the linker accepted the packages, Material and the defaults rendered, and the engine
 * answered, under the Angular this project installed.
 */
import { JsonPipe } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { FormancyForm, provideFormancy, provideFormancyUploader } from '@formancy/angular'
import { provideFormancyMaterial } from '@formancy/angular/material'
import { createFormEngine } from '@formancy/core'
import type { SubmitOutcome } from '@formancy/angular'
import type { FormSchema } from '@formancy/spec'

const schema = {
  specVersion: '4',
  id: 'installed',
  title: 'Installed',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', required: true },
      { key: 'receipt', type: 'file', label: 'Receipt' },
    ],
  },
} as unknown as FormSchema

@Component({
  selector: 'installed-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyForm, JsonPipe],
  template: `
    <formancy-form (submitted)="outcome.set($event)" />
    @if (outcome(); as done) {
      <pre id="outcome">{{ done | json }}</pre>
    }
  `,
})
class InstalledRoot {
  protected readonly outcome = signal<SubmitOutcome | undefined>(undefined)
}

bootstrapApplication(InstalledRoot, {
  providers: [
    provideZonelessChangeDetection(),
    provideFormancy(
      createFormEngine({
        schema,
        capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
      }),
    ),
    provideFormancyMaterial(),
    provideFormancyUploader((file) =>
      Promise.resolve({
        id: 'r1',
        name: file.name,
        size: file.size,
        contentType: file.type,
        storageKey: 'installed:nowhere',
      }),
    ),
  ],
}).catch((error: unknown) => {
  document.body.setAttribute('data-failed', error instanceof Error ? error.message : String(error))
})
