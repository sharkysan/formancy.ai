import { InjectionToken, inject } from '@angular/core'
import type { Provider } from '@angular/core'
import type { FormEngine } from '@formancy/core'

/**
 * The engine reaches components through DI, never through inputs drilling: a
 * form is one engine instance, and every inject* helper resolves against it.
 */
export const FORMANCY_ENGINE = new InjectionToken<FormEngine>('formancy.engine')

export function provideFormancy(engine: FormEngine): Provider[] {
  return [{ provide: FORMANCY_ENGINE, useValue: engine }]
}

export function injectEngine(): FormEngine {
  const engine = inject(FORMANCY_ENGINE, { optional: true })
  if (engine === null) {
    throw new Error('formancy needs provideFormancy(engine) in the injector tree above this component')
  }
  return engine
}
