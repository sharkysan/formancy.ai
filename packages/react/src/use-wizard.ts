import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useFormEngine } from './context.js'

export interface WizardBinding {
  page: number
  pageCount: number
  /** Whether there is a live page after this one. Not `page < pageCount - 1`
   *  once a page can be walked past: the last live page is not always the last. */
  canGoNext: boolean
  canGoBack: boolean
  /** Resolves true iff the page advanced; a failed validation keeps the page. */
  next(): Promise<boolean>
  back(): void
  /** Unvalidated jump — error navigation, never a way past a gate. */
  goTo(pageIndex: number): void
}

/**
 * The wizard's live position. Throws on an unpaged form rather than degrading
 * to a one-page pseudo-wizard: a stepper rendered over a flat form is a bug in
 * the caller, and a loud error at mount beats a mute component.
 */
export function useWizard(): WizardBinding {
  const engine = useFormEngine()
  const wizard = engine.wizard()
  if (wizard === undefined) {
    throw new Error('useWizard needs a schema with pages; this form has none')
  }

  const subscribe = useCallback((onChange: () => void) => wizard.subscribe(onChange), [wizard])
  // The REVISION, not the page: walking past a page changes which steps exist
  // while leaving the position alone, and a store snapshot that did not change
  // is a component that does not re-render.
  const getRevision = useCallback(() => wizard.revision(), [wizard])
  const revision = useSyncExternalStore(subscribe, getRevision, getRevision)

  return useMemo(
    () => ({
      page: wizard.page(),
      pageCount: wizard.pageCount,
      canGoNext: wizard.canGoNext(),
      canGoBack: wizard.canGoBack(),
      next: () => wizard.next(),
      back: () => wizard.back(),
      goTo: (pageIndex: number) => wizard.goTo(pageIndex),
    }),
    [revision, wizard],
  )
}
