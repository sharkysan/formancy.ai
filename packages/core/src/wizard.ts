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
  /**
   * Whether a page is on the path the answers take.
   *
   * A skipped page is walked past in BOTH directions. Skipping it going forward
   * and stepping into it going back is the shape nobody can reason about, and it
   * is how this is usually got wrong.
   *
   * Absent means every page is live, which is what every wizard did before
   * conditional routing existed.
   */
  isLive?: (pageIndex: number) => boolean
}

export interface Wizard {
  readonly pageCount: number
  page(): number
  /** Whether there is a live page after this one, which is not the same as
   *  `page() < pageCount - 1` once a page can be walked past. */
  canGoNext(): boolean
  canGoBack(): boolean
  /** Recompute after the answers change which pages are live. */
  refresh(): void
  /**
   * Increments on every change the wizard notifies about.
   *
   * A binding needs a snapshot that changes whenever anything here did, and the
   * page number is not one: walking past a page changes which steps exist while
   * leaving the position alone, so a `useSyncExternalStore` reading `page()`
   * sees the same number and does not re-render. The stepper then went on naming
   * a step the form had stopped taking.
   */
  revision(): number
  /** Resolves true iff the page actually advanced. */
  next(): Promise<boolean>
  back(): void
  /** Jump without validating. Its caller is error navigation — taking the user
   *  TO a problem — never a way to skip past one. */
  goTo(pageIndex: number): void
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
  let revision = 0
  const listeners = new Set<() => void>()

  function notify(): void {
    revision += 1
    for (const listener of [...listeners]) listener()
  }

  const live = (index: number): boolean => options.isLive?.(index) ?? true

  /** The next live page after `from`, or `undefined` at the end of the path. */
  const after = (from: number): number | undefined => {
    for (let index = from + 1; index < options.pageCount; index += 1) {
      if (live(index)) return index
    }
    return undefined
  }

  const before = (from: number): number | undefined => {
    for (let index = from - 1; index >= 0; index -= 1) {
      if (live(index)) return index
    }
    return undefined
  }

  return {
    pageCount: options.pageCount,
    page: () => current,
    revision: () => revision,
    canGoNext: () => after(current) !== undefined,
    canGoBack: () => before(current) !== undefined,

    refresh() {
      // The page somebody is standing on may have just been walked past — they
      // said they need no visa while reading the visa page. Staying would leave
      // them on a page whose fields are hidden, which renders as an empty step.
      if (!live(current)) {
        const target = after(current) ?? before(current)
        if (target !== undefined) current = target
      }
      // Notified either way, and that is not belt and braces: the STEPPER changed
      // even when the position did not, and a renderer subscribed to the wizard
      // is how it finds out. Without this a form kept naming a step it had just
      // stopped taking.
      notify()
    },

    async next() {
      const target = after(current)
      if (advancing || target === undefined) return false
      advancing = true
      try {
        if (!(await options.validatePage(current))) return false
        current = target
        notify()
        return true
      } finally {
        advancing = false
      }
    },

    back() {
      const target = before(current)
      if (target === undefined) return
      current = target
      notify()
    },

    goTo(pageIndex) {
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= options.pageCount) {
        throw new RangeError(`No page ${pageIndex}: valid range is 0..${options.pageCount - 1}`)
      }
      if (pageIndex === current) return
      current = pageIndex
      notify()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
