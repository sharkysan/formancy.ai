import { DestroyRef, InjectionToken, inject } from '@angular/core'
import type { Provider } from '@angular/core'
import { cancelUploads } from '@formancy/core'
import type { FormEngine } from '@formancy/core'

/**
 * The engine reaches components through DI, never through inputs drilling: a
 * form is one engine instance, and every inject* helper resolves against it.
 */
export const FORMANCY_ENGINE = new InjectionToken<FormEngine>('formancy.engine')

export function provideFormancy(engine: FormEngine): Provider[] {
  return [
    {
      provide: FORMANCY_ENGINE,
      // When the injector that holds the form goes, its uploads stop. Here rather than
      // in the file field: the field is recreated whenever its row moves, and its
      // uploads have to survive that (0130).
      useFactory: () => {
        inject(DestroyRef).onDestroy(() => cancelUploads(engine))
        return engine
      },
    },
  ]
}

export function injectEngine(): FormEngine {
  const engine = inject(FORMANCY_ENGINE, { optional: true })
  if (engine === null) {
    throw new Error('formancy needs provideFormancy(engine) in the injector tree above this component')
  }
  return engine
}
