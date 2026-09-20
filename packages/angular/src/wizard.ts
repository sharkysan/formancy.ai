import { DestroyRef, inject, signal } from '@angular/core'
import type { Signal } from '@angular/core'
import { injectEngine } from './provide.js'

export interface WizardBinding {
  /** The live page index. */
  page: Signal<number>
  pageCount: number
  /** Resolves true iff the page advanced; a failed validation keeps the page. */
  next(): Promise<boolean>
  back(): void
  /** Unvalidated jump — error navigation, never a way past a gate. */
  goTo(pageIndex: number): void
}

/**
 * The wizard's live position as a signal. Throws on an unpaged form rather
 * than degrading to a one-page pseudo-wizard: a stepper rendered over a flat
 * form is a bug in the caller, and a loud error at wiring beats a mute
 * component. Same words as React's useWizard, because it is the same policy.
 *
 * Call from an injection context (field member initialiser or constructor).
 */
export function injectWizard(): WizardBinding {
  const engine = injectEngine()
  const wizard = engine.wizard()
  if (wizard === undefined) {
    throw new Error('injectWizard needs a schema with pages; this form has none')
  }

  const page = signal(wizard.page())
  const unsubscribe = wizard.subscribe(() => page.set(wizard.page()))
  inject(DestroyRef).onDestroy(unsubscribe)

  return {
    page: page.asReadonly(),
    pageCount: wizard.pageCount,
    next: () => wizard.next(),
    back: () => wizard.back(),
    goTo: (pageIndex) => wizard.goTo(pageIndex),
  }
}
