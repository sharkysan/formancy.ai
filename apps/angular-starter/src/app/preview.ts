import { NgComponentOutlet } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  InjectionToken,
  computed,
  createEnvironmentInjector,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import { FormancyForm, provideFormancy, provideFormancyUploader } from '@formancy/angular'
import type { StoredFile, SubmitOutcome, Uploader } from '@formancy/angular'
import { provideFormancyMaterial } from '@formancy/angular/material'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

/** Where a submitted claim goes: to whoever hosts the preview. */
const ON_SUBMIT = new InjectionToken<(outcome: SubmitOutcome) => void>('starter submit')

/** The form itself, with its submit reported to the preview that made it. */
@Component({
  selector: 'starter-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyForm],
  template: `<formancy-form submitLabel="Submit claim" (submitted)="report($event)" />`,
})
export class StarterForm {
  protected readonly report = inject(ON_SUBMIT)
}

let minted = 0

/**
 * This starter's uploader. **The bytes stay in the browser tab**, and the storage key says
 * so: replace it with one that sends them to your storage — the formancy server's two-step
 * offer-then-PUT, or your own — and the field stays exactly as it is. It is told the
 * field, a signal for cancelling and a callback for progress; this one needs none of them.
 */
export const inTabUploader: Uploader = (file) => {
  minted += 1
  const stored: StoredFile = {
    id: `starter-${String(minted)}`,
    name: file.name,
    size: file.size,
    contentType: file.type === '' ? 'application/octet-stream' : file.type,
    storageKey: `starter:in-this-tab/${String(minted)}`,
  }
  return Promise.resolve(stored)
}

/**
 * The form a document describes, drawn with Angular Material, made afresh whenever the
 * document changes.
 *
 * **One engine per document**, because an engine is built for one schema. Each gets an
 * environment injector of its own, which is where `provideFormancy` puts the form's
 * lifetime: destroying the previous one when the document changes stops that form's
 * uploads rather than leaving them to finish into an engine nobody shows.
 *
 * **A document the engine refuses is said, not thrown.** The builder holds any document the
 * schema accepts, and the schema takes a rule's expression as a string: one that does not
 * compile, or a form saved half-written, is only refused when the engine is built. The
 * reason is shown in the pane, as the admin's build pane shows it, and the form is drawn
 * again as soon as the document builds.
 */
@Component({
  selector: 'starter-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @if (built().error; as error) {
      <p role="alert">{{ error }}</p>
    } @else if (injector(); as injector) {
      <ng-container *ngComponentOutlet="form; injector: injector" />
    }
  `,
})
export class StarterPreview {
  readonly document = input.required<FormSchema>()
  readonly submitted = output<SubmitOutcome>()

  protected readonly form = StarterForm
  protected readonly injector = signal<EnvironmentInjector | undefined>(undefined)
  private readonly parent = inject(EnvironmentInjector)

  /** The engine for the document, or the engine's own reason for refusing it. */
  protected readonly built = computed(() => {
    try {
      return {
        engine: createFormEngine({
          schema: this.document(),
          // The application's own clock: this is the composition root, where ambient
          // time may enter. The engine never reads it on its own.
          capabilities: {
            now: () => Date.now(),
            today: () => new Date().toISOString().slice(0, 10),
            random: () => Math.random(),
          },
        }),
        error: undefined,
      }
    } catch (error) {
      return { engine: undefined, error: error instanceof Error ? error.message : String(error) }
    }
  })

  constructor() {
    // A resource with a lifetime, so an effect with a cleanup: the previous form's
    // injector is destroyed when the document changes and when this preview goes.
    effect((onCleanup) => {
      const { engine } = this.built()
      if (engine === undefined) {
        this.injector.set(undefined)
        return
      }
      const injector = createEnvironmentInjector(
        [
          provideFormancy(engine),
          provideFormancyMaterial(),
          provideFormancyUploader(inTabUploader),
          {
            provide: ON_SUBMIT,
            useValue: (outcome: SubmitOutcome) => this.submitted.emit(outcome),
          },
        ],
        this.parent,
      )
      this.injector.set(injector)
      onCleanup(() => injector.destroy())
    })
  }
}
