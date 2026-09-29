import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { builderView } from '@formancy/builder-core'
import type { BuilderSession, BuilderView, MoveTarget } from '@formancy/builder-core'

export type { BuilderView, MoveTarget }

/**
 * The builder session as a React value.
 *
 * `revision()` is the whole subscription: the session increments it once per
 * accepted command, undo or redo, so a number comparison is enough and there is
 * no need to diff documents. `getSnapshot` must return something stable between
 * changes or `useSyncExternalStore` loops, which is why the view is memoised on
 * the revision rather than rebuilt per render.
 *
 * What the view CONTAINS is `builderView` in `@formancy/builder-core`, shared
 * with the Angular builder. Only the subscription is React's: a destination list
 * that offered different choices in the two builders would be two products, and
 * the difference would be invisible to anybody using one of them.
 */
export function useBuilder(session: BuilderSession): BuilderView {
  const subscribe = useCallback((onChange: () => void) => session.subscribe(onChange), [session])
  const revision = useSyncExternalStore(
    subscribe,
    () => session.revision(),
    () => session.revision(),
  )

  // revision is the dependency that matters; session is stable for its life.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => builderView(session), [session, revision])
}
