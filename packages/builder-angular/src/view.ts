import { DestroyRef, computed, effect, inject, signal } from '@angular/core'
import type { Signal } from '@angular/core'
import { builderView } from '@formancy/builder-core'
import type { BuilderSession, BuilderView } from '@formancy/builder-core'

export type { BuilderView }

/**
 * A builder session as a signal — the Angular half of the protocol React binds
 * with `useSyncExternalStore`.
 *
 * `revision()` is the whole subscription: the session increments it once per
 * accepted command, undo or redo, so a number is enough and no document has to
 * be diffed. What the view CONTAINS is `builderView` in `@formancy/builder-core`,
 * shared with the React builder — two builders offering different destination
 * lists for one document would be two products, and nobody using only one of
 * them could see the difference.
 *
 * The session arrives as a signal because it arrives as an `input()`, and an
 * input can be replaced. Re-subscribing when it is is the difference between a
 * builder that follows its document and one that quietly keeps editing the
 * previous one.
 *
 * Call from an injection context.
 */
export function injectBuilderView(session: Signal<BuilderSession>): Signal<BuilderView> {
  const revision = signal(0)
  let unsubscribe: (() => void) | undefined

  effect(() => {
    const current = session()
    unsubscribe?.()
    revision.set(current.revision())
    unsubscribe = current.subscribe(() => revision.set(current.revision()))
  })
  inject(DestroyRef).onDestroy(() => unsubscribe?.())

  return computed(() => {
    // Read for the dependency, not for the value: the number says WHEN, and the
    // session says what.
    revision()
    return builderView(session())
  })
}
