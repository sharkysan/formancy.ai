/**
 * Headless multi-page navigation.
 *
 * The semantics live here rather than in any renderer because they are policy,
 * not presentation: leaving a page forward validates exactly that page; going
 * BACK never validates, because a user must always be able to retreat from a
 * page they cannot complete; and the last page has no "next" — submit is a
 * separate act that validates everything.
 */
export interface WizardOptions {
  pageCount: number
  /** Validate one page. Called with the page being LEFT, only on forward moves. */
  validatePage: (pageIndex: number) => boolean | Promise<boolean>
}

export interface Wizard {
  readonly pageCount: number
  page(): number
  /** Resolves true iff the page actually advanced. */
  next(): Promise<boolean>
  back(): void
  subscribe(listener: () => void): () => void
}

export function createWizard(options: WizardOptions): Wizard {
  if (!Number.isInteger(options.pageCount) || options.pageCount < 1) {
    throw new Error(`A wizard needs at least one page, got ${options.pageCount}`)
  }

  let current = 0
  /**
   * True while an async validation is deciding a forward move. A second next()
   * during that window reports false instead of queueing: double-activated
   * "next" buttons must not skip a page when validation eventually resolves.
   */
  let advancing = false
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  return {
    pageCount: options.pageCount,
    page: () => current,

    async next() {
      if (advancing || current >= options.pageCount - 1) return false
      advancing = true
      try {
        if (!(await options.validatePage(current))) return false
        current++
        notify()
        return true
      } finally {
        advancing = false
      }
    },

    back() {
      if (current === 0) return
      current--
      notify()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
