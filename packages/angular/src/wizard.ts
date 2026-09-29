import { DestroyRef, inject, signal } from '@angular/core'
import type { Signal } from '@angular/core'
import type { FieldDef } from '@formancy/spec'
import { injectEngine } from './provide.js'

export interface WizardBinding {
  /** The live page index. */
  page: Signal<number>
  pageCount: number
  /** The pages the answers actually take, in order, with the index each has in
   *  the form — a stepper naming a step Next never reaches reads as a broken
   *  button rather than as a page that does not apply. */
  livePages: Signal<ReadonlyArray<{ key: string; def: FieldDef; index: number }>>
  /** Whether there is a live page after this one. Not `page < pageCount - 1`
   *  once a page can be walked past. */
  canGoNext: Signal<boolean>
  canGoBack: Signal<boolean>
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

  const live = (): ReadonlyArray<{ key: string; def: FieldDef; index: number }> =>
    engine
      .pages()
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => !entry.skipped)

  const page = signal(wizard.page())
  const livePages = signal(live())
  const canGoNext = signal(wizard.canGoNext())
  const canGoBack = signal(wizard.canGoBack())
  // All four, on every notification: walking past a page changes which steps
  // exist while leaving the position alone, so a binding that only followed the
  // position went on naming a step the form had stopped taking. React's
  // `useWizard` reads a revision for the same reason.
  const unsubscribe = wizard.subscribe(() => {
    page.set(wizard.page())
    livePages.set(live())
    canGoNext.set(wizard.canGoNext())
    canGoBack.set(wizard.canGoBack())
  })
  inject(DestroyRef).onDestroy(unsubscribe)

  return {
    page: page.asReadonly(),
    livePages: livePages.asReadonly(),
    canGoNext: canGoNext.asReadonly(),
    canGoBack: canGoBack.asReadonly(),
    pageCount: wizard.pageCount,
    next: () => wizard.next(),
    back: () => wizard.back(),
    goTo: (pageIndex) => wizard.goTo(pageIndex),
  }
}
