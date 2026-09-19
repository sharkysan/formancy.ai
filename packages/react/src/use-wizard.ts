import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useFormEngine } from './context.js'

export interface WizardBinding {
  page: number
  pageCount: number
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
  const getPage = useCallback(() => wizard.page(), [wizard])
  const page = useSyncExternalStore(subscribe, getPage, getPage)

  return useMemo(
    () => ({
      page,
      pageCount: wizard.pageCount,
      next: () => wizard.next(),
      back: () => wizard.back(),
      goTo: (pageIndex: number) => wizard.goTo(pageIndex),
    }),
    [page, wizard],
  )
}
